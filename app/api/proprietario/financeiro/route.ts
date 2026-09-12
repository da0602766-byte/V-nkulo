import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";

// Financeiro do Proprietário. Hoje o registro de pagamento é MANUAL /
// ADMINISTRATIVO: quem confirma uma cobrança é o proprietário, informando
// método e observação. Os campos `provedor` e `referencia_externa` já existem
// no schema justamente para que um futuro adaptador de gateway preencha os
// MESMOS campos sem alterar este contrato. Nenhuma API externa é chamada aqui
// e nenhum fornecedor específico é pressuposto.

type ChargeRow = {
  id: number;
  assinatura_id: number;
  comunidade_id: number;
  comunidade_nome: string | null;
  plano_id: number | null;
  plano_nome: string | null;
  competencia: string;
  valor_centavos: number;
  desconto_centavos: number;
  status: string;
  vence_em: string;
  pago_em: string | null;
  metodo: string;
  provedor: string;
  referencia_externa: string;
  tentativas: number;
  observacoes: string;
  criado_em: string;
};

type SubscriptionRow = {
  id: number;
  comunidade_id: number;
  comunidade_nome: string | null;
  plano_id: number;
  plano_nome: string | null;
  status: string;
  inicia_em: string;
  renova_em: string | null;
  teste_ate: string | null;
  carencia_ate: string | null;
  cancelado_em: string | null;
  cupom: string;
  desconto_percentual: number;
  renovacao_automatica: number;
  observacoes: string;
  preco_centavos: number | null;
  periodicidade: string | null;
  dias_teste: number | null;
  duracao_meses: number | null;
};

const CHARGE_STATUS = ["PENDENTE", "PAGA", "VENCIDA", "CANCELADA", "ESTORNADA"] as const;
const SUBSCRIPTION_STATUS = ["TESTE", "ATIVA", "INADIMPLENTE", "CARENCIA", "CANCELADA", "SUSPENSA"] as const;
const MESES_POR_PERIODICIDADE: Record<string, number> = {
  MENSAL: 1,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
};

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

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

