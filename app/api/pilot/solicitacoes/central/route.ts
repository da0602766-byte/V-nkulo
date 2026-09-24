import { getD1 } from "../../../../../db";
import { ensureRequestRepositorySuggestions, normalizeWhatsappNumber } from "../../../../lib/request-repositories";
import { notifyUser } from "../../../../lib/pilot-notifications";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

const REPOSITORY_TYPES = new Set(["ORACAO", "VISITA"]);
const PRAYER_STATUSES = new Set(["ABERTO", "EM_ORACAO", "EM_ACOMPANHAMENTO", "AGUARDANDO_RETORNO", "FINALIZADO", "ORACAO_ATENDIDA"]);
const VISIT_STATUSES = new Set(["ABERTO", "AGUARDANDO_CONTATO", "AGUARDANDO_RETORNO", "EM_PROCESSO", "VISITA_AGENDADA", "VISITA_REALIZADA", "VISITA_CONCLUIDA", "NOVA_VISITA"]);
const FINAL_STATUSES = new Set(["FINALIZADO", "ORACAO_ATENDIDA", "VISITA_CONCLUIDA"]);
const EVENT_TYPES = new Set(["NOTA_INTERNA", "ATUALIZACAO_MEMBRO", "TENTATIVA_CONTATO", "REGISTRO_VISITA"]);

// Os itens de repositório (oração/visita) tinham teto fixo de 250 sem cursor:
// comunidades com mais pedidos abertos que isso perdiam os mais antigos da
// fila para sempre, sem qualquer aviso na tela. Agora o mesmo desenho de
// paginação por cursor da lista geral de solicitações cobre estes itens.
const REPO_ITEMS_PAGE_SIZE = 250;
const REPO_ITEMS_MAX_PAGE_SIZE = 300;

// A ordenação agrupa por pendência (aberto antes de finalizado) e depois por
// urgência, então o cursor carrega o par (grupo, id): grupo 0 = aberto e
// urgente, 1 = aberto e normal, 2 = finalizado e urgente, 3 = finalizado e
// normal. Um cursor só com id pularia itens ao trocar de grupo.
type RepositoryItemsCursor = { grupo: number; id: number };

function encodeItemsCursor(cursor: RepositoryItemsCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeItemsCursor(value: string | null): RepositoryItemsCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<RepositoryItemsCursor>;
    const grupo = Number(parsed.grupo);
    const id = Number(parsed.id);
    if (!Number.isInteger(grupo) || grupo < 0 || grupo > 3 || !Number.isInteger(id) || id <= 0) return null;
    return { grupo, id };
  } catch {
    return null;
  }
}

const REPO_ITEM_GROUP_SQL =
  "((CASE WHEN ri.finalizado_em IS NULL THEN 0 ELSE 2 END) + (CASE WHEN ri.prioridade = 'URGENTE' THEN 0 ELSE 1 END))";

// A busca e as abas rápidas (Orações, Urgentes, Aguardando retorno…) do painel
// de Atendimento filtravam só o que já tinha sido carregado no navegador: uma
// pessoa procurada que estivesse além do primeiro lote simplesmente não
// aparecia. Agora o filtro entra no SQL, então a busca alcança a fila inteira.
export type OperationalFilters = {
  search: string; category: string; status: string;
  responsavelId: number; since: string; unassignedOnly: boolean;
};
const OPERATIONAL_CATEGORIES = new Set([
  "TODOS", "ORACAO", "VISITA", "URGENTES", "PENDENTES", "ACOMPANHAMENTO", "RETORNO", "CONCLUIDOS",
]);
export function parseOperationalFilters(address: URL): OperationalFilters {
  const categoryRaw = (address.searchParams.get("categoria") || "TODOS").toUpperCase();
  const responsavelId = Number(address.searchParams.get("responsavelId") || 0);
  return {
    search: (address.searchParams.get("busca") || "").trim().slice(0, 80),
    category: OPERATIONAL_CATEGORIES.has(categoryRaw) ? categoryRaw : "TODOS",
    status: (address.searchParams.get("status") || "").trim().slice(0, 30).toUpperCase(),
    responsavelId: Number.isInteger(responsavelId) && responsavelId > 0 ? responsavelId : 0,
    since: (address.searchParams.get("desde") || "").trim().slice(0, 10),
    unassignedOnly: address.searchParams.get("semResponsavel") === "1",
  };
}
function hasActiveFilters(filters: OperationalFilters) {
  return Boolean(
    filters.search || filters.category !== "TODOS" || filters.status ||
    filters.responsavelId || filters.since || filters.unassignedOnly,
  );
}
const REPO_CATEGORY_SQL: Record<string, string> = {
  TODOS: "1 = 1",
  ORACAO: "r.tipo = 'ORACAO'",
  VISITA: "r.tipo = 'VISITA'",
  URGENTES: "ri.finalizado_em IS NULL AND ri.prioridade = 'URGENTE'",
  PENDENTES: "ri.finalizado_em IS NULL",
  ACOMPANHAMENTO: "ri.status IN ('EM_ACOMPANHAMENTO', 'EM_ORACAO', 'EM_PROCESSO')",
  RETORNO: "((ri.proximo_retorno_em IS NOT NULL AND ri.proximo_retorno_em < CURRENT_TIMESTAMP AND ri.finalizado_em IS NULL) OR ri.status = 'AGUARDANDO_RETORNO')",
  CONCLUIDOS: "ri.finalizado_em IS NOT NULL",
};

