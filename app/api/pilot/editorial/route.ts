import { getD1 } from "../../../../db";
import { verifyPassword } from "../../../lib/local-auth";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

const CATEGORIES = [
  "VERSICULOS_COM_REFERENCIA",
  "DICAS_DA_PLATAFORMA",
  "TUTORIAIS",
  "CURIOSIDADES",
  "SEGURANCA",
  "BOAS_PRATICAS",
  "NOVIDADES_OFICIAIS",
] as const;
const BLOCKED_TOPICS = [
  "ACONSELHAMENTO_PESSOAL",
  "DADOS_PRIVADOS",
  "ACUSACOES",
  "POLITICA_DIRECIONADA",
  "DIAGNOSTICO",
  "CONTEUDO_DISCRIMINATORIO",
  "DOUTRINA_CONTROVERSA",
  "PROPAGANDA_NAO_AUTORIZADA",
] as const;
const FREQUENCIES = new Set(["DIARIA", "SEMANAL", "MENSAL"]);
const REVIEW_ACTIONS = new Set(["APROVAR", "REJEITAR", "BLOQUEAR", "PUBLICAR"]);

export async function GET() {
  const access = await editorialAccess();
  if (access instanceof Response) return access;
  const db = getD1();
  const [policy, communities, drafts] = await Promise.all([
    db
      .prepare(
        `SELECT modo, status, publicacao_automatica, categorias_permitidas,
          temas_proibidos, frequencia, horarios, comunidades_destino,
          quantidade_diaria, tamanho_maximo, usar_imagens, fontes_permitidas,
          atualizado_em
        FROM politicas_editoriais_ia
        WHERE scope_type = 'GLOBAL' AND scope_id = 0
        LIMIT 1`,
      )
      .first<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, nome FROM comunidades
         WHERE status = 'ATIVA' ORDER BY nome`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT r.id, r.comunidade_id, c.nome AS comunidade_nome,
          r.titulo, r.conteudo, r.categoria, r.referencia, r.origem,
          r.status, r.politica_aplicada, r.versao, r.motivo_bloqueio,
          r.hash_semantico, r.conteudo_semelhante_id, r.revisado_em,
          u.nome AS revisor_nome, r.criado_em
        FROM rascunhos_editoriais_ia r
        JOIN comunidades c ON c.id = r.comunidade_id
        LEFT JOIN usuarios u ON u.id = r.revisado_por
        ORDER BY
          CASE r.status WHEN 'AGUARDANDO_REVISAO' THEN 0 ELSE 1 END,
          r.criado_em DESC, r.id DESC
        LIMIT 30`,
      )
      .all<Record<string, unknown>>(),
  ]);

  return Response.json(
    {
      config: normalizePolicy(policy),
      communities: communities.results,
      drafts: drafts.results,
      allowedCategories: CATEGORIES,
      blockedTopics: BLOCKED_TOPICS,
      provider: {
        connected: false,
        generationAvailable: false,
        dependency:
          "A geração automática exige um provedor de IA executado no backend.",
      },
      safeguards: {
        humanReviewRequired: String(policy?.modo || "COM_REVISAO") === "COM_REVISAO",
        autoPublish: ["AUTOMATICO", "HIBRIDO"].includes(String(policy?.modo || "")),
        activeMode: String(policy?.modo || "COM_REVISAO"),
        preparedContentOnly: true,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const access = await editorialAccess();
  if (access instanceof Response) return access;
  const payload = (await request.json()) as Record<string, unknown>;
  const mode = String(payload.mode || "COM_REVISAO").toUpperCase();
  const enabled = payload.enabled !== false;
  if (!["COM_REVISAO", "AUTOMATICO", "HIBRIDO", "PAUSADO"].includes(mode))
    return badRequest("Modo editorial inválido.");
  const activeMode = enabled ? (mode === "PAUSADO" ? "COM_REVISAO" : mode) : "PAUSADO";
  const automaticEnabled = enabled && ["AUTOMATICO", "HIBRIDO"].includes(activeMode);

  const frequency = String(payload.frequency || "SEMANAL").toUpperCase();
  if (!FREQUENCIES.has(frequency)) return badRequest("Frequência inválida.");
  const dailyQuantity = boundedInteger(payload.dailyQuantity, 1, 10);
  const maxLength = boundedInteger(payload.maxLength, 280, 5000);
  if (!dailyQuantity || !maxLength)
    return badRequest("Quantidade diária ou tamanho máximo inválido.");

  const schedules = stringArray(payload.schedules)
    .map((item) => item.slice(0, 5))
    .filter((item) => /^([01]\d|2[0-3]):[0-5]\d$/.test(item))
    .slice(0, 6);
  if (!schedules.length) return badRequest("Informe pelo menos um horário.");
  const categories = enumArray(payload.categories, CATEGORIES);
  if (!categories.length) return badRequest("Selecione pelo menos uma categoria.");
  const blockedTopics = enumArray(payload.blockedTopics, BLOCKED_TOPICS);
  if (blockedTopics.length !== BLOCKED_TOPICS.length) {
    return badRequest("Todos os temas de alto risco devem permanecer bloqueados.");
  }
  const communityIds = numberArray(payload.communityIds).slice(0, 100);
  if (!communityIds.length)
    return badRequest("Selecione pelo menos uma comunidade de destino.");
  const sources = stringArray(payload.sources)
    .map((item) => item.trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, 20);
  if (!sources.length) return badRequest("Informe ao menos uma fonte permitida.");
  const password = String(payload.password || "");
  if (!password) return badRequest("Confirme sua senha para salvar.");

  const db = getD1();
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
    !(await verifyPassword(
      password,
      credentials.senha_salt,
      credentials.senha_hash,
    ))
  ) {
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "EDITORIAL_CONFIG_REAUTENTICACAO",
      "NEGADO",
      { mode, enabled },
    );
    return Response.json(
      { error: "Senha inválida. Nenhuma configuração foi alterada." },
      { status: 401 },
    );
  }

  const validCommunities = await db
    .prepare(
      `SELECT id FROM comunidades
       WHERE status = 'ATIVA' AND id IN (${communityIds
         .map(() => "?")
         .join(",")})`,
    )
    .bind(...communityIds)
    .all<{ id: number }>();
  if (validCommunities.results.length !== new Set(communityIds).size) {
    return badRequest("Uma das comunidades selecionadas não está ativa.");
  }

  await db.batch([
    db
      .prepare(
        `UPDATE politicas_editoriais_ia SET
          modo = ?, status = ?, publicacao_automatica = ?,
          categorias_permitidas = ?, temas_proibidos = ?, frequencia = ?,
          horarios = ?, comunidades_destino = ?, quantidade_diaria = ?,
          tamanho_maximo = ?, usar_imagens = ?, fontes_permitidas = ?,
          atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE scope_type = 'GLOBAL' AND scope_id = 0`,
      )
      .bind(
        activeMode,
        enabled ? "ATIVA" : "PAUSADA",
        automaticEnabled ? 1 : 0,
        JSON.stringify(categories),
        JSON.stringify(blockedTopics),
        frequency,
        JSON.stringify(schedules),
        JSON.stringify([...new Set(communityIds)]),
        dailyQuantity,
        maxLength,
        payload.useImages === true ? 1 : 0,
        JSON.stringify(sources),
        access.user.id,
      ),
    db
      .prepare(
        `UPDATE feature_flags SET enabled = ?, config_json = ?,
          alterado_por = ?, alterado_em = CURRENT_TIMESTAMP
        WHERE flag_key = 'ai_editorial_enabled'
          AND scope_type = 'GLOBAL' AND scope_id = 0`,
      )
      .bind(
        enabled ? 1 : 0,
        JSON.stringify({ mode: activeMode }),
        access.user.id,
      ),
    db
      .prepare(
        `UPDATE feature_flags SET enabled = ?, config_json = ?,
          alterado_por = ?, alterado_em = CURRENT_TIMESTAMP
        WHERE flag_key = 'ai_auto_publish_enabled'
          AND scope_type = 'GLOBAL' AND scope_id = 0`,
      )
      .bind(
        automaticEnabled ? 1 : 0,
        JSON.stringify({
          mode: activeMode,
          prepared_content_only: true,
          sensitive_topics_blocked: true,
          human_review_required: activeMode === "COM_REVISAO",
        }),
        access.user.id,
      ),
  ]);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "EDITORIAL_CONFIG_ATUALIZADA",
    "SUCESSO",
    {
      mode: activeMode,
      dailyQuantity,
      maxLength,
      destinations: communityIds.length,
      autoPublish: automaticEnabled,
    },
  );
  return Response.json({
    ok: true,
    mode: activeMode,
    autoPublish: automaticEnabled,
  });
}

