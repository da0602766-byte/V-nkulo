import { getSessionUser } from "../../../lib/local-auth";
import { log } from "../../../lib/logger.mjs";
import {
  cancelarCadastroMfa,
  confirmarCadastroMfa,
  desativarMfa,
  iniciarCadastroMfa,
  statusMfa,
} from "../../../lib/mfa";
import {
  respostaLimiteExcedido,
  verificarLimiteAutenticacao,
} from "../../../lib/rate-limit";

type Corpo = { acao?: unknown; codigo?: unknown };

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  return Response.json(await statusMfa(user.id), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  let corpo: Corpo;
  try {
    corpo = (await request.json()) as Corpo;
  } catch {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const acao = String(corpo.acao || "");
  const codigo = String(corpo.codigo || "");

  // Confirmar e desativar conferem um código: as duas viram alvo de tentativa
  // e erro se não tiverem teto. Iniciar e cancelar não conferem nada, então
  // ficam de fora do limite.
  if (acao === "confirmar" || acao === "desativar") {
    const limite = await verificarLimiteAutenticacao(request, "primeiro-acesso");
    if (!limite.permitido) {
      log.warn("mfa_limite_por_origem", { acao, tentarEmSegundos: limite.tentarEmSegundos });
      return respostaLimiteExcedido(limite);
    }
  }

  if (acao === "iniciar") {
    const inicio = await iniciarCadastroMfa(user.id, user.email);
    if (!inicio.ok) {
      return Response.json(
        { error: "A verificação em duas etapas já está ativa nesta conta." },
        { status: 409 },
      );
    }
    log.info("mfa_cadastro_iniciado", { usuarioId: user.id });
    // O segredo e a URI só saem aqui, para a tela montar o QR Code. Nunca
    // voltam depois: quem perder a tela recomeça o cadastro.
    return Response.json(
      { ok: true, segredo: inicio.segredoBase32, uri: inicio.uri },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (acao === "confirmar") {
    const confirmacao = await confirmarCadastroMfa(user.id, codigo);
    if (!confirmacao.ok) {
      log.warn("mfa_confirmacao_recusada", { usuarioId: user.id, motivo: confirmacao.motivo });
      const mensagem =
        confirmacao.motivo === "NAO_INICIADO"
          ? "Comece o cadastro da verificação em duas etapas antes de confirmar."
          : confirmacao.motivo === "JA_ATIVO"
            ? "A verificação em duas etapas já está ativa nesta conta."
            : "Código incorreto. Confira o aplicativo e tente de novo.";
      return Response.json({ error: mensagem }, { status: confirmacao.motivo === "INCORRETO" ? 401 : 409 });
    }
    log.info("mfa_ativado", { usuarioId: user.id });
    // Os códigos de recuperação aparecem em claro uma única vez.
    return Response.json(
      { ok: true, codigosRecuperacao: confirmacao.codigosRecuperacao },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (acao === "desativar") {
    const remocao = await desativarMfa(user.id, codigo);
    if (!remocao.ok) {
      log.warn("mfa_desativacao_recusada", { usuarioId: user.id, motivo: remocao.motivo });
      return Response.json(
        {
          error:
            remocao.motivo === "NAO_CONFIGURADO"
              ? "Esta conta não tem verificação em duas etapas ativa."
              : "Código incorreto. Use o aplicativo ou um código de recuperação.",
        },
        { status: remocao.motivo === "NAO_CONFIGURADO" ? 409 : 401 },
      );
    }
    log.info("mfa_desativado", { usuarioId: user.id, viaRecuperacao: remocao.motivo === "VALIDO_RECUPERACAO" });
    return Response.json({ ok: true });
  }

  if (acao === "cancelar") {
    await cancelarCadastroMfa(user.id);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Ação não reconhecida." }, { status: 400 });
}
