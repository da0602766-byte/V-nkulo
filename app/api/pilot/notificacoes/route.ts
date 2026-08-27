import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";

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

export async function GET() {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const db = getD1();
  const result = await db
    .prepare(
      `SELECT n.id, n.tipo, n.titulo, n.mensagem, n.area, n.entidade_id,
        n.destino_rota, n.hierarquia, n.ministerio,
        remetente.nome AS remetente_nome,
        n.criado_em, CASE WHEN nl.id IS NULL THEN 0 ELSE 1 END AS lida
      FROM notificacoes_sistema n
      LEFT JOIN usuarios remetente ON remetente.id = n.remetente_usuario_id
      LEFT JOIN notificacoes_lidas nl
        ON nl.notificacao_id = n.id AND nl.usuario_id = ?
      WHERE n.usuario_id = ? AND n.area <> 'CHAT'
      ORDER BY n.criado_em DESC, n.id DESC
      LIMIT 60`,
    )
    .bind(user.id, user.id)
    .all<NotificationRow>();
  const owner = await db.prepare("SELECT id FROM comunidades WHERE proprietario_usuario_id = ? AND status = 'ATIVA' LIMIT 1").bind(user.id).first<{ id: number }>();
  const configKey = `notification_preferences:${user.id}`;
  const stored = await db.prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1").bind(configKey).first<{ valor: string }>();
  const config = parseNotificationConfig(stored?.valor);
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
    unread: notifications.filter((item) => !item.read).length,
    canConfigure: Boolean(owner),
    config,
  });
}

const DEFAULT_NOTIFICATION_CONFIG = { escalas: true, eventos: true, pedidos: true, mensagens: true, sistema: true };
type NotificationCategory = keyof typeof DEFAULT_NOTIFICATION_CONFIG;

function parseNotificationConfig(value?: string) {
  try {
    return { ...DEFAULT_NOTIFICATION_CONFIG, ...(value ? JSON.parse(value) : {}) } as Record<NotificationCategory, boolean>;
  } catch {
    return { ...DEFAULT_NOTIFICATION_CONFIG };
  }
}

function notificationCategory(item: NotificationRow): NotificationCategory {
  const value = `${item.tipo} ${item.area} ${item.titulo}`.toLocaleLowerCase("pt-BR");
  if (value.includes("escala") || value.includes("minister")) return "escalas";
  if (value.includes("evento")) return "eventos";
  if (value.includes("pedido") || value.includes("oração") || value.includes("solicita")) return "pedidos";
  if (value.includes("mensagem") || value.includes("chat")) return "mensagens";
  return "sistema";
}

function normalizeDestination(value: string) {
  const destination = String(value || "");
  return destination.startsWith("/painel?") ||
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
        SELECT id, ? FROM notificacoes_sistema
        WHERE usuario_id = ? AND area <> 'CHAT'`,
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
      "SELECT id FROM notificacoes_sistema WHERE id = ? AND usuario_id = ? AND area <> 'CHAT' LIMIT 1",
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
      WHERE usuario_id = ? AND area <> 'CHAT'
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
    WHERE n.id = ? AND n.usuario_id = ? AND n.area <> 'CHAT' LIMIT 1`)
    .bind(user.id, id, user.id).first<{ id: number }>();
  if (!readNotification) {
    return Response.json({ error: "Visualize a notificação antes de limpá-la." }, { status: 409 });
  }
  await db.prepare("DELETE FROM notificacoes_sistema WHERE id = ? AND usuario_id = ? AND area <> 'CHAT'")
    .bind(id, user.id).run();
  return Response.json({ ok: true });
}
