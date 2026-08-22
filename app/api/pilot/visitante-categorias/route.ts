import { getD1 } from "../../../../db";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";
import { requireVisitorCategoryManagement } from "../../../lib/visitor-category-access";
import {
  findOverlappingAgeRule,
  migrateVisitorAgeCategories,
  parseCategoryAgeRule,
} from "../../../lib/visitor-category-rules";

const ICONS = new Set(["◎", "◇", "♡", "✦", "♙", "▣", "○", "△"]);

export async function GET() {
  const access = await requireTenantPermission("visitors.view");
  if ("error" in access) return access.error;
  const canManage =
    access.context.isOwner ||
    access.context.permissions.includes("visitor.categories.manage");
  const db = getD1();
  const firstMonth = firstMonthIso(5);
  const categories = await db
    .prepare(
      `SELECT vc.id, vc.nome, vc.descricao, vc.icone, vc.cor, vc.ordem,
        vc.idade_minima, vc.idade_maxima, vc.migracao_automatica, vc.exibir_dashboard,
        vc.responsavel_usuario_id, u.nome AS responsavel_nome,
        vc.ministerio_id, m.nome AS ministerio_nome,
        COUNT(v.id) AS total_visitantes
       FROM visitante_categorias vc
       LEFT JOIN usuarios u ON u.id = vc.responsavel_usuario_id
       LEFT JOIN ministerios_comunidade m
         ON m.id = vc.ministerio_id
        AND m.comunidade_id = vc.comunidade_id
        AND m.status = 'ATIVO'
       LEFT JOIN visitantes v ON v.categoria_id = vc.id
         AND v.comunidade_id = vc.comunidade_id
         AND v.ativo = 1 AND v.escopo_confirmado = 1
       WHERE vc.comunidade_id = ? AND vc.ativa = 1
       GROUP BY vc.id
       ORDER BY vc.ordem ASC, vc.nome ASC`,
    )
    .bind(access.context.comunidadeId)
    .all<Record<string, unknown>>();
  const growth = await db
    .prepare(
      `SELECT v.categoria_id, substr(v.criado_em, 1, 7) AS mes,
        COUNT(*) AS novos
       FROM visitantes v
       JOIN visitante_categorias vc
         ON vc.id = v.categoria_id
        AND vc.comunidade_id = v.comunidade_id
        AND vc.ativa = 1
       WHERE v.comunidade_id = ?
         AND v.ativo = 1 AND v.escopo_confirmado = 1
         AND date(v.criado_em) >= date(?)
       GROUP BY v.categoria_id, substr(v.criado_em, 1, 7)
       ORDER BY mes ASC, v.categoria_id ASC`,
    )
    .bind(access.context.comunidadeId, firstMonth)
    .all<Record<string, unknown>>();
  let responsibles: Record<string, unknown>[] = [];
  let ministries: Record<string, unknown>[] = [];
  if (canManage) {
    const [responsibleResult, ministryResult] = await Promise.all([
      db.prepare(
        `SELECT u.id, u.nome
         FROM usuario_comunidades uc
         JOIN usuarios u ON u.id = uc.usuario_id
         WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1
         ORDER BY u.nome ASC LIMIT 250`,
      ).bind(access.context.comunidadeId).all<Record<string, unknown>>(),
      db.prepare(
        `SELECT id, nome FROM ministerios_comunidade
         WHERE comunidade_id = ? AND status = 'ATIVO'
         ORDER BY nome ASC LIMIT 150`,
      ).bind(access.context.comunidadeId).all<Record<string, unknown>>(),
    ]);
    responsibles = responsibleResult.results;
    ministries = ministryResult.results;
  }
  return Response.json(
    {
      categorias: categories.results,
      crescimento: growth.results,
      meses: monthKeys(6),
      responsaveis: responsibles,
      ministerios: ministries,
      canManage,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireVisitorCategoryManagement();
  if ("error" in access) return access.error;
  const body = await safeJson(request);
  if (!body) return badRequest("Dados inválidos.");
  const nome = clean(body.nome, 80);
  const descricao = clean(body.descricao, 240);
  const icone = clean(body.icone, 4) || "◎";
  const cor = normalizeColor(body.cor);
  const requestedOrder = body.ordem === undefined || body.ordem === ""
    ? null
    : Math.max(0, Math.min(999, Number(body.ordem) || 0));
  const responsavelUsuarioId = positiveInteger(body.responsavelUsuarioId);
  const ministerioId = positiveInteger(body.ministerioId);
  const exibirDashboard = body.exibirDashboard !== false && body.exibirDashboard !== "false";
  const parsedAgeRule = parseCategoryAgeRule(body);
  if ("error" in parsedAgeRule) return badRequest(parsedAgeRule.error);
  const ageRule = parsedAgeRule.rule;
  if (!nome || !ICONS.has(icone) || !cor) {
    return badRequest("Informe nome, ícone e cor válidos.");
  }
  const db = getD1();
  if (responsavelUsuarioId && !(await activeMember(db, responsavelUsuarioId, access.context.comunidadeId))) {
    return badRequest("O responsável deve pertencer à comunidade ativa.");
  }
  if (ministerioId && !(await activeMinistry(db, ministerioId, access.context.comunidadeId))) {
    return badRequest("O ministério deve pertencer à comunidade ativa.");
  }
  const overlappingRule = await findOverlappingAgeRule(
    db,
    access.context.comunidadeId,
    ageRule,
  );
  if (overlappingRule) {
    return Response.json(
      { error: `A faixa informada se sobrepõe à categoria “${overlappingRule.nome}”.` },
      { status: 409 },
    );
  }
  const nextOrder = requestedOrder ?? Number((await db
    .prepare(
      `SELECT COALESCE(MAX(ordem), -10) + 10 AS ordem
       FROM visitante_categorias
       WHERE comunidade_id = ? AND ativa = 1`,
    )
    .bind(access.context.comunidadeId)
    .first<{ ordem: number }>())?.ordem || 0);
  try {
    const result = await db
      .prepare(
        `INSERT INTO visitante_categorias
         (comunidade_id, nome, descricao, icone, cor, ordem,
          idade_minima, idade_maxima, migracao_automatica, exibir_dashboard,
          responsavel_usuario_id, ministerio_id, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        access.context.comunidadeId,
        nome,
        descricao,
        icone,
        cor,
        nextOrder,
        ageRule.idadeMinima,
        ageRule.idadeMaxima,
        ageRule.migracaoAutomatica ? 1 : 0,
        exibirDashboard ? 1 : 0,
        responsavelUsuarioId,
        ministerioId,
        access.user.id,
      )
      .run();
    const id = Number(result.meta.last_row_id);
    const migratedVisitors = await migrateVisitorAgeCategories(db, access.context.comunidadeId);
    await recordTenantAudit(db, access.context, access.user.id, "CATEGORIA_ACOMPANHAMENTO_CRIADA", "SUCESSO", {
      categoriaId: id,
      ministerioId,
      regraEtaria: ageRule.migracaoAutomatica,
      visitantesMigrados: migratedVisitors,
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      return Response.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 });
    }
    throw error;
  }
}

export async function PUT(request: Request) {
  const access = await requireVisitorCategoryManagement();
  if ("error" in access) return access.error;
  const body = await safeJson(request);
  const ids = Array.isArray(body?.ids)
    ? body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (!body || ids.length < 2 || new Set(ids).size !== ids.length || ids.length > 200) {
    return badRequest("Ordem de categorias inválida.");
  }
  const db = getD1();
  const current = await db
    .prepare(
      `SELECT id FROM visitante_categorias
       WHERE comunidade_id = ? AND ativa = 1
       ORDER BY ordem ASC, nome ASC`,
    )
    .bind(access.context.comunidadeId)
    .all<{ id: number }>();
  const currentIds = current.results.map((item) => Number(item.id));
  if (currentIds.length !== ids.length || currentIds.some((id) => !ids.includes(id))) {
    return Response.json(
      { error: "A lista de categorias mudou. Atualize a página e tente novamente." },
      { status: 409 },
    );
  }
  await db.batch(ids.map((id, index) => db
    .prepare(
      `UPDATE visitante_categorias
       SET ordem = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ? AND ativa = 1`,
    )
    .bind(index * 10, id, access.context.comunidadeId)));
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "CATEGORIAS_ACOMPANHAMENTO_REORDENADAS",
    "SUCESSO",
    { ids },
  );
  return Response.json({ ok: true });
}

async function activeMinistry(db: ReturnType<typeof getD1>, ministryId: number, communityId: number) {
  return db.prepare(
    `SELECT id FROM ministerios_comunidade
     WHERE id = ? AND comunidade_id = ? AND status = 'ATIVO' LIMIT 1`,
  ).bind(ministryId, communityId).first<{ id: number }>();
}

function monthKeys(total: number) {
  return Array.from({ length: total }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (total - index - 1));
    return date.toISOString().slice(0, 7);
  });
}

function firstMonthIso(monthsAgo: number) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - monthsAgo);
  return date.toISOString().slice(0, 10);
}

async function activeMember(db: ReturnType<typeof getD1>, userId: number, communityId: number) {
  return db
    .prepare(
      `SELECT uc.id FROM usuario_comunidades uc JOIN usuarios u ON u.id = uc.usuario_id
       WHERE uc.usuario_id = ? AND uc.comunidade_id = ?
         AND uc.status = 'ATIVO' AND u.ativo = 1 LIMIT 1`,
    )
    .bind(userId, communityId)
    .first<{ id: number }>();
}

function normalizeColor(value: unknown) {
  const color = clean(value, 7).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : "";
}
function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
function clean(value: unknown, length: number) {
  return String(value ?? "").trim().slice(0, length);
}
async function safeJson(request: Request) {
  try { return (await request.json()) as Record<string, unknown>; }
  catch { return null; }
}
function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}