async function loadRepositoryItemsPage(db: ReturnType<typeof getD1>, input: {
  communityId: number; userId: number; canManageRepositories: boolean;
  cursor: RepositoryItemsCursor | null; pageSize: number; filters: OperationalFilters;
}) {
  const { communityId, userId, canManageRepositories, cursor, pageSize, filters } = input;
  const searchTerm = `%${filters.search.replaceAll("%", "").replaceAll("_", "")}%`;
  const result = await db.prepare(
    `SELECT ri.id, ri.repositorio_id, ri.status AS item_status,
      s.id AS solicitacao_id, s.tipo, s.titulo, s.descricao,
      s.status AS solicitacao_status, s.criado_em, s.atualizado_em,
      s.preferencia_contato, s.disponibilidade, s.data_preferencial, s.contato_autorizado,
      u.nome AS solicitante_nome, COALESCE(u.telefone, '') AS solicitante_telefone,
      COALESCE(u.foto_perfil, '') AS solicitante_foto, COALESCE(uc.papel, 'MEMBRO') AS solicitante_papel,
      ri.responsavel_usuario_id, COALESCE(responsavel.nome, '') AS responsavel_nome,
      COALESCE(oc.titulo, ucResponsavel.papel, '') AS responsavel_funcao,
      ri.responsavel_atribuido_em, ri.primeiro_contato_em,
      ri.proximo_retorno_em, ri.visita_agendada_em,
      COALESCE(ri.prioridade, 'NORMAL') AS prioridade, COALESCE(ri.resultado, '') AS resultado,
      ri.mensagem_atendimento, ri.testemunho, ri.testemunho_compartilhavel,
      ri.testemunho_publicado_em, ri.finalizado_em,
      CASE WHEN ri.proximo_retorno_em IS NOT NULL AND ri.proximo_retorno_em < CURRENT_TIMESTAMP
        AND ri.finalizado_em IS NULL THEN 1 ELSE 0 END AS retorno_atrasado
     FROM solicitacao_repositorio_itens ri
     JOIN solicitacao_repositorios r ON r.id = ri.repositorio_id AND r.comunidade_id = ri.comunidade_id
     JOIN solicitacoes_comunidade s ON s.id = ri.solicitacao_id AND s.comunidade_id = ri.comunidade_id
     JOIN usuarios u ON u.id = s.solicitante_id
     LEFT JOIN usuario_comunidades uc ON uc.usuario_id = s.solicitante_id AND uc.comunidade_id = s.comunidade_id AND uc.status = 'ATIVO'
     LEFT JOIN usuarios responsavel ON responsavel.id = ri.responsavel_usuario_id
     LEFT JOIN usuario_comunidades ucResponsavel ON ucResponsavel.usuario_id = ri.responsavel_usuario_id
       AND ucResponsavel.comunidade_id = ri.comunidade_id AND ucResponsavel.status = 'ATIVO'
     LEFT JOIN oficiais_comunidade oc ON oc.usuario_comunidade_id = ucResponsavel.id
     LEFT JOIN ministerios_comunidade m ON m.id = r.ministerio_id AND m.comunidade_id = r.comunidade_id
     WHERE ri.comunidade_id = ? AND r.status = 'ATIVO' AND (? = 1 OR m.responsavel_usuario_id = ?)
       AND (${REPO_CATEGORY_SQL[filters.category]})
       AND (? = '' OR u.nome LIKE ? OR s.titulo LIKE ? OR s.descricao LIKE ?
         OR COALESCE(responsavel.nome, '') LIKE ? OR COALESCE(ri.mensagem_atendimento, '') LIKE ?
         OR COALESCE(ri.resultado, '') LIKE ?)
       AND (? = '' OR ri.status = ?)
       AND (? = 0 OR ri.responsavel_usuario_id = ?)
       AND (? = '' OR datetime(s.criado_em) >= datetime(?))
       AND (? = 0 OR ri.responsavel_usuario_id IS NULL)
       AND (? = 0 OR ${REPO_ITEM_GROUP_SQL} > ? OR (${REPO_ITEM_GROUP_SQL} = ? AND ri.id < ?))
     ORDER BY ${REPO_ITEM_GROUP_SQL}, ri.id DESC LIMIT ?`,
  ).bind(
    communityId, canManageRepositories ? 1 : 0, userId,
    filters.search, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm,
    filters.status, filters.status,
    filters.responsavelId, filters.responsavelId,
    filters.since, filters.since,
    filters.unassignedOnly ? 1 : 0,
    cursor ? 1 : 0, cursor?.grupo ?? 0, cursor?.grupo ?? 0, cursor?.id ?? 0,
    pageSize + 1,
  ).all<Record<string, unknown>>();

  const hasMore = result.results.length > pageSize;
  if (hasMore) result.results.length = pageSize;
  const last = result.results[result.results.length - 1];
  const nextCursor = hasMore && last
    ? encodeItemsCursor({
        grupo: (last.finalizado_em == null ? 0 : 2) + (last.prioridade === "URGENTE" ? 0 : 1),
        id: Number(last.id),
      })
    : null;

  const itemIds = result.results.map((item) => Number(item.id));
  const events = itemIds.length
    ? await db.prepare(
        `SELECT e.id, e.item_id, e.tipo, e.mensagem, e.visivel_membro,
          e.criado_em, COALESCE(u.nome, 'Sistema') AS autor_nome FROM solicitacao_eventos e
         LEFT JOIN usuarios u ON u.id = e.criado_por
         WHERE e.comunidade_id = ? AND e.item_id IN (${itemIds.map(() => "?").join(", ")})
         ORDER BY e.id DESC`,
      ).bind(communityId, ...itemIds).all<Record<string, unknown>>()
    : { results: [] as Record<string, unknown>[] };
  const eventsByItem = new Map<number, Record<string, unknown>[]>();
  for (const event of events.results) {
    const itemId = Number(event.item_id);
    const collection = eventsByItem.get(itemId) || [];
    collection.push(event);
    eventsByItem.set(itemId, collection);
  }
  // Anotação explícita: espalhar um Record<string, unknown> sem propriedades
  // conhecidas faz o TypeScript inferir só { eventos: ... }, descartando a
  // assinatura de índice — e derrubando o acesso a item.repositorio_id em
  // quem consome o retorno desta função.
  const items: Record<string, unknown>[] = result.results.map((item) => ({ ...item, eventos: eventsByItem.get(Number(item.id)) || [] }));
  return { items, nextCursor };
}

