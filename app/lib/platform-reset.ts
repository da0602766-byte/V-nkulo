import { getD1 } from '../../db';
import { getRuntimeEnv } from '../../db/runtime-env';
import { privateHash, secureToken } from './access-security';
import { deleteSupabaseStoredImage } from './supabase-storage-copy';
import { hasTrackedProfileDetails } from './supabase-profile-details-copy-state';
import { getCatalogCopyCounts, totalCatalogCopies } from './supabase-catalog-cleanup';
import { readIntegration } from './supabase-integration';
import { getAutoSyncStatus } from './supabase-auto-sync';

export class ResetError extends Error {}
type Table = { name: string; sql: string };
type Column = { name: string; pk: number };
export type ResetSummary = { users: number; communities: number; rows: number; files: number; archives: number; tables: { name: string; rows: number }[] };
const PRESERVED = new Set(['planos_plataforma', 'planos_rede', 'controlled_auth_rate_limits', 'auth_rate_limits', 'supabase_storage_copies']);
const INTERNAL = /^(sqlite_|_cf_|__drizzle|platform_reset_)|^d1_migrations$/;
const encoder = new TextEncoder();
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const CHUNK_SIZE = 128 * 1024;
const quoted = (value: string) => '"' + value.replaceAll('"', '""') + '"';
const sqlString = (value: string) => "'" + value.replaceAll("'", "''") + "'";
function predicate(table: string, ownerId: number) {
  if (!Number.isSafeInteger(ownerId) || ownerId < 1) throw new ResetError('Proprietário inválido.');
  if (table === 'usuarios') return `id <> ${ownerId}`;
  if (table === 'identidades_cpf' || table === 'sessoes') return `usuario_id <> ${ownerId}`;
  if (table === 'configuracoes') return "chave <> 'supabase_integration'";
  return '1=1';
}

async function tables() {
  const rows = await getD1().prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all<Table>();
  const selected = rows.results.filter(row => !INTERNAL.test(row.name) && !PRESERVED.has(row.name));
  if (!selected.some(row => row.name === 'usuarios') || !selected.some(row => row.name === 'comunidades')) throw new ResetError('Estrutura do banco não reconhecida.');
  if (selected.some(row => /CREATE\s+VIRTUAL\s+TABLE/i.test(row.sql))) throw new ResetError('Há uma tabela especial que exige revisão técnica antes da limpeza.');
  return { list: selected, schemaCount: rows.results.length };
}

// The binding belongs exclusively to this application. Never enumerate a personal Drive.
async function fileKeys() {
  const bucket = getRuntimeEnv().BUCKET;
  const copies = await getD1().prepare('SELECT object_key FROM supabase_storage_copies ORDER BY object_key')
    .all<{ object_key: string }>();
  if (!bucket) {
    if (copies.results.length > 10000) throw new ResetError('Mais de 10 mil arquivos: use uma manutenção técnica para este volume. Nenhum dado foi apagado.');
    return copies.results.map(row => row.object_key);
  }
  if (!bucket.list) throw new ResetError('Não foi possível conferir os arquivos da plataforma. A limpeza foi bloqueada.');
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    keys.push(...page.objects.map(object => object.key));
    if (keys.length > 10000) throw new ResetError('Mais de 10 mil arquivos: use uma manutenção técnica para este volume. Nenhum dado foi apagado.');
    cursor = page.truncated ? page.cursor : undefined;
    if (page.truncated && !cursor) throw new ResetError('Não foi possível concluir a conferência dos arquivos.');
  } while (cursor);
  const all = [...new Set([...keys, ...copies.results.map(row => row.object_key)])].sort();
  if (all.length > 10000) throw new ResetError('Mais de 10 mil arquivos: use uma manutenção técnica para este volume. Nenhum dado foi apagado.');
  return all;
}

