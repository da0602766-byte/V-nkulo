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
  const result = await getD1()
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
  }));
  return Response.json({
    notifications,
    unread: notifications.filter((item) => !item.read).length,
  });
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
  const payload = (await request.json()) as { id?: unknown; todas?: unknown };
  const db = getD1();
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
