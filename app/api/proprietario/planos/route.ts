import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";

// Catálogo de planos da plataforma. Toda a autorização é feita no servidor
// pela guarda `owner()`; nenhuma decisão de permissão depende do cliente.

type PlanRow = {
  id: number;
  nome: string;
  slug: string;
  descricao: string;
  preco_centavos: number;
  periodicidade: string;
  limite_membros: number;
  limite_armazenamento_mb: number;
  modulos: string;
  recursos: string;
  dias_teste: number;
  duracao_meses: number;
  desconto_percentual: number;
  regras: string;
  comunidade_exclusiva_id: number | null;
  status: string;
  criado_em: string;
  atualizado_em: string;
  comunidade_exclusiva_nome: string | null;
  assinaturas: number;
  assinaturas_ativas: number;
};

type CouponRow = {
  id: number;
  codigo: string;
  tipo: string;
  valor: number;
  plano_id: number | null;
  plano_nome: string | null;
  valido_ate: string | null;
  usos_maximos: number;
  usos: number;
  ativo: number;
  criado_em: string;
};

const PERIODICIDADES = ["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL", "PERSONALIZADO"] as const;

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

async function owner() {
  const user = await getSessionUser();
  if (!user) return { error: Response.json({ error: "Faça login para continuar." }, { status: 401 }) } as const;
  if (!user.ativo || !user.system_owner) {
    return { error: Response.json({ error: "Esta área é exclusiva do proprietário do sistema." }, { status: 403 }) } as const;
  }
  return { user } as const;
}

function id(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function count(value: unknown, max = 100_000_000) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max);
}

function percent(value: unknown) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

function list(value: unknown, max = 40) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  for (const item of value) {
    const entry = clean(item, 60);
    if (entry) seen.add(entry);
    if (seen.size >= max) break;
  }
  return [...seen];
}

function periodicidade(value: unknown) {
  const parsed = clean(value, 20).toUpperCase();
  return (PERIODICIDADES as readonly string[]).includes(parsed) ? parsed : "MENSAL";
}

function isoDate(value: unknown) {
  const parsed = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : null;
}

async function audit(
  db: ReturnType<typeof getD1>,
  userId: number,
  event: string,
  metadata: Record<string, unknown>,
  comunidadeId: number | null = null,
) {
  await db
    .prepare("INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados) VALUES (?, ?, ?, 'SUCESSO', ?)")
    .bind(comunidadeId, userId, event, JSON.stringify(metadata))
    .run();
}