async function inspect(ownerId: number) {
  const db = getD1();
  const autoSync = await getAutoSyncStatus(db);
  if (autoSync.enabled || autoSync.running) throw new ResetError('Pause e conclua a sincronização Supabase antes de reinicializar a plataforma.');
  if (await hasTrackedProfileDetails(db)) throw new ResetError('Remova a cópia dos dados cadastrais no Supabase antes de reinicializar a plataforma.');
  if (await readIntegration()) {
    let remoteCount: number;
    try { const counts = await getCatalogCopyCounts(); remoteCount = totalCatalogCopies(counts) + counts.linked_auth; }
    catch { throw new ResetError('Confira as cópias dos catálogos no Supabase antes de reinicializar a plataforma. A migração SQL 0009 precisa estar disponível.'); }
    if (remoteCount) throw new ResetError('Remova as cópias de comunidades, perfis e vínculos no Supabase antes de reinicializar a plataforma.');
  }
  const { list, schemaCount } = await tables();
  const pending = await db.prepare("SELECT COUNT(*) AS n FROM platform_reset_files WHERE disposition='DELETE_PENDING'").first<{ n: number }>();
  if (pending?.n) throw new ResetError('Conclua a exclusão dos arquivos pendentes no histórico antes de iniciar outra reinicialização.');
  const counts = await db.batch<{ n: number }>(list.map(table => db.prepare(`SELECT COUNT(*) AS n FROM ${quoted(table.name)} WHERE ${predicate(table.name, ownerId)}`)));
  const files = await fileKeys();
  const archives = await db.prepare('SELECT COUNT(*) AS n FROM platform_reset_history WHERE archive_iv IS NOT NULL').first<{ n: number }>();
  const tableCounts = list.map((table, index) => ({ name: table.name, rows: Number(counts[index].results?.[0]?.n ?? 0) }));
  const summary: ResetSummary = { users: tableCounts.find(row => row.name === 'usuarios')!.rows, communities: tableCounts.find(row => row.name === 'comunidades')!.rows,
    rows: tableCounts.reduce((sum, row) => sum + row.rows, 0), files: files.length, archives: Number(archives?.n || 0), tables: tableCounts };
  return { list, files, summary, schemaCount };
}

export async function resetOverview() {
  const db = getD1();
  const history = await db.prepare(`SELECT h.id,h.mode,h.created_at,h.summary,h.archive_bytes,(h.archive_iv IS NOT NULL) AS downloadable,
    (SELECT COUNT(*) FROM platform_reset_files f WHERE f.reset_id=h.id AND f.disposition='DELETE_PENDING') AS pending_files
    FROM platform_reset_history h ORDER BY h.created_at DESC,h.id DESC LIMIT 20`).all();
  return { history: history.results };
}

export async function prepareReset(ownerId: number) {
  const { summary } = await inspect(ownerId);
  const token = secureToken();
  await getD1().prepare('UPDATE platform_reset_control SET challenge_hash=?,owner_id=?,expires_at=?,summary=? WHERE id=1')
    .bind(await privateHash('reset', token), ownerId, Date.now() + 5 * 60_000, JSON.stringify(summary)).run();
  return { token, summary, expiresAt: Date.now() + 5 * 60_000 };
}

async function encryptionKey() {
  const secret = getRuntimeEnv().AUTH_SECRET;
  if (!secret) throw new ResetError('Chave de proteção indisponível.');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode('vinkulo:platform-reset:v1:' + secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function base64(bytes: Uint8Array) {
  let output = '';
  for (let i = 0; i < bytes.length; i += 8192) output += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(output);
}
const unbase64 = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));

