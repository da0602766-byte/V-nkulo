import { getD1 } from "../../db";

export const ANDROID_OFFLINE_KEY = "android_offline_enabled";

export async function getAndroidOfflinePolicy() {
  const row = await getD1().prepare(
    "SELECT enabled FROM feature_flags WHERE flag_key = ? AND scope_type = 'GLOBAL' AND scope_id = 0 LIMIT 1",
  ).bind(ANDROID_OFFLINE_KEY).first<{ enabled: number }>();
  // Preserve the current feature until the owner changes it. No tenant override.
  return { offlineEnabled: row ? row.enabled === 1 : true, minimumVersion: "1.23.0" };
}

export async function rejectDisabledOffline() {
  return (await getAndroidOfflinePolicy()).offlineEnabled ? null : Response.json(
    { error: "O proprietário desativou o modo offline. Use o sistema com internet.", code: "OFFLINE_DISABLED" },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