// Os cartões do painel (Total em aberto, Urgentes, Visitas pendentes,
// Atendidos hoje) e os números ao lado de cada aba rápida (Orações, Em
// acompanhamento…) contavam só o que já tinha sido carregado no navegador,
// então uma comunidade com mais de um lote via números menores que o real.
// Este COUNT agregado ignora o LIMIT da paginação e reflete a fila inteira —
// e, como a lista de pessoas já faz, essas contagens ficam sempre totais,
// sem levar em conta a busca ou a aba selecionada no momento.
async function loadRepositoryItemsMetrics(db: ReturnType<typeof getD1>, input: {
  communityId: number; userId: number; canManageRepositories: boolean;
}) {
  const row = await db.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN ri.finalizado_em IS NULL THEN 1 ELSE 0 END), 0) AS aberto,
      COALESCE(SUM(CASE WHEN ri.finalizado_em IS NULL AND ri.prioridade = 'URGENTE' THEN 1 ELSE 0 END), 0) AS urgente,
      COALESCE(SUM(CASE WHEN ri.finalizado_em IS NULL AND r.tipo = 'VISITA' THEN 1 ELSE 0 END), 0) AS visitas,
      COALESCE(SUM(CASE WHEN ri.finalizado_em IS NOT NULL AND date(ri.finalizado_em) = date('now') THEN 1 ELSE 0 END), 0) AS hoje,
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN r.tipo = 'ORACAO' THEN 1 ELSE 0 END), 0) AS oracao_total,
      COALESCE(SUM(CASE WHEN r.tipo = 'VISITA' THEN 1 ELSE 0 END), 0) AS visita_total,
      COALESCE(SUM(CASE WHEN ri.status IN ('EM_ACOMPANHAMENTO', 'EM_ORACAO', 'EM_PROCESSO') THEN 1 ELSE 0 END), 0) AS em_acompanhamento,
      COALESCE(SUM(CASE WHEN (ri.proximo_retorno_em IS NOT NULL AND ri.proximo_retorno_em < CURRENT_TIMESTAMP
        AND ri.finalizado_em IS NULL) OR ri.status = 'AGUARDANDO_RETORNO' THEN 1 ELSE 0 END), 0) AS aguardando_retorno,
      COALESCE(SUM(CASE WHEN ri.finalizado_em IS NOT NULL THEN 1 ELSE 0 END), 0) AS concluidos
     FROM solicitacao_repositorio_itens ri
     JOIN solicitacao_repositorios r ON r.id = ri.repositorio_id AND r.comunidade_id = ri.comunidade_id
     LEFT JOIN ministerios_comunidade m ON m.id = r.ministerio_id AND m.comunidade_id = r.comunidade_id
     WHERE ri.comunidade_id = ? AND r.status = 'ATIVO' AND (? = 1 OR m.responsavel_usuario_id = ?)`,
  ).bind(input.communityId, input.canManageRepositories ? 1 : 0, input.userId)
    .first<{
      aberto: number; urgente: number; visitas: number; hoje: number; total: number;
      oracao_total: number; visita_total: number; em_acompanhamento: number;
      aguardando_retorno: number; concluidos: number;
    }>();
  return {
    open: Number(row?.aberto || 0), urgent: Number(row?.urgente || 0),
    visits: Number(row?.visitas || 0), today: Number(row?.hoje || 0),
    total: Number(row?.total || 0), prayerTotal: Number(row?.oracao_total || 0),
    visitTotal: Number(row?.visita_total || 0), inProgress: Number(row?.em_acompanhamento || 0),
    overdue: Number(row?.aguardando_retorno || 0), completed: Number(row?.concluidos || 0),
  };
}

export async function GET(request: Request) {
  const access = await requireTenantPermission("dashboard.view", "requests");
  if ("error" in access) return access.error;
  if (access.context.communityAccess === "FEED_ONLY") return Response.json({ error: "Ação não permitida." }, { status: 403 });

  const db = getD1();
  const communityId = access.context.comunidadeId;
  const userId = access.user.id;
  const canManageRepositories = hasGlobalRepositoryAccess(access.context.permissions);
  const canConfigureWhatsapp = access.context.papel === "PASTOR";

  const address = new URL(request.url);
  const requestedItemsSize = Number(address.searchParams.get("limite") || 0);
  const itemsPageSize = Number.isInteger(requestedItemsSize) && requestedItemsSize > 0
    ? Math.min(requestedItemsSize, REPO_ITEMS_MAX_PAGE_SIZE)
    : REPO_ITEMS_PAGE_SIZE;
  const filters = parseOperationalFilters(address);

  // Um cursor, qualquer filtro/busca ativo, ou o sinalizador explícito
  // ?operacional=1 (usado pelo painel de Atendimento ao entrar nesse modo,
  // mesmo sem filtro nenhum ainda) pedem só o próximo lote de itens de
  // repositório: repositórios, ministérios, contatos e responsáveis não
  // mudam a cada busca e já foram carregados no primeiro pedido sem filtro,
  // então este caminho fica bem mais leve.
  if (address.searchParams.has("cursor") || hasActiveFilters(filters) || address.searchParams.get("operacional") === "1") {
    const itemsCursor = decodeItemsCursor(address.searchParams.get("cursor"));
    const page = await loadRepositoryItemsPage(db, { communityId, userId, canManageRepositories, cursor: itemsCursor, pageSize: itemsPageSize, filters });
    return Response.json(page, { headers: { "Cache-Control": "no-store" } });
  }

  await cleanupFinishedRepositoryRequests(db, communityId);
  await ensureRequestRepositorySuggestions(db, communityId);

  const [repositories, itemsPage, itemsMetrics, ministries, contacts, preference, currentUser, assignees] = await Promise.all([
    db.prepare(
      `SELECT r.id, r.tipo, r.nome, r.status, r.ministerio_id,
        COALESCE(m.nome, '') AS ministerio_nome,
        CASE WHEN m.responsavel_usuario_id = ? THEN 1 ELSE 0 END AS responsavel
       FROM solicitacao_repositorios r
       LEFT JOIN ministerios_comunidade m ON m.id = r.ministerio_id AND m.comunidade_id = r.comunidade_id
       WHERE r.comunidade_id = ? AND (? = 1 OR (r.status = 'ATIVO' AND m.responsavel_usuario_id = ?))
       ORDER BY CASE r.status WHEN 'SUGERIDO' THEN 0 ELSE 1 END, r.tipo`,
    ).bind(userId, communityId, canManageRepositories ? 1 : 0, userId).all<Record<string, unknown>>(),
    loadRepositoryItemsPage(db, { communityId, userId, canManageRepositories, cursor: null, pageSize: itemsPageSize, filters }),
    loadRepositoryItemsMetrics(db, { communityId, userId, canManageRepositories }),
    canManageRepositories
      ? db.prepare("SELECT id, nome FROM ministerios_comunidade WHERE comunidade_id = ? AND status = 'ATIVO' ORDER BY nome ASC LIMIT 100")
          .bind(communityId).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    db.prepare(
      `SELECT u.id, u.nome, u.foto_perfil, u.telefone FROM pastor_whatsapp_preferencias p
       JOIN usuarios u ON u.id = p.usuario_id AND u.ativo = 1
       JOIN usuario_comunidades uc ON uc.usuario_id = u.id AND uc.comunidade_id = p.comunidade_id
         AND uc.status = 'ATIVO' AND uc.papel = 'PASTOR'
       WHERE p.comunidade_id = ? AND p.disponivel = 1 ORDER BY u.nome ASC`,
    ).bind(communityId).all<{ id: number; nome: string; foto_perfil: string | null; telefone: string | null }>(),
    db.prepare("SELECT disponivel FROM pastor_whatsapp_preferencias WHERE comunidade_id = ? AND usuario_id = ? LIMIT 1")
      .bind(communityId, userId).first<{ disponivel: number }>(),
    db.prepare("SELECT COALESCE(telefone, '') AS telefone FROM usuarios WHERE id = ? LIMIT 1")
      .bind(userId).first<{ telefone: string }>(),
    db.prepare(
      `SELECT DISTINCT u.id, u.nome, COALESCE(oc.titulo, uc.papel) AS funcao FROM usuarios u
       JOIN usuario_comunidades uc ON uc.usuario_id = u.id AND uc.comunidade_id = ? AND uc.status = 'ATIVO'
       LEFT JOIN oficiais_comunidade oc ON oc.usuario_comunidade_id = uc.id
       LEFT JOIN ministerios_comunidade m ON m.comunidade_id = uc.comunidade_id
         AND m.status = 'ATIVO' AND m.responsavel_usuario_id = u.id
       WHERE u.ativo = 1 AND (uc.papel IN ('PASTOR', 'ADMIN_COMUNIDADE') OR m.id IS NOT NULL
         OR instr(',' || COALESCE(oc.permissoes, '') || ',', ',requests.manage,') > 0)
       ORDER BY u.nome ASC LIMIT 150`,
    ).bind(communityId).all<Record<string, unknown>>(),
  ]);

  const itemsByRepository = new Map<number, Record<string, unknown>[]>();
  for (const item of itemsPage.items) {
    const repositoryId = Number(item.repositorio_id);
    const collection = itemsByRepository.get(repositoryId) || [];
    collection.push(item);
    itemsByRepository.set(repositoryId, collection);
  }

  return Response.json({
    canManageRepositories,
    canOperate: canManageRepositories || repositories.results.some((item) => item.status === "ATIVO"),
    currentActor: { id: userId, nome: access.user.nome },
    whatsappPreference: { canConfigure: canConfigureWhatsapp, enabled: Boolean(preference?.disponivel), hasPhone: Boolean(normalizeWhatsappNumber(currentUser?.telefone)) },
    pastoresContato: contacts.results.flatMap((contact) => {
      const number = normalizeWhatsappNumber(contact.telefone);
      return number ? [{ id: Number(contact.id), nome: contact.nome, foto: contact.foto_perfil || "", whatsappUrl: `https://wa.me/${number}` }] : [];
    }),
    ministries: ministries.results,
    assignees: assignees.results,
    // Nulo quando o lote de itens de repositório alcançou o último pendente.
    itemsNextCursor: itemsPage.nextCursor,
    // Contagens da fila inteira de oração/visita, não só do lote carregado.
    itemsMetrics,
    repositories: repositories.results.map((repository) => ({ ...repository, items: itemsByRepository.get(Number(repository.id)) || [] })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("dashboard.view", "requests");
  if ("error" in access) return access.error;
  if (access.context.communityAccess === "FEED_ONLY") return Response.json({ error: "Ação não permitida." }, { status: 403 });
  const body = await safeJson(request);
  if (!body) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const action = clean(body.action, 40).toUpperCase();
  const db = getD1();
  const communityId = access.context.comunidadeId;
  const userId = access.user.id;
  const globalAccess = hasGlobalRepositoryAccess(access.context.permissions);

  if (action === "TOGGLE_WHATSAPP") {
    if (access.context.papel !== "PASTOR") return Response.json({ error: "Somente pastores podem disponibilizar esse contato." }, { status: 403 });
    const enabled = body.enabled === true;
    const user = await db.prepare("SELECT telefone FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1").bind(userId).first<{ telefone: string | null }>();
    if (enabled && !normalizeWhatsappNumber(user?.telefone)) return Response.json({ error: "Cadastre um telefone válido no perfil antes de liberar o WhatsApp." }, { status: 400 });
    await db.prepare(
      `INSERT INTO pastor_whatsapp_preferencias (comunidade_id, usuario_id, disponivel, atualizado_em)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(comunidade_id, usuario_id) DO UPDATE SET
       disponivel = excluded.disponivel, atualizado_em = CURRENT_TIMESTAMP`,
    ).bind(communityId, userId, enabled ? 1 : 0).run();
    await recordTenantAudit(db, access.context, userId, "PASTOR_WHATSAPP_ATUALIZADO", "SUCESSO", { enabled });
    return Response.json({ ok: true });
  }

  if (action === "CONFIRMAR_REPOSITORIO") {
    if (!globalAccess) return Response.json({ error: "Permissão insuficiente para criar o repositório." }, { status: 403 });
    const repositoryId = positiveInteger(body.repositoryId);
    const ministryId = body.ministryId ? positiveInteger(body.ministryId) : null;
    if (!repositoryId) return Response.json({ error: "Repositório inválido." }, { status: 400 });
    const repository = await db.prepare("SELECT id, tipo FROM solicitacao_repositorios WHERE id = ? AND comunidade_id = ? LIMIT 1")
      .bind(repositoryId, communityId).first<{ id: number; tipo: string }>();
    if (!repository || !REPOSITORY_TYPES.has(repository.tipo)) return Response.json({ error: "Repositório não encontrado nesta comunidade." }, { status: 404 });
    if (ministryId) {
      const ministry = await db.prepare("SELECT id FROM ministerios_comunidade WHERE id = ? AND comunidade_id = ? AND status = 'ATIVO' LIMIT 1")
        .bind(ministryId, communityId).first<{ id: number }>();
      if (!ministry) return Response.json({ error: "Ministério inválido para esta comunidade." }, { status: 400 });
    }
    await db.prepare(
      `UPDATE solicitacao_repositorios SET status = 'ATIVO', ministerio_id = ?, confirmado_por = ?,
       confirmado_em = COALESCE(confirmado_em, CURRENT_TIMESTAMP), atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ?`,
    ).bind(ministryId, userId, repositoryId, communityId).run();
    await recordTenantAudit(db, access.context, userId, "REPOSITORIO_PEDIDOS_CONFIRMADO", "SUCESSO", { repositoryId, tipo: repository.tipo, ministryId });
    return Response.json({ ok: true });
  }

  if (action === "ENCAMINHAR_REPOSITORIO") {
    const repositoryId = positiveInteger(body.repositoryId);
    const requestId = positiveInteger(body.requestId);
    if (!repositoryId || !requestId) return Response.json({ error: "Solicitação ou repositório inválido." }, { status: 400 });
    const repository = await getAuthorizedRepository(db, { repositoryId, communityId, userId, globalAccess });
    if (!repository) return Response.json({ error: "Repositório não autorizado." }, { status: 403 });
    const requestItem = await db.prepare(
      `SELECT id, tipo, solicitante_id, titulo FROM solicitacoes_comunidade WHERE id = ? AND comunidade_id = ? AND (
       solicitante_id = ? OR EXISTS (SELECT 1 FROM solicitacao_destinatarios sd WHERE sd.solicitacao_id = solicitacoes_comunidade.id
       AND sd.comunidade_id = solicitacoes_comunidade.comunidade_id AND sd.usuario_id = ?)
       OR (? = 1 AND NOT EXISTS (SELECT 1 FROM solicitacao_destinatarios legacy WHERE legacy.solicitacao_id = solicitacoes_comunidade.id))) LIMIT 1`,
    ).bind(requestId, communityId, userId, userId, globalAccess ? 1 : 0).first<{ id: number; tipo: string; solicitante_id: number; titulo: string }>();
    if (!requestItem || requestItem.tipo !== repository.tipo) return Response.json({ error: "A solicitação não corresponde a este repositório." }, { status: 400 });
    await db.prepare("INSERT OR IGNORE INTO solicitacao_repositorio_itens (repositorio_id, comunidade_id, solicitacao_id, encaminhado_por) VALUES (?, ?, ?, ?)")
      .bind(repositoryId, communityId, requestId, userId).run();
    const item = await db.prepare("SELECT id FROM solicitacao_repositorio_itens WHERE repositorio_id = ? AND comunidade_id = ? AND solicitacao_id = ? LIMIT 1")
      .bind(repositoryId, communityId, requestId).first<{ id: number }>();
    if (item) await insertEvent(db, { communityId, itemId: item.id, requestId, type: "PEDIDO_ENCAMINHADO", message: `Pedido encaminhado ao ${repository.nome}.`, visibleToMember: true, actorId: userId });
    await db.prepare("UPDATE solicitacoes_comunidade SET status = 'EM_ANALISE', atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?").bind(requestId, communityId).run();
    await notifyUser(db, { userId: Number(requestItem.solicitante_id), title: "Pedido encaminhado para acompanhamento", message: `“${requestItem.titulo}” foi encaminhado ao ${repository.nome}.`, entityId: requestId, area: "SOLICITACOES", destination: "/painel?view=solicitacoes", createdBy: access.user.email });
    await recordTenantAudit(db, access.context, userId, "PEDIDO_ENCAMINHADO_REPOSITORIO", "SUCESSO", { repositoryId, requestId });
    return Response.json({ ok: true });
  }

  if (["ASSUMIR_ITEM", "TRANSFERIR_ITEM", "ADICIONAR_PARTICIPANTE"].includes(action)) {
    const itemId = positiveInteger(body.itemId);
    if (!itemId) return Response.json({ error: "Pedido inválido." }, { status: 400 });
    const item = await getItemForAction(db, itemId, communityId);
    if (!item) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    const repository = await getAuthorizedRepository(db, { repositoryId: item.repositorio_id, communityId, userId, globalAccess });
    if (!repository) return Response.json({ error: "Pedido fora do seu escopo de atendimento." }, { status: 403 });
    if (action === "ASSUMIR_ITEM") {
      if (item.responsavel_usuario_id && Number(item.responsavel_usuario_id) !== userId) return Response.json({ error: "Este pedido já possui responsável. Use a transferência autorizada." }, { status: 409 });
      await db.prepare(
        `UPDATE solicitacao_repositorio_itens SET responsavel_usuario_id = ?,
         responsavel_atribuido_em = COALESCE(responsavel_atribuido_em, CURRENT_TIMESTAMP), atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ?`,
      ).bind(userId, itemId, communityId).run();
      await insertEvent(db, { communityId, itemId, requestId: item.solicitacao_id, type: "RESPONSAVEL_ATRIBUIDO", message: `${access.user.nome} assumiu o atendimento.`, visibleToMember: true, actorId: userId });
      await notifyUser(db, { userId: item.solicitante_id, title: "Seu pedido está em acompanhamento", message: "Uma pessoa responsável assumiu seu atendimento.", entityId: item.solicitacao_id, area: "SOLICITACOES", destination: "/painel?view=solicitacoes", createdBy: access.user.email });
      await recordTenantAudit(db, access.context, userId, "PEDIDO_ASSUMIDO", "SUCESSO", { itemId });
      return Response.json({ ok: true });
    }
    const targetUserId = positiveInteger(body.userId);
    if (!targetUserId || !(await isAuthorizedAssignee(db, communityId, targetUserId))) return Response.json({ error: "Pessoa não autorizada para atender pedidos nesta comunidade." }, { status: 403 });
    if (!globalAccess && Number(item.responsavel_usuario_id) !== userId) return Response.json({ error: "Somente o responsável atual pode compartilhar este atendimento." }, { status: 403 });
    const target = await db.prepare("SELECT nome FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1").bind(targetUserId).first<{ nome: string }>();
    if (!target) return Response.json({ error: "Pessoa não encontrada." }, { status: 404 });
    await db.prepare("INSERT OR IGNORE INTO solicitacao_destinatarios (solicitacao_id, comunidade_id, usuario_id) VALUES (?, ?, ?)")
      .bind(item.solicitacao_id, communityId, targetUserId).run();
    if (action === "TRANSFERIR_ITEM") {
      await db.prepare("UPDATE solicitacao_repositorio_itens SET responsavel_usuario_id = ?, responsavel_atribuido_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?")
        .bind(targetUserId, itemId, communityId).run();
      await insertEvent(db, { communityId, itemId, requestId: item.solicitacao_id, type: "RESPONSAVEL_TRANSFERIDO", message: `Atendimento transferido para ${target.nome}.`, visibleToMember: true, actorId: userId });
    } else {
      await insertEvent(db, { communityId, itemId, requestId: item.solicitacao_id, type: "PARTICIPANTE_ADICIONADO", message: `${target.nome} foi adicionado ao atendimento.`, visibleToMember: false, actorId: userId });
    }
    await notifyUser(db, { userId: targetUserId, title: action === "TRANSFERIR_ITEM" ? "Pedido atribuído a você" : "Você foi adicionado a um atendimento", message: `Acompanhe “${item.titulo}” na Central de Pedidos.`, entityId: item.solicitacao_id, area: "SOLICITACOES", destination: "/painel?view=solicitacoes", createdBy: access.user.email });
    await recordTenantAudit(db, access.context, userId, action === "TRANSFERIR_ITEM" ? "PEDIDO_TRANSFERIDO" : "PEDIDO_PARTICIPANTE_ADICIONADO", "SUCESSO", { itemId, targetUserId });
    return Response.json({ ok: true });
  }

  if (action === "ADICIONAR_EVENTO") {
    const itemId = positiveInteger(body.itemId);
    const eventType = clean(body.tipo, 40).toUpperCase();
    const message = clean(body.mensagem, 2000);
    if (!itemId || !EVENT_TYPES.has(eventType) || message.length < 3) return Response.json({ error: "Informe uma anotação válida." }, { status: 400 });
    const item = await getItemForAction(db, itemId, communityId);
    if (!item) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    const repository = await getAuthorizedRepository(db, { repositoryId: item.repositorio_id, communityId, userId, globalAccess });
    if (!repository) return Response.json({ error: "Pedido fora do seu escopo de atendimento." }, { status: 403 });
    const visibleToMember = eventType === "ATUALIZACAO_MEMBRO";
    await insertEvent(db, { communityId, itemId, requestId: item.solicitacao_id, type: eventType, message, visibleToMember, actorId: userId });
    if (eventType === "TENTATIVA_CONTATO") await db.prepare("UPDATE solicitacao_repositorio_itens SET primeiro_contato_em = COALESCE(primeiro_contato_em, CURRENT_TIMESTAMP), atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?").bind(itemId, communityId).run();
    if (eventType === "REGISTRO_VISITA") await db.prepare("UPDATE solicitacao_repositorio_itens SET resultado = ?, primeiro_contato_em = COALESCE(primeiro_contato_em, CURRENT_TIMESTAMP), atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?").bind(message, itemId, communityId).run();
    if (visibleToMember) {
      await db.prepare("UPDATE solicitacao_repositorio_itens SET mensagem_atendimento = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?").bind(message, itemId, communityId).run();
      await notifyUser(db, { userId: item.solicitante_id, title: "Nova atualização no seu pedido", message, entityId: item.solicitacao_id, area: "SOLICITACOES", destination: "/painel?view=solicitacoes", createdBy: access.user.email });
    }
    await recordTenantAudit(db, access.context, userId, "PEDIDO_EVENTO_REGISTRADO", "SUCESSO", { itemId, tipo: eventType, visivelMembro: visibleToMember });
    return Response.json({ ok: true });
  }

  if (action === "ATUALIZAR_ITEM") {
    const itemId = positiveInteger(body.itemId);
    const status = clean(body.status, 30).toUpperCase();
    const message = clean(body.mensagemAtendimento, 2000);
    const testimony = clean(body.testemunho, 2000);
    const testimonyPermission = clean(body.testemunhoPermissao, 30).toUpperCase();
    const priority = clean(body.prioridade, 20).toUpperCase() || "NORMAL";
    const nextFollowUp = normalizeDateTime(body.proximoRetornoEm);
    const scheduledVisit = normalizeDateTime(body.visitaAgendadaEm);
    const result = clean(body.resultado, 2000);
    if (!itemId || !["NORMAL", "URGENTE"].includes(priority) || nextFollowUp === undefined || scheduledVisit === undefined || (testimony && !["PERMITIR", "NAO_PERMITIR"].includes(testimonyPermission))) return Response.json({ error: "Atualização inválida." }, { status: 400 });
    const item = await getItemForAction(db, itemId, communityId);
    if (!item) return Response.json({ error: "Item não encontrado." }, { status: 404 });
    const repository = await getAuthorizedRepository(db, { repositoryId: item.repositorio_id, communityId, userId, globalAccess });
    if (!repository) return Response.json({ error: "Repositório não autorizado." }, { status: 403 });
    const allowedStatuses = item.tipo === "ORACAO" ? PRAYER_STATUSES : VISIT_STATUSES;
    if (!allowedStatuses.has(status)) return Response.json({ error: "Situação inválida para este repositório." }, { status: 400 });
    const isFinal = FINAL_STATUSES.has(status);
    await db.prepare(
      `UPDATE solicitacao_repositorio_itens SET status = ?, prioridade = ?, responsavel_usuario_id = COALESCE(responsavel_usuario_id, ?),
       responsavel_atribuido_em = CASE WHEN responsavel_usuario_id IS NULL THEN CURRENT_TIMESTAMP ELSE responsavel_atribuido_em END,
       mensagem_atendimento = CASE WHEN ? = '' THEN mensagem_atendimento ELSE ? END,
       testemunho = CASE WHEN ? = '' THEN testemunho ELSE ? END,
       testemunho_compartilhavel = CASE WHEN ? = '' THEN testemunho_compartilhavel ELSE ? END,
       proximo_retorno_em = ?, visita_agendada_em = ?, resultado = CASE WHEN ? = '' THEN resultado ELSE ? END,
       finalizado_em = CASE WHEN ? = 1 THEN COALESCE(finalizado_em, CURRENT_TIMESTAMP) ELSE NULL END,
       atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?`,
    ).bind(status, priority, userId, message, message, testimony, testimony, testimony, testimonyPermission === "PERMITIR" ? 1 : 0, nextFollowUp, scheduledVisit, result, result, isFinal ? 1 : 0, itemId, communityId).run();
    await db.prepare("UPDATE solicitacoes_comunidade SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?")
      .bind(isFinal ? "CONCLUIDA" : "EM_ANALISE", item.solicitacao_id, communityId).run();
    if (status !== item.item_status) await insertEvent(db, { communityId, itemId, requestId: item.solicitacao_id, type: "STATUS_ATUALIZADO", message: `Situação alterada para ${status.replaceAll("_", " ").toLowerCase()}.`, visibleToMember: true, actorId: userId });
    if (message) await insertEvent(db, { communityId, itemId, requestId: item.solicitacao_id, type: "ATUALIZACAO_MEMBRO", message, visibleToMember: true, actorId: userId });
    await notifyUser(db, { userId: item.solicitante_id, title: "Acompanhamento atualizado", message: isFinal ? "Seu pedido foi concluído." : "Seu pedido está em acompanhamento.", entityId: item.solicitacao_id, area: "SOLICITACOES", destination: "/painel?view=solicitacoes", createdBy: access.user.email });
    await recordTenantAudit(db, access.context, userId, "ITEM_REPOSITORIO_ATUALIZADO", "SUCESSO", { itemId, status, prioridade: priority });
    return Response.json({ ok: true });
  }

  if (action === "PUBLICAR_TESTEMUNHO") {
    const itemId = positiveInteger(body.itemId);
    if (!itemId) return Response.json({ error: "Testemunho inválido." }, { status: 400 });
    const item = await db.prepare(
      `SELECT ri.id, ri.repositorio_id, ri.responsavel_usuario_id, ri.testemunho,
       ri.testemunho_compartilhavel, ri.testemunho_publicado_em, s.titulo, s.solicitante_id
       FROM solicitacao_repositorio_itens ri JOIN solicitacoes_comunidade s
       ON s.id = ri.solicitacao_id AND s.comunidade_id = ri.comunidade_id
       WHERE ri.id = ? AND ri.comunidade_id = ? LIMIT 1`,
    ).bind(itemId, communityId).first<{ id: number; repositorio_id: number; responsavel_usuario_id: number | null; testemunho: string; testemunho_compartilhavel: number; testemunho_publicado_em: string | null; titulo: string; solicitante_id: number }>();
    if (!item) return Response.json({ error: "Atendimento não encontrado." }, { status: 404 });
    const repository = await getAuthorizedRepository(db, { repositoryId: item.repositorio_id, communityId, userId, globalAccess });
    if (!repository || item.responsavel_usuario_id !== userId) return Response.json({ error: "Somente quem realizou o atendimento pode publicar o testemunho." }, { status: 403 });
    if (!item.testemunho || item.testemunho_compartilhavel !== 1) return Response.json({ error: "O compartilhamento deste testemunho não foi autorizado." }, { status: 403 });
    if (item.testemunho_publicado_em) return Response.json({ error: "Este testemunho já foi compartilhado." }, { status: 409 });
    const publication = await db.prepare(
      `INSERT INTO publicacoes_piloto (comunidade_id, titulo, resumo, conteudo, categoria, visibilidade, status,
       origem, comentarios_habilitados, criado_por, atualizado_em)
       VALUES (?, ?, ?, ?, 'TESTEMUNHO', 'COMUNIDADE', 'PUBLICADA', 'COMUNIDADE', 1, ?, CURRENT_TIMESTAMP)`,
    ).bind(communityId, `Testemunho · ${item.titulo}`.slice(0, 120), item.testemunho.slice(0, 320), item.testemunho, userId).run();
    await db.prepare("UPDATE solicitacao_repositorio_itens SET testemunho_publicado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?").bind(itemId, communityId).run();
    await recordTenantAudit(db, access.context, userId, "TESTEMUNHO_PEDIDO_PUBLICADO", "SUCESSO", { itemId, publicacaoId: Number(publication.meta.last_row_id) });
    return Response.json({ ok: true, publicacaoId: Number(publication.meta.last_row_id) });
  }
  return Response.json({ error: "Ação inválida." }, { status: 400 });
}