export async function PATCH(request: Request) {
  const access = await editorialAccess();
  if (access instanceof Response) return access;
  const payload = (await request.json()) as Record<string, unknown>;
  const draftId = Number(payload.draftId || 0);
  const action = String(payload.action || "").toUpperCase();
  const reason = String(payload.reason || "").trim().slice(0, 500);
  if (!Number.isInteger(draftId) || draftId <= 0)
    return badRequest("Rascunho inválido.");
  if (!REVIEW_ACTIONS.has(action)) return badRequest("Decisão inválida.");
  if (!["APROVAR", "PUBLICAR"].includes(action) && reason.length < 5)
    return badRequest("Informe o motivo da decisão.");

  const db = getD1();
  const draft = await db
    .prepare(
      `SELECT id, comunidade_id, titulo, conteudo, categoria, referencia,
        origem, status, politica_aplicada, versao, conteudo_semelhante_id
       FROM rascunhos_editoriais_ia WHERE id = ? LIMIT 1`,
    )
    .bind(draftId)
    .first<{
      id: number; comunidade_id: number; titulo: string; conteudo: string;
      categoria: string; referencia: string; origem: string; status: string;
      politica_aplicada: string; versao: number; conteudo_semelhante_id: number | null;
    }>();
  if (!draft) return Response.json({ error: "Rascunho não encontrado." }, { status: 404 });
  if (action === "PUBLICAR") {
    if (draft.status !== "APROVADO") {
      return Response.json({ error: "Apenas um rascunho aprovado pode ser publicado." }, { status: 409 });
    }
    const password = String(payload.password || "");
    if (!password) return badRequest("Confirme sua senha para publicar.");
    const credentials = await db.prepare(
      `SELECT senha_hash, senha_salt FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1`,
    ).bind(access.user.id).first<{ senha_hash: string | null; senha_salt: string | null }>();
    if (!credentials?.senha_hash || !credentials.senha_salt ||
      !(await verifyPassword(password, credentials.senha_salt, credentials.senha_hash))) {
      await recordTenantAudit(db, access.context, access.user.id, "EDITORIAL_PUBLICACAO_REAUTENTICACAO", "NEGADO", { draftId });
      return Response.json({ error: "Senha inválida. Nada foi publicado." }, { status: 401 });
    }
    const community = await db.prepare(
      "SELECT id FROM comunidades WHERE id = ? AND status = 'ATIVA' LIMIT 1",
    ).bind(draft.comunidade_id).first<{ id: number }>();
    if (!community) {
      return Response.json({ error: "A comunidade precisa estar ativa." }, { status: 409 });
    }
    const publication = await db.prepare(
      `INSERT INTO publicacoes_piloto
       (comunidade_id, titulo, resumo, conteudo, categoria, visibilidade,
        status, origem, comentarios_habilitados, criado_por, atualizado_em)
       VALUES (?, ?, ?, ?, ?, 'COMUNIDADE', 'PUBLICADA', 'IA', 1, ?, CURRENT_TIMESTAMP)`,
    ).bind(
      draft.comunidade_id,
      draft.titulo,
      draft.conteudo.slice(0, 220),
      draft.conteudo,
      draft.categoria,
      access.user.id,
    ).run();
    await db.prepare(
      `UPDATE rascunhos_editoriais_ia SET status = 'PUBLICADO', atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'APROVADO'`,
    ).bind(draftId).run();
    await recordTenantAudit(db, access.context, access.user.id, "EDITORIAL_PUBLICACAO_MANUAL", "SUCESSO", {
      draftId, publicacaoId: Number(publication.meta.last_row_id), origem: draft.origem,
      politica: draft.politica_aplicada, versao: draft.versao,
      semelhanteA: draft.conteudo_semelhante_id, autoPublish: false,
    });
    return Response.json({ ok: true, status: "PUBLICADO", published: true, message: "Publicação manual concluída e registrada na auditoria." });
  }
  if (draft.status !== "AGUARDANDO_REVISAO") {
    return Response.json(
      { error: "Este rascunho já recebeu uma decisão." },
      { status: 409 },
    );
  }
  const nextStatus =
    action === "APROVAR"
      ? "APROVADO"
      : action === "REJEITAR"
        ? "REJEITADO"
        : "BLOQUEADO";
  await db
    .prepare(
      `UPDATE rascunhos_editoriais_ia SET
        status = ?, motivo_bloqueio = ?, revisado_por = ?,
        revisado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'AGUARDANDO_REVISAO'`,
    )
    .bind(nextStatus, reason, access.user.id, draftId)
    .run();
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "EDITORIAL_RASCUNHO_REVISADO",
    "SUCESSO",
    { draftId, action, status: nextStatus, autoPublish: false },
  );
  return Response.json({
    ok: true,
    status: nextStatus,
    published: false,
    message:
      nextStatus === "APROVADO"
        ? "Rascunho aprovado. A publicação continua manual."
        : "Decisão registrada na auditoria.",
  });
}

