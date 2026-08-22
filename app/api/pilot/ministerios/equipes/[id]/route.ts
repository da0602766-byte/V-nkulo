import { getD1 } from "../../../../../../db";
import { canManageMinistry } from "../../../../../lib/ministry-access";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireTenantPermission("ministries.view");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  const body = await safeJson(request);
  if (!Number.isInteger(id) || id <= 0 || !body) return badRequest("Equipe inválida.");
  const db = getD1();
  const team = await ownedTeam(db, id, access.context.comunidadeId);
  if (!team) return Response.json({ error: "Equipe não encontrada." }, { status: 404 });
  if (!(await canManageMinistry(db, access.context, access.user.id, team.ministerio_id))) {
    return Response.json({ error: "Você não administra este ministério." }, { status: 403 });
  }
  const action = clean(body.acao, 30).toUpperCase() || "ATUALIZAR";
  if (action === "DEFINIR_MEMBROS") {
    const ids = Array.isArray(body.voluntarioIds)
      ? [...new Set(body.voluntarioIds.map(positiveInteger).filter(Boolean) as number[])].slice(0, 100)
      : [];
    for (const volunteerId of ids) {
      const volunteer = await db
        .prepare(
          `SELECT id FROM ministerio_voluntarios
           WHERE id = ? AND comunidade_id = ? AND ministerio_id = ? AND ativo = 1`,
        )
        .bind(volunteerId, access.context.comunidadeId, team.ministerio_id)
        .first<{ id: number }>();
      if (!volunteer) return badRequest("Um integrante selecionado não pertence ao ministério.");
      const count = await db
        .prepare(
          `SELECT COUNT(*) AS total FROM ministerio_equipe_membros mem
           JOIN ministerio_equipes me ON me.id = mem.equipe_id AND me.ativa = 1
           WHERE mem.comunidade_id = ? AND mem.ministerio_id = ?
             AND mem.voluntario_id = ? AND mem.equipe_id != ?`,
        )
        .bind(access.context.comunidadeId, team.ministerio_id, volunteerId, id)
        .first<{ total: number }>();
      if (Number(count?.total || 0) >= 3) {
        return Response.json({ error: "Cada integrante pode participar de no máximo três equipes neste ministério." }, { status: 409 });
      }
    }
    await db
      .prepare(
        `DELETE FROM ministerio_equipe_membros
         WHERE equipe_id = ? AND comunidade_id = ? AND ministerio_id = ?`,
      )
      .bind(id, access.context.comunidadeId, team.ministerio_id)
      .run();
    for (const volunteerId of ids) {
      await db
        .prepare(
          `INSERT INTO ministerio_equipe_membros
           (comunidade_id, ministerio_id, equipe_id, voluntario_id)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(access.context.comunidadeId, team.ministerio_id, id, volunteerId)
        .run();
    }
    await recordTenantAudit(db, access.context, access.user.id, "EQUIPE_MINISTERIAL_MEMBROS_ATUALIZADOS", "SUCESSO", { ministerioId: team.ministerio_id, equipeId: id, total: ids.length });
    return Response.json({ ok: true });
  }
  const nome = clean(body.nome, 80);
  const descricao = clean(body.descricao, 300);
  const cor = normalizeColor(body.cor);
  const ordem = Math.max(0, Math.min(999, Number(body.ordem) || 0));
  if (!nome || !cor) return badRequest("Informe nome e cor válidos.");
  try {
    await db
      .prepare(
        `UPDATE ministerio_equipes SET nome = ?, descricao = ?, cor = ?, ordem = ?,
          atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ? AND ministerio_id = ? AND ativa = 1`,
      )
      .bind(nome, descricao, cor, ordem, id, access.context.comunidadeId, team.ministerio_id)
      .run();
    await recordTenantAudit(db, access.context, access.user.id, "EQUIPE_MINISTERIAL_ATUALIZADA", "SUCESSO", { ministerioId: team.ministerio_id, equipeId: id });
    return Response.json({ ok: true });
  } catch (error) {
    if (String(error).includes("UNIQUE")) return Response.json({ error: "Já existe uma equipe com esse nome." }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_request: Request, context: Context) {
  const access = await requireTenantPermission("ministries.view");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return badRequest("Equipe inválida.");
  const db = getD1();
  const team = await ownedTeam(db, id, access.context.comunidadeId);
  if (!team) return Response.json({ error: "Equipe não encontrada." }, { status: 404 });
  if (!(await canManageMinistry(db, access.context, access.user.id, team.ministerio_id))) {
    return Response.json({ error: "Você não administra este ministério." }, { status: 403 });
  }
  const used = await db
    .prepare(
      `SELECT id FROM escalas_ministerio
       WHERE equipe_id = ? AND comunidade_id = ? AND status IN ('RASCUNHO','PUBLICADA','AGUARDANDO_CHECKLIST') LIMIT 1`,
    )
    .bind(id, access.context.comunidadeId)
    .first<{ id: number }>();
  if (used) return Response.json({ error: "Cancele ou encerre as escalas ativas desta equipe antes de excluí-la." }, { status: 409 });
  await db
    .prepare(
      `UPDATE ministerio_equipes SET ativa = 0, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ? AND ministerio_id = ?`,
    )
    .bind(id, access.context.comunidadeId, team.ministerio_id)
    .run();
  await recordTenantAudit(db, access.context, access.user.id, "EQUIPE_MINISTERIAL_EXCLUIDA", "SUCESSO", { ministerioId: team.ministerio_id, equipeId: id });
  return Response.json({ ok: true });
}

function ownedTeam(db: ReturnType<typeof getD1>, id: number, communityId: number) {
  return db.prepare(
    `SELECT id, ministerio_id FROM ministerio_equipes
     WHERE id = ? AND comunidade_id = ? AND ativa = 1`,
  ).bind(id, communityId).first<{ id: number; ministerio_id: number }>();
}
function clean(value: unknown, length: number) { return String(value ?? "").trim().slice(0, length); }
function positiveInteger(value: unknown) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; }
function normalizeColor(value: unknown) { const color = clean(value, 7).toLowerCase(); return /^#[0-9a-f]{6}$/.test(color) ? color : ""; }
async function safeJson(request: Request) { try { return (await request.json()) as Record<string, unknown>; } catch { return null; } }
function badRequest(error: string) { return Response.json({ error }, { status: 400 }); }
