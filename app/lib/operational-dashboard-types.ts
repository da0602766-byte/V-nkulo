import type { ConnectorSummary } from "./integration-catalog";
import type { PushQueueState } from "./push-delivery-types";

export type DashboardPeriod = "24h" | "7d";
export type DashboardChannel = "all" | "web" | "android";
export type DeliveryCounts = Record<PushQueueState, number>;
export type OperationalDashboard = {
  checkedAt: string; period: DashboardPeriod; channel: DashboardChannel; since: string;
  counts: DeliveryCounts; total: number; acceptanceRate: number | null;
  meanAcceptanceSeconds: number | null; maxAcceptanceSeconds: number | null; retried: number;
  series: { at: string; accepted: number; failed: number; other: number }[];
  channels: { channel: Exclude<DashboardChannel, "all">; total: number; accepted: number; failed: number }[];
  queue: { pending: number; processing: number; oldestPendingAt: string | null; nextAttemptAt: string | null };
  schedulerHealthy: boolean; lastScheduledAt: string | null; lastFinishedAt: string | null; processing: boolean;
  recent: { id: number; channel: Exclude<DashboardChannel, "all">; state: PushQueueState; attempts: number;
    lastStatus: number | null; reason: string | null; updatedAt: string }[];
  connectors: ConnectorSummary[];
};
