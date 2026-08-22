import { getD1 } from "../../../../db";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";
import {
  migrateVisitorAgeCategories,
  resolveAutomaticVisitorCategory,
} from "../../../lib/visitor-category-rules";

const BAPTISM = new Set(["SIM", "NAO", "NAO_INFORMADO"]);
const STATUS = new Set([
  "NOVO",
  "EM_CONTATO",
  "EM_ACOMPANHAMENTO",
  "INTEGRADO",
]);
const PAGE_SIZE = 10;

export async function GET(request: Request) {
  const access = await requireTenantPermission("visitors.view");
  if ("error" in access) return access.error;
  const params = new URL(request.url).searchParams;
  const search = String(params.get("busca") || "").trim().slice(0, 80);
  const cursor = Math.max(0, Number(params.get("cursor") || 0) || 0);
  const categoryParam = String(params.get("categoria") || "").trim();
  const categoryMode = categoryParam === "sem-categoria"
    ? -1
    : Math.max(0, Number(categoryParam) || 0);
  const like = `%${search}%`;
  const db = getD1();
  const migratedVisitors = await migrateVisitorAgeCategories(db, access.context.comunidadeId);
  if (migratedVisitors > 0) {
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "VISITANTES_CATEGORIA_ETARIA_RECONCILIADA",
      "SUCESSO",
      { visitantesMigrados: migratedVisitors },
    );
  }
  if (params.get("duplicidade") === "1") {
    const duplicates = await findPotentialDuplicates(db, access.context.comunidadeId, {
      nome: cleanText(params.get("nome"), 120),
      email: cleanText(params.get("email"), 180).toLowerCase(),
      telefone: cleanText(params.get("telefone"), 30),
      parente: cleanText(params.get("parente"), 120),
    });
    return Response.json(
      { duplicados: duplicates },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const result = await db
    .prepare(
      `SELECT v.id, v.nome_completo, v.data_nascimento, v.telefone, v.email,
        v.batizado, v.status, v.endereco, v.acompanhante, v.parente,
        v.encontro_com_deus, v.curso_membros, v.ministerio,
        v.data_entrada, v.observacoes, v.celula_id, v.categoria_id, v.criado_por,
        c.nome AS celula_nome, vc.nome AS categoria_nome, vc.icone AS categoria_icone,
        vc.cor AS categoria_cor, v.criado_em, v.atualizado_em
      FROM visitantes v
      LEFT JOIN celulas c
        ON c.id = v.celula_id
       AND c.comunidade_id = v.comunidade_id
       AND c.escopo_confirmado = 1
      LEFT JOIN visitante_categorias vc
        ON vc.id = v.categoria_id
       AND vc.comunidade_id = v.comunidade_id
       AND vc.ativa = 1
      WHERE v.comunidade_id = ?
        AND v.ativo = 1
        AND v.escopo_confirmado = 1
        AND (? = 0 OR v.id < ?)
        AND (? = 0 OR (? = -1 AND v.categoria_id IS NULL) OR v.categoria_id = ?)
        AND (? = '' OR v.nome_completo LIKE ? OR COALESCE(v.telefone, '') LIKE ? OR COALESCE(v.email, '') LIKE ?)
      ORDER BY v.id DESC
      LIMIT ?`,
    )
    .bind(
      access.context.comunidadeId,
      cursor,
      cursor,
      categoryMode,
      categoryMode,
      categoryMode,
      search,
      like,
      like,
      like,
      PAGE_SIZE + 1,
    )
    .all<Record<string, unknown>>();
  const hasMore = result.results.length > PAGE_SIZE;
  const visitors = result.results.slice(0, PAGE_SIZE);
  const month = new Date().toISOString().slice(5, 7);
  const birthdays = await db
    .prepare(
      `SELECT id, nome_completo, data_nascimento, telefone
       FROM visitantes
       WHERE comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1
         AND data_nascimento IS NOT NULL
         AND substr(data_nascimento, 6, 2) = ?
       ORDER BY substr(data_nascimento, 9, 2) ASC, nome_completo ASC
       LIMIT 5`,
    )
    .bind(access.context.comunidadeId, month)
    .all<Record<string, unknown>>();
  return Response.json(
    {
      visitantes: visitors,
      nextCursor: hasMore ? Number(visitors.at(-1)?.id || 0) : null,
      aniversariantes: birthdays.results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("visitors.create");
  if ("error" in access) return access.error;
  const payload = (await request.json()) as Record<
    string,
    string | number | boolean | null
  >;
  const nome = cleanText(payload.nomeCompleto, 120);
  const telefone = cleanText(payload.telefone, 30);
  const email = cleanText(payload.email, 180).toLowerCase();
  const dataNascimento = cleanText(payload.dataNascimento, 10);
  const endereco = cleanText(payload.endereco, 250);
  const acompanhante = cleanText(payload.acompanhante, 120);
  const parente = cleanText(payload.parente, 120);
  const ministerio = cleanText(payload.ministerio, 120);
  const encontroComDeus = Boolean(payload.encontroComDeus);
  const cursoMembros = Boolean(payload.cursoMembros);
  const batizado = cleanText(payload.batizado, 30).toUpperCase() || "NAO_INFORMADO";
  const status = cleanText(payload.status, 40).toUpperCase() || "NOVO";
  const dataEntrada =
    cleanText(payload.dataEntrada, 10) || new Date().toISOString().slice(0, 10);
  const observacoes = cleanText(payload.observacoes, 1000);
  const celulaId = Number(payload.celulaId || 0) || null;
  const categoriaId = Number(payload.categoriaId || 0) || null;

  if (!nome) {
    return Response.json(
      { error: "Nome completo é obrigatório." },
      { status: 400 },
    );
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (dataNascimento && !isIsoDate(dataNascimento)) {
    return Response.json(
      { error: "Data de nascimento inválida." },
      { status: 400 },
    );
  }
  if (!BAPTISM.has(batizado) || !STATUS.has(status) || !isIsoDate(dataEntrada)) {
    return Response.json(
      { error: "Revise batismo, status e data de entrada." },
      { status: 400 },
    );
  }

  const db = getD1();
  const duplicates = await findPotentialDuplicates(db, access.context.comunidadeId, {
    nome,
    telefone,
    email,
    parente,
  });
  if (duplicates.length) {
    return Response.json(
      {
        error: "Já existe uma ficha semelhante. Abra o cadastro existente antes de continuar.",
        duplicados: duplicates,
      },
      { status: 409 },
    );
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
  const effectiveCategoryId = automaticCategory?.id || category?.id || null;

  const result = await db
    .prepare(
      `INSERT INTO visitantes (
        comunidade_id, nome_completo, data_nascimento, telefone, email,
        batizado, status, endereco, acompanhante, parente, celula, celula_id, categoria_id,
        encontro_com_deus, curso_membros, ministerio, data_entrada,
        observacoes, criado_por, ativo, escopo_confirmado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
    )
    .bind(
      access.context.comunidadeId,
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
      access.user.email,
    )
    .run();
  const visitorId = Number(result.meta.last_row_id);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "VISITANTE_V45_CRIADO",
    "SUCESSO",
    {
      visitanteId: visitorId,
      celulaId: cell?.id || null,
      categoriaId: effectiveCategoryId,
      categoriaAutomatica: Boolean(automaticCategory),
    },
  );
  return Response.json({ id: visitorId }, { status: 201 });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

type DuplicateInput = {
  nome: string;
  telefone: string;
  email: string;
  parente: string;
};

async function findPotentialDuplicates(
  db: ReturnType<typeof getD1>,
  communityId: number,
  input: DuplicateInput,
) {
  const nome = input.nome.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const telefone = onlyDigits(input.telefone);
  const parente = input.parente.trim().toLowerCase();
  if (nome.length < 3 && !email && telefone.length < 8 && parente.length < 3) return [];
  const result = await db
    .prepare(
      `SELECT id, nome_completo, email, telefone, parente, data_nascimento,
        status, ativo, data_entrada
       FROM visitantes
       WHERE comunidade_id = ? AND escopo_confirmado = 1
         AND (
           (? <> '' AND lower(trim(nome_completo)) = ?)
           OR (? <> '' AND lower(trim(COALESCE(email, ''))) = ?)
           OR (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telefone, ''), '(', ''), ')', ''), '-', ''), ' ', ''), '+', ''), '.', '') = ?)
           OR (? <> '' AND lower(trim(COALESCE(parente, ''))) = ?)
         )
       ORDER BY ativo DESC, atualizado_em DESC
       LIMIT 5`,
    )
    .bind(
      communityId,
      nome,
      nome,
      email,
      email,
      telefone,
      telefone,
      parente,
      parente,
    )
    .all<Record<string, unknown>>();
  return result.results;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}
