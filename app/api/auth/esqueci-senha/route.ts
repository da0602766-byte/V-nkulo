import { getD1 } from "../../../../db";
import { normalizeEmail } from "../../../lib/local-auth";
import { notifySuperadmins } from "../../../lib/pilot-notifications";

export async function POST(request: Request) {
  const { email } = await request.json() as { email?: string };
  const db = getD1();
  const user = await db.prepare("SELECT id FROM usuarios WHERE email = ? LIMIT 1").bind(normalizeEmail(email)).first<{ id: number }>();
  if (user) {
    await db.prepare("UPDATE redefinicoes_senha SET usado = 1 WHERE usuario_id = ? AND usado = 0").bind(user.id).run();
    await db.prepare("INSERT INTO redefinicoes_senha (usuario_id, usado) VALUES (?, 0)").bind(user.id).run();
    await notifySuperadmins(db, {
      title: "Solicitação de recuperação de senha",
      message: "Uma pessoa solicitou recuperação de acesso. Consulte a fila administrativa.",
      entityId: user.id,
      createdBy: "sistema",
    });
  }
  return Response.json({ ok: true, message: "Solicitação registrada. Peça ao administrador o link seguro de redefinição." });
}
