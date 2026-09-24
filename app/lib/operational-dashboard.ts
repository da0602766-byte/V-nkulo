import { getIntegrationCatalog } from "./integration-catalog";
import type { DashboardChannel, DashboardPeriod, DeliveryCounts, OperationalDashboard } from "./operational-dashboard-types";
import type { PushQueueState } from "./push-delivery-types";

const cache = new WeakMap<D1Database, Map<string, { until: number; value: OperationalDashboard }>>();
const emptyCounts = (): DeliveryCounts => ({ PENDENTE: 0, PROCESSANDO: 0, ACEITO: 0, FALHA: 0, EXPIRADA: 0, CANCELADA: 0 });
const channelSql = "CASE WHEN p.endpoint LIKE 'fcm:%' THEN 'android' ELSE 'web' END";
const utcSql = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
type Aggregate = { bucket: number; channel: "web" | "android"; estado: PushQueueState; total: number;
  latency_sum: number; latency_count: number; latency_max: number | null; retried: number };

export async function getOperationalDashboard(db: D1Database, period: DashboardPeriod, channel: DashboardChannel): Promise<OperationalDashboard> {
  // Only completed, credential-free snapshots are cached. Never share in-flight
  // Worker I/O promises across requests; authorization is checked by the route.
  const key = `${period}:${channel}`, now = Date.now();
  const bucketCache = cache.get(db), cached = bucketCache?.get(key);
  if (cached && cached.until > now) return cached.value;
  const step = period === "24h" ? 3600 : 86400;
  const since = now - (period === "24h" ? 24 : 168) * 3600_000;
  const filter = channel === "all" ? "" : ` AND ${channelSql} = ?`;
  const args = channel === "all" ? [] : [channel];
  const [grouped, pending, control, recent, catalog] = await Promise.all([
    db.prepare(`SELECT CAST((unixepoch(q.atualizado_em)-10800)/? AS INTEGER)*?+10800 AS bucket,
      ${channelSql} AS channel,q.estado,COUNT(*) AS total,
      SUM(CASE WHEN q.estado='ACEITO' AND unixepoch(q.atualizado_em)>=unixepoch(q.criado_em)
        THEN unixepoch(q.atualizado_em)-unixepoch(q.criado_em) ELSE 0 END) AS latency_sum,
      SUM(CASE WHEN q.estado='ACEITO' AND unixepoch(q.atualizado_em)>=unixepoch(q.criado_em) THEN 1 ELSE 0 END) AS latency_count,
      MAX(CASE WHEN q.estado='ACEITO' AND unixepoch(q.atualizado_em)>=unixepoch(q.criado_em)
        THEN unixepoch(q.atualizado_em)-unixepoch(q.criado_em) END) AS latency_max,
      SUM(CASE WHEN q.tentativas>1 THEN 1 ELSE 0 END) AS retried
      FROM notificacoes_push_fila q JOIN notificacoes_push_dispositivos p ON p.id=q.dispositivo_id
      WHERE q.atualizado_em>=? AND q.atualizado_em<=?${filter} GROUP BY bucket,channel,q.estado`)
      .bind(step, step, utcSql(since), utcSql(now), ...args).all<Aggregate>(),
    db.prepare(`SELECT SUM(CASE WHEN q.estado='PENDENTE' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN q.estado='PROCESSANDO' THEN 1 ELSE 0 END) AS processing,
      MIN(CASE WHEN q.estado='PENDENTE' THEN q.criado_em END) AS oldest,
      MIN(CASE WHEN q.estado='PENDENTE' THEN q.proxima_tentativa_em END) AS next_at
      FROM notificacoes_push_fila q JOIN notificacoes_push_dispositivos p ON p.id=q.dispositivo_id
      WHERE q.estado IN ('PENDENTE','PROCESSANDO')${filter}`).bind(...args)
      .first<{ pending: number | null; processing: number | null; oldest: string | null; next_at: number | null }>(),
    db.prepare("SELECT lease_ate,ultimo_agendamento_em,ultimo_fim_em FROM notificacoes_push_controle WHERE id=1")
      .first<{ lease_ate: number; ultimo_agendamento_em: string | null; ultimo_fim_em: string | null }>(),
    db.prepare(`SELECT q.id,${channelSql} AS channel,q.estado,q.tentativas,q.ultimo_status,q.motivo,q.atualizado_em
      FROM notificacoes_push_fila q JOIN notificacoes_push_dispositivos p ON p.id=q.dispositivo_id
      WHERE q.atualizado_em>=? AND q.atualizado_em<=?${filter} ORDER BY q.atualizado_em DESC,q.id DESC LIMIT 12`)
      .bind(utcSql(since), utcSql(now), ...args).all<{ id: number; channel: "web" | "android"; estado: PushQueueState;
        tentativas: number; ultimo_status: number | null; motivo: string | null; atualizado_em: string }>(),
    getIntegrationCatalog(),
  ]);
  if (!control) throw new Error("Controle da fila indisponível.");
  const counts = emptyCounts(), buckets = new Map<number, OperationalDashboard["series"][number]>();
  const floor = (ms: number) => Math.floor((ms / 1000 - 10800) / step) * step + 10800;
  for (let at = floor(since); at <= floor(now); at += step) buckets.set(at, { at: new Date(at * 1000).toISOString(), accepted: 0, failed: 0, other: 0 });
  const channels: OperationalDashboard["channels"] = ["web", "android"].filter(c => channel === "all" || channel === c)
    .map(c => ({ channel: c as "web" | "android", total: 0, accepted: 0, failed: 0 }));
  let latency = 0, measured = 0, maximum: number | null = null, retried = 0;
  for (const row of grouped.results) {
    counts[row.estado] += Number(row.total);
    const item = buckets.get(Number(row.bucket)), transport = channels.find(c => c.channel === row.channel);
    if (item) { if (row.estado === "ACEITO") item.accepted += row.total; else if (row.estado === "FALHA") item.failed += row.total; else item.other += row.total; }
    if (transport) { transport.total += row.total; if (row.estado === "ACEITO") transport.accepted += row.total; if (row.estado === "FALHA") transport.failed += row.total; }
    latency += Number(row.latency_sum); measured += Number(row.latency_count); retried += Number(row.retried);
    if (row.latency_max !== null) maximum = Math.max(maximum ?? 0, row.latency_max);
  }
  const completed = counts.ACEITO + counts.FALHA + counts.EXPIRADA;
  const scheduled = control.ultimo_agendamento_em ? Date.parse(control.ultimo_agendamento_em.replace(" ", "T") + "Z") : 0;
  const value: OperationalDashboard = {
    checkedAt: new Date(now).toISOString(), period, channel, since: new Date(since).toISOString(), counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0), acceptanceRate: completed ? counts.ACEITO / completed * 100 : null,
    meanAcceptanceSeconds: measured ? latency / measured : null, maxAcceptanceSeconds: maximum, retried,
    series: [...buckets.values()], channels,
    queue: { pending: pending?.pending ?? 0, processing: pending?.processing ?? 0, oldestPendingAt: pending?.oldest ?? null,
      nextAttemptAt: pending?.next_at != null ? new Date(pending.next_at).toISOString() : null },
    schedulerHealthy: scheduled > 0 && now >= scheduled && now - scheduled < 12 * 60_000,
    lastScheduledAt: control.ultimo_agendamento_em, lastFinishedAt: control.ultimo_fim_em, processing: control.lease_ate > now,
    recent: recent.results.map(r => ({ id: r.id, channel: r.channel, state: r.estado, attempts: r.tentativas,
      lastStatus: r.ultimo_status, reason: r.motivo, updatedAt: r.atualizado_em })),
    connectors: catalog.connectors.filter(c => c.available),
  };
  const entries = bucketCache ?? new Map();
  entries.set(key, { until: Date.now() + 15_000, value }); cache.set(db, entries);
  return value;
}
