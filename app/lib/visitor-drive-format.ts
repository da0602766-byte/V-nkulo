// Portable data only. Never execute schema or SQL supplied by a backup file.
export const VISITOR_TABLES = ['visitantes', 'acompanhamentos', 'visitor_contacts', 'visitor_visits', 'visitante_categorias', 'visitante_campos'] as const;
export type VisitorTable = typeof VISITOR_TABLES[number];
export type VisitorRow = Record<string, string | number | null>;
export type VisitorArchive = {
  format: 'vinkulo-visitors'; version: 1; communityId: number;
  tables: Record<VisitorTable, VisitorRow[]>;
  sequences: Record<string, number>;
  privateNotes: string;
};
export const MAX_VISITOR_ARCHIVE_BYTES = 4 * 1024 * 1024;
export async function archiveHash(text: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
}
export function validateVisitorArchive(value: unknown, communityId: number): asserts value is VisitorArchive {
  const a = value as VisitorArchive;
  if (!a || a.format !== 'vinkulo-visitors' || a.version !== 1 || a.communityId !== communityId || !a.tables || !a.sequences || typeof a.privateNotes !== 'string') throw new Error('Backup incompatível ou pertencente a outra comunidade.');
  if (Object.keys(a.tables).length !== VISITOR_TABLES.length) throw new Error('O backup contém tabelas incompatíveis.');
  for (const table of VISITOR_TABLES) {
    const rows = a.tables[table];
    if (!Array.isArray(rows) || rows.length > 100000) throw new Error('Backup incompleto ou acima do limite.');
    const ids = new Set<number>();
    for (const row of rows) {
      if (!row || !Number.isSafeInteger(row.id) || Number(row.id) <= 0 || ids.has(Number(row.id)) || row.comunidade_id !== communityId || Object.values(row).some(v => v !== null && typeof v !== 'string' && (typeof v !== 'number' || !Number.isFinite(v)))) throw new Error('O backup possui registros inválidos ou duplicados.');
      ids.add(Number(row.id));
    }
    if (!Number.isSafeInteger(a.sequences[table]) || a.sequences[table] < rows.reduce((max,r)=>Math.max(max,Number(r.id)),0)) throw new Error('A sequência do backup está inválida.');
  }
  const people = new Set(a.tables.visitantes.map(r => r.id));
  for (const table of ['acompanhamentos', 'visitor_contacts', 'visitor_visits'] as const) {
    if (a.tables[table].some(r => !people.has(r.visitante_id))) throw new Error('O backup possui histórico sem ficha correspondente.');
  }
}
export function archiveCounts(a: VisitorArchive) {
  return Object.fromEntries(VISITOR_TABLES.map(table => [table, a.tables[table].length]));
}
