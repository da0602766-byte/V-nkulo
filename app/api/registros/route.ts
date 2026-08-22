import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";

export async function POST(request: Request) {
  const access = await requireApiPermission("MODULOS_PERSONALIZADOS_VER");
  if (access.error) return access.error;
  const payload = (await request.json()) as { moduloId?: number; dados?: Record<string, unknown> };
  if (!payload.moduloId) return Response.json({ error: "Módulo inválido." }, { status: 400 });
  const result = await getD1().prepare(
    "INSERT INTO ministerio_registros (modulo_id, dados, criado_por) VALUES (?, ?, ?)",
  ).bind(payload.moduloId, JSON.stringify(payload.dados ?? {}), access.user!.email).run();
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
