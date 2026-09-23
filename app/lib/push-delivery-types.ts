export type PushQueueState = "PENDENTE" | "PROCESSANDO" | "ACEITO" | "FALHA" | "EXPIRADA" | "CANCELADA";

export type PushQueueStatus = {
  configured: boolean;
  checkedAt: string;
  counts: Record<PushQueueState, number>;
  nextAttemptAt: string | null;
  oldestPendingAt: string | null;
  processing: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastScheduledAt: string | null;
  lastError: string | null;
  schedulerHealthy: boolean;
  recent: { id: number; state: PushQueueState; attempts: number; lastStatus: number | null; reason: string | null; updatedAt: string }[];
};
