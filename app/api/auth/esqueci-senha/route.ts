import { getD1 } from "../../../../db";
import { createResetToken, normalizeEmail } from "../../../lib/local-auth";
import { log } from "../../../lib/logger.mjs";
import { notifyUser } from "../../../lib/pilot-notifications";
import {
  respostaLimiteExcedido,
  verificarLimiteAutenticacao,
} from "../../../lib/rate-limit";

export async function POST(request: Request) {
  // O cooldown de 2 minutos logo abaixo é por conta. Uma mesma origem
  // percorrendo muitos e-mails continuaria notificando a liderança de várias
  // comunidades sem nunca esbarrar nele.
  const limiteOrigem = await verificarLimiteAutenticacao(request, "esqueci-senha");
  if (!limiteOrigem.permitido) {
    log.warn("esqueci_senha_limite_por_origem", { tentarEmSegundos: limiteOrigem.tentarEmSegundos });
    return respostaLimiteExcedido(limiteOrigem);
  }
  const { email } = await request.json() as { email?: string };
  const db = getD1();
  const user = await db.prepare("SELECT id, nome, email FROM usuarios WHERE email = ? AND ativo = 1 LIMIT 1").bind(normalizeEmail(email)).first<{ id: number; nome: string; email: string }>();
  if (user) {
    // Sem isso, qualquer pessoa poderia repetir esta chamada sem parar para um
    // e-mail cadastrado e inundar a liderança responsável com notificações a
    // cada solicitação. O próprio link enviado continua válido por 30 minutos,
    // então esperar essa janela antes de gerar outro é imperceptível para
    // quem realmente esqueceu a senha.
    const recent = await db.prepare(
      `SELECT id FROM redefinicoes_senha
       WHERE usuario_id = ? AND (token_hash IS NULL OR token_hash NOT LIKE 'first:%')
         AND datetime(solicitado_em) > datetime('now', '-2 minutes')
       LIMIT 1`,
    ).bind(user.id).first<{ id: number }>();
    if (recent) {
      return Response.json({ ok: true, message: "Se o e-mail estiver cadastrado, a liderança responsável receberá um link seguro para encaminhar. Por privacidade, não confirmamos contas nesta tela." });
    }
    const token = await createResetToken(user.id);
    const resetPath = `/redefinir-senha?token=${encodeURIComponent(token)}`;
    const managers = await db.prepare(
      `SELECT DISTINCT gestor.id
       FROM usuario_comunidades membro
       JOIN usuario_comunidades gestao ON gestao.comunidade_id = membro.comunidade_id
       JOIN usuarios gestor ON gestor.id = gestao.usuario_id
       WHERE membro.usuario_id = ?
         AND membro.status = 'ATIVO'
         AND gestao.status = 'ATIVO'
         AND gestor.ativo = 1
         AND gestao.papel IN ('PASTOR', 'ADMIN_COMUNIDADE')`,
    ).bind(user.id).all<{ id: number }>();
    await Promise.all(managers.results.map((manager) => notifyUser(db, {
      userId: Number(manager.id),
      title: "Redefinição de acesso solicitada",
      message: `${user.nome} confirmou o e-mail cadastrado e solicitou um link de redefinição. Abra para encaminhar o acesso seguro.`,
      entityId: user.id,
      destination: resetPath,
      createdBy: "sistema",
    })));
  }
  return Response.json({ ok: true, message: "Se o e-mail estiver cadastrado, a liderança responsável receberá um link seguro para encaminhar. Por privacidade, não confirmamos contas nesta tela." });
}