function hasGlobalRepositoryAccess(permissions: string[]) {
  return permissions.some((permission) => ["pastoral.panel.view", "community.settings.manage", "platform.admin.view", "community.admin.view", "requests.manage"].includes(permission));
}

async function getAuthorizedRepository(db: ReturnType<typeof getD1>, input: { repositoryId: number; communityId: number; userId: number; globalAccess: boolean }) {
  return db.prepare(
    `SELECT r.id, r.tipo, r.nome, r.ministerio_id FROM solicitacao_repositorios r
     LEFT JOIN ministerios_comunidade m ON m.id = r.ministerio_id AND m.comunidade_id = r.comunidade_id
     WHERE r.id = ? AND r.comunidade_id = ? AND r.status = 'ATIVO' AND (? = 1 OR m.responsavel_usuario_id = ?) LIMIT 1`,
  ).bind(input.repositoryId, input.communityId, input.globalAccess ? 1 : 0, input.userId).first<{ id: number; tipo: string; nome: string; ministerio_id: number | null }>();
}

async function getItemForAction(db: ReturnType<typeof getD1>, itemId: number, communityId: number) {
  return db.prepare(
    `SELECT ri.id, ri.repositorio_id, ri.solicitacao_id, ri.responsavel_usuario_id, ri.status AS item_status,
     s.solicitante_id, s.titulo, r.tipo FROM solicitacao_repositorio_itens ri
     JOIN solicitacao_repositorios r ON r.id = ri.repositorio_id AND r.comunidade_id = ri.comunidade_id
     JOIN solicitacoes_comunidade s ON s.id = ri.solicitacao_id AND s.comunidade_id = ri.comunidade_id
     WHERE ri.id = ? AND ri.comunidade_id = ? LIMIT 1`,
  ).bind(itemId, communityId).first<{ id: number; repositorio_id: number; solicitacao_id: number; responsavel_usuario_id: number | null; item_status: string; solicitante_id: number; titulo: string; tipo: string }>();
}

