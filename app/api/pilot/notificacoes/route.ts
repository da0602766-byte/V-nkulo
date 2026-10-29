import { notificationCategory, NOTIFICATION_CATEGORY_SQL, type NotificationCategory } from "../../../lib/notification-category";
import { deliverCareNoteReminders } from "../../../lib/care-note-reminders";
import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { notificationVisibilitySql } from "../../../lib/owner-notifications";

type NotificationRow = {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  area: string;
  entidade_id: number | null;
  destino_rota: string;
  hierarquia: string;
  ministerio: string;
  remetente_nome: string | null;
  criado_em: string;
  lida: number;
};

// Lote das notificações. Antes eram 60 fixas, sem forma de ver as anteriores.
const NOTIFICATION_PAGE_SIZE = 60;
const NOTIFICATION_MAX_PAGE_SIZE = 100;

// A lista desce por (criado_em, id), então o cursor carrega esse par.
type NotificationCursor = { criadoEm: string; id: number };

function encodeNotificationCursor(cursor: NotificationCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeNotificationCursor(value: string | null): NotificationCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<NotificationCursor>;
    const id = Number(parsed.id);
    if (typeof parsed.criadoEm !== "string" || !Number.isInteger(id) || id <= 0) {
      return null;
    }
    return { criadoEm: parsed.criadoEm, id };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const db = getD1();
  await deliverCareNoteReminders(db, user.id).catch(() => undefined);
  const address = new URL(request.url);
  const cursor = decodeNotificationCursor(address.searchParams.get("cursor"));
  const requestedSize = Number(address.searchParams.get("limite") || 0);
  const pageSize =
    Number.isInteger(requestedSize) && requestedSize > 0
      ? Math.min(requestedSize, NOTIFICATION_MAX_PAGE_SIZE)
      : NOTIFICATION_PAGE_SIZE;
  const result = await db
    .prepare(
      `WITH page AS MATERIALIZED (
        SELECT n.id FROM notificacoes_sistema n
      WHERE n.usuario_id = ? AND n.area <> 'CHAT' AND ${notificationVisibilitySql(Boolean(user.system_owner))}
        AND (
          ? = 0
          OR n.criado_em < ?
          OR (n.criado_em = ? AND n.id < ?)
        )
      ORDER BY n.criado_em DESC, n.id DESC
      LIMIT ?
      )
      SELECT n.id, n.tipo, n.titulo, n.mensagem, n.area, n.entidade_id,
        n.destino_rota, n.hierarquia, n.ministerio,
        remetente.nome AS remetente_nome,
        n.criado_em, CASE WHEN nl.id IS NULL THEN 0 ELSE 1 END AS lida
      FROM page JOIN notificacoes_sistema n ON n.id = page.id
      LEFT JOIN usuarios remetente ON remetente.id = n.remetente_usuario_id
      LEFT JOIN notificacoes_lidas nl
        ON nl.notificacao_id = n.id AND nl.usuario_id = ?
      ORDER BY n.criado_em DESC, n.id DESC`,
    )
    .bind(
      user.id,
      cursor ? 1 : 0,
      cursor?.criadoEm ?? "",
      cursor?.criadoEm ?? "",
      cursor?.id ?? 0,
      pageSize + 1,
      user.id,
    )
    .all<NotificationRow>();

  const hasMore = result.results.length > pageSize;
  if (hasMore) result.results.length = pageSize;
  const lastNotification = result.results[result.results.length - 1];
  const nextCursor =
    hasMore && lastNotification
      ? encodeNotificationCursor({
          criadoEm: String(lastNotification.criado_em ?? ""),
          id: Number(lastNotification.id),
        })
      : null;

  const owner = await db.prepare("SELECT id FROM comunidades WHERE proprietario_usuario_id = ? AND status = 'ATIVA' LIMIT 1").bind(user.id).first<{ id: number }>();
  const configKey = `notification_preferences:${user.id}`;
  const stored = await db.prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1").bind(configKey).first<{ valor: string }>();
  const config = parseNotificationConfig(stored?.valor);
  const countCategory = (Object.keys(DEFAULT_NOTIFICATION_CONFIG) as NotificationCategory[])
    .every(category => config[category]) ? "'sistema'" : NOTIFICATION_CATEGORY_SQL;
  // Conta no banco: no máximo cinco linhas atravessam a conexão. Quando todas
  // as categorias estão ativas, basta o total, sem classificar cada título.
  const unreadCounts = await db
    .prepare(
      `SELECT ${countCategory} AS category, COUNT(*) AS total
       FROM notificacoes_sistema n
       LEFT JOIN notificacoes_lidas nl
         ON nl.notificacao_id = n.id AND nl.usuario_id = ?
       WHERE n.usuario_id = ? AND n.area <> 'CHAT' AND nl.id IS NULL AND ${notificationVisibilitySql(Boolean(user.system_owner))}
       GROUP BY category`,
    )
    .bind(user.id, user.id)
    .all<{ category: NotificationCategory; total: number }>();
  const notifications = result.results.map((item) => ({
    id: Number(item.id),
    type: item.tipo,
    title: item.titulo,
    message: item.mensagem,
    area: item.area,
    entityId: item.entidade_id ? Number(item.entidade_id) : null,
    destination: normalizeDestination(item.destino_rota),
    senderName: item.remetente_nome || "",
    hierarchy: item.hierarquia || "",
    ministry: item.ministerio || "",
    createdAt: item.criado_em,
    read: Boolean(item.lida),
    category: notificationCategory(item),
  })).filter((item) => config[item.category]);
  return Response.json({
    notifications,
    nextCursor,
    unread: unreadCounts.results.reduce((total, item) => total + (config[item.category] ? Number(item.total) : 0), 0),
    canConfigure: Boolean(owner),
    config,
  });
}

