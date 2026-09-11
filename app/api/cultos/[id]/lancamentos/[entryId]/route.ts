import { getD1 } from "../../../../../../db";
import { requireApiPermission } from "../../../../../lib/access";
import {
  canWriteCultRoutine,
  countValue,
  normalizeCultExtras,
  safeJson,
  type CultCustomField,
  type CultRoutineRow,
} from "../../../../../lib/cultos";

type Context = { params: Promise<{ id: string; entryId: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("CULTOS_REGISTRAR");
  if (access.error) return access.error;
  const params = await context.params;
  const routineId = Number(params.id);
  const entryId = Number(params.entryId);
  const payload = (await request.json()) as Record<string, unknown>;
  const db = getD1();
  const routine = await db
    .prepare("SELECT * FROM culto_rotinas WHERE id = ? LIMIT 1")
    .bind(routineId)
    .first<CultRoutineRow>();
  const entry = await db
    .prepare(
      "SELECT id FROM culto_lancamentos WHERE id = ? AND rotina_id = ? LIMIT 1",
    )
    .bind(entryId, routineId)
    .first();
  if (!routine || !entry) {
    return Response.json(
      { error: "Registro não encontrado." },
      { status: 404 },
    );
  }
  if (!canWriteCultRoutine(access.user!, routine)) {
    return Response.json(
      { error: "Você não pode editar os registros desta rotina." },
      { status: 403 },
    );
  }

  const extras = normalizeCultExtras(
    payload.extras,
    safeJson<CultCustomField[]>(routine.campos_extras, []),
  );
  await db
    .prepare(
      `UPDATE culto_lancamentos SET pessoas_culto = ?, visitantes = ?, cestas_basicas = ?,
       visitas_dia = ?, visitas_lares = ?, teens = ?, adultos = ?, jovens = ?, kids = ?, bebes = ?, extras = ?,
       observacoes = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND rotina_id = ?`,
    )
    .bind(
      countValue(payload.pessoasCulto),
      countValue(payload.visitantes),
      countValue(payload.cestasBasicas),
      countValue(payload.visitasDia),
      countValue(payload.visitasLares),
      countValue(payload.teens),
      countValue(payload.adultos),
      countValue(payload.jovens),
      countValue(payload.kids),
      countValue(payload.bebes),
      JSON.stringify(extras),
      String(payload.observacoes || "")
        .trim()
        .slice(0, 2000) || null,
      entryId,
      routineId,
    )
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("CULTOS_REGISTRAR");
  if (access.error) return access.error;
  const params = await context.params;
  const routineId = Number(params.id);
  const entryId = Number(params.entryId);
  const db = getD1();
  const routine = await db
    .prepare("SELECT * FROM culto_rotinas WHERE id = ? LIMIT 1")
    .bind(routineId)
    .first<CultRoutineRow>();
  if (!routine)
    return Response.json({ error: "Rotina não encontrada." }, { status: 404 });
  if (!canWriteCultRoutine(access.user!, routine)) {
    return Response.json(
      { error: "Você não pode excluir os registros desta rotina." },
      { status: 403 },
    );
  }
  await db
    .prepare("DELETE FROM culto_lancamentos WHERE id = ? AND rotina_id = ?")
    .bind(entryId, routineId)
    .run();
  return Response.json({ ok: true });
}
