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

const VISIONS = new Set([
  "todos",
  "novos",
  "acompanhamento",
  "pendencias",
  "sem_contato",
  "arquivados",
]);

export async function GET(request: Request) {
  const access = await requireTenantPermission("visitors.view");
  if ("error" in access) return access.error;
  const params = new URL(request.url).searchParams;
  const search = String(params.get("busca") || "").trim().slice(0, 80);
  const cursor = Math.max(0, Number(params.get("cursor") || 0) || 0);
  const categoryParam = String(params.get("categoria") || "").trim();
  const requestedVision = String(params.get("visao") || "todos").trim();
  const vision = VISIONS.has(requestedVision) ? requestedVision : "todos";
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
        v.ativo, v.criado_em, v.atualizado_em,
        c.nome AS celula_nome, vc.nome AS categoria_nome, vc.icone AS categoria_icone,
        vc.cor AS categoria_cor,
        (SELECT MAX(a.criado_em) FROM acompanhamentos a
          WHERE a.visitante_id = v.id AND a.comunidade_id = v.comunidade_id
            AND a.escopo_confirmado = 1) AS ultimo_contato,
        (SELECT a.proximo_contato FROM acompanhamentos a
          WHERE a.visitante_id = v.id AND a.comunidade_id = v.comunidade_id
            AND a.escopo_confirmado = 1
          ORDER BY a.id DESC LIMIT 1) AS proximo_contato,
        (SELECT a.responsavel_email FROM acompanhamentos a
          WHERE a.visitante_id = v.id AND a.comunidade_id = v.comunidade_id
            AND a.escopo_confirmado = 1
          ORDER BY a.id DESC LIMIT 1) AS responsavel_email,
        (SELECT COUNT(*) FROM acompanhamentos a
          WHERE a.visitante_id = v.id AND a.comunidade_id = v.comunidade_id
            AND a.escopo_confirmado = 1) AS acompanhamentos_total
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
        AND v.escopo_confirmado = 1
        AND (
          (? = 'arquivados' AND v.ativo = 0)
          OR (? <> 'arquivados' AND v.ativo = 1)
        )
        AND (
          ? = 'todos'
          OR ? = 'arquivados'
          OR (? = 'novos' AND v.status = 'NOVO')
          OR (? = 'acompanhamento' AND v.status = 'EM_ACOMPANHAMENTO')
          OR (? = 'pendencias' AND EXISTS (
            SELECT 1 FROM acompanhamentos ax
            WHERE ax.visitante_id = v.id AND ax.comunidade_id = v.comunidade_id
              AND ax.escopo_confirmado = 1 AND ax.proximo_contato IS NOT NULL
              AND ax.proximo_contato <= date('now')
          ))
          OR (? = 'sem_contato'
            AND date(v.data_entrada) <= date('now', '-15 days')
            AND NOT EXISTS (
              SELECT 1 FROM acompanhamentos ax
              WHERE ax.visitante_id = v.id AND ax.comunidade_id = v.comunidade_id
                AND ax.escopo_confirmado = 1
                AND datetime(ax.criado_em) > datetime('now', '-15 days')
            ))
        )
        AND (? = 0 OR v.id < ?)
        AND (? = 0 OR (? = -1 AND v.categoria_id IS NULL) OR v.categoria_id = ?)
        AND (? = '' OR v.nome_completo LIKE ? OR COALESCE(v.telefone, '') LIKE ? OR COALESCE(v.email, '') LIKE ?)
      ORDER BY v.id DESC
      LIMIT ?`,
    )
    .bind(
      access.context.comunidadeId,
      vision,
      vision,
      vision,
      vision,
      vision,
      vision,
      vision,
      vision,
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
  const counts = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN v.ativo = 1 THEN 1 ELSE 0 END) AS todos,
        SUM(CASE WHEN v.ativo = 0 THEN 1 ELSE 0 END) AS arquivados,
        SUM(CASE WHEN v.ativo = 1 AND v.status = 'NOVO' THEN 1 ELSE 0 END) AS novos,
        SUM(CASE WHEN v.ativo = 1 AND v.status = 'EM_ACOMPANHAMENTO' THEN 1 ELSE 0 END) AS acompanhamento,
        SUM(CASE WHEN v.ativo = 1 AND EXISTS (
          SELECT 1 FROM acompanhamentos a
          WHERE a.visitante_id = v.id AND a.comunidade_id = v.comunidade_id
            AND a.escopo_confirmado = 1 AND a.proximo_contato IS NOT NULL
            AND a.proximo_contato <= date('now')
        ) THEN 1 ELSE 0 END) AS pendencias,
        SUM(CASE WHEN v.ativo = 1
          AND date(v.data_entrada) <= date('now', '-15 days')
          AND NOT EXISTS (
            SELECT 1 FROM acompanhamentos a
            WHERE a.visitante_id = v.id AND a.comunidade_id = v.comunidade_id
              AND a.escopo_confirmado = 1
              AND datetime(a.criado_em) > datetime('now', '-15 days')
          ) THEN 1 ELSE 0 END) AS sem_contato
      FROM visitantes v
      WHERE v.comunidade_id = ? AND v.escopo_confirmado = 1`,
    )
    .bind(access.context.comunidadeId)
    .first<Record<string, number | null>>();
  return Response.json(
    {
      visitantes: visitors,
      nextCursor: hasMore ? Number(visitors.at(-1)?.id || 0) : null,
      aniversariantes: birthdays.results,
      contagens: {
        todos: Number(counts?.todos || 0),
        novos: Number(counts?.novos || 0),
        acompanhamento: Number(counts?.acompanhamento || 0),
        pendencias: Number(counts?.pendencias || 0),
        sem_contato: Number(counts?.sem_contato || 0),
        arquivados: Number(counts?.arquivados || 0),
      },
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
  const rawCategoriaNome = cleanText(payload.categoriaNome, 80);
  const categoriaNome = /^(sem\s+categoria|[-—])$/i.test(rawCategoriaNome)
    ? ""
    : rawCategoriaNome;

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
  let category = categoriaId
    ? await db
        .prepare(
          `SELECT id FROM visitante_categorias
           WHERE id = ? AND comunidade_id = ? AND ativa = 1`,
        )
        .bind(categoriaId, access.context.comunidadeId)
        .first<{ id: number }>()
    : null;
  if (!category && categoriaNome) {
    category = await db
      .prepare(
        `SELECT id FROM visitante_categorias
         WHERE comunidade_id = ? AND lower(trim(nome)) = lower(trim(?))`,
      )
      .bind(access.context.comunidadeId, categoriaNome)
      .first<{ id: number }>();
    if (category) {
      await db
        .prepare(
          `UPDATE visitante_categorias
           SET ativa = 1, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(category.id, access.context.comunidadeId)
        .run();
    }
  }
  if (categoriaId && !category && !categoriaNome) {
    return Response.json(
      { error: "A categoria não pertence à comunidade ativa." },
      { status: 400 },
    );
  }
  if (!category && categoriaNome) {
    const nextOrder = await db
      .prepare(
        `SELECT COALESCE(MAX(ordem), 0) + 10 AS ordem
         FROM visitante_categorias WHERE comunidade_id = ?`,
      )
      .bind(access.context.comunidadeId)
      .first<{ ordem: number }>();
    const created = await db
      .prepare(
        `INSERT INTO visitante_categorias
         (comunidade_id, nome, descricao, icone, cor, ordem, ativa, criado_por)
         VALUES (?, ?, '', '◎', '#7357e8', ?, 1, ?)`,
      )
      .bind(
        access.context.comunidadeId,
        categoriaNome,
        Number(nextOrder?.ordem || 10),
        access.user.id,
      )
      .run();
    category = { id: Number(created.meta.last_row_id) };
  }
  const automaticCategory = await resolveAutomaticVisitorCategory(
    db,
    access.context.comunidadeId,
    dataNascimento || null,
  );
  // Uma categoria declarada na planilha ou no formulário representa a intenção
  // explícita de quem está cadastrando; a classificação por idade fica como
  // sugestão apenas quando ela não foi informada.
  const effectiveCategoryId = category?.id || automaticCategory?.id || null;

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
