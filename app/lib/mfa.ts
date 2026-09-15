import { getD1 } from "../../db";
import { getRuntimeEnv } from "../../db/runtime-env";
import { fromBase64Url, toBase64Url } from "./base64url.mjs";
import { sha256 } from "./local-auth";
import {
  gerarSegredo,
  uriOtpauth,
  verificarCodigo,
} from "./totp.mjs";

/** Quantos códigos de recuperação são entregues na confirmação. */
const CODIGOS_RECUPERACAO = 10;

/**
 * Alfabeto dos códigos de recuperação: sem `0`/`O` e sem `1`/`I`, que o
 * usuário confunde ao copiar do papel.
 */
const ALFABETO_RECUPERACAO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type LinhaMfa = {
  segredo_ciphertext: string;
  segredo_iv: string;
  confirmado_em: string | null;
  ultimo_passo: number | null;
};

export type StatusMfa = {
  ativo: boolean;
  cadastroPendente: boolean;
  codigosRecuperacaoRestantes: number;
};

export type ResultadoVerificacao = {
  ok: boolean;
  motivo:
    | "VALIDO"
    | "VALIDO_RECUPERACAO"
    | "NAO_CONFIGURADO"
    | "INCORRETO"
    | "REUTILIZADO"
    | "FORMATO";
};

/**
 * Situação do segundo fator do usuário.
 */
