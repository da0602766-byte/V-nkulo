import { getRuntimeEnv } from "../../db/runtime-env";
import { getVapidConfiguration, isTrustedPushEndpoint, isWebPushConfigured, sendWebPush, type PushSubscriptionRow, type VapidConfiguration } from "./web-push";
import type { PushQueueState, PushQueueStatus } from "./push-delivery-types";
import { readFirebaseConfig, nativeToken, sendFcm, type FirebaseConfig } from "./firebase-integration";

const BATCH_SIZE = 8;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 5;
const LEASE_MS = 60_000;
type DrainReason = "immediate" | "traffic" | "scheduled";
type Job = { id: number; notificacao_id: number; dispositivo_id: number; usuario_id: number; vinculo_id: string; tentativas: number; expira_em: number };
type Control = { lease_ate: number; ultimo_inicio_em: string | null; ultimo_fim_em: string | null; ultimo_agendamento_em: string | null; ultimo_erro: string | null };

/** A fila já existe no D1; waitUntil só reduz o tempo até a primeira tentativa. */
export function scheduleWebPushDelivery(db: D1Database, reason: DrainReason = "immediate") {
  const delivery = drainPushQueue(db, reason).catch(() => undefined);
  const executionContext = getRuntimeEnv().executionContext;
  if (executionContext) executionContext.waitUntil(delivery);
  else void delivery;
}

export function retryAt(attempt: number, retryAfter: string | null, now: number) {
  const base = Math.min(3_600_000, 30_000 * 2 ** Math.max(0, attempt - 1));
  const backoff = now + base + Math.floor(Math.random() * base * .2);
  if (!retryAfter) return backoff;
  const seconds = /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) : null;
  const suggested = seconds === null ? Date.parse(retryAfter) : now + seconds * 1000;
  return Number.isFinite(suggested) ? Math.max(backoff, suggested) : backoff;
}

export async function drainPushQueue(db: D1Database, reason: DrainReason = "traffic") {
  if (reason === "scheduled") {
    await db.prepare("UPDATE notificacoes_push_controle SET ultimo_agendamento_em = CURRENT_TIMESTAMP WHERE id = 1").run();
  }
  const configuration = getVapidConfiguration();
  const firebase = await readFirebaseConfig(db).catch(() => null);
  if (!configuration && !firebase) return { configured: false, claimed: 0, busy: false };
  const now = Date.now(), token = crypto.randomUUID();
  const lock = await db.prepare(
    `UPDATE notificacoes_push_controle SET lease_token = ?, lease_ate = ?, ultimo_inicio_em = CURRENT_TIMESTAMP
     WHERE id = 1 AND lease_ate <= ?`,
  ).bind(token, now + LEASE_MS, now).run();
  if (Number(lock.meta.changes) !== 1) return { configured: true, claimed: 0, busy: true };
  let failed = false;
  try {
    // Retém somente diagnóstico operacional. Nunca apaga a notificação da central.
    await db.prepare(
      `DELETE FROM notificacoes_push_fila WHERE id IN (
       SELECT id FROM notificacoes_push_fila WHERE atualizado_em < datetime('now','-7 days')
         AND estado IN ('ACEITO','FALHA','EXPIRADA','CANCELADA') ORDER BY atualizado_em LIMIT 500)`,
    ).run();
    const claimed = await db.prepare(
      `UPDATE notificacoes_push_fila SET estado = 'PROCESSANDO', lease_token = ?, lease_ate = ?,
         tentativas = tentativas + 1, atualizado_em = CURRENT_TIMESTAMP
       WHERE id IN (SELECT id FROM notificacoes_push_fila
         WHERE ((estado = 'PENDENTE' AND proxima_tentativa_em <= ?)
            OR (estado = 'PROCESSANDO' AND lease_ate <= ?))
           AND dispositivo_id IN (SELECT id FROM notificacoes_push_dispositivos
             WHERE (? = 1 AND endpoint NOT LIKE 'fcm:%') OR (? = 1 AND endpoint LIKE 'fcm:%'))
         ORDER BY proxima_tentativa_em, id LIMIT ?)
       RETURNING id, notificacao_id, dispositivo_id, usuario_id, vinculo_id, tentativas, expira_em`,
    ).bind(token, now + LEASE_MS, now, now, configuration ? 1 : 0, firebase ? 1 : 0, BATCH_SIZE).all<Job>();
    // Duas ondas de até quatro requisições com timeout de cinco segundos cada.
    for (let index = 0; index < claimed.results.length; index += CONCURRENCY) {
      const outcomes = await Promise.allSettled(claimed.results.slice(index, index + CONCURRENCY)
        .map(job => deliverJob(db, job, token, configuration, firebase)));
      if (outcomes.some(outcome => outcome.status === "rejected")) failed = true;
    }
    if (failed) throw new Error("Falha ao registrar uma tentativa da fila push.");
    return { configured: true, claimed: claimed.results.length, busy: false };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // Fencing: uma execução antiga não libera o lock nem sobrescreve o estado da nova.
    await db.prepare(
      `UPDATE notificacoes_push_controle SET lease_token = NULL, lease_ate = 0,
       ultimo_fim_em = CURRENT_TIMESTAMP, ultimo_erro = ? WHERE id = 1 AND lease_token = ?`,
    ).bind(failed ? "Falha no processamento; itens interrompidos serão retomados." : null, token).run();
  }
}

