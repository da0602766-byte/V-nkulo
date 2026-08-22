import { getD1 } from "../../../../../db";
import { parseSelfProfileUpdate } from "../../../../lib/people-validation";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("profile.self.update");
  if ("error" in access) return access.error;
  const parsed = parseSelfProfileUpdate(await request.json());
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const db = getD1();
  await db
    .prepare(
      `UPDATE usuarios
       SET telefone = ?, data_nascimento = ?, endereco = ?,
         ministerio = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND ativo = 1`,
    )
    .bind(
      parsed.data.telefone || null,
      parsed.data.dataNascimento || null,
      parsed.data.endereco || null,
      parsed.data.ministerio || null,
      access.user.id,
    )
    .run();
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "PERFIL_PROPRIO_ATUALIZADO",
    "SUCESSO",
    { usuarioId: access.user.id },
  );
  return Response.json({ updated: true });
}