export async function statusMfa(usuarioId: number): Promise<StatusMfa> {
  const db = getD1();
  const linha = await db
    .prepare("SELECT confirmado_em FROM usuario_mfa WHERE usuario_id = ? LIMIT 1")
    .bind(usuarioId)
    .first<{ confirmado_em: string | null }>();
  if (!linha) {
    return { ativo: false, cadastroPendente: false, codigosRecuperacaoRestantes: 0 };
  }
  const restantes = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM usuario_mfa_recuperacao
       WHERE usuario_id = ? AND usado_em IS NULL`,
    )
    .bind(usuarioId)
    .first<{ total: number }>();
  return {
    ativo: Boolean(linha.confirmado_em),
    cadastroPendente: !linha.confirmado_em,
    codigosRecuperacaoRestantes: Number(restantes?.total || 0),
  };
}

/** Atalho para os pontos que só precisam saber se o fator está valendo. */
export async function mfaAtivo(usuarioId: number): Promise<boolean> {
  return (await statusMfa(usuarioId)).ativo;
}

/**
 * Inicia o cadastro: gera o segredo, grava cifrado e devolve o que o
 * aplicativo autenticador precisa ler.
 *
 * O segredo só passa a valer como segundo fator depois de `confirmarCadastro`,
 * para ninguém ficar trancado por ter fechado a tela antes de escanear o QR.
 */
export async function iniciarCadastroMfa(usuarioId: number, conta: string) {
  const db = getD1();
  const jaConfirmado = await db
    .prepare("SELECT confirmado_em FROM usuario_mfa WHERE usuario_id = ? LIMIT 1")
    .bind(usuarioId)
    .first<{ confirmado_em: string | null }>();
  if (jaConfirmado?.confirmado_em) {
    return { ok: false as const, motivo: "JA_ATIVO" as const };
  }

  const segredoBase32 = gerarSegredo();
  const cifrado = await cifrarSegredo(segredoBase32);
  // Recomeçar o cadastro descarta o segredo anterior não confirmado: senão o
  // usuário poderia validar com um QR antigo que já não está mais na tela.
  await db
    .prepare(
      `INSERT INTO usuario_mfa
        (usuario_id, segredo_ciphertext, segredo_iv, confirmado_em, ultimo_passo, atualizado_em)
       VALUES (?, ?, ?, NULL, NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(usuario_id) DO UPDATE SET
         segredo_ciphertext = excluded.segredo_ciphertext,
         segredo_iv = excluded.segredo_iv,
         confirmado_em = NULL,
         ultimo_passo = NULL,
         atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(usuarioId, cifrado.ciphertext, cifrado.iv)
    .run();

  return {
    ok: true as const,
    segredoBase32,
    uri: uriOtpauth({ segredoBase32, conta }),
  };
}

/**
 * Conclui o cadastro provando que o aplicativo leu o segredo, e entrega os
 * códigos de recuperação — a única vez em que eles aparecem em claro.
 */
export async function confirmarCadastroMfa(usuarioId: number, codigo: string) {
  const db = getD1();
  const linha = await db
    .prepare(
      `SELECT segredo_ciphertext, segredo_iv, confirmado_em, ultimo_passo
       FROM usuario_mfa WHERE usuario_id = ? LIMIT 1`,
    )
    .bind(usuarioId)
    .first<LinhaMfa>();
  if (!linha) return { ok: false as const, motivo: "NAO_INICIADO" as const };
  if (linha.confirmado_em) return { ok: false as const, motivo: "JA_ATIVO" as const };

  const segredoBase32 = await decifrarSegredo(linha.segredo_ciphertext, linha.segredo_iv);
  const conferencia = await verificarCodigo({ segredoBase32, codigo });
  if (!conferencia.valido) return { ok: false as const, motivo: "INCORRETO" as const };

  const codigosRecuperacao = gerarCodigosRecuperacao();
  await db
    .prepare(
      `UPDATE usuario_mfa
       SET confirmado_em = CURRENT_TIMESTAMP, ultimo_passo = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE usuario_id = ?`,
    )
    .bind(conferencia.passo, usuarioId)
    .run();
  await db
    .prepare("DELETE FROM usuario_mfa_recuperacao WHERE usuario_id = ?")
    .bind(usuarioId)
    .run();
  for (const codigoRecuperacao of codigosRecuperacao) {
    await db
      .prepare(
        `INSERT INTO usuario_mfa_recuperacao (usuario_id, codigo_hash)
         VALUES (?, ?)`,
      )
      .bind(usuarioId, await sha256(normalizarRecuperacao(codigoRecuperacao)))
      .run();
  }

  return { ok: true as const, codigosRecuperacao };
}

/**
 * Confere um segundo fator apresentado para uma operação crítica.
 *
 * Aceita o código de 6 dígitos do aplicativo ou um código de recuperação.
 * Consome o que for usado: o passo TOTP vira `ultimo_passo` e o código de
 * recuperação é marcado como gasto.
 */
export async function verificarMfa(
  usuarioId: number,
  codigo: string,
): Promise<ResultadoVerificacao> {
  const db = getD1();
  const linha = await db
    .prepare(
      `SELECT segredo_ciphertext, segredo_iv, confirmado_em, ultimo_passo
       FROM usuario_mfa WHERE usuario_id = ? LIMIT 1`,
    )
    .bind(usuarioId)
    .first<LinhaMfa>();
  if (!linha?.confirmado_em) return { ok: false, motivo: "NAO_CONFIGURADO" };

  const digitado = String(codigo || "").trim();
  if (!digitado) return { ok: false, motivo: "FORMATO" };

  // Seis dígitos é o código do aplicativo; qualquer outro formato só pode ser
  // um código de recuperação.
  if (/^\d{6}$/.test(digitado.replace(/\s/g, ""))) {
    const segredoBase32 = await decifrarSegredo(linha.segredo_ciphertext, linha.segredo_iv);
    const conferencia = await verificarCodigo({
      segredoBase32,
      codigo: digitado,
      ultimoPasso: linha.ultimo_passo,
    });
    if (conferencia.valido) {
      await db
        .prepare(
          "UPDATE usuario_mfa SET ultimo_passo = ?, atualizado_em = CURRENT_TIMESTAMP WHERE usuario_id = ?",
        )
        .bind(conferencia.passo, usuarioId)
        .run();
      return { ok: true, motivo: "VALIDO" };
    }
    return {
      ok: false,
      motivo: conferencia.motivo === "REUTILIZADO" ? "REUTILIZADO" : "INCORRETO",
    };
  }

  const normalizado = normalizarRecuperacao(digitado);
  if (normalizado.length !== 10) return { ok: false, motivo: "FORMATO" };
  const hash = await sha256(normalizado);
  const resultado = await db
    .prepare(
      `UPDATE usuario_mfa_recuperacao
       SET usado_em = CURRENT_TIMESTAMP
       WHERE usuario_id = ? AND codigo_hash = ? AND usado_em IS NULL`,
    )
    .bind(usuarioId, hash)
    .run();
  // A própria condição `usado_em IS NULL` garante o uso único: se outra
  // requisição gastou o código primeiro, nenhuma linha é alterada aqui.
  if (Number(resultado.meta.changes || 0) > 0) {
    return { ok: true, motivo: "VALIDO_RECUPERACAO" };
  }
  return { ok: false, motivo: "INCORRETO" };
}

/**
 * Desliga o segundo fator. Exige um código válido: sem isso, quem pegasse uma
 * sessão aberta removeria justamente a proteção contra o roubo de sessão.
 */
export async function desativarMfa(usuarioId: number, codigo: string) {
  const conferencia = await verificarMfa(usuarioId, codigo);
  if (!conferencia.ok) return conferencia;
  const db = getD1();
  await db.prepare("DELETE FROM usuario_mfa WHERE usuario_id = ?").bind(usuarioId).run();
  await db
    .prepare("DELETE FROM usuario_mfa_recuperacao WHERE usuario_id = ?")
    .bind(usuarioId)
    .run();
  return conferencia;
}

/** Cancela um cadastro ainda não confirmado, sem exigir código. */
export async function cancelarCadastroMfa(usuarioId: number) {
  const db = getD1();
  await db
    .prepare("DELETE FROM usuario_mfa WHERE usuario_id = ? AND confirmado_em IS NULL")
    .bind(usuarioId)
    .run();
}

function gerarCodigosRecuperacao() {
  const codigos: string[] = [];
  for (let indice = 0; indice < CODIGOS_RECUPERACAO; indice += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const letras = Array.from(
      bytes,
      (byte) => ALFABETO_RECUPERACAO[byte % ALFABETO_RECUPERACAO.length],
    ).join("");
    codigos.push(`${letras.slice(0, 5)}-${letras.slice(5)}`);
  }
  return codigos;
}

/** O usuário digita com ou sem hífen, em maiúscula ou não. */
function normalizarRecuperacao(codigo: string) {
  return String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function segredoDoAmbiente() {
  return getRuntimeEnv().AUTH_SECRET || "";
}

/**
 * Chave AES-GCM própria do MFA. O separador de domínio no digest garante que
 * ela não é a mesma usada pela integração Google, mesmo partindo do mesmo
 * AUTH_SECRET.
 */
async function chaveDeCifragem() {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`vinkulo-mfa:${segredoDoAmbiente()}`),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function cifrarSegredo(valor: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await chaveDeCifragem(),
    new TextEncoder().encode(valor),
  );
  return { ciphertext: toBase64Url(new Uint8Array(cifrado)), iv: toBase64Url(iv) };
}

async function decifrarSegredo(ciphertext: string, iv: string) {
  const claro = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) },
    await chaveDeCifragem(),
    fromBase64Url(ciphertext),
  );
  return new TextDecoder().decode(claro);
}
