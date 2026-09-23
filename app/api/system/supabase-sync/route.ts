import { getD1 } from "../../../../db";
import { runAutoSyncIfDue } from "../../../lib/supabase-auto-sync";
import { recordScheduleHeartbeat, validWebhookToken } from "../../../lib/supabase-schedule";
import { drainPushQueue } from "../../../lib/push-delivery-queue";

export async function POST(request: Request) {
  if (!(await validWebhookToken(request.headers.get("authorization")))) {
    return Response.json({ error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const db = getD1();
    await recordScheduleHeartbeat(db);
    // O job já instalado a cada cinco minutos também acorda a fila, sem depender
    // de uma tela aberta. Falha no catálogo não impede a tentativa das entregas.
    const [sync, push] = await Promise.allSettled([
      runAutoSyncIfDue(db, { force: true }), drainPushQueue(db, "scheduled"),
    ]);
    if (sync.status === "rejected") throw new Error("Sincronização indisponível.");
    const status = sync.value;
    return Response.json({ enabled: status.enabled, running: status.running, lastSuccessAt: status.lastSuccessAt,
      lastError: status.lastError, pushQueue: push.status === "fulfilled" ? push.value : { error: "Fila temporariamente indisponível." } },
      { status: status.lastError || push.status === "rejected" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível executar a sincronização." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