async function isAuthorizedAssignee(db: ReturnType<typeof getD1>, communityId: number, userId: number) {
  return Boolean(await db.prepare(
    `SELECT u.id FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id = u.id
     AND uc.comunidade_id = ? AND uc.status = 'ATIVO'
     LEFT JOIN oficiais_comunidade oc ON oc.usuario_comunidade_id = uc.id
     LEFT JOIN ministerios_comunidade m ON m.comunidade_id = uc.comunidade_id AND m.status = 'ATIVO' AND m.responsavel_usuario_id = u.id
     WHERE u.id = ? AND u.ativo = 1 AND (uc.papel IN ('PASTOR', 'ADMIN_COMUNIDADE') OR m.id IS NOT NULL
     OR instr(',' || COALESCE(oc.permissoes, '') || ',', ',requests.manage,') > 0) LIMIT 1`,
  ).bind(communityId, userId).first<{ id: number }>());
}

async function insertEvent(db: ReturnType<typeof getD1>, input: { communityId: number; itemId: number; requestId: number; type: string; message: string; visibleToMember: boolean; actorId: number }) {
  await db.prepare(
    `INSERT INTO solicitacao_eventos (comunidade_id, item_id, solicitacao_id, tipo, mensagem, visivel_membro, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(input.communityId, input.itemId, input.requestId, input.type, input.message, input.visibleToMember ? 1 : 0, input.actorId).run();
}

function normalizeDateTime(value: unknown) {
  const raw = clean(value, 40);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
async function safeJson(request: Request) { try { return (await request.json()) as Record<string, unknown>; } catch { return null; } }
function clean(value: unknown, length: number) { return String(value ?? "").trim().slice(0, length); }
function positiveInteger(value: unknown) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : 0; }
async function cleanupFinishedRepositoryRequests(db: ReturnType<typeof getD1>, communityId: number) {
  await db.prepare(
    `DELETE FROM solicitacoes_comunidade WHERE comunidade_id = ? AND id IN (
     SELECT solicitacao_id FROM solicitacao_repositorio_itens WHERE comunidade_id = ? AND finalizado_em IS NOT NULL
     AND finalizado_em <= datetime('now', '-30 days'))`,
  ).bind(communityId, communityId).run();
}