export async function POST() {
  const access = await editorialAccess();
  if (access instanceof Response) return access;
  return Response.json(
    {
      error:
        "A geração real depende de um provedor de IA no backend e ainda não foi conectada.",
      dependency: "EXTERNAL_AI_BACKEND",
      mode: "COM_REVISAO",
      autoPublish: false,
    },
    { status: 424 },
  );
}

async function editorialAccess() {
  const access = await requireTenantPermission("platform.admin.view");
  if ("error" in access) return access.error;
  if (!access.context.isSuperadmin) {
    return Response.json(
      { error: "Somente o superadministrador pode administrar a IA editorial." },
      { status: 403 },
    );
  }
  return access;
}

function normalizePolicy(policy: Record<string, unknown> | null) {
  return {
    mode: String(policy?.modo || "COM_REVISAO"),
    enabled: String(policy?.status || "ATIVA") === "ATIVA",
    autoPublish: Boolean(policy?.publicacao_automatica),
    categories: jsonArray(policy?.categorias_permitidas),
    blockedTopics: jsonArray(policy?.temas_proibidos),
    frequency: String(policy?.frequencia || "SEMANAL"),
    schedules: jsonArray(policy?.horarios),
    communityIds: jsonArray(policy?.comunidades_destino).map(Number),
    dailyQuantity: Number(policy?.quantidade_diaria || 1),
    maxLength: Number(policy?.tamanho_maximo || 1200),
    useImages: Boolean(policy?.usar_imagens),
    sources: jsonArray(policy?.fontes_permitidas),
    updatedAt: policy?.atualizado_em || null,
  };
}

function jsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(Number)
        .filter((item) => Number.isInteger(item) && item > 0)
    : [];
}

function enumArray<T extends readonly string[]>(value: unknown, catalog: T) {
  const allowed = new Set<string>(catalog);
  return [...new Set(stringArray(value).map((item) => item.toUpperCase()))].filter(
    (item): item is T[number] => allowed.has(item),
  );
}

function boundedInteger(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : 0;
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}
