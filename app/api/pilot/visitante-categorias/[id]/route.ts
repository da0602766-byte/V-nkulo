import { getD1 } from "../../../../../db";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireVisitorCategoryManagement } from "../../../../lib/visitor-category-access";
import {
  findOverlappingAgeRule,
  migrateVisitorAgeCategories,
  parseCategoryAgeRule,
} from "../../../../lib/visitor-category-rules";

type Context = { params: Promise<{ id: string }> };
const ICONS = new Set(["◎", "◇", "♡", "✦", "♙", "▣", "○", "△"]);

export async function PATCH(request: Request, context: Context) {
  const access = await requireVisitorCategoryManagement();
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  const body = await safeJson(request);
  if (!Number.isInteger(id) || id <= 0 || !body) return badRequest("Categoria inválida.");
  const nome = clean(body.nome, 80);
  const descricao = clean(body.descricao, 240);
  const icone = clean(body.icone, 4) || "◎";
  const cor = normalizeColor(body.cor);
  const ordem = Math.max(0, Math.min(999, Number(body.ordem) || 0));
  const responsavelUsuarioId = positiveInteger(body.responsavelUsuarioId);
  const ministerioId = positiveInteger(body.ministerioId);
  const exibirDashboard = body.exibirDashboard !== false && body.exibirDashboard !== "false";
  const parsedAgeRule = parseCategoryAgeRule(body);
  if ("error" in parsedAgeRule) return badRequest(parsedAgeRule.error);
  const ageRule = parsedAgeRule.rule;
  if (!nome || !ICONS.has(icone) || !cor) return badRequest("Revise nome, ícone e cor.");
  const db = getD1();
  if (responsavelUsuarioId) {
    const member = await db
      .prepare(
        `SELECT uc.id FROM usuario_comunidades uc JOIN usuarios u ON u.id = uc.usuario_id
         WHERE uc.usuario_id = ? AND uc.comunidade_id = ?
           AND uc.status = 'ATIVO' AND u.ativo = 1 LIMIT 1`,
      )
      .bind(responsavelUsuarioId, access.context.comunidadeId)
      .first<{ id: number }>();
    if (!member) return badRequest("O responsável deve pertencer à comunidade ativa.");
  }
  if (ministerioId) {
    const ministry = await db
      .prepare(
        `SELECT id FROM ministerios_comunidade
         WHERE id = ? AND comunidade_id = ? AND status = 'ATIVO' LIMIT 1`,
      )
      .bind(ministerioId, access.context.comunidadeId)
      .first<{ id: number }>();
    if (!ministry) return badRequest("O ministério deve pertencer à comunidade ativa.");
  }
  const overlappingRule = await findOverlappingAgeRule(
    db,
    access.context.comunidadeId,
    ageRule,
    id,
  );
  if (overlappingRule) {
    return Response.json(
      { error: `A faixa informada se sobrepõe à categoria “${overlappingRule.nome}”.` },
      { status: 409 },
    );
  }
  try {
    const result = await db
      .prepare(
        `UPDATE visitante_categorias SET nome = ?, descricao = ?, icone = ?, cor = ?, ordem = ?,
          idade_minima = ?, idade_maxima = ?, migracao_automatica = ?, exibir_dashboard = ?,
          responsavel_usuario_id = ?, ministerio_id = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ? AND ativa = 1`,
      )
      .bind(
        nome,
        descricao,
        icone,
        cor,
        ordem,
        ageRule.idadeMinima,
        ageRule.idadeMaxima,
        ageRule.migracaoAutomatica ? 1 : 0,
        exibirDashboard ? 1 : 0,
        responsavelUsuarioId,
        ministerioId,
        id,
        access.context.comunidadeId,
      )
      .run();
    if (!Number(result.meta.changes)) return Response.json({ error: "Categoria não encontrada." }, { status: 404 });
    const migratedVisitors = await migrateVisitorAgeCategories(db, access.context.comunidadeId);
    await recordTenantAudit(db, access.context, access.user.id, "CATEGORIA_ACOMPANHAMENTO_ATUALIZADA", "SUCESSO", {
      categoriaId: id,
      ministerioId,
      regraEtaria: ageRule.migracaoAutomatica,
      visitantesMigrados: migratedVisitors,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      return Response.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: Context) {
  const access = await requireVisitorCategoryManagement();
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return badRequest("Categoria inválida.");
  const db = getD1();
  const linked = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM visitantes
       WHERE comunidade_id = ? AND categoria_id = ? AND ativo = 1 AND escopo_confirmado = 1`,
    )
    .bind(access.context.comunidadeId, id)
    .first<{ total: number }>();
  if (Number(linked?.total || 0) > 0) {
    return Response.json(
      { error: "Mova os visitantes desta categoria antes de excluí-la." },
      { status: 409 },
    );
  }
  const result = await db
    .prepare(
      `UPDATE visitante_categorias SET ativa = 0, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ? AND ativa = 1`,
    )
    .bind(id, access.context.comunidadeId)
    .run();
  if (!Number(result.meta.changes)) return Response.json({ error: "Categoria não encontrada." }, { status: 404 });
  await recordTenantAudit(db, access.context, access.user.id, "CATEGORIA_ACOMPANHAMENTO_EXCLUIDA", "SUCESSO", { categoriaId: id });
  return Response.json({ ok: true });
}

function normalizeColor(value: unknown) {
  const color = clean(value, 7).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : "";
}
function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
function clean(value: unknown, length: number) { return String(value ?? "").trim().slice(0, length); }
async function safeJson(request: Request) {
  try { return (await request.json()) as Record<string, unknown>; }
  catch { return null; }
}
function badRequest(error: string) { return Response.json({ error }, { status: 400 }); }
