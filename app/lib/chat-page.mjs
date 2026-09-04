export const CHAT_PAGE_SIZE = 30;

/** Bounded concurrency, stable identity, explicit failures, no payload for known files. */
/** @param {any[]} files @param {{knownIds?: string[], read: Function, concurrency?: number}} options */
export async function readMessagePage(files, { knownIds = [], read, concurrency = 4 }) {
  const known = new Set(knownIds);
  const candidates = files.filter(file => {
    if (!file.id || known.has(String(file.id)) || file.mimeType === 'application/vnd.google-apps.folder') return false;
    known.add(String(file.id));
    return true;
  });
  const messages = [];
  const failedFileIds = [];
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    while (index < candidates.length) {
      const file = candidates[index++];
      try {
        if (file.mimeType !== 'application/vnd.vinkulo.encrypted+json') throw new Error('Unexpected message format');
        const message = await read(file);
        if (!Number.isSafeInteger(message.id) || typeof message.mensagem !== 'string' || message.mensagem.length > 2000 ||
            typeof message.criado_em !== 'string' || !Number.isFinite(Date.parse(message.criado_em)))
          throw new Error('Invalid message');
        messages.push({ ...message, fileId: String(file.id), driveCreatedTime: String(file.createdTime) });
      } catch { failedFileIds.push(String(file.id)); }
    }
  }));
  messages.sort(compareMessages);
  failedFileIds.sort();
  return { messages, failedFileIds, partial: failedFileIds.length > 0 };
}

export function mergeChatMessages(current, incoming) {
  const items = new Map(current.map((m) => [m.fileId || String(m.id), m]));
  for (const m of incoming) items.set(m.fileId || String(m.id), m);
  return [...items.values()].sort(compareMessages);
}

function timestamp(value) {
  // SQLite legacy timestamps are UTC; retain their ordering beside ISO timestamps.
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
}
function compareMessages(a, b) {
  return timestamp(a.criado_em) - timestamp(b.criado_em) || String(a.fileId || a.id).localeCompare(String(b.fileId || b.id));
}
