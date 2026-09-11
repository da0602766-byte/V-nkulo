import { getD1 } from "../../../../db";
import { verifyPassword } from "../../../lib/local-auth";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

const REQUEST_TYPES = new Set(["CANCELAMENTO", "DESATIVACAO", "REATIVACAO"]);
const EVIDENCE_REQUIRED_CATEGORIES = new Set([
  "DENUNCIA",
  "SEGURANCA",
  "RETENCAO_LEGAL",
]);
const OPEN_STATUSES = [
  "CANCELAMENTO_SOLICITADO",
  "EM_ANALISE",
  "DESATIVADA_SOLICITADA",
  "REATIVACAO_SOLICITADA",
] as const;
type TenantAccess = Exclude<
  Awaited<ReturnType<typeof requireTenantPermission>>,
  { error: Response }
>;

type LifecycleRow = {
  id: number;
  comunidade_id: number;
  comunidade_nome: string;
  comunidade_status: string;
  tipo: string;
  status: string;
  decisao: string;
  motivo: string;
  categoria_motivo: string;
  descricao: string;
  evidencias: string;
  evidencia_obrigatoria: number;
  mfa_status: string;
  solicitante_id: number;
  solicitante_nome: string;
  analista_id: number | null;
  analista_nome: string | null;
  justificativa_analise: string | null;
  bloqueios: string;
  solicitado_em: string;
  analisado_em: string | null;
};