export async function executeReset(ownerId: number, token: string, mode: 'ARCHIVE' | 'DELETE') {
  const db = getD1();
  const tokenHash = await privateHash('reset', token);
  const challenge = await db.prepare('SELECT summary FROM platform_reset_control WHERE id=1 AND owner_id=? AND challenge_hash=? AND expires_at>?')
    .bind(ownerId, tokenHash, Date.now()).first<{ summary: string }>();
  if (!challenge) throw new ResetError('A conferência expirou ou já foi utilizada. Confira novamente.');
  const { list, summary, files, schemaCount } = await inspect(ownerId);
  // Counts are shown to the owner before confirmation; recheck them in the transaction too.
  if (challenge.summary !== JSON.stringify(summary)) throw new ResetError('Os dados mudaram desde a conferência. Confira novamente antes de continuar.');
  const resetId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db.prepare('PRAGMA defer_foreign_keys=ON'),
    db.prepare(`INSERT INTO platform_reset_guard(ok) SELECT COUNT(*) FROM platform_reset_control WHERE id=1 AND owner_id=? AND challenge_hash=? AND expires_at>?`)
      .bind(ownerId, tokenHash, Date.now()),
    db.prepare("INSERT INTO platform_reset_guard(ok) SELECT COUNT(*)=? FROM sqlite_master WHERE type='table'").bind(schemaCount),
  ];
  for (const table of summary.tables) statements.push(db.prepare(`INSERT INTO platform_reset_guard(ok) SELECT COUNT(*)=? FROM ${quoted(table.name)} WHERE ${predicate(table.name, ownerId)}`).bind(table.rows));

  let iv: string | null = null;
  let ciphertext = '';
  let archiveBytes = 0;
  if (mode === 'ARCHIVE') {
    const columns = await db.batch(list.map(table => db.prepare(`PRAGMA table_info(${quoted(table.name)})`)));
    const queries = list.map((table, index) => {
      const fields = columns[index].results as unknown as Column[];
      const order = fields.filter(field => field.pk).sort((a, b) => a.pk - b.pk).map(field => quoted(field.name)).join(',') || 'rowid';
      return `SELECT json_group_array(json_object(${fields.map(field => `${sqlString(field.name)},${quoted(field.name)}`).join(',')})) AS payload FROM (SELECT * FROM ${quoted(table.name)} WHERE ${predicate(table.name, ownerId)} ORDER BY ${order})`;
    });
    // Read all table payloads from a single consistent D1 batch, then verify byte equality
    // inside the destructive batch. A concurrent edit aborts the whole reset.
    const result = await db.batch<{ payload: string }>(queries.map(query => db.prepare(query)));
    const snapshot = { format: 'vinkulo-reset-v1', ownerId, createdAt: new Date().toISOString(), summary,
      tables: list.map((table, index) => ({ name: table.name, schema: table.sql, rows: JSON.parse(String(result[index].results?.[0]?.payload)) })),
      files, recovery: 'Recuperação técnica manual. Não reative sessões, links temporários ou integrações automaticamente.' };
    const cleartext = encoder.encode(JSON.stringify(snapshot));
    if (cleartext.byteLength > MAX_ARCHIVE_BYTES) throw new ResetError('O arquivo excede 16 MB. É necessário um backup técnico para arquivar este volume. Nenhum dado foi apagado.');
    archiveBytes = cleartext.byteLength;
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    ciphertext = base64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(resetId) }, await encryptionKey(), cleartext)));
    iv = base64(nonce);
    queries.forEach((query, index) => statements.push(db.prepare(`INSERT INTO platform_reset_guard(ok) SELECT ((${query}) IS ?)`).bind(result[index].results?.[0]?.payload ?? null)));
  }

  // Child-first deletion avoids RESTRICT actions and cascades into tables still needed
  // by another child. Deferred constraints handle cycles until all rows are removed.
  const dependencies = await db.batch<{ table: string }>(list.map(table => db.prepare(`PRAGMA foreign_key_list(${quoted(table.name)})`)));
  const parents = new Map(list.map((table, index) => [table.name, new Set((dependencies[index].results || []).map(row => row.table))]));
  const ordered: Table[] = [];
  const pending = [...list];
  while (pending.length) {
    const index = pending.findIndex(table => !pending.some(child => child.name !== table.name && parents.get(child.name)?.has(table.name)));
    ordered.push(pending.splice(index < 0 ? 0 : index, 1)[0]);
  }
  statements.push(db.prepare('INSERT INTO platform_reset_history(id,mode,owner_id,summary,archive_iv,archive_bytes) VALUES(?,?,?,?,?,?)')
    .bind(resetId, mode, ownerId, JSON.stringify(summary), iv, archiveBytes));
  if (mode === 'DELETE') {
    statements.push(db.prepare('DELETE FROM platform_reset_chunks'));
    statements.push(db.prepare('UPDATE platform_reset_history SET archive_iv=NULL,archive_bytes=0'));
    statements.push(db.prepare("UPDATE platform_reset_files SET disposition='DELETE_PENDING',reset_id=? WHERE disposition<>'DELETED'").bind(resetId));
  }
  for (let offset = 0; offset < ciphertext.length; offset += CHUNK_SIZE) statements.push(db.prepare('INSERT INTO platform_reset_chunks(reset_id,part,ciphertext) VALUES(?,?,?)').bind(resetId, offset / CHUNK_SIZE, ciphertext.slice(offset, offset + CHUNK_SIZE)));
  for (const key of files) statements.push(db.prepare('INSERT INTO platform_reset_files(object_key,reset_id,disposition) VALUES(?,?,?) ON CONFLICT(object_key) DO UPDATE SET reset_id=excluded.reset_id,disposition=excluded.disposition')
    .bind(key, resetId, mode === 'ARCHIVE' ? 'ARCHIVED' : 'DELETE_PENDING'));
  // Remove community-specific profile fields without changing the protected login identity.
  statements.push(db.prepare(`UPDATE usuarios SET foto_perfil=NULL,telefone=NULL,cadastro_dados='{}',data_nascimento=NULL,endereco=NULL,celula=NULL,ministerio=NULL,observacoes=NULL,nome_pais=NULL,diaconia_equipe_id=NULL WHERE id=?`).bind(ownerId));
  ordered.forEach(table => statements.push(db.prepare(`DELETE FROM ${quoted(table.name)} WHERE ${predicate(table.name, ownerId)}`)));
  if (mode === 'DELETE') statements.push(db.prepare("UPDATE configuracoes SET atualizado_por='reset-pending' WHERE chave='supabase_integration' AND EXISTS(SELECT 1 FROM supabase_storage_copies)"));
  statements.push(db.prepare("DELETE FROM configuracoes WHERE chave='supabase_integration' AND NOT EXISTS(SELECT 1 FROM supabase_storage_copies)"));
  // Assert that every scoped row disappeared, including anything inserted by a trigger.
  summary.tables.forEach(table => statements.push(db.prepare(`INSERT INTO platform_reset_guard(ok) SELECT COUNT(*)=0 FROM ${quoted(table.name)} WHERE ${predicate(table.name, ownerId)}`)));
  statements.push(db.prepare('UPDATE platform_reset_control SET challenge_hash=NULL,expires_at=0,summary=NULL,generation=generation+1 WHERE id=1'));
  statements.push(db.prepare('DELETE FROM platform_reset_guard'));
  try { await db.batch(statements); }
  catch { throw new ResetError('A limpeza foi cancelada e o banco foi preservado. Os dados podem ter mudado ou possuir uma dependência. Atualize a conferência e tente novamente.'); }
  if (mode === 'DELETE') await cleanupResetFiles();
  return { ok: true, resetId, mode, summary, ...await resetOverview() };
}

