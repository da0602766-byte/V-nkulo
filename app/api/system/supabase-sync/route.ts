import { getD1 } from "../../../../db";
import { runAutoSyncIfDue } from "../../../lib/supabase-auto-sync";
import { recordScheduleHeartbeat, validWebhookToken } from "../../../lib/supabase-schedule";

export async function POST(request: Request) {
  if (!(await validWebhookToken(request.headers.get("authorization")))) {
    return Response.json({ error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const db = getD1();
    await recordScheduleHeartbeat(db);
    const status = await runAutoSyncIfDue(db, { force: true });
    return Response.json({ enabled: status.enabled, running: status.running, lastSuccessAt: status.lastSuccessAt,
      lastError: status.lastError }, { status: status.lastError ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível executar a sincronização." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
