import { getD1 } from "../../../../../db";
import { canManageMinistry } from "../../../../lib/ministry-access";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

export async function GET(request: Request) {
  const access = await requireTenantPermission("ministries.view");
  if ("error" in access) return access.error;
  const ministerioId = Number(new URL(request.url).searchParams.get("ministerioId") || 0);
  if (!Number.isInteger(ministerioId) || ministerioId <= 0) return badRequest("Ministério inválido.");
  const db = getD1();
  const visible = await db
    .prepare(
      `SELECT m.id FROM ministerios_comunidade m
       WHERE m.id = ? AND m.comunidade_id = ? AND m.status = 'ATIVO'
         AND (
           ? = 1 OR m.responsavel_usuario_id = ? OR EXISTS (
             SELECT 1 FROM ministerio_voluntarios mv
             WHERE mv.ministerio_id = m.id AND mv.comunidade_id = m.comunidade_id
               AND mv.usuario_id = ? AND mv.ativo = 1
           ) OR EXISTS (
             SELECT 1 FROM escala_designacoes ed JOIN escalas_ministerio em ON em.id = ed.escala_id
             WHERE em.ministerio_id = m.id AND ed.comunidade_id = m.comunidade_id
               AND ed.usuario_id = ? AND ed.ativo = 1 AND em.status = 'PUBLICADA'
           )
         )`,
    )
    .bind(
      ministerioId,
      access.context.comunidadeId,
      access.context.permissions.some((permission) => ["pastoral.panel.view", "community.settings.manage", "platform.admin.view"].includes(permission)) ? 1 : 0,
      access.user.id,
      access.user.id,
      access.user.id,
    )
    .first<{ id: number }>();
  if (!visible) return Response.json({ error: "Ministério não encontrado." }, { status: 404 });
  const canManage = await canManageMinistry(db, access.context, access.user.id, ministerioId);
  const teams = await db
    .prepare(
      `SELECT me.id, me.nome, me.descricao, me.cor, me.ordem,
        COUNT(mem.id) AS total_membros
       FROM ministerio_equipes me
       LEFT JOIN ministerio_equipe_membros mem ON mem.equipe_id = me.id
         AND mem.comunidade_id = me.comunidade_id AND mem.ministerio_id = me.ministerio_id
       WHERE me.comunidade_id = ? AND me.ministerio_id = ? AND me.ativa = 1
       GROUP BY me.id ORDER BY me.ordem ASC, me.nome ASC`,
    )
    .bind(access.context.comunidadeId, ministerioId)
    .all<Record<string, unknown>>();
  const members = await db
    .prepare(
      `SELECT mem.equipe_id, mem.voluntario_id, mv.usuario_id, u.nome, mv.funcao
       FROM ministerio_equipe_membros mem
       JOIN ministerio_voluntarios mv ON mv.id = mem.voluntario_id
         AND mv.ministerio_id = mem.ministerio_id AND mv.comunidade_id = mem.comunidade_id
         AND mv.ativo = 1
       JOIN usuarios u ON u.id = mv.usuario_id AND u.ativo = 1
       WHERE mem.comunidade_id = ? AND mem.ministerio_id = ?
       ORDER BY u.nome ASC`,
    )
    .bind(access.context.comunidadeId, ministerioId)
    .all<Record<string, unknown>>();
  return Response.json(
    {
      equipes: teams.results.map((team) => ({
        ...team,
        membros: members.results.filter((member) => Number(member.equipe_id) === Number(team.id)),
      })),
      canManage,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("ministries.view");
  if ("error" in access) return access.error;
  const body = await safeJson(request);
  if (!body) return badRequest("Dados inválidos.");
  const ministerioId = positiveInteger(body.ministerioId);
  const nome = clean(body.nome, 80);
  const descricao = clean(body.descricao, 300);
  const cor = normalizeColor(body.cor);
  const ordem = Math.max(0, Math.min(999, Number(body.ordem) || 0));
  if (!ministerioId || !nome || !cor) return badRequest("Informe ministério, nome e cor.");
  const db = getD1();
  if (!(await canManageMinistry(db, access.context, access.user.id, ministerioId))) {
    return Response.json({ error: "Você não administra este ministério." }, { status: 403 });
  }
  try {
    const result = await db
      .prepare(
        `INSERT INTO ministerio_equipes
         (comunidade_id, ministerio_id, nome, descricao, cor, ordem, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(access.context.comunidadeId, ministerioId, nome, descricao, cor, ordem, access.user.id)
      .run();
    const id = Number(result.meta.last_row_id);
    await recordTenantAudit(db, access.context, access.user.id, "EQUIPE_MINISTERIAL_CRIADA", "SUCESSO", { ministerioId, equipeId: id });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (String(error).includes("UNIQUE")) return Response.json({ error: "Já existe uma equipe com esse nome." }, { status: 409 });
    throw error;
  }
}

function clean(value: unknown, length: number) { return String(value ?? "").trim().slice(0, length); }
function positiveInteger(value: unknown) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; }
function normalizeColor(value: unknown) { const color = clean(value, 7).toLowerCase(); return /^#[0-9a-f]{6}$/.test(color) ? color : ""; }
async function safeJson(request: Request) { try { return (await request.json()) as Record<string, unknown>; } catch { return null; } }
function badRequest(error: string) { return Response.json({ error }, { status: 400 }); }