export async function cleanupResetFiles() {
  const db = getD1();
  const rows = await db.prepare("SELECT object_key FROM platform_reset_files WHERE disposition='DELETE_PENDING' LIMIT 100").all<{ object_key: string }>();
  const bucket = getRuntimeEnv().BUCKET;
  if (!bucket) return;
  // A failed object deletion remains visible and retryable; never label it complete.
  for (const row of rows.results) {
    try {
      await deleteSupabaseStoredImage(row.object_key);
      await bucket.delete(row.object_key);
      await db.prepare("UPDATE platform_reset_files SET disposition='DELETED' WHERE object_key=? AND disposition='DELETE_PENDING'").bind(row.object_key).run();
    } catch { /* Preserve the durable pending item. */ }
  }
  await db.prepare("DELETE FROM configuracoes WHERE chave='supabase_integration' AND atualizado_por='reset-pending' AND NOT EXISTS(SELECT 1 FROM supabase_storage_copies)").run();
}

export async function downloadResetArchive(id: string) {
  const db = getD1();
  const record = await db.prepare('SELECT archive_iv FROM platform_reset_history WHERE id=? AND archive_iv IS NOT NULL').bind(id).first<{ archive_iv: string }>();
  if (!record) throw new ResetError('Arquivo não encontrado ou já excluído definitivamente.');
  const chunks = await db.prepare('SELECT ciphertext FROM platform_reset_chunks WHERE reset_id=? ORDER BY part').bind(id).all<{ ciphertext: string }>();
  const encrypted = unbase64(chunks.results.map(chunk => chunk.ciphertext).join(''));
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(record.archive_iv), additionalData: encoder.encode(id) }, await encryptionKey(), encrypted);
}