const DEFAULT_NOTIFICATION_CONFIG = { escalas: true, eventos: true, pedidos: true, mensagens: true, sistema: true };


function parseNotificationConfig(value?: string) {
  try {
    return { ...DEFAULT_NOTIFICATION_CONFIG, ...(value ? JSON.parse(value) : {}) } as Record<NotificationCategory, boolean>;
  } catch {
    return { ...DEFAULT_NOTIFICATION_CONFIG };
  }
}

function normalizeDestination(value: string) {
  const destination = String(value || "");
  return destination.startsWith("/painel?") ||
    destination.startsWith("/painel/visitantes?") ||
    destination.startsWith("/comunidades") ||
    destination.startsWith("/proprietario")
    ? destination
    : "";
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const payload = (await request.json()) as { id?: unknown; todas?: unknown; config?: unknown };
  const db = getD1();
  if (payload.config && typeof payload.config === "object") {
    const owner = await db.prepare("SELECT id FROM comunidades WHERE proprietario_usuario_id = ? AND status = 'ATIVA' LIMIT 1").bind(user.id).first<{ id: number }>();
    if (!owner) return Response.json({ error: "Somente o proprietário pode configurar notificações." }, { status: 403 });
    const source = payload.config as Record<string, unknown>;
    const config = Object.fromEntries(Object.keys(DEFAULT_NOTIFICATION_CONFIG).map((key) => [key, source[key] !== false]));
    await db.prepare(`INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`)
      .bind(`notification_preferences:${user.id}`, JSON.stringify(config), user.email).run();
    return Response.json({ ok: true, config });
  }
  if (payload.todas === true) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO notificacoes_lidas (notificacao_id, usuario_id)
        SELECT n.id, ? FROM notificacoes_sistema n
        WHERE n.usuario_id = ? AND n.area <> 'CHAT' AND ${notificationVisibilitySql(Boolean(user.system_owner))}`,
      )
      .bind(user.id, user.id)
      .run();
    return Response.json({ ok: true });
  }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Notificação inválida." }, { status: 400 });
  }
  const owned = await db
    .prepare(
      `SELECT n.id FROM notificacoes_sistema n WHERE n.id = ? AND n.usuario_id = ? AND n.area <> 'CHAT' AND ${notificationVisibilitySql(Boolean(user.system_owner))} LIMIT 1`,
    )
    .bind(id, user.id)
    .first<{ id: number }>();
  if (!owned) {
    return Response.json({ error: "Notificação não encontrada." }, { status: 404 });
  }
  await db
    .prepare(
      "INSERT OR IGNORE INTO notificacoes_lidas (notificacao_id, usuario_id) VALUES (?, ?)",
    )
    .bind(id, user.id)
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const payload = (await request.json()) as { id?: unknown; lidas?: unknown };
  const db = getD1();
  if (payload.lidas === true) {
    await db.prepare(`DELETE FROM notificacoes_sistema
      WHERE usuario_id = ? AND area <> 'CHAT' AND ${notificationVisibilitySql(Boolean(user.system_owner), "notificacoes_sistema")}
      AND EXISTS (
        SELECT 1 FROM notificacoes_lidas nl
        WHERE nl.notificacao_id = notificacoes_sistema.id AND nl.usuario_id = ?
      )`).bind(user.id, user.id).run();
    return Response.json({ ok: true });
  }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Notificação inválida." }, { status: 400 });
  }
  const readNotification = await db.prepare(`SELECT n.id
    FROM notificacoes_sistema n
    JOIN notificacoes_lidas nl ON nl.notificacao_id = n.id AND nl.usuario_id = ?
    WHERE n.id = ? AND n.usuario_id = ? AND n.area <> 'CHAT' AND ${notificationVisibilitySql(Boolean(user.system_owner))} LIMIT 1`)
    .bind(user.id, id, user.id).first<{ id: number }>();
  if (!readNotification) {
    return Response.json({ error: "Visualize a notificação antes de limpá-la." }, { status: 409 });
  }
  await db.prepare("DELETE FROM notificacoes_sistema WHERE id = ? AND usuario_id = ? AND area <> 'CHAT'")
    .bind(id, user.id).run();
  return Response.json({ ok: true });
}
