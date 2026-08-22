import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";

export async function PATCH(request: Request) {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  const payload = (await request.json()) as { tema?: string };
  const tema = payload.tema === "ESCURO" ? "ESCURO" : "CLARO";
  await getD1()
    .prepare(
      "UPDATE usuarios SET tema_preferido = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(tema, access.user!.id)
    .run();
  return Response.json({ tema_preferido: tema });
}