function parseList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function view(row: PlanRow) {
  return {
    id: row.id,
    nome: row.nome,
    slug: row.slug,
    descricao: row.descricao,
    precoCentavos: Number(row.preco_centavos) || 0,
    periodicidade: row.periodicidade,
    limiteMembros: Number(row.limite_membros) || 0,
    limiteArmazenamentoMb: Number(row.limite_armazenamento_mb) || 0,
    modulos: parseList(row.modulos),
    recursos: parseList(row.recursos),
    diasTeste: Number(row.dias_teste) || 0,
    duracaoMeses: Number(row.duracao_meses) || 0,
    descontoPercentual: Number(row.desconto_percentual) || 0,
    comunidadeExclusivaId: row.comunidade_exclusiva_id,
    comunidadeExclusivaNome: row.comunidade_exclusiva_nome,
    status: row.status,
    assinaturas: Number(row.assinaturas) || 0,
    assinaturasAtivas: Number(row.assinaturas_ativas) || 0,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

const PLAN_SELECT = `SELECT p.*, c.nome AS comunidade_exclusiva_nome,
    (SELECT COUNT(*) FROM assinaturas_comunidade a WHERE a.plano_id = p.id) AS assinaturas,
    (SELECT COUNT(*) FROM assinaturas_comunidade a WHERE a.plano_id = p.id AND a.status IN ('ATIVA','TESTE','CARENCIA','INADIMPLENTE')) AS assinaturas_ativas
  FROM planos_plataforma p
  LEFT JOIN comunidades c ON c.id = p.comunidade_exclusiva_id`;

async function uniqueSlug(db: ReturnType<typeof getD1>, base: string, ignoreId = 0) {
  const root = base || "plano";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`.slice(0, 72);
    const existing = await db
      .prepare("SELECT id FROM planos_plataforma WHERE slug = ? AND id <> ? LIMIT 1")
      .bind(candidate, ignoreId)
      .first<{ id: number }>();
    if (!existing) return candidate;
  }
  return `${root}-${Date.now()}`.slice(0, 72);
}

export async function GET() {
  const access = await owner();
  if ("error" in access) return access.error;
  const db = getD1();
  const [plans, communities, coupons] = await Promise.all([
    db.prepare(`${PLAN_SELECT} ORDER BY CASE p.status WHEN 'ATIVO' THEN 0 ELSE 1 END, p.preco_centavos ASC, p.nome ASC LIMIT 200`).all<PlanRow>(),
    db.prepare("SELECT id, nome, status FROM comunidades ORDER BY nome ASC LIMIT 500").all<{ id: number; nome: string; status: string }>(),
    db
      .prepare(
        `SELECT cp.*, p.nome AS plano_nome FROM cupons_assinatura cp
         LEFT JOIN planos_plataforma p ON p.id = cp.plano_id
         ORDER BY cp.ativo DESC, cp.criado_em DESC LIMIT 200`,
      )
      .all<CouponRow>(),
  ]);
  return Response.json(
    {
      plans: plans.results.map(view),
      communities: communities.results.map((row) => ({ id: row.id, nome: row.nome, status: row.status })),
      coupons: coupons.results.map((row) => ({
        id: row.id,
        codigo: row.codigo,
        tipo: row.tipo,
        valor: Number(row.valor) || 0,
        planoId: row.plano_id,
        planoNome: row.plano_nome,
        validoAte: row.valido_ate,
        usosMaximos: Number(row.usos_maximos) || 0,
        usos: Number(row.usos) || 0,
        ativo: Boolean(row.ativo),
        criadoEm: row.criado_em,
      })),
      periodicidades: PERIODICIDADES,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  }
  const nome = clean(body.nome, 120);
  if (nome.length < 2) return Response.json({ error: "Informe um nome com pelo menos 2 caracteres." }, { status: 400 });
  const db = getD1();
  const slug = await uniqueSlug(db, slugify(clean(body.slug, 72) || nome));
  const exclusiva = id(body.comunidadeExclusivaId);
  if (exclusiva) {
    const community = await db.prepare("SELECT id FROM comunidades WHERE id = ? LIMIT 1").bind(exclusiva).first<{ id: number }>();
    if (!community) return Response.json({ error: "Comunidade exclusiva não encontrada." }, { status: 400 });
  }
  const result = await db
    .prepare(
      `INSERT INTO planos_plataforma
        (nome, slug, descricao, preco_centavos, periodicidade, limite_membros, limite_armazenamento_mb,
         modulos, recursos, dias_teste, duracao_meses, desconto_percentual, regras, comunidade_exclusiva_id, status, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, 'ATIVO', ?)`,
    )
    .bind(
      nome,
      slug,
      clean(body.descricao, 600),
      count(body.precoCentavos),
      periodicidade(body.periodicidade),
      count(body.limiteMembros),
      count(body.limiteArmazenamentoMb),
      JSON.stringify(list(body.modulos)),
      JSON.stringify(list(body.recursos)),
      count(body.diasTeste, 365),
      count(body.duracaoMeses, 120),
      percent(body.descontoPercentual),
      exclusiva || null,
      access.user.id,
    )
    .run();
  await audit(db, access.user.id, "PLANO_CRIADO", { planoId: result.meta.last_row_id, slug, nome });
  return Response.json({ ok: true, id: result.meta.last_row_id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  }
  const db = getD1();
  const action = clean(body.action, 30).toUpperCase();

  if (action === "COUPON_CREATE") {
    const codigo = clean(body.codigo, 40).toUpperCase().replace(/\s+/g, "");
    if (codigo.length < 3) return Response.json({ error: "Informe um código de cupom com pelo menos 3 caracteres." }, { status: 400 });
    const tipo = clean(body.tipo, 20).toUpperCase() === "VALOR" ? "VALOR" : "PERCENTUAL";
    const valor = tipo === "PERCENTUAL" ? percent(body.valor) : count(body.valor);
    if (valor <= 0) return Response.json({ error: "Informe um valor de desconto maior que zero." }, { status: 400 });
    const planoId = id(body.planoId);
    if (planoId) {
      const plan = await db.prepare("SELECT id FROM planos_plataforma WHERE id = ? LIMIT 1").bind(planoId).first<{ id: number }>();
      if (!plan) return Response.json({ error: "Plano do cupom não encontrado." }, { status: 400 });
    }
    const existing = await db.prepare("SELECT id FROM cupons_assinatura WHERE codigo = ? LIMIT 1").bind(codigo).first<{ id: number }>();
    if (existing) return Response.json({ error: "Já existe um cupom com este código." }, { status: 409 });
    const result = await db
      .prepare("INSERT INTO cupons_assinatura (codigo, tipo, valor, plano_id, valido_ate, usos_maximos, ativo, criado_por) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
      .bind(codigo, tipo, valor, planoId || null, isoDate(body.validoAte), count(body.usosMaximos, 1_000_000), access.user.id)
      .run();
    await audit(db, access.user.id, "CUPOM_CRIADO", { cupomId: result.meta.last_row_id, codigo, tipo, valor });
    return Response.json({ ok: true, id: result.meta.last_row_id }, { status: 201 });
  }

  if (action === "COUPON_TOGGLE") {
    const cupomId = id(body.cupomId ?? body.id);
    const coupon = await db.prepare("SELECT id, codigo, ativo FROM cupons_assinatura WHERE id = ? LIMIT 1").bind(cupomId).first<{ id: number; codigo: string; ativo: number }>();
    if (!coupon) return Response.json({ error: "Cupom não encontrado." }, { status: 404 });
    const ativo = coupon.ativo ? 0 : 1;
    await db.prepare("UPDATE cupons_assinatura SET ativo = ? WHERE id = ?").bind(ativo, cupomId).run();
    await audit(db, access.user.id, ativo ? "CUPOM_ATIVADO" : "CUPOM_DESATIVADO", { cupomId, codigo: coupon.codigo });
    return Response.json({ ok: true, ativo: Boolean(ativo) });
  }

  const planId = id(body.id ?? body.planoId);
  if (!planId) return Response.json({ error: "Plano inválido." }, { status: 400 });
  const current = await db.prepare("SELECT * FROM planos_plataforma WHERE id = ? LIMIT 1").bind(planId).first<PlanRow>();
  if (!current) return Response.json({ error: "Plano não encontrado." }, { status: 404 });

  if (action === "ARCHIVE" || action === "RESTORE") {
    const status = action === "ARCHIVE" ? "ARQUIVADO" : "ATIVO";
    await db.prepare("UPDATE planos_plataforma SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").bind(status, planId).run();
    await audit(db, access.user.id, action === "ARCHIVE" ? "PLANO_ARQUIVADO" : "PLANO_RESTAURADO", { planoId: planId, nome: current.nome });
    return Response.json({ ok: true });
  }

  if (action === "DELETE") return deletePlan(db, access.user.id, planId, current.nome);

  const nome = clean(body.nome ?? current.nome, 120);
  if (nome.length < 2) return Response.json({ error: "Informe um nome com pelo menos 2 caracteres." }, { status: 400 });
  const slug = await uniqueSlug(db, slugify(clean(body.slug, 72) || nome), planId);
  const exclusiva = body.comunidadeExclusivaId === undefined ? Number(current.comunidade_exclusiva_id) || 0 : id(body.comunidadeExclusivaId);
  if (exclusiva) {
    const community = await db.prepare("SELECT id FROM comunidades WHERE id = ? LIMIT 1").bind(exclusiva).first<{ id: number }>();
    if (!community) return Response.json({ error: "Comunidade exclusiva não encontrada." }, { status: 400 });
  }
  await db
    .prepare(
      `UPDATE planos_plataforma SET nome = ?, slug = ?, descricao = ?, preco_centavos = ?, periodicidade = ?,
        limite_membros = ?, limite_armazenamento_mb = ?, modulos = ?, recursos = ?, dias_teste = ?,
        duracao_meses = ?, desconto_percentual = ?, comunidade_exclusiva_id = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      nome,
      slug,
      clean(body.descricao ?? current.descricao, 600),
      body.precoCentavos === undefined ? Number(current.preco_centavos) || 0 : count(body.precoCentavos),
      body.periodicidade === undefined ? current.periodicidade : periodicidade(body.periodicidade),
      body.limiteMembros === undefined ? Number(current.limite_membros) || 0 : count(body.limiteMembros),
      body.limiteArmazenamentoMb === undefined ? Number(current.limite_armazenamento_mb) || 0 : count(body.limiteArmazenamentoMb),
      body.modulos === undefined ? current.modulos : JSON.stringify(list(body.modulos)),
      body.recursos === undefined ? current.recursos : JSON.stringify(list(body.recursos)),
      body.diasTeste === undefined ? Number(current.dias_teste) || 0 : count(body.diasTeste, 365),
      body.duracaoMeses === undefined ? Number(current.duracao_meses) || 0 : count(body.duracaoMeses, 120),
      body.descontoPercentual === undefined ? Number(current.desconto_percentual) || 0 : percent(body.descontoPercentual),
      exclusiva || null,
      planId,
    )
    .run();
  await audit(db, access.user.id, "PLANO_ATUALIZADO", { planoId: planId, nome });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  const planId = id(new URL(request.url).searchParams.get("id"));
  if (!planId) return Response.json({ error: "Plano inválido." }, { status: 400 });
  const db = getD1();
  const current = await db.prepare("SELECT id, nome FROM planos_plataforma WHERE id = ? LIMIT 1").bind(planId).first<{ id: number; nome: string }>();
  if (!current) return Response.json({ error: "Plano não encontrado." }, { status: 404 });
  return deletePlan(db, access.user.id, planId, current.nome);
}

async function deletePlan(db: ReturnType<typeof getD1>, userId: number, planId: number, nome: string) {
  const linked = await db
    .prepare("SELECT COUNT(*) AS total FROM assinaturas_comunidade WHERE plano_id = ?")
    .bind(planId)
    .first<{ total: number }>();
  const total = Number(linked?.total) || 0;
  if (total > 0) {
    return Response.json(
      {
        error: `Este plano possui ${total} assinatura${total > 1 ? "s" : ""} vinculada${total > 1 ? "s" : ""} e não pode ser excluído. Arquive o plano ou migre as comunidades para outro plano antes de excluir.`,
      },
      { status: 409 },
    );
  }
  await db.prepare("UPDATE cupons_assinatura SET plano_id = NULL WHERE plano_id = ?").bind(planId).run();
  await db.prepare("DELETE FROM planos_plataforma WHERE id = ?").bind(planId).run();
  await audit(db, userId, "PLANO_EXCLUIDO", { planoId: planId, nome });
  return Response.json({ ok: true });
}
