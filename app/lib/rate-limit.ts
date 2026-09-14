import { getD1 } from "../../db";
import { getRuntimeEnv } from "../../db/runtime-env";
import { sha256 } from "./local-auth";
import {
  AUTH_RATE_LIMITS,
  decidirLimite,
  estadoDaLinha,
  origemDaRequisicao,
} from "./rate-limit-policy.mjs";

export type AuthRateLimitScope = keyof typeof AUTH_RATE_LIMITS;

type LimiteLinha = {
  tentativas: number;
  janela_inicio: string | null;
  bloqueado_ate: string | null;
};

export type ResultadoLimite = {
  permitido: boolean;
  tentarEmSegundos: number;
};

const PERMITIDO: ResultadoLimite = { permitido: true, tentarEmSegundos: 0 };

// Uma linha só é útil enquanto a janela ou o bloqueio da finalidade mais
// longa ainda podem valer. Passado isso ela é lixo e some na próxima
// verificação, para a tabela não crescer sem limite.
const RETENCAO_HORAS = 24;

/**
 * Verifica e consome uma unidade da cota da origem para esta finalidade.
 *
 * Falhas de infraestrutura (banco indisponível, migração ainda não aplicada)
 * deixam a requisição passar: a limitação é uma camada extra e não pode ser
 * o motivo de ninguém conseguir entrar na plataforma.
 */
export async function verificarLimiteAutenticacao(
  request: Request,
  escopo: AuthRateLimitScope,
): Promise<ResultadoLimite> {
  const configuracao = AUTH_RATE_LIMITS[escopo];
  if (!configuracao) return PERMITIDO;

  const origem = origemDaRequisicao(request.headers);
  // Sem IP confiável (desenvolvimento local) não há como separar origens.
  // Ver a justificativa em `origemDaRequisicao`.
  if (!origem) return PERMITIDO;

  try {
    const db = getD1();
    const chave = await chaveDaOrigem(escopo, origem);
    const linha = await db
      .prepare(
        `SELECT tentativas, janela_inicio, bloqueado_ate
         FROM limites_autenticacao
         WHERE escopo = ? AND chave = ? LIMIT 1`,
      )
      .bind(escopo, chave)
      .first<LimiteLinha>();

    const agoraMs = Date.now();
    const decisao = decidirLimite({
      agoraMs,
      limite: configuracao.limite,
      janelaSegundos: configuracao.janelaSegundos,
      bloqueioSegundos: configuracao.bloqueioSegundos,
      estado: estadoDaLinha(linha),
    });

    await db
      .prepare(
        `INSERT INTO limites_autenticacao
          (escopo, chave, tentativas, janela_inicio, bloqueado_ate, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(escopo, chave) DO UPDATE SET
           tentativas = excluded.tentativas,
           janela_inicio = excluded.janela_inicio,
           bloqueado_ate = excluded.bloqueado_ate,
           atualizado_em = excluded.atualizado_em`,
      )
      .bind(
        escopo,
        chave,
        decisao.proximoEstado.tentativas,
        paraIso(decisao.proximoEstado.janelaInicioMs, agoraMs),
        decisao.proximoEstado.bloqueadoAteMs
          ? paraIso(decisao.proximoEstado.bloqueadoAteMs, agoraMs)
          : null,
        paraIso(agoraMs, agoraMs),
      )
      .run();

    await limparVencidos(db, agoraMs);

    return {
      permitido: decisao.permitido,
      tentarEmSegundos: decisao.tentarEmSegundos,
    };
  } catch {
    return PERMITIDO;
  }
}

/**
 * Zera a cota da origem depois de uma autenticação bem-sucedida, para que
 * quem realmente entrou não carregue as tentativas anteriores.
 */
export async function liberarLimiteAutenticacao(
  request: Request,
  escopo: AuthRateLimitScope,
): Promise<void> {
  const origem = origemDaRequisicao(request.headers);
  if (!origem) return;
  try {
    const db = getD1();
    await db
      .prepare("DELETE FROM limites_autenticacao WHERE escopo = ? AND chave = ?")
      .bind(escopo, await chaveDaOrigem(escopo, origem))
      .run();
  } catch {
    // Não há o que compensar: a linha vence sozinha.
  }
}

/**
 * Resposta padrão de origem barrada. Mantém o corpo em português, sem revelar
 * qual finalidade estourou nem quantas tentativas restavam.
 */
export function respostaLimiteExcedido(resultado: ResultadoLimite): Response {
  const minutos = Math.max(1, Math.ceil(resultado.tentarEmSegundos / 60));
  return Response.json(
    {
      error: `Muitas tentativas a partir deste dispositivo. Aguarde ${minutos} minuto(s) e tente novamente.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, resultado.tentarEmSegundos)),
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * Redireciona um envio de formulário barrado de volta ao login com a mensagem
 * visível, já que o navegador não mostraria o JSON do 429.
 */
export function redirecionamentoLimiteExcedido(
  request: Request,
  resultado: ResultadoLimite,
  destino: string,
): Response {
  const minutos = Math.max(1, Math.ceil(resultado.tentarEmSegundos / 60));
  const url = new URL(destino, request.url);
  url.searchParams.set(
    "erro",
    `Muitas tentativas a partir deste dispositivo. Aguarde ${minutos} minuto(s) e tente novamente.`,
  );
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      "Retry-After": String(Math.max(1, resultado.tentarEmSegundos)),
      "Cache-Control": "no-store",
    },
  });
}

/**
 * O IP entra na tabela apenas como hash com o segredo do ambiente: sem o
 * `AUTH_SECRET` ninguém reconstrói o endereço a partir do banco, e o mesmo IP
 * gera chaves diferentes em finalidades diferentes.
 */
async function chaveDaOrigem(escopo: string, origem: string) {
  const segredo = getRuntimeEnv().AUTH_SECRET || "";
  return sha256(`${segredo}:${escopo}:${origem}`);
}

function paraIso(valorMs: number, padraoMs: number) {
  const instante = Number.isFinite(valorMs) && valorMs > 0 ? valorMs : padraoMs;
  return new Date(instante).toISOString();
}

async function limparVencidos(
  db: ReturnType<typeof getD1>,
  agoraMs: number,
): Promise<void> {
  // Amostragem: a limpeza não precisa rodar em toda requisição de login, e
  // rodá-la sempre custaria uma escrita a mais em cada tentativa.
  if (Math.random() > 0.02) return;
  const corte = new Date(agoraMs - RETENCAO_HORAS * 3600 * 1000).toISOString();
  await db
    .prepare(
      `DELETE FROM limites_autenticacao
       WHERE atualizado_em < ?
         AND (bloqueado_ate IS NULL OR bloqueado_ate < ?)`,
    )
    .bind(corte, new Date(agoraMs).toISOString())
    .run();
}
