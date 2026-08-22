import { getD1 } from "../../../../../db";
import { requireApiPermission } from "../../../../lib/access";
import { createResetToken } from "../../../../lib/local-auth";

type Context = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Context) {
  const access = await requireApiPermission("USUARIOS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const user = await getD1().prepare("SELECT id FROM usuarios WHERE id = ? LIMIT 1").bind(id).first<{ id: number }>();
  if (!user) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
  const token = await createResetToken(id);
  return Response.json({ path: `/redefinir-senha?token=${encodeURIComponent(token)}` });
}
