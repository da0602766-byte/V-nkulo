const OPTIMIZER_CONFIG_KEY = "platform_optimizer_config";
const OPTIMIZER_LOCK_MINUTES = 5;

export const PLATFORM_OPTIMIZER_INTERVALS = [24, 168, 720] as const;
export type PlatformOptimizerInterval = (typeof PLATFORM_OPTIMIZER_INTERVALS)[number];
export type PlatformOptimizerTrigger = "MANUAL" | "AUTOMATICO";

export type PlatformOptimizationCounts = {
  expiredSessions: number;
  expiredPasswordResets: number;
  resolvedJoinRequests: number;
  oldAuditRecords: number;
  expiredInvites: number;
  expiredTemporaryAccesses: number;
};

export type PlatformOptimizationResult = {
  finishedAt: string;
  durationMs: number;
  trigger: PlatformOptimizerTrigger;
  counts: PlatformOptimizationCounts;
};

export type PlatformOptimizerConfig = {
  enabled: boolean;
  intervalHours: PlatformOptimizerInterval;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lockUntil: string | null;
  lastResult: PlatformOptimizationResult | null;
  lastErrorAt: string | null;
};

type ConfigRow = { valor: string };
type CountRow = Record<keyof PlatformOptimizationCounts, number>;

export class PlatformOptimizerBusyError extends Error {
  constructor() {
    super("A manutenção já está sendo executada. Aguarde alguns instantes e atualize o painel.");
    this.name = "PlatformOptimizerBusyError";
  }
}

function isoAfter(hours: number, from = Date.now()) {
  return new Date(from + hours * 60 * 60 * 1000).toISOString();
}

function defaultConfig(): PlatformOptimizerConfig {
  return {
    enabled: true,
    intervalHours: 168,
    lastRunAt: null,
    nextRunAt: new Date().toISOString(),
    lockUntil: null,
    lastResult: null,
    lastErrorAt: null,
  };
}

function validInterval(value: unknown): value is PlatformOptimizerInterval {
  return PLATFORM_OPTIMIZER_INTERVALS.includes(Number(value) as PlatformOptimizerInterval);
}

