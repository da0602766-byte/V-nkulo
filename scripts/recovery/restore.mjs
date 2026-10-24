import { DatabaseSync } from 'node:sqlite';
import { lstat, readFile, mkdtemp, link, unlink, rmdir, chmod } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DATA_TABLES, EXCLUDED_TABLES, BASELINE_TABLES, INTERNAL_TABLE, RESET_TABLES, recoveredRow } from './policy.mjs';

const MAX_BYTES = 16 * 1024 * 1024;
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const fail = message => { throw new Error(message); };
const known = name => DATA_TABLES.has(name) || EXCLUDED_TABLES.has(name) || BASELINE_TABLES.has(name) || RESET_TABLES.has(name) || INTERNAL_TABLE.test(name);
const isRow = row => row && typeof row === 'object' && !Array.isArray(row);

function validateArchive(archive, db) {
  if (!isRow(archive) || archive.format !== 'vinkulo-reset-v1' || !Number.isSafeInteger(archive.ownerId) || archive.ownerId < 1 || !Array.isArray(archive.tables)) fail('Formato de arquivo de recuperação inválido.');
  if (!Array.isArray(archive.files) || archive.files.length > 10000 || archive.files.some(key => typeof key !== 'string' || key.length > 1024)) fail('Inventário de anexos inválido.');
  const tables = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
  if (tables.some(table => !known(table.name) || /CREATE\s+VIRTUAL\s+TABLE/i.test(table.sql))) fail('O banco contém tabela não revisada para recuperação.');
  const byName = new Map(tables.map(table => [table.name, table]));
  const seen = new Set();
  let count = 0;
  for (const table of archive.tables) {
    if (!isRow(table) || typeof table.name !== 'string' || seen.has(table.name) || !byName.has(table.name) || !Array.isArray(table.rows) || (!DATA_TABLES.has(table.name) && !EXCLUDED_TABLES.has(table.name))) fail('Tabela desconhecida, repetida ou incompatível no arquivo.');
    seen.add(table.name);
    const columns = db.prepare(`PRAGMA table_info(${quote(table.name)})`).all();
    const columnNames = new Set(columns.map(column => column.name));
    for (const row of table.rows) {
      // Full rows only; silent defaulting could manufacture privileges or lose fields.
      if (!isRow(row) || Object.keys(row).length !== columns.length || Object.keys(row).some(key => !columnNames.has(key)) || Object.values(row).some(value => value !== null && typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)))) fail(`Colunas ou valores incompatíveis em ${table.name}.`);
      if ((table.name === 'usuarios' && row.id === archive.ownerId) || (['identidades_cpf', 'sessoes'].includes(table.name) && row.usuario_id === archive.ownerId)) fail('O arquivo não pode substituir a identidade atual do proprietário.');
    }
    count += table.rows.length;
  }
  // The exporter inventories every operational table, including empty ones.
  const expected = tables.filter(table => (DATA_TABLES.has(table.name) || EXCLUDED_TABLES.has(table.name)) && table.name !== 'supabase_storage_copies');
  if (expected.some(table => !seen.has(table.name))) fail('Arquivo incompleto ou de outra versão do banco.');
  const summary = archive.summary;
  if (!isRow(summary) || summary.rows !== count || summary.files !== archive.files.length || !Array.isArray(summary.tables) || summary.tables.length !== seen.size) fail('As contagens do arquivo não conferem.');
  const summaryNames = new Set();
  for (const item of summary.tables) {
    if (!isRow(item) || summaryNames.has(item.name) || !seen.has(item.name) || item.rows !== archive.tables.find(table => table.name === item.name)?.rows.length) fail('Inventário de tabelas inconsistente.');
    summaryNames.add(item.name);
  }
  if (summary.users !== archive.tables.find(table => table.name === 'usuarios')?.rows.length || summary.communities !== archive.tables.find(table => table.name === 'comunidades')?.rows.length) fail('Contagens de pessoas ou comunidades inconsistentes.');
  return tables;
}

