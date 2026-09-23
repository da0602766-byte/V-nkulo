import { getRuntimeEnv } from "../../db/runtime-env";
import { readIntegration, reveal } from "./supabase-integration";

const SITE_ORIGIN = "https://adote-gestao.da0602766.chatgpt.site";
const SCHEDULE_KEY = "supabase_sync_schedule";

export type ScheduleStatus = { installedAt: string | null; lastHeartbeatAt: string | null; jobId: number | null };

export async function webhookToken(): Promise<string> {
  const secret = getRuntimeEnv().AUTH_SECRET;
  if (!secret || secret.length < 20) throw new Error("A chave de autenticação do site não está configurada.");
  const bytes = new TextEncoder().encode(`vinkulo:supabase-schedule:v1:${SITE_ORIGIN}:${secret}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function validWebhookToken(value: string | null): Promise<boolean> {
  const supplied = /^Bearer ([a-f0-9]{64})$/.exec(value || "")?.[1];
  if (!supplied) return false;
  const expected = await webhookToken();
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return diff === 0;
}

export async function getScheduleStatus(db: D1Database): Promise<ScheduleStatus> {
  const row = await db.prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1").bind(SCHEDULE_KEY).first<{ valor: string }>();
  if (!row) return { installedAt: null, lastHeartbeatAt: null, jobId: null };
  try {
    const status = JSON.parse(row.valor) as Partial<ScheduleStatus>;
    return { installedAt: status.installedAt || null, lastHeartbeatAt: status.lastHeartbeatAt || null,
      jobId: Number.isSafeInteger(status.jobId) ? status.jobId! : null };
  } catch { return { installedAt: null, lastHeartbeatAt: null, jobId: null }; }
}

async function saveStatus(db: D1Database, status: ScheduleStatus) {
  await db.prepare("INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em) VALUES (?, ?, 'sistema', CURRENT_TIMESTAMP) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = CURRENT_TIMESTAMP")
    .bind(SCHEDULE_KEY, JSON.stringify(status)).run();
}

export async function recordScheduleHeartbeat(db: D1Database) {
  const previous = await getScheduleStatus(db);
  await saveStatus(db, { ...previous, lastHeartbeatAt: new Date().toISOString() });
}

export async function installSchedule(db: D1Database): Promise<ScheduleStatus> {
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey) throw new Error("Ative a conexão protegida com o Supabase.");
  if (saved.config.url !== "https://erdyearvkahtwdmpcvgc.supabase.co") throw new Error("O agendamento está restrito ao projeto Supabase desta publicação.");
  const secret = await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${saved.config.url}/rest/v1/rpc/vinkulo_install_sync_schedule`, {
      method: "POST", headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_secret: await webhookToken() }), cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new Error(response.status === 404
      ? "A migração SQL do agendamento ainda não foi aplicada no Supabase."
      : `O Supabase recusou o agendamento (HTTP ${response.status}).`);
    const jobId = Number(await response.json());
    if (!Number.isSafeInteger(jobId) || jobId < 1) throw new Error("O Supabase não confirmou o agendamento.");
    const previous = await getScheduleStatus(db);
    const status = { ...previous, installedAt: new Date().toISOString(), jobId };
    await saveStatus(db, status);
    return status;
  } finally { clearTimeout(timer); }
}
