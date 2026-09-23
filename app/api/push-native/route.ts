import { getD1 } from "../../../db";
import { getCurrentSessionTokenHash, getSessionUser } from "../../lib/local-auth";
import { nativeToken, readFirebaseConfig } from "../../lib/firebase-integration";
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const user = await getSessionUser(); const sessionHash = await getCurrentSessionTokenHash();
  if (!user?.ativo || !sessionHash) return reply({ error: "Faça login." }, 401);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Origem inválida." }, 403);
  let payload: { token?: unknown; permission?: unknown; projectId?: unknown };
  try { payload = await request.json(); } catch { return reply({ error: "Registro inválido." }, 400); }
  if (!payload || typeof payload.token !== "string" || !nativeToken(`fcm:${payload.token}`) || payload.projectId !== "vinkulo-256e8") return reply({ error: "Registro inválido." }, 400);
  const db = getD1(), endpoint = `fcm:${payload.token}`;
  if (payload.permission !== true) {
    await db.prepare("DELETE FROM notificacoes_push_dispositivos WHERE usuario_id=? AND sessao_token_hash=? AND endpoint=?").bind(user.id, sessionHash, endpoint).run();
    return reply({ registered: false, configured: !!await readFirebaseConfig() });
  }
  // One native token per session. Rotation and account changes replace the binding;
  // deletion of the session cascades to devices and queued jobs.
  await db.prepare("DELETE FROM notificacoes_push_dispositivos WHERE usuario_id=? AND sessao_token_hash=? AND endpoint LIKE 'fcm:%' AND endpoint<>?").bind(user.id, sessionHash, endpoint).run();
  const registered = await db.prepare(`INSERT INTO notificacoes_push_dispositivos
    (usuario_id,endpoint,p256dh,auth,sessao_token_hash,vinculo_id,atualizado_em)
    SELECT ?,?,'','',?,?,CURRENT_TIMESTAMP
    WHERE EXISTS (SELECT 1 FROM sessoes WHERE usuario_id=? AND token_hash=? AND datetime(expira_em)>CURRENT_TIMESTAMP)
    ON CONFLICT(endpoint) DO UPDATE SET usuario_id=excluded.usuario_id,sessao_token_hash=excluded.sessao_token_hash,
      vinculo_id=CASE WHEN sessao_token_hash=excluded.sessao_token_hash AND usuario_id=excluded.usuario_id AND vinculo_id IS NOT NULL THEN vinculo_id ELSE excluded.vinculo_id END,
      atualizado_em=CURRENT_TIMESTAMP
    RETURNING vinculo_id`).bind(user.id, endpoint, sessionHash, crypto.randomUUID(), user.id, sessionHash).first<{ vinculo_id: string }>();
  if (!registered) return reply({ error: "Sessão expirada." }, 401);
  return reply({ registered: true, bindingId: registered.vinculo_id, configured: !!await readFirebaseConfig() });
}