export async function restoreArchive({ archivePath, baselinePath, outputPath, ownerEmail }) {
  if (typeof ownerEmail !== 'string' || !ownerEmail.trim()) fail('Informe o e-mail atual do proprietário, conferido na base de origem.');
  const archiveFile = resolve(archivePath);
  const baselineFile = resolve(baselinePath);
  const outputFile = resolve(outputPath);
  if (outputFile === baselineFile || outputFile === archiveFile) fail('A saída deve ser um arquivo novo.');
  for (const file of [archiveFile, baselineFile]) {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('Use arquivos locais regulares como entrada.');
    if (file === archiveFile && stat.size > MAX_BYTES) fail('O arquivo excede o limite de 16 MiB.');
  }
  try { await lstat(outputFile); fail('A saída já existe; nenhum arquivo foi sobrescrito.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const content = await readFile(archiveFile);
  if (content.length > MAX_BYTES) fail('O arquivo excede o limite de 16 MiB.');
  let archive;
  try { archive = JSON.parse(content.toString('utf8')); }
  catch { fail('O arquivo não contém JSON válido.'); }

  // VACUUM INTO creates a consistent snapshot, including committed WAL data.
  // It also works on the project's minimum Node version. The source is read-only.
  const staging = await mkdtemp(join(dirname(outputFile), '.vinkulo-recovery-'));
  const temporaryFile = join(staging, 'recovered.sqlite');
  let source, db;
  try {
    source = new DatabaseSync(baselineFile, { readOnly: true });
    source.prepare('VACUUM main INTO ?').run(temporaryFile);
    source.close(); source = null;
    await chmod(temporaryFile, 0o600);
    db = new DatabaseSync(temporaryFile);
    const tables = validateArchive(archive, db);
    const owner = db.prepare('SELECT * FROM usuarios WHERE id=? AND ativo=1').get(archive.ownerId);
    const identity = db.prepare('SELECT * FROM identidades_cpf WHERE usuario_id=?').get(archive.ownerId);
    if (!owner?.senha_hash || !owner.senha_salt || !identity || owner.email.toLowerCase() !== ownerEmail.trim().toLowerCase()) fail('A base deve conter a conta ativa, o e-mail e o CPF atuais do proprietário da mesma instalação.');
    const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all();
    const report = { format: 'vinkulo-recovery-report-v1', archiveSha256: createHash('sha256').update(content).digest('hex'), ownerPreserved: true, restoredRows: 0, disabledUsers: 0, excludedRows: 0, filesNotRestored: archive.files.length, tables: [], integrity: 'pending' };
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    try {
      // Only the trusted baseline supplies executable SQL; archive.schema is ignored.
      for (const trigger of triggers) db.exec(`DROP TRIGGER ${quote(trigger.name)}`);
      for (const table of tables) {
        if (INTERNAL_TABLE.test(table.name) || BASELINE_TABLES.has(table.name)) continue;
        if (table.name === 'usuarios') db.prepare('DELETE FROM usuarios WHERE id<>?').run(archive.ownerId);
        else if (table.name === 'identidades_cpf') db.prepare('DELETE FROM identidades_cpf WHERE usuario_id<>?').run(archive.ownerId);
        else db.exec(`DELETE FROM ${quote(table.name)}`);
      }
      db.exec('INSERT INTO platform_reset_control(id) VALUES(1)');
      for (const table of archive.tables) {
        const excluded = EXCLUDED_TABLES.has(table.name);
        report.tables.push({ name: table.name, rows: table.rows.length, action: excluded ? 'excluded' : 'restored' });
        if (excluded) { report.excludedRows += table.rows.length; continue; }
        for (const row of table.rows) {
          const recovered = recoveredRow(table.name, row);
          const keys = Object.keys(recovered);
          db.prepare(`INSERT INTO ${quote(table.name)} (${keys.map(quote).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(key => recovered[key]));
          report.restoredRows++;
          if (table.name === 'usuarios') report.disabledUsers++;
        }
      }
      for (const table of archive.tables) {
        const expected = EXCLUDED_TABLES.has(table.name) ? 0 : table.rows.length + (['usuarios', 'identidades_cpf'].includes(table.name) ? 1 : 0);
        if (db.prepare(`SELECT COUNT(*) n FROM ${quote(table.name)}`).get().n !== expected) fail(`Contagem de recuperação divergente em ${table.name}.`);
      }
      if (db.prepare('PRAGMA foreign_key_check').all().length) fail('Há vínculos quebrados; o banco recuperado não foi entregue.');
      const integrity = db.prepare('PRAGMA integrity_check').all();
      if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') fail('A integridade do banco não foi confirmada.');
      if (JSON.stringify(db.prepare('SELECT * FROM usuarios WHERE id=?').get(archive.ownerId)) !== JSON.stringify(owner) || JSON.stringify(db.prepare('SELECT * FROM identidades_cpf WHERE usuario_id=?').get(archive.ownerId)) !== JSON.stringify(identity)) fail('A identidade atual do proprietário não foi preservada.');
      for (const trigger of triggers) db.exec(trigger.sql);
      db.exec('COMMIT; PRAGMA foreign_keys=ON');
      report.integrity = 'ok';
    } catch (error) {
      db.exec('ROLLBACK');
      // Constraint messages can contain data. Do not print rows, SQL or credentials.
      if (error.code?.startsWith('ERR_SQLITE')) fail('A recuperação foi recusada por uma restrição do banco. Nenhum arquivo de saída foi entregue.');
      throw error;
    }
    // Purge deleted baseline rows from free pages as well as logical tables.
    db.exec('VACUUM');
    db.close(); db = null;
    // Hard link publishes atomically and fails if any file already occupies output.
    await link(temporaryFile, outputFile);
    return report;
  } finally {
    db?.close(); source?.close();
    for (const suffix of ['', '-journal', '-wal', '-shm']) await unlink(temporaryFile + suffix).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(staging);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 8 || args[0] !== '--archive' || args[2] !== '--baseline' || args[4] !== '--output' || args[6] !== '--owner-email') fail('Uso: node scripts/recovery/restore.mjs --archive arquivo.json --baseline base-atual.sqlite --output recuperado.sqlite --owner-email email-do-proprietario');
    const report = await restoreArchive({ archivePath: args[1], baselinePath: args[3], outputPath: args[5], ownerEmail: args[7] });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.code ? 'Falha ao acessar ou validar os arquivos locais. Nenhuma origem foi alterada.' : error.message);
    process.exitCode = 1;
  }
}
