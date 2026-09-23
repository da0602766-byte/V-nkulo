import { getD1 } from "../../../../db";
import { getCurrentSessionTokenHash, getSessionUser } from "../../../lib/local-auth";
import { safeDestination } from "../../../lib/web-push";

// Push pode ficar na fila do provedor depois do logout. O service worker
// consulta esta rota antes de exibir ou abrir um aviso, sempre com a sessão
// atual e o vínculo que existia quando o push foi criado.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.ativo) return new Response(null, { status: 401 });
  const params = new URL(request.url).searchParams;
  const id = Number(params.get("id"));
  const binding = params.get("binding") || "";
  if (!Number.isSafeInteger(id) || id <= 0 || !/^[a-f0-9-]{36}$/i.test(binding)) {
    return new Response(null, { status: 400 });
  }
  const sessionHash = await getCurrentSessionTokenHash();
  if (!sessionHash) return new Response(null, { status: 401 });
  const notification = await getD1().prepare(
    `SELECT n.destino_rota FROM notificacoes_sistema n
     WHERE n.id = ? AND n.usuario_id = ? AND n.area <> 'CHAT'
       AND NOT EXISTS (SELECT 1 FROM notificacoes_lidas l
         WHERE l.notificacao_id = n.id AND l.usuario_id = ?)
       AND EXISTS (SELECT 1 FROM notificacoes_push_dispositivos p
         JOIN sessoes s ON s.token_hash = p.sessao_token_hash AND s.usuario_id = p.usuario_id
         WHERE p.usuario_id = ? AND p.vinculo_id = ? AND p.sessao_token_hash = ?
           AND datetime(s.expira_em) > CURRENT_TIMESTAMP
           AND (p.expiracao_em IS NULL OR datetime(p.expiracao_em) > CURRENT_TIMESTAMP))
     LIMIT 1`,
  ).bind(id, user.id, user.id, user.id, binding, sessionHash).first<{ destino_rota: string }>();
  if (!notification) return new Response(null, { status: 404 });
  return Response.json({
    title: "Vínkulo",
    body: "Você recebeu uma atualização. Abra o Vínkulo para consultar.",
    url: safeDestination(notification.destino_rota),
    tag: `vinkulo-notification-${id}`,
  }, { headers: { "Cache-Control": "no-store" } });
}