function competencia(value: unknown) {
  const parsed = clean(value, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(parsed) ? parsed : "";
}

function isoDate(value: unknown) {
  const parsed = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(from: string, days: number) {
  const base = new Date(`${from}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function addMonths(from: string, months: number) {
  const base = new Date(`${from}T00:00:00Z`);
  const day = base.getUTCDate();
  base.setUTCDate(1);
  base.setUTCMonth(base.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(day, lastDay));
  return base.toISOString().slice(0, 10);
}

function cycleMonths(periodicidade: string | null, duracaoMeses: number | null) {
  const meses = MESES_POR_PERIODICIDADE[String(periodicidade || "MENSAL").toUpperCase()];
  if (meses) return meses;
  return Math.max(1, Number(duracaoMeses) || 1);
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

const CHARGE_SELECT = `SELECT b.*, c.nome AS comunidade_nome, a.plano_id, p.nome AS plano_nome
  FROM cobrancas_assinatura b
  LEFT JOIN comunidades c ON c.id = b.comunidade_id
  LEFT JOIN assinaturas_comunidade a ON a.id = b.assinatura_id
  LEFT JOIN planos_plataforma p ON p.id = a.plano_id`;

const SUBSCRIPTION_SELECT = `SELECT a.*, c.nome AS comunidade_nome, p.nome AS plano_nome,
    p.preco_centavos, p.periodicidade, p.dias_teste, p.duracao_meses
  FROM assinaturas_comunidade a
  LEFT JOIN comunidades c ON c.id = a.comunidade_id
  LEFT JOIN planos_plataforma p ON p.id = a.plano_id`;

function chargeView(row: ChargeRow) {
  const valor = Number(row.valor_centavos) || 0;
  const desconto = Number(row.desconto_centavos) || 0;
  return {
    id: row.id,
    assinaturaId: row.assinatura_id,
    comunidadeId: row.comunidade_id,
    comunidadeNome: row.comunidade_nome || "Comunidade removida",
    planoId: row.plano_id,
    planoNome: row.plano_nome || "—",
    competencia: row.competencia,
    valorCentavos: valor,
    descontoCentavos: desconto,
    liquidoCentavos: Math.max(0, valor - desconto),
    status: row.status,
    venceEm: row.vence_em,
    pagoEm: row.pago_em,
    metodo: row.metodo,
    provedor: row.provedor,
    referenciaExterna: row.referencia_externa,
    tentativas: Number(row.tentativas) || 0,
    observacoes: row.observacoes,
    criadoEm: row.criado_em,
  };
}

function subscriptionView(row: SubscriptionRow) {
  return {
    id: row.id,
    comunidadeId: row.comunidade_id,
    comunidadeNome: row.comunidade_nome || "Comunidade removida",
    planoId: row.plano_id,
    planoNome: row.plano_nome || "—",
    status: row.status,
    iniciaEm: row.inicia_em,
    renovaEm: row.renova_em,
    testeAte: row.teste_ate,
    carenciaAte: row.carencia_ate,
    canceladoEm: row.cancelado_em,
    cupom: row.cupom,
    descontoPercentual: Number(row.desconto_percentual) || 0,
    renovacaoAutomatica: Boolean(row.renovacao_automatica),
    observacoes: row.observacoes,
    precoCentavos: Number(row.preco_centavos) || 0,
    periodicidade: row.periodicidade || "MENSAL",
  };
}

export async function GET(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  const params = new URL(request.url).searchParams;
  const db = getD1();

  const statusFilter = clean(params.get("status"), 20).toUpperCase();
  const status = (CHARGE_STATUS as readonly string[]).includes(statusFilter) ? statusFilter : "";
  const comunidade = id(params.get("comunidade"));
  const de = competencia(params.get("de")) || competencia(params.get("competencia"));
  const ate = competencia(params.get("ate")) || competencia(params.get("competencia"));

  const filters: string[] = [];
  const binds: (string | number)[] = [];
  if (status) {
    filters.push("b.status = ?");
    binds.push(status);
  }
  if (comunidade) {
    filters.push("b.comunidade_id = ?");
    binds.push(comunidade);
  }
  if (de) {
    filters.push("b.competencia >= ?");
    binds.push(de);
  }
  if (ate) {
    filters.push("b.competencia <= ?");
    binds.push(ate);
  }
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";

  // O resumo respeita o recorte de competência (período) e de comunidade, mas
  // não o filtro de status — caso contrário os totais se contradiriam.
  const summaryFilters: string[] = [];
  const summaryBinds: (string | number)[] = [];
  if (comunidade) {
    summaryFilters.push("comunidade_id = ?");
    summaryBinds.push(comunidade);
  }
  if (de) {
    summaryFilters.push("competencia >= ?");
    summaryBinds.push(de);
  }
  if (ate) {
    summaryFilters.push("competencia <= ?");
    summaryBinds.push(ate);
  }
  const summaryWhere = summaryFilters.length ? ` WHERE ${summaryFilters.join(" AND ")}` : "";

  const [charges, summary, subscriptionStats, upcoming, communities, plans] = await Promise.all([
    db.prepare(`${CHARGE_SELECT}${where} ORDER BY b.competencia DESC, b.vence_em DESC, b.id DESC LIMIT 250`).bind(...binds).all<ChargeRow>(),
    db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN status = 'PAGA' THEN valor_centavos - desconto_centavos END), 0) AS receita,
          COALESCE(SUM(CASE WHEN status = 'PENDENTE' AND date(vence_em) >= date('now') THEN valor_centavos - desconto_centavos END), 0) AS pendente,
          COALESCE(SUM(CASE WHEN status = 'VENCIDA' OR (status = 'PENDENTE' AND date(vence_em) < date('now')) THEN valor_centavos - desconto_centavos END), 0) AS vencido,
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN status = 'PAGA' THEN 1 END), 0) AS pagas,
          COUNT(DISTINCT CASE WHEN status = 'VENCIDA' OR (status = 'PENDENTE' AND date(vence_em) < date('now')) THEN comunidade_id END) AS comunidades_vencidas
         FROM cobrancas_assinatura${summaryWhere}`,
      )
      .bind(...summaryBinds)
      .first<Record<string, number>>(),
    db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN status IN ('ATIVA','TESTE','CARENCIA') THEN 1 END), 0) AS ativas,
          COALESCE(SUM(CASE WHEN status = 'INADIMPLENTE' THEN 1 END), 0) AS inadimplentes,
          COALESCE(SUM(CASE WHEN status = 'TESTE' THEN 1 END), 0) AS em_teste
         FROM assinaturas_comunidade`,
      )
      .first<Record<string, number>>(),
    db
      .prepare(
        `${SUBSCRIPTION_SELECT}
         WHERE a.status IN ('ATIVA','TESTE','CARENCIA','INADIMPLENTE')
           AND a.renova_em IS NOT NULL
           AND date(a.renova_em) <= date('now', '+45 day')
         ORDER BY date(a.renova_em) ASC LIMIT 40`,
      )
      .all<SubscriptionRow>(),
    db.prepare("SELECT id, nome FROM comunidades ORDER BY nome ASC LIMIT 500").all<{ id: number; nome: string }>(),
    db
      .prepare("SELECT id, nome, preco_centavos, periodicidade, dias_teste FROM planos_plataforma WHERE status = 'ATIVO' ORDER BY preco_centavos ASC, nome ASC LIMIT 200")
      .all<{ id: number; nome: string; preco_centavos: number; periodicidade: string; dias_teste: number }>(),
  ]);

  const inadimplentes = Math.max(
    Number(subscriptionStats?.inadimplentes) || 0,
    Number(summary?.comunidades_vencidas) || 0,
  );

  return Response.json(
    {
      summary: {
        receitaCentavos: Number(summary?.receita) || 0,
        pendenteCentavos: Number(summary?.pendente) || 0,
        vencidoCentavos: Number(summary?.vencido) || 0,
        cobrancas: Number(summary?.total) || 0,
        cobrancasPagas: Number(summary?.pagas) || 0,
        comunidadesInadimplentes: inadimplentes,
        assinaturas: Number(subscriptionStats?.total) || 0,
        assinaturasAtivas: Number(subscriptionStats?.ativas) || 0,
        assinaturasEmTeste: Number(subscriptionStats?.em_teste) || 0,
      },
      filters: { status, comunidade, de, ate },
      charges: charges.results.map(chargeView),
      upcoming: upcoming.results.map(subscriptionView),
      communities: communities.results,
      plans: plans.results.map((row) => ({
        id: row.id,
        nome: row.nome,
        precoCentavos: Number(row.preco_centavos) || 0,
        periodicidade: row.periodicidade,
        diasTeste: Number(row.dias_teste) || 0,
      })),
      chargeStatus: CHARGE_STATUS,
      subscriptionStatus: SUBSCRIPTION_STATUS,
      // Registro administrativo enquanto não há gateway conectado.
      paymentMode: "MANUAL",
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
  const db = getD1();
  const action = clean(body.action, 30).toUpperCase() || "SUBSCRIBE";

  if (action === "CHARGE") {
    const assinaturaId = id(body.assinaturaId);
    const subscription = await db.prepare(`${SUBSCRIPTION_SELECT} WHERE a.id = ? LIMIT 1`).bind(assinaturaId).first<SubscriptionRow>();
    if (!subscription) return Response.json({ error: "Assinatura não encontrada." }, { status: 404 });
    const charge = await createCharge(db, access.user.id, subscription, body);
    await audit(db, access.user.id, "COBRANCA_GERADA", { cobrancaId: charge.id, assinaturaId, competencia: charge.competencia }, subscription.comunidade_id);
    return Response.json({ ok: true, id: charge.id }, { status: 201 });
  }

  // SUBSCRIBE: vincula uma comunidade a um plano.
  const comunidadeId = id(body.comunidadeId);
  const planoId = id(body.planoId);
  if (!comunidadeId || !planoId) return Response.json({ error: "Selecione a comunidade e o plano." }, { status: 400 });
  const community = await db.prepare("SELECT id, nome FROM comunidades WHERE id = ? LIMIT 1").bind(comunidadeId).first<{ id: number; nome: string }>();
  if (!community) return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });
  const plan = await db
    .prepare("SELECT id, nome, preco_centavos, periodicidade, dias_teste, duracao_meses, desconto_percentual, comunidade_exclusiva_id, status FROM planos_plataforma WHERE id = ? LIMIT 1")
    .bind(planoId)
    .first<{ id: number; nome: string; preco_centavos: number; periodicidade: string; dias_teste: number; duracao_meses: number; desconto_percentual: number; comunidade_exclusiva_id: number | null; status: string }>();
  if (!plan) return Response.json({ error: "Plano não encontrado." }, { status: 404 });
  if (plan.status !== "ATIVO") return Response.json({ error: "Este plano está arquivado e não aceita novas assinaturas." }, { status: 400 });
  if (plan.comunidade_exclusiva_id && plan.comunidade_exclusiva_id !== comunidadeId) {
    return Response.json({ error: "Este plano é exclusivo de outra comunidade." }, { status: 400 });
  }
  const existing = await db
    .prepare("SELECT id FROM assinaturas_comunidade WHERE comunidade_id = ? AND status NOT IN ('CANCELADA') LIMIT 1")
    .bind(comunidadeId)
    .first<{ id: number }>();
  if (existing) {
    return Response.json({ error: "Esta comunidade já possui uma assinatura vigente. Use a ação de troca de plano." }, { status: 409 });
  }

  const inicia = isoDate(body.iniciaEm) || today();
  const diasTeste = Number(plan.dias_teste) || 0;
  const testeAte = diasTeste > 0 ? addDays(inicia, diasTeste) : null;
  const meses = cycleMonths(plan.periodicidade, plan.duracao_meses);
  const renovaEm = addMonths(testeAte || inicia, meses);
  const status = testeAte ? "TESTE" : "ATIVA";
  const desconto = Math.min(100, Math.max(0, Math.trunc(Number(body.descontoPercentual ?? plan.desconto_percentual)) || 0));

  const result = await db
    .prepare(
      `INSERT INTO assinaturas_comunidade
        (comunidade_id, plano_id, status, inicia_em, renova_em, teste_ate, cupom, desconto_percentual, renovacao_automatica, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      comunidadeId,
      planoId,
      status,
      inicia,
      renovaEm,
      testeAte,
      clean(body.cupom, 40).toUpperCase(),
      desconto,
      body.renovacaoAutomatica === false ? 0 : 1,
      clean(body.observacoes, 500),
      access.user.id,
    )
    .run();
  const assinaturaId = Number(result.meta.last_row_id);
  await audit(db, access.user.id, "ASSINATURA_CRIADA", { assinaturaId, planoId, plano: plan.nome, status, renovaEm, testeAte }, comunidadeId);

  let cobrancaId = 0;
  if (body.gerarCobranca === true && status === "ATIVA") {
    const subscription = await db.prepare(`${SUBSCRIPTION_SELECT} WHERE a.id = ? LIMIT 1`).bind(assinaturaId).first<SubscriptionRow>();
    if (subscription) {
      const charge = await createCharge(db, access.user.id, subscription, body);
      cobrancaId = charge.id;
      await audit(db, access.user.id, "COBRANCA_GERADA", { cobrancaId, assinaturaId, competencia: charge.competencia }, comunidadeId);
    }
  }
  return Response.json({ ok: true, id: assinaturaId, cobrancaId }, { status: 201 });
}

