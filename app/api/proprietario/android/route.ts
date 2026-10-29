import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { ANDROID_OFFLINE_KEY, getAndroidOfflinePolicy } from "../../../lib/android-offline-policy";

async function owner() {
  const user = await getSessionUser();
  if (!user) return { error: Response.json({ error: "Faça login para continuar." }, { status: 401 }) };
  if (!user.ativo || !user.system_owner) return { error: Response.json({ error: "Controle exclusivo do proprietário." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const access = await owner();
  if (access.error) return access.error;
  return Response.json(await getAndroidOfflinePolicy(), { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const access = await owner();
  if (access.error) return access.error;
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Origem inválida." }, { status: 403 });
  }
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Solicitação inválida." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || !("offlineEnabled" in payload) || typeof payload.offlineEnabled !== "boolean") {
    return Response.json({ error: "Escolha ativar ou desativar o modo offline." }, { status: 400 });
  }
  const offlineEnabled = payload.offlineEnabled;
  const db = getD1();
  await db.batch([
    db.prepare(`INSERT INTO feature_flags (flag_key, scope_type, scope_id, enabled, alterado_por, alterado_em)
      VALUES (?, 'GLOBAL', 0, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(flag_key, scope_type, scope_id) DO UPDATE SET enabled = excluded.enabled,
      inicia_em = NULL, termina_em = NULL, alterado_por = excluded.alterado_por, alterado_em = CURRENT_TIMESTAMP`)
      .bind(ANDROID_OFFLINE_KEY, offlineEnabled ? 1 : 0, access.user!.id),
    db.prepare(`INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados)
      VALUES (NULL, ?, 'ANDROID_OFFLINE_ATUALIZADO', 'SUCESSO', ?)`)
      .bind(access.user!.id, JSON.stringify({ offlineEnabled, scope: "GLOBAL" })),
  ]);
  return Response.json({ ok: true, offlineEnabled, minimumVersion: "1.23.0" }, { headers: { "Cache-Control": "no-store" } });
}
