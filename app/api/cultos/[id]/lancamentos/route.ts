import { getD1 } from "../../../../../db";
import { requireApiPermission } from "../../../../lib/access";
import {
  canWriteCultRoutine,
  countValue,
  normalizeCultExtras,
  safeJson,
  type CultCustomField,
  type CultRoutineRow,
} from "../../../../lib/cultos";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireApiPermission("CULTOS_REGISTRAR");
  if (access.error) return access.error;
  const routineId = Number((await context.params).id);
  const payload = (await request.json()) as Record<string, unknown>;
  const db = getD1();
  const routine = await db
    .prepare("SELECT * FROM culto_rotinas WHERE id = ? LIMIT 1")
    .bind(routineId)
    .first<CultRoutineRow>();
  if (!routine)
    return Response.json({ error: "Rotina não encontrada." }, { status: 404 });
  if (!canWriteCultRoutine(access.user!, routine)) {
    return Response.json(
      { error: "Esta rotina não foi atribuída a você." },
      { status: 403 },
    );
  }
  if (routine.status === "ENCERRADA") {
    return Response.json(
      { error: "Reabra a rotina antes de adicionar outro registro." },
      { status: 409 },
    );
  }

  const extras = normalizeCultExtras(
    payload.extras,
    safeJson<CultCustomField[]>(routine.campos_extras, []),
  );
  const result = await db
    .prepare(
      `INSERT INTO culto_lancamentos
       (rotina_id, registrado_por_usuario_id, registrado_por_nome, pessoas_culto,
        visitantes, cestas_basicas, visitas_dia, visitas_lares, teens, adultos, jovens, kids, bebes,
        extras, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      routineId,
      access.user!.id,
      access.user!.nome,
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
    )
    .run();
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