async function createCharge(
  db: ReturnType<typeof getD1>,
  userId: number,
  subscription: SubscriptionRow,
  body: Record<string, unknown>,
) {
  const venceEm = isoDate(body.venceEm) || subscription.renova_em || addDays(today(), 7);
  const comp = competencia(body.competencia) || venceEm.slice(0, 7);
  const bruto = body.valorCentavos === undefined ? Number(subscription.preco_centavos) || 0 : count(body.valorCentavos);
  const descontoPercentual = Number(subscription.desconto_percentual) || 0;
  const desconto =
    body.descontoCentavos === undefined
      ? Math.round((bruto * descontoPercentual) / 100)
      : Math.min(bruto, count(body.descontoCentavos));
  const result = await db
    .prepare(
      `INSERT INTO cobrancas_assinatura
        (assinatura_id, comunidade_id, competencia, valor_centavos, desconto_centavos, status, vence_em, metodo, observacoes, registrado_por)
       VALUES (?, ?, ?, ?, ?, 'PENDENTE', ?, ?, ?, ?)`,
    )
    .bind(
      subscription.id,
      subscription.comunidade_id,
      comp,
      bruto,
      desconto,
      venceEm,
      clean(body.metodo, 40),
      clean(body.observacoes, 500),
      userId,
    )
    .run();
  return { id: Number(result.meta.last_row_id), competencia: comp };
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

  if (action === "MARK_PAID" || action === "CANCEL_CHARGE") {
    const cobrancaId = id(body.cobrancaId ?? body.id);
    const charge = await db.prepare("SELECT * FROM cobrancas_assinatura WHERE id = ? LIMIT 1").bind(cobrancaId).first<ChargeRow>();
    if (!charge) return Response.json({ error: "Cobrança não encontrada." }, { status: 404 });

    if (action === "MARK_PAID") {
      if (charge.status === "PAGA") return Response.json({ error: "Esta cobrança já está registrada como paga." }, { status: 409 });
      if (charge.status === "CANCELADA" || charge.status === "ESTORNADA") {
        return Response.json({ error: "Cobranças canceladas ou estornadas não podem ser marcadas como pagas." }, { status: 409 });
      }
      const pagoEm = isoDate(body.pagoEm) || today();
      // Registro administrativo: `provedor`/`referencia_externa` ficam à
      // disposição de um adaptador de gateway futuro.
      await db
        .prepare(
          `UPDATE cobrancas_assinatura SET status = 'PAGA', pago_em = ?, metodo = ?, provedor = ?, referencia_externa = ?,
             observacoes = ?, registrado_por = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(
          pagoEm,
          clean(body.metodo, 40) || charge.metodo || "MANUAL",
          clean(body.provedor, 40) || charge.provedor,
          clean(body.referenciaExterna, 120) || charge.referencia_externa,
          clean(body.observacoes ?? charge.observacoes, 500),
          access.user.id,
          cobrancaId,
        )
        .run();
      const pending = await db
        .prepare("SELECT COUNT(*) AS total FROM cobrancas_assinatura WHERE assinatura_id = ? AND (status = 'VENCIDA' OR (status = 'PENDENTE' AND date(vence_em) < date('now')))")
        .bind(charge.assinatura_id)
        .first<{ total: number }>();
      if (!Number(pending?.total)) {
        await db
          .prepare("UPDATE assinaturas_comunidade SET status = 'ATIVA', carencia_ate = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('INADIMPLENTE','CARENCIA')")
          .bind(charge.assinatura_id)
          .run();
      }
      await audit(db, access.user.id, "COBRANCA_PAGA_REGISTRADA", { cobrancaId, competencia: charge.competencia, pagoEm, origem: "ADMINISTRATIVA" }, charge.comunidade_id);
      return Response.json({ ok: true });
    }

    if (charge.status === "PAGA") {
      await db
        .prepare("UPDATE cobrancas_assinatura SET status = 'ESTORNADA', observacoes = ?, registrado_por = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(clean(body.observacoes, 500) || charge.observacoes, access.user.id, cobrancaId)
        .run();
      await audit(db, access.user.id, "COBRANCA_ESTORNADA", { cobrancaId, competencia: charge.competencia }, charge.comunidade_id);
      return Response.json({ ok: true, status: "ESTORNADA" });
    }
    await db
      .prepare("UPDATE cobrancas_assinatura SET status = 'CANCELADA', observacoes = ?, registrado_por = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(clean(body.observacoes, 500) || charge.observacoes, access.user.id, cobrancaId)
      .run();
    await audit(db, access.user.id, "COBRANCA_CANCELADA", { cobrancaId, competencia: charge.competencia }, charge.comunidade_id);
    return Response.json({ ok: true, status: "CANCELADA" });
  }

  const assinaturaId = id(body.assinaturaId ?? body.id);
  if (!assinaturaId) return Response.json({ error: "Assinatura inválida." }, { status: 400 });
  const subscription = await db.prepare(`${SUBSCRIPTION_SELECT} WHERE a.id = ? LIMIT 1`).bind(assinaturaId).first<SubscriptionRow>();
  if (!subscription) return Response.json({ error: "Assinatura não encontrada." }, { status: 404 });

  if (action === "CHANGE_PLAN") {
    const planoId = id(body.planoId);
    const plan = await db
      .prepare("SELECT id, nome, periodicidade, duracao_meses, comunidade_exclusiva_id, status FROM planos_plataforma WHERE id = ? LIMIT 1")
      .bind(planoId)
      .first<{ id: number; nome: string; periodicidade: string; duracao_meses: number; comunidade_exclusiva_id: number | null; status: string }>();
    if (!plan) return Response.json({ error: "Plano não encontrado." }, { status: 404 });
    if (plan.status !== "ATIVO") return Response.json({ error: "Este plano está arquivado e não aceita assinaturas." }, { status: 400 });
    if (plan.comunidade_exclusiva_id && plan.comunidade_exclusiva_id !== subscription.comunidade_id) {
      return Response.json({ error: "Este plano é exclusivo de outra comunidade." }, { status: 400 });
    }
    const renovaEm = addMonths(today(), cycleMonths(plan.periodicidade, plan.duracao_meses));
    await db
      .prepare("UPDATE assinaturas_comunidade SET plano_id = ?, renova_em = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(planoId, renovaEm, assinaturaId)
      .run();
    await audit(db, access.user.id, "ASSINATURA_PLANO_ALTERADO", { assinaturaId, de: subscription.plano_id, para: planoId, plano: plan.nome, renovaEm }, subscription.comunidade_id);
    return Response.json({ ok: true });
  }

  if (action === "CANCEL_SUBSCRIPTION") {
    if (subscription.status === "CANCELADA") return Response.json({ error: "Esta assinatura já está cancelada." }, { status: 409 });
    await db
      .prepare("UPDATE assinaturas_comunidade SET status = 'CANCELADA', cancelado_em = CURRENT_TIMESTAMP, encerrada_em = CURRENT_TIMESTAMP, renovacao_automatica = 0, observacoes = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(clean(body.observacoes, 500) || subscription.observacoes, assinaturaId)
      .run();
    await db
      .prepare("UPDATE cobrancas_assinatura SET status = 'CANCELADA', atualizado_em = CURRENT_TIMESTAMP WHERE assinatura_id = ? AND status = 'PENDENTE'")
      .bind(assinaturaId)
      .run();
    await audit(db, access.user.id, "ASSINATURA_CANCELADA", { assinaturaId, motivo: clean(body.observacoes, 200) }, subscription.comunidade_id);
    return Response.json({ ok: true });
  }

  if (action === "REACTIVATE") {
    if (subscription.status !== "CANCELADA" && subscription.status !== "SUSPENSA" && subscription.status !== "INADIMPLENTE") {
      return Response.json({ error: "Só é possível reativar assinaturas canceladas, suspensas ou inadimplentes." }, { status: 409 });
    }
    const renovaEm = addMonths(today(), cycleMonths(subscription.periodicidade, subscription.duracao_meses));
    await db
      .prepare("UPDATE assinaturas_comunidade SET status = 'ATIVA', cancelado_em = NULL, encerrada_em = NULL, carencia_ate = NULL, renova_em = ?, renovacao_automatica = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(renovaEm, assinaturaId)
      .run();
    await audit(db, access.user.id, "ASSINATURA_REATIVADA", { assinaturaId, renovaEm }, subscription.comunidade_id);
    return Response.json({ ok: true });
  }

  if (action === "SET_GRACE") {
    const pedido = Math.trunc(Number(body.dias)) || 0;
    const carenciaExplicita = isoDate(body.carenciaAte);
    if (!carenciaExplicita && (pedido < 1 || pedido > 180)) {
      return Response.json({ error: "Informe a quantidade de dias de carência (1 a 180)." }, { status: 400 });
    }
    const dias = Math.min(180, Math.max(1, pedido));
    const carenciaAte = carenciaExplicita || addDays(today(), dias);
    await db
      .prepare("UPDATE assinaturas_comunidade SET status = 'CARENCIA', carencia_ate = ?, observacoes = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(carenciaAte, clean(body.observacoes, 500) || subscription.observacoes, assinaturaId)
      .run();
    await audit(db, access.user.id, "ASSINATURA_CARENCIA_DEFINIDA", { assinaturaId, carenciaAte, dias }, subscription.comunidade_id);
    return Response.json({ ok: true, carenciaAte });
  }

  return Response.json({ error: "Ação não reconhecida." }, { status: 400 });
}
