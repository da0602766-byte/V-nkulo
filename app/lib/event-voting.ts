type StatementLike = {
  bind: (...values: unknown[]) => StatementLike;
  run: () => Promise<unknown>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
};
type D1Like = { prepare: (query: string) => StatementLike };

/** Creates the small, tenant-scoped voting tables lazily for older databases. */
export async function ensureEventVotingTables(db: D1Like) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS eventos_enquetes (
      evento_id INTEGER PRIMARY KEY,
      comunidade_id INTEGER NOT NULL,
      pergunta TEXT NOT NULL,
      opcoes_json TEXT NOT NULL,
      criado_por INTEGER,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS eventos_enquetes_votos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evento_id INTEGER NOT NULL,
      comunidade_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      opcao INTEGER NOT NULL,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(evento_id, usuario_id)
    )
  `).run();
}

export function parsePollOptions(value: unknown) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  const options = [...new Set(raw.map((item) => String(item || "").trim().slice(0, 80)).filter(Boolean))].slice(0, 6);
  return options.length >= 2 ? options : [];
}

export function parsePoll(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as { pergunta?: unknown; opcoes?: unknown };
  const pergunta = String(source.pergunta || "").trim().slice(0, 180);
  const opcoes = parsePollOptions(source.opcoes);
  return pergunta && opcoes.length >= 2 ? { pergunta, opcoes } : null;
}

export function parsePollJson(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return parsePollOptions(parsed);
  } catch {
    return [];
  }
}