function safeCount(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeCounts(value: unknown): PlatformOptimizationCounts {
  const source = value && typeof value === "object"
    ? value as Partial<PlatformOptimizationCounts>
    : {};
  return {
    expiredSessions: safeCount(source.expiredSessions),
    expiredPasswordResets: safeCount(source.expiredPasswordResets),
    resolvedJoinRequests: safeCount(source.resolvedJoinRequests),
    oldAuditRecords: safeCount(source.oldAuditRecords),
    expiredInvites: safeCount(source.expiredInvites),
    expiredTemporaryAccesses: safeCount(source.expiredTemporaryAccesses),
  };
}

function normalizeConfig(value: unknown): PlatformOptimizerConfig {
  const fallback = defaultConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Partial<PlatformOptimizerConfig>;
  const lastResult = source.lastResult && typeof source.lastResult === "object"
    ? {
        finishedAt: String(source.lastResult.finishedAt || ""),
        durationMs: safeCount(source.lastResult.durationMs),
        trigger: source.lastResult.trigger === "MANUAL" ? "MANUAL" as const : "AUTOMATICO" as const,
        counts: normalizeCounts(source.lastResult.counts),
      }
    : null;
  return {
    enabled: source.enabled !== false,
    intervalHours: validInterval(source.intervalHours) ? source.intervalHours : fallback.intervalHours,
    lastRunAt: source.lastRunAt ? String(source.lastRunAt) : null,
    nextRunAt: source.nextRunAt ? String(source.nextRunAt) : fallback.nextRunAt,
    lockUntil: source.lockUntil ? String(source.lockUntil) : null,
    lastResult,
    lastErrorAt: source.lastErrorAt ? String(source.lastErrorAt) : null,
  };
}

function parseConfig(raw: string) {
  try {
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return defaultConfig();
  }
}

function serializeConfig(config: PlatformOptimizerConfig) {
  return JSON.stringify(config);
}

function affectedRows(result: unknown) {
  const metadata = result && typeof result === "object"
    ? (result as { meta?: { changes?: number } }).meta
    : undefined;
  return safeCount(metadata?.changes);
}

async function loadConfig(db: D1Database) {
  const initial = defaultConfig();
  await db
    .prepare(
      `INSERT OR IGNORE INTO configuracoes
       (chave, valor, atualizado_por, atualizado_em)
       VALUES (?, ?, 'sistema', CURRENT_TIMESTAMP)`,
    )
    .bind(OPTIMIZER_CONFIG_KEY, serializeConfig(initial))
    .run();
  const row = await db
    .prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
    .bind(OPTIMIZER_CONFIG_KEY)
    .first<ConfigRow>();
  const raw = String(row?.valor || serializeConfig(initial));
  return { raw, config: parseConfig(raw) };
}

export async function getPlatformOptimizerStatus(db: D1Database) {
  const [{ config }, candidates] = await Promise.all([
    loadConfig(db),
    db.prepare(
      `SELECT
        (SELECT COUNT(*) FROM sessoes
          WHERE datetime(expira_em) <= CURRENT_TIMESTAMP) AS expiredSessions,
        (SELECT COUNT(*) FROM redefinicoes_senha
          WHERE usado = 1 OR (expira_em IS NOT NULL AND datetime(expira_em) <= CURRENT_TIMESTAMP)) AS expiredPasswordResets,
        (SELECT COUNT(*) FROM solicitacoes_entrada_comunidade
          WHERE status IN ('APROVADA', 'RECUSADA')
            AND analisado_em IS NOT NULL
            AND datetime(analisado_em) <= datetime('now', '-7 days')) AS resolvedJoinRequests,
        (SELECT COUNT(*) FROM auditoria_piloto
          WHERE datetime(criado_em) < datetime('now', '-14 days')) AS oldAuditRecords,
        (SELECT COUNT(*) FROM convites_comunidade
          WHERE status = 'PENDENTE' AND datetime(expira_em) <= CURRENT_TIMESTAMP) AS expiredInvites,
        (SELECT COUNT(*) FROM acessos_temporarios
          WHERE status IN ('PENDENTE', 'AGUARDANDO_HORARIO', 'ATIVO')
            AND datetime(termina_em) <= CURRENT_TIMESTAMP) AS expiredTemporaryAccesses`,
    ).first<CountRow>(),
  ]);
  return {
    config,
    candidates: normalizeCounts(candidates),
    retention: { auditDays: 14, resolvedJoinRequestDays: 7 },
  };
}

export async function configurePlatformOptimizer(
  db: D1Database,
  input: { enabled: boolean; intervalHours: number },
  actorId: number,
) {
  if (!validInterval(input.intervalHours)) {
    throw new Error("Frequência de manutenção inválida.");
  }
  const { raw, config } = await loadConfig(db);
  if (config.lockUntil && Date.parse(config.lockUntil) > Date.now()) {
    throw new PlatformOptimizerBusyError();
  }
  const next: PlatformOptimizerConfig = {
    ...config,
    enabled: Boolean(input.enabled),
    intervalHours: input.intervalHours,
    nextRunAt: input.enabled ? isoAfter(input.intervalHours) : null,
    lockUntil: null,
  };
  const result = await db
    .prepare(
      `UPDATE configuracoes
       SET valor = ?, atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE chave = ? AND valor = ?`,
    )
    .bind(serializeConfig(next), String(actorId), OPTIMIZER_CONFIG_KEY, raw)
    .run();
  if (affectedRows(result) !== 1) throw new PlatformOptimizerBusyError();
  await db.prepare(
    `INSERT INTO auditoria_piloto
      (comunidade_id, usuario_id, evento, resultado, metadados)
     VALUES (NULL, ?, 'OTIMIZADOR_PLATAFORMA_CONFIGURADO', 'SUCESSO', ?)`,
  ).bind(actorId, JSON.stringify({ enabled: next.enabled, intervalHours: next.intervalHours })).run();
  return getPlatformOptimizerStatus(db);
}

export async function runPlatformOptimization(
  db: D1Database,
  options: { trigger: PlatformOptimizerTrigger; actorId?: number; force?: boolean },
) {
  const startedAt = Date.now();
  const { raw, config } = await loadConfig(db);
  if (!options.force) {
    if (!config.enabled) return { executed: false as const, reason: "DESATIVADO" as const };
    if (config.nextRunAt && Date.parse(config.nextRunAt) > startedAt) {
      return { executed: false as const, reason: "AINDA_NAO_PROGRAMADO" as const };
    }
  }
  if (config.lockUntil && Date.parse(config.lockUntil) > startedAt) {
    return { executed: false as const, reason: "EM_EXECUCAO" as const };
  }

  const locked: PlatformOptimizerConfig = {
    ...config,
    lockUntil: new Date(startedAt + OPTIMIZER_LOCK_MINUTES * 60 * 1000).toISOString(),
  };
  const lockResult = await db.prepare(
    `UPDATE configuracoes
     SET valor = ?, atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
     WHERE chave = ? AND valor = ?`,
  ).bind(
    serializeConfig(locked),
    options.actorId ? String(options.actorId) : "sistema",
    OPTIMIZER_CONFIG_KEY,
    raw,
  ).run();
  if (affectedRows(lockResult) !== 1) {
    return { executed: false as const, reason: "EM_EXECUCAO" as const };
  }

  try {
    const results = await db.batch([
      db.prepare(
        "DELETE FROM sessoes WHERE datetime(expira_em) <= CURRENT_TIMESTAMP",
      ),
      db.prepare(
        `DELETE FROM redefinicoes_senha
         WHERE usado = 1 OR (expira_em IS NOT NULL AND datetime(expira_em) <= CURRENT_TIMESTAMP)`,
      ),
      db.prepare(
        `DELETE FROM solicitacoes_entrada_comunidade
         WHERE status IN ('APROVADA', 'RECUSADA')
           AND analisado_em IS NOT NULL
           AND datetime(analisado_em) <= datetime('now', '-7 days')`,
      ),
      db.prepare(
        "DELETE FROM auditoria_piloto WHERE datetime(criado_em) < datetime('now', '-14 days')",
      ),
      db.prepare(
        `UPDATE convites_comunidade
         SET status = 'EXPIRADO'
         WHERE status = 'PENDENTE' AND datetime(expira_em) <= CURRENT_TIMESTAMP`,
      ),
      db.prepare(
        `UPDATE acessos_temporarios
         SET status = 'EXPIRADO',
             expirado_em = COALESCE(expirado_em, CURRENT_TIMESTAMP),
             atualizado_em = CURRENT_TIMESTAMP
         WHERE status IN ('PENDENTE', 'AGUARDANDO_HORARIO', 'ATIVO')
           AND datetime(termina_em) <= CURRENT_TIMESTAMP`,
      ),
    ]);
    const counts: PlatformOptimizationCounts = {
      expiredSessions: affectedRows(results[0]),
      expiredPasswordResets: affectedRows(results[1]),
      resolvedJoinRequests: affectedRows(results[2]),
      oldAuditRecords: affectedRows(results[3]),
      expiredInvites: affectedRows(results[4]),
      expiredTemporaryAccesses: affectedRows(results[5]),
    };
    const finishedAt = new Date().toISOString();
    const lastResult: PlatformOptimizationResult = {
      finishedAt,
      durationMs: Math.max(0, Date.now() - startedAt),
      trigger: options.trigger,
      counts,
    };
    const completed: PlatformOptimizerConfig = {
      ...locked,
      lastRunAt: finishedAt,
      nextRunAt: locked.enabled ? isoAfter(locked.intervalHours) : null,
      lockUntil: null,
      lastResult,
      lastErrorAt: null,
    };
    await db.batch([
      db.prepare(
        `UPDATE configuracoes
         SET valor = ?, atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE chave = ?`,
      ).bind(
        serializeConfig(completed),
        options.actorId ? String(options.actorId) : "sistema",
        OPTIMIZER_CONFIG_KEY,
      ),
      db.prepare(
        `INSERT INTO auditoria_piloto
          (comunidade_id, usuario_id, evento, resultado, metadados)
         VALUES (NULL, ?, 'OTIMIZADOR_PLATAFORMA_EXECUTADO', 'SUCESSO', ?)`,
      ).bind(options.actorId || null, JSON.stringify({ ...lastResult, counts })),
    ]);
    return { executed: true as const, result: lastResult };
  } catch (error) {
    const failed: PlatformOptimizerConfig = {
      ...locked,
      lockUntil: null,
      lastErrorAt: new Date().toISOString(),
      nextRunAt: locked.enabled ? isoAfter(1) : null,
    };
    await db.batch([
      db.prepare(
        `UPDATE configuracoes
         SET valor = ?, atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE chave = ?`,
      ).bind(serializeConfig(failed), options.actorId ? String(options.actorId) : "sistema", OPTIMIZER_CONFIG_KEY),
      db.prepare(
        `INSERT INTO auditoria_piloto
          (comunidade_id, usuario_id, evento, resultado, metadados)
         VALUES (NULL, ?, 'OTIMIZADOR_PLATAFORMA_EXECUTADO', 'ERRO', ?)`,
      ).bind(options.actorId || null, JSON.stringify({ trigger: options.trigger })),
    ]);
    throw error;
  }
}

export function runPlatformOptimizationIfDue(db: D1Database) {
  return runPlatformOptimization(db, { trigger: "AUTOMATICO" });
}