async function finish(db: D1Database, job: Job, token: string, state: PushQueueState, status: number | null, reason: string | null, nextAt = 0) {
  await db.prepare(
    `UPDATE notificacoes_push_fila SET estado = ?, ultimo_status = ?, motivo = ?, proxima_tentativa_em = ?,
       lease_token = NULL, lease_ate = 0, atualizado_em = CURRENT_TIMESTAMP
     WHERE id = ? AND estado = 'PROCESSANDO' AND lease_token = ?`,
  ).bind(state, status, reason, nextAt, job.id, token).run();
}

async function deliverJob(db: D1Database, job: Job, token: string, configuration: VapidConfiguration | null, firebase: FirebaseConfig | null) {
  if (job.expira_em <= Date.now()) return finish(db, job, token, "EXPIRADA", null, "PRAZO_EXPIRADO");
  if (job.tentativas > MAX_ATTEMPTS) return finish(db, job, token, "FALHA", null, "LIMITE_TENTATIVAS");
  // Revalida a autorização e a leitura a cada envio, incluindo execuções recuperadas.
  const subscription = await db.prepare(
    `SELECT p.id, p.endpoint, p.p256dh, p.auth, p.vinculo_id, n.tipo
     FROM notificacoes_push_fila q
     JOIN notificacoes_push_dispositivos p ON p.id = q.dispositivo_id
       AND p.usuario_id = q.usuario_id AND p.vinculo_id = q.vinculo_id
     JOIN sessoes s ON s.token_hash = p.sessao_token_hash AND s.usuario_id = p.usuario_id
     JOIN usuarios u ON u.id = p.usuario_id AND u.ativo = 1
     JOIN notificacoes_sistema n ON n.id = q.notificacao_id AND n.usuario_id = q.usuario_id
     WHERE q.id = ? AND q.lease_token = ? AND q.estado = 'PROCESSANDO' AND q.lease_ate > ?
       AND n.area <> 'CHAT' AND datetime(s.expira_em) > CURRENT_TIMESTAMP
       AND (p.expiracao_em IS NULL OR datetime(p.expiracao_em) > CURRENT_TIMESTAMP)
       AND NOT EXISTS (SELECT 1 FROM notificacoes_lidas l WHERE l.notificacao_id = n.id AND l.usuario_id = q.usuario_id)`,
  ).bind(job.id, token, Date.now()).first<PushSubscriptionRow & { tipo: string }>();
  if (!subscription) return finish(db, job, token, "CANCELADA", null, "ACESSO_OU_AVISO_INDISPONIVEL");
  const native = nativeToken(subscription.endpoint);
  if (!native && !isTrustedPushEndpoint(subscription.endpoint)) return finish(db, job, token, "FALHA", null, "DESTINO_INVALIDO");

  const payload = JSON.stringify({ title: "Vínkulo", body: "Você recebeu uma atualização. Abra o Vínkulo para consultar.",
    tag: `vinkulo-notification-${job.notificacao_id}`, url: "/painel", notificationId: job.notificacao_id, bindingId: job.vinculo_id });
  let status = 0, retryAfter: string | null = null;
  try {
    const options = {
      ttl: Math.ceil((job.expira_em - Date.now()) / 1000), topic: `n-${job.notificacao_id}`, urgent: subscription.tipo === "IMPORTANTE",
    };
    const result = native && firebase ? await sendFcm(firebase, subscription.endpoint, { tag: `vinkulo-notification-${job.notificacao_id}`, url: "/painel", notificationId: job.notificacao_id, bindingId: job.vinculo_id }, options.ttl)
      : configuration ? await sendWebPush(subscription, payload, configuration, options) : new Response(null, { status: 503 });
    status = result.status;
    retryAfter = result.headers.get("Retry-After");
    await result.body?.cancel();
  } catch { /* Timeout/rede: apenas código operacional, sem conteúdo ou credenciais. */ }

  // Resposta 404/410 nunca remove um vínculo substituído durante o envio.
  if (status === 404 || status === 410) {
    await db.prepare(
      `DELETE FROM notificacoes_push_dispositivos WHERE id = ? AND usuario_id = ? AND vinculo_id = ?
       AND EXISTS (SELECT 1 FROM notificacoes_push_fila WHERE id = ? AND estado = 'PROCESSANDO' AND lease_token = ?)`,
    ).bind(job.dispositivo_id, job.usuario_id, job.vinculo_id, job.id, token).run();
    return finish(db, job, token, "CANCELADA", status, "ASSINATURA_EXPIRADA");
  }
  const accepted = status >= 200 && status < 300 ? 1 : 0;
  await db.prepare(
    `UPDATE notificacoes_push_dispositivos SET ultima_tentativa_em = CURRENT_TIMESTAMP, ultimo_status = ?,
       ultimo_aceite_em = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE ultimo_aceite_em END,
       falhas_consecutivas = CASE WHEN ? = 1 THEN 0 ELSE falhas_consecutivas + 1 END
     WHERE id = ? AND usuario_id = ? AND vinculo_id = ?
       AND EXISTS (SELECT 1 FROM notificacoes_push_fila WHERE id = ? AND estado = 'PROCESSANDO' AND lease_token = ?)`,
  ).bind(status, accepted, accepted, job.dispositivo_id, job.usuario_id, job.vinculo_id, job.id, token).run();
  if (accepted) return finish(db, job, token, "ACEITO", status, null);
  const temporary = status === 0 || status === 408 || status === 429 || status >= 500;
  if (!temporary || job.tentativas >= MAX_ATTEMPTS) {
    return finish(db, job, token, "FALHA", status, temporary ? "LIMITE_TENTATIVAS" : "RECUSADO_PELO_PROVEDOR");
  }
  const nextAt = retryAt(job.tentativas, retryAfter, Date.now());
  if (nextAt >= job.expira_em) return finish(db, job, token, "EXPIRADA", status, "ESPERA_EXCEDE_PRAZO");
  await finish(db, job, token, "PENDENTE", status, status === 0 ? "REDE_OU_TIMEOUT" : "REENVIO_AGENDADO", nextAt);
}

