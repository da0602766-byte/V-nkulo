import { parseVisitorCare, isVisitorDate, visitorBoolean } from "../../../../lib/visitor-care";
import { visitorToday } from "../../../../lib/visitor-attention";
import { getD1 } from "../../../../../db";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";
import { resolveAutomaticVisitorCategory } from "../../../../lib/visitor-category-rules";

type Context = { params: Promise<{ id: string }> };
const BAPTISM = new Set(["SIM", "NAO", "NAO_INFORMADO"]);
const STATUS = new Set([
  "NOVO",
  "EM_CONTATO",
  "EM_ACOMPANHAMENTO",
  "INTEGRADO",
]);

export async function PATCH(request: Request, context: Context) {
  const access = await requireTenantPermission("visitors.edit");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Visitante inválido." }, { status: 400 });
  }
  const submitted = (await request.json()) as Record<
    string,
    string | number | boolean | null
  >;
  const db = getD1();
  const existing = await db.prepare("SELECT * FROM visitantes WHERE id = ? AND comunidade_id = ? AND escopo_confirmado = 1").bind(id, access.context.comunidadeId).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Visitante não encontrado." }, { status: 404 });
  if (submitted.reativar === true) {
    if (!access.context.permissions.includes("visitors.deactivate")) return Response.json({ error: "Sem permissão para reativar." }, { status: 403 });
    await db.prepare("UPDATE visitantes SET ativo = 1, status = 'EM_ACOMPANHAMENTO', atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?").bind(id, access.context.comunidadeId).run();
    await recordTenantAudit(db, access.context, access.user.id, "VISITANTE_REATIVADO", "SUCESSO", { visitanteId: id });
    return Response.json({ ok: true });
  }
  if (!existing.ativo) return Response.json({ error: "Reative a ficha antes de editar." }, { status: 409 });
  const legacy = { nomeCompleto: "nome_completo", telefone: "telefone", email: "email", dataNascimento: "data_nascimento", endereco: "endereco", acompanhante: "acompanhante", parente: "parente", ministerio: "ministerio", encontroComDeus: "encontro_com_deus", cursoMembros: "curso_membros", batizado: "batizado", status: "status", dataEntrada: "data_entrada", observacoes: "observacoes", celulaId: "celula_id", categoriaId: "categoria_id" };
  const payload = { ...Object.fromEntries(Object.entries(legacy).map(([key, col]) => [key, existing[col]])), ...submitted };
  const care = parseVisitorCare(submitted, existing);
  if ("error" in care) return Response.json({ error: care.error }, { status: 400 });
  const nome = cleanText(payload.nomeCompleto, 120);
  const telefone = cleanText(payload.telefone, 30);
  const email = cleanText(payload.email, 180).toLowerCase();
  const dataNascimento = cleanText(payload.dataNascimento, 10);
  const endereco = cleanText(payload.endereco, 250);
  const acompanhante = cleanText(payload.acompanhante, 120);
  const parente = cleanText(payload.parente, 120);
  const ministerio = cleanText(payload.ministerio, 120);
  const encontroComDeus = visitorBoolean(payload.encontroComDeus);
  const cursoMembros = visitorBoolean(payload.cursoMembros);
  const batizado = cleanText(payload.batizado, 30).toUpperCase();
  const status = cleanText(payload.status, 40).toUpperCase();
  const dataEntrada = cleanText(payload.dataEntrada, 10);
  const observacoes = cleanText(payload.observacoes, 1000);
  const celulaId = Number(payload.celulaId || 0) || null;
  const categoriaId = Number(payload.categoriaId || 0) || null;
  if (
    !nome ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    (dataNascimento && (!isVisitorDate(dataNascimento) || dataNascimento > visitorToday())) ||
    !BAPTISM.has(batizado) ||
    !STATUS.has(status) ||
    !isVisitorDate(dataEntrada) || dataEntrada > visitorToday() || (batizado !== "SIM" && care.values.certificado_batismo === "SIM")
  ) {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const cell = celulaId
    ? await db
        .prepare(
          `SELECT id, nome FROM celulas
          WHERE id = ? AND comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1`,
        )
        .bind(celulaId, access.context.comunidadeId)
        .first<{ id: number; nome: string }>()
    : null;
  if (celulaId && !cell) {
    return Response.json(
      { error: "A célula não pertence à comunidade ativa." },
      { status: 400 },
    );
  }
  const category = categoriaId
    ? await db
        .prepare(
          `SELECT id FROM visitante_categorias
           WHERE id = ? AND comunidade_id = ? AND ativa = 1`,
        )
        .bind(categoriaId, access.context.comunidadeId)
        .first<{ id: number }>()
    : null;
  if (categoriaId && !category) {
    return Response.json(
      { error: "A categoria não pertence à comunidade ativa." },
      { status: 400 },
    );
  }
  const automaticCategory = await resolveAutomaticVisitorCategory(
    db,
    access.context.comunidadeId,
    dataNascimento || null,
  );
  const effectiveCategoryId = category?.id || automaticCategory?.id || null;
  await db
    .prepare(
      `UPDATE visitantes SET
        nome_completo = ?, data_nascimento = ?, telefone = ?, email = ?,
        batizado = ?, status = ?, endereco = ?, acompanhante = ?, parente = ?,
        celula = ?, celula_id = ?, categoria_id = ?, encontro_com_deus = ?,
        curso_membros = ?, ministerio = ?, data_entrada = ?, observacoes = ?,
        ${Object.keys(care.values).map(column => `${column} = ?`).join(", ")},
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1`,
    )
    .bind(
      nome,
      dataNascimento || null,
      telefone || null,
      email || null,
      batizado,
      status,
      endereco || null,
      acompanhante || null,
      parente || null,
      cell?.nome || null,
      cell?.id || null,
      effectiveCategoryId,
      encontroComDeus ? 1 : 0,
      cursoMembros ? 1 : 0,
      ministerio || null,
      dataEntrada,
      observacoes || null,
      ...Object.values(care.values),
      id,
      access.context.comunidadeId,
    )
    .run();
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "VISITANTE_V45_ATUALIZADO",
    "SUCESSO",
    {
      visitanteId: id,
      camposAlterados: Object.keys(submitted).filter(key => key !== "observacoes"),
      proximaAcaoConcluida: Boolean(existing.proxima_acao && Object.hasOwn(submitted, "proximaAcao") && !care.values.proxima_acao),
      celulaId: cell?.id || null,
      categoriaId: effectiveCategoryId,
      categoriaAutomatica: Boolean(automaticCategory),
    },
  );
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: Context) {
  const access = await requireTenantPermission("visitors.deactivate");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Visitante inválido." }, { status: 400 });
  }
  const db = getD1();
  const permanent = new URL(request.url).searchParams.get("permanente") === "1";
  if (permanent) {
    const result = await db
      .prepare(
        `DELETE FROM visitantes
         WHERE id = ? AND comunidade_id = ? AND escopo_confirmado = 1`,
      )
      .bind(id, access.context.comunidadeId)
      .run();
    if (!Number(result.meta.changes)) {
      return Response.json({ error: "Visitante não encontrado." }, { status: 404 });
    }
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "VISITANTE_EXCLUIDO_DEFINITIVAMENTE",
      "SUCESSO",
      { visitanteId: id },
    );
    return Response.json({ ok: true, permanente: true });
  }
  const result = await db
    .prepare(
      `UPDATE visitantes SET ativo = 0, status = 'INATIVO',
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1`,
    )
    .bind(id, access.context.comunidadeId)
    .run();
  if (!Number(result.meta.changes)) {
    return Response.json({ error: "Visitante não encontrado." }, { status: 404 });
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "VISITANTE_V45_DESATIVADO",
    "SUCESSO",
    { visitanteId: id },
  );
  return Response.json({ ok: true });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}
