import { consumeResetToken, validatePassword } from "../../../lib/local-auth";
import { log } from "../../../lib/logger.mjs";
import {
  liberarLimiteAutenticacao,
  respostaLimiteExcedido,
  verificarLimiteAutenticacao,
} from "../../../lib/rate-limit";

export async function POST(request: Request) {
  // Este endpoint não tinha nenhuma contenção: era possível varrer tokens de
  // redefinição em série. O token é aleatório e guardado como hash, então a
  // varredura é cara, mas não custava nada a quem tentasse.
  const limiteOrigem = await verificarLimiteAutenticacao(request, "redefinir-senha");
  if (!limiteOrigem.permitido) {
    log.warn("redefinir_senha_limite_por_origem", { tentarEmSegundos: limiteOrigem.tentarEmSegundos });
    return respostaLimiteExcedido(limiteOrigem);
  }
  const { token, senha } = await request.json() as { token?: string; senha?: string };
  const password = String(senha || "");
  const error = validatePassword(password);
  if (error) return Response.json({ error }, { status: 400 });
  const success = await consumeResetToken(String(token || ""), password);
  if (!success) {
    log.warn("redefinir_senha_token_recusado");
    return Response.json({ error: "Este link é inválido, já foi usado ou expirou." }, { status: 400 });
  }
  await liberarLimiteAutenticacao(request, "redefinir-senha");
  log.info("redefinir_senha_concluida");
  return Response.json({ ok: true });
}