export async function getPushQueueStatus(db: D1Database): Promise<PushQueueStatus> {
  const [control, aggregate, pending, recent] = await Promise.all([
    db.prepare("SELECT lease_ate, ultimo_inicio_em, ultimo_fim_em, ultimo_agendamento_em, ultimo_erro FROM notificacoes_push_controle WHERE id = 1").first<Control>(),
    db.prepare("SELECT estado, COUNT(*) AS total FROM notificacoes_push_fila GROUP BY estado").all<{ estado: PushQueueState; total: number }>(),
    db.prepare("SELECT MIN(proxima_tentativa_em) AS next_at, MIN(criado_em) AS oldest FROM notificacoes_push_fila WHERE estado = 'PENDENTE'").first<{ next_at: number | null; oldest: string | null }>(),
    db.prepare("SELECT id, estado, tentativas, ultimo_status, motivo, atualizado_em FROM notificacoes_push_fila ORDER BY atualizado_em DESC, id DESC LIMIT 12")
      .all<{ id: number; estado: PushQueueState; tentativas: number; ultimo_status: number | null; motivo: string | null; atualizado_em: string }>(),
  ]);
  if (!control) throw new Error("Controle da fila indisponível.");
  const counts: PushQueueStatus["counts"] = { PENDENTE: 0, PROCESSANDO: 0, ACEITO: 0, FALHA: 0, EXPIRADA: 0, CANCELADA: 0 };
  for (const row of aggregate.results) counts[row.estado] = Number(row.total);
  const scheduledAt = control.ultimo_agendamento_em ? Date.parse(`${control.ultimo_agendamento_em.replace(" ", "T")}Z`) : 0;
  return {
    configured: isWebPushConfigured() || !!await readFirebaseConfig(db), checkedAt: new Date().toISOString(), counts,
    nextAttemptAt: pending?.next_at != null ? new Date(pending.next_at).toISOString() : null,
    oldestPendingAt: pending?.oldest ?? null, processing: control.lease_ate > Date.now(),
    lastStartedAt: control.ultimo_inicio_em, lastFinishedAt: control.ultimo_fim_em,
    lastScheduledAt: control.ultimo_agendamento_em, lastError: control.ultimo_erro,
    schedulerHealthy: scheduledAt > 0 && Date.now() - scheduledAt < 12 * 60_000,
    recent: recent.results.map(row => ({ id: row.id, state: row.estado, attempts: row.tentativas,
      lastStatus: row.ultimo_status, reason: row.motivo, updatedAt: row.atualizado_em })),
  };
}