export async function GET() {
  const access = await requireTenantPermission("community.lifecycle.request");
  if ("error" in access) return access.error;
  const db = getD1();
  const canReview = access.context.permissions.includes(
    "community.lifecycle.review",
  );
  const where = canReview ? "" : "WHERE s.comunidade_id = ?";
  const statement = db.prepare(
    `SELECT s.id, s.comunidade_id, c.nome AS comunidade_nome,
      c.status AS comunidade_status, s.tipo, s.status, s.decisao,
      s.motivo, s.categoria_motivo, s.descricao, s.evidencias,
      s.evidencia_obrigatoria, s.mfa_status, s.solicitante_id,
      solicitante.nome AS solicitante_nome, s.analista_id,
      analista.nome AS analista_nome, s.justificativa_analise,
      s.bloqueios, s.solicitado_em, s.analisado_em
     FROM solicitacoes_ciclo_comunidade s
     JOIN comunidades c ON c.id = s.comunidade_id
     JOIN usuarios solicitante ON solicitante.id = s.solicitante_id
     LEFT JOIN usuarios analista ON analista.id = s.analista_id
     ${where}
     ORDER BY CASE s.decisao WHEN 'PENDENTE' THEN 0 ELSE 1 END,
       datetime(s.solicitado_em) DESC, s.id DESC
     LIMIT 100`,
  );
  const [requests, protection] = await Promise.all([
    (canReview
      ? statement.all<LifecycleRow>()
      : statement.bind(access.context.comunidadeId).all<LifecycleRow>()),
    getProtectionSummary(access.context.comunidadeId),
  ]);

  return Response.json(
    {
      community: {
        id: access.context.comunidadeId,
        name: access.context.comunidadeNome,
        status: protection.communityStatus,
      },
      requests: requests.results.map(serializeRequest),
      protection,
      canRequest: access.context.permissions.includes(
        "community.lifecycle.request",
      ),
      canReview,
      permanentDeletionAvailable: false,
      mfa: {
        required: true,
        available: false,
        dependency:
          "Provedor de MFA e canal seguro de evidências fora do ChatGPT Sites.",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("community.lifecycle.request");
  if ("error" in access) return access.error;
  const payload = (await request.json()) as Record<string, unknown>;
  const action = String(payload.action || "CRIAR_SOLICITACAO").toUpperCase();
  if (action === "CRIAR_SOLICITACAO") {
    return createRequest(payload, access);
  }
  if (action === "INICIAR_ANALISE" || action === "RECUSAR" || action === "APROVAR") {
    return reviewRequest(action, payload, access);
  }
  return badRequest("Ação de continuidade inválida.");
}

export async function DELETE() {
  return Response.json(
    {
      error:
        "Exclusão definitiva não está disponível. Use o fluxo de solicitação e análise.",
      permanentDeletionAvailable: false,
    },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}

async function createRequest(
  payload: Record<string, unknown>,
  access: TenantAccess,
) {
  const db = getD1();
  const type = String(payload.type || "").toUpperCase();
  const category = String(payload.category || "").toUpperCase();
  const reason = clean(payload.reason, 160);
  const description = clean(payload.description, 1600);
  const evidence = clean(payload.evidence, 900);
  const password = String(payload.password || "");
  const confirmation = String(payload.confirmation || "").trim().toUpperCase();
  if (!REQUEST_TYPES.has(type)) return badRequest("Selecione um tipo de solicitação.");
  if (!category) return badRequest("Selecione a categoria do motivo.");
  if (reason.length < 5) return badRequest("Informe um motivo com pelo menos 5 caracteres.");
  if (description.length < 20) {
    return badRequest("Descreva a situação com pelo menos 20 caracteres.");
  }
  const evidenceRequired = EVIDENCE_REQUIRED_CATEGORIES.has(category);
  if (evidenceRequired && evidence.length < 5) {
    return badRequest("Esta categoria exige uma referência de evidência.");
  }
  if (confirmation !== "SOLICITAR") {
    return badRequest("Digite SOLICITAR para confirmar.");
  }
  if (!password) return badRequest("Confirme sua senha para continuar.");

  const communityId = access.context.comunidadeId;
  const community = await db
    .prepare(
      `SELECT id, nome, status, feed_publico_habilitado
       FROM comunidades WHERE id = ? LIMIT 1`,
    )
    .bind(communityId)
    .first<{
      id: number;
      nome: string;
      status: string;
      feed_publico_habilitado: number;
    }>();
  if (!community) return notFound("Comunidade não encontrada.");
  if (
    type === "REATIVACAO" &&
    !["DESATIVADA_POR_INATIVIDADE", "SUSPENSA"].includes(community.status)
  ) {
    return conflict("A comunidade ainda está ativa e não precisa de reativação.");
  }
  if (
    type !== "REATIVACAO" &&
    !["ATIVA", "REATIVADA"].includes(community.status)
  ) {
    return conflict("Já existe uma restrição ativa para esta comunidade.");
  }
  const credentials = await db
    .prepare(
      `SELECT senha_hash, senha_salt FROM usuarios
       WHERE id = ? AND ativo = 1 LIMIT 1`,
    )
    .bind(access.user.id)
    .first<{ senha_hash: string | null; senha_salt: string | null }>();
  if (
    !credentials?.senha_hash ||
    !credentials.senha_salt ||
    !(await verifyPassword(password, credentials.senha_salt, credentials.senha_hash))
  ) {
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "CONTINUIDADE_REAUTENTICACAO",
      "NEGADO",
      { type, category },
    );
    return Response.json(
      { error: "Senha inválida. A solicitação não foi criada." },
      { status: 401 },
    );
  }
  const duplicate = await db
    .prepare(
      `SELECT id FROM solicitacoes_ciclo_comunidade
       WHERE comunidade_id = ? AND decisao = 'PENDENTE'
         AND status IN (${OPEN_STATUSES.map(() => "?").join(",")})
       LIMIT 1`,
    )
    .bind(communityId, ...OPEN_STATUSES)
    .first<{ id: number }>();
  if (duplicate) return conflict("Já existe uma solicitação aberta para esta comunidade.");

  const protection = await getProtectionSummary(communityId);
  const status =
    type === "CANCELAMENTO"
      ? "CANCELAMENTO_SOLICITADO"
      : type === "DESATIVACAO"
        ? "DESATIVADA_SOLICITADA"
        : "REATIVACAO_SOLICITADA";
  const blockers = [
    ...(protection.recentRecords > 0
      ? [`${protection.recentRecords} registros protegidos nos últimos 12 meses`]
      : []),
    ...(protection.activeLegalHolds > 0
      ? [`${protection.activeLegalHolds} retenções legais ativas`]
      : []),
    "Denúncias, evidências e auditorias nunca entram em exclusão automática",
  ];
  const inserted = await db
    .prepare(
      `INSERT INTO solicitacoes_ciclo_comunidade
       (comunidade_id, tipo, status, motivo, categoria_motivo, descricao,
        evidencias, evidencia_obrigatoria, senha_reconfirmada, mfa_status,
        solicitante_id, bloqueios, snapshot_configuracao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'PENDENTE_EXTERNO', ?, ?, ?)`,
    )
    .bind(
      communityId,
      type,
      status,
      reason,
      category,
      description,
      JSON.stringify(evidence ? [evidence] : []),
      evidenceRequired ? 1 : 0,
      access.user.id,
      JSON.stringify(blockers),
      JSON.stringify({
        communityStatus: community.status,
        publicFeedEnabled: Boolean(community.feed_publico_habilitado),
        preservedAt: new Date().toISOString(),
        dataDeletionPerformed: false,
      }),
    )
    .run();
  const id = Number(inserted.meta.last_row_id);
  await notifySupport(db, id, community.nome, type, access.user.nome);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "CONTINUIDADE_SOLICITADA",
    "SUCESSO",
    { requestId: id, type, status, evidenceRequired, mfaStatus: "PENDENTE_EXTERNO" },
  );
  return Response.json(
    {
      id,
      status,
      message:
        "Solicitação registrada e encaminhada para análise. Nenhum dado foi apagado.",
    },
    { status: 201 },
  );
}

async function reviewRequest(
  action: string,
  payload: Record<string, unknown>,
  access: TenantAccess,
) {
  if (
    !access.context.isSuperadmin ||
    !access.context.permissions.includes("community.lifecycle.review")
  ) {
    return Response.json(
      { error: "Somente o suporte autorizado pode analisar solicitações." },
      { status: 403 },
    );
  }
  const requestId = Number(payload.requestId);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return badRequest("Solicitação inválida.");
  }
  const db = getD1();
  const row = await db
    .prepare(
      `SELECT s.id, s.comunidade_id, s.solicitante_id, s.tipo,
        s.status, s.decisao, c.nome AS comunidade_nome
       FROM solicitacoes_ciclo_comunidade s
       JOIN comunidades c ON c.id = s.comunidade_id
       WHERE s.id = ? LIMIT 1`,
    )
    .bind(requestId)
    .first<{
      id: number;
      comunidade_id: number;
      solicitante_id: number;
      tipo: string;
      status: string;
      decisao: string;
      comunidade_nome: string;
    }>();
  if (!row) return notFound("Solicitação não encontrada.");
  if (row.solicitante_id === access.user.id) {
    await auditForCommunity(
      access,
      row.comunidade_id,
      "CONTINUIDADE_AUTOAPROVACAO",
      "NEGADO",
      { requestId },
    );
    return Response.json(
      { error: "O solicitante não pode analisar a própria solicitação." },
      { status: 403 },
    );
  }
  if (row.decisao !== "PENDENTE") return conflict("Esta solicitação já foi encerrada.");

  const reason = clean(payload.reviewReason, 600);
  if (reason.length < 10) {
    return badRequest("Informe uma justificativa de análise com pelo menos 10 caracteres.");
  }
  if (action === "APROVAR") {
    await auditForCommunity(
      access,
      row.comunidade_id,
      "CONTINUIDADE_APROVACAO",
      "NEGADO",
      { requestId, reason: "MFA externo não homologado" },
    );
    return Response.json(
      {
        error:
          "A aprovação crítica permanece bloqueada até a validação de MFA pelo backend externo.",
        mfaRequired: true,
        externalDependency: true,
      },
      { status: 423 },
    );
  }

  if (action === "INICIAR_ANALISE") {
    await db
      .prepare(
        `UPDATE solicitacoes_ciclo_comunidade
         SET status = 'EM_ANALISE', analista_id = ?,
           justificativa_analise = ?, analisado_em = CURRENT_TIMESTAMP,
           atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND decisao = 'PENDENTE'`,
      )
      .bind(access.user.id, reason, requestId)
      .run();
    await auditForCommunity(
      access,
      row.comunidade_id,
      "CONTINUIDADE_ANALISE_INICIADA",
      "SUCESSO",
      { requestId },
    );
    return Response.json({ ok: true, status: "EM_ANALISE" });
  }

  await db
    .prepare(
      `UPDATE solicitacoes_ciclo_comunidade
       SET status = ?, decisao = 'RECUSADA', analista_id = ?,
         justificativa_analise = ?, analisado_em = CURRENT_TIMESTAMP,
         atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND decisao = 'PENDENTE'`,
    )
    .bind(
      row.tipo === "REATIVACAO" ? "SUSPENSA" : "ATIVA",
      access.user.id,
      reason,
      requestId,
    )
    .run();
  await notifyRequester(
    db,
    row.solicitante_id,
    requestId,
    row.comunidade_nome,
    "A solicitação foi recusada após análise do suporte.",
  );
  await auditForCommunity(
    access,
    row.comunidade_id,
    "CONTINUIDADE_SOLICITACAO_RECUSADA",
    "SUCESSO",
    { requestId },
  );
  return Response.json({ ok: true, status: "RECUSADA" });
}

async function getProtectionSummary(communityId: number) {
  const db = getD1();
  const row = await db
    .prepare(
      `SELECT c.status AS community_status,
        (
          (SELECT COUNT(*) FROM visitantes
           WHERE comunidade_id = c.id
             AND datetime(criado_em) >= datetime('now', '-12 months')) +
          (SELECT COUNT(*) FROM publicacoes_piloto
           WHERE comunidade_id = c.id
             AND datetime(criado_em) >= datetime('now', '-12 months')) +
          (SELECT COUNT(*) FROM eventos_comunidade
           WHERE comunidade_id = c.id
             AND datetime(criado_em) >= datetime('now', '-12 months')) +
          (SELECT COUNT(*) FROM auditoria_piloto
           WHERE comunidade_id = c.id
             AND datetime(criado_em) >= datetime('now', '-12 months')) +
          (SELECT COUNT(*) FROM estacionamento_movimentacoes
           WHERE comunidade_id = c.id
             AND datetime(criado_em) >= datetime('now', '-12 months'))
        ) AS recent_records,
        (
          SELECT COUNT(*) FROM retencoes_comunidade r
          WHERE r.comunidade_id = c.id AND r.status = 'ATIVA'
            AND (r.termina_em IS NULL OR datetime(r.termina_em) > CURRENT_TIMESTAMP)
        ) AS active_legal_holds
       FROM comunidades c WHERE c.id = ? LIMIT 1`,
    )
    .bind(communityId)
    .first<{
      community_status: string;
      recent_records: number;
      active_legal_holds: number;
    }>();
  return {
    communityStatus: row?.community_status || "ATIVA",
    recentRecords: Number(row?.recent_records || 0),
    activeLegalHolds: Number(row?.active_legal_holds || 0),
    protectedData: ["denúncias", "evidências", "auditorias", "retenções legais"],
    permanentDeletionBlocked: true,
  };
}

function serializeRequest(row: LifecycleRow) {
  return {
    id: Number(row.id),
    communityId: Number(row.comunidade_id),
    communityName: row.comunidade_nome,
    communityStatus: row.comunidade_status,
    type: row.tipo,
    status: row.status,
    decision: row.decisao,
    reason: row.motivo,
    category: row.categoria_motivo,
    description: row.descricao,
    evidence: safeArray(row.evidencias),
    evidenceRequired: Boolean(row.evidencia_obrigatoria),
    mfaStatus: row.mfa_status,
    requesterId: Number(row.solicitante_id),
    requesterName: row.solicitante_nome,
    analystId: row.analista_id ? Number(row.analista_id) : null,
    analystName: row.analista_nome,
    reviewReason: row.justificativa_analise,
    blockers: safeArray(row.bloqueios),
    requestedAt: row.solicitado_em,
    reviewedAt: row.analisado_em,
  };
}

function safeArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function notifySupport(
  db: ReturnType<typeof getD1>,
  requestId: number,
  communityName: string,
  type: string,
  requesterName: string,
) {
  const admins = await db
    .prepare("SELECT id FROM usuarios WHERE perfil = 'ADMIN' AND ativo = 1")
    .all<{ id: number }>();
  if (!admins.results.length) return;
  await db.batch(
    admins.results.map((admin) =>
      db
        .prepare(
          `INSERT INTO notificacoes_sistema
           (tipo, titulo, mensagem, area, entidade_id, usuario_id, criado_por)
           VALUES ('ALERTA', 'Nova solicitação de continuidade', ?, 'CONTINUIDADE', ?, ?, ?)`,
        )
        .bind(
          `${requesterName} enviou uma solicitação de ${type.toLowerCase()} para ${communityName}.`,
          requestId,
          admin.id,
          requesterName,
        ),
    ),
  );
}

async function notifyRequester(
  db: ReturnType<typeof getD1>,
  requesterId: number,
  requestId: number,
  communityName: string,
  message: string,
) {
  await db
    .prepare(
      `INSERT INTO notificacoes_sistema
       (tipo, titulo, mensagem, area, entidade_id, usuario_id, criado_por)
       VALUES ('INFO', 'Atualização da solicitação', ?, 'CONTINUIDADE', ?, ?, 'Suporte Vínkulo')`,
    )
    .bind(`${communityName}: ${message}`, requestId, requesterId)
    .run();
}

async function auditForCommunity(
  access: TenantAccess,
  communityId: number,
  event: string,
  result: "SUCESSO" | "NEGADO" | "ERRO",
  metadata: Record<string, string | number | boolean | null>,
) {
  await recordTenantAudit(
    getD1(),
    { ...access.context, comunidadeId: communityId },
    access.user.id,
    event,
    result,
    metadata,
  );
}

function clean(value: unknown, limit: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function conflict(error: string) {
  return Response.json({ error }, { status: 409 });
}

function notFound(error: string) {
  return Response.json({ error }, { status: 404 });
}
