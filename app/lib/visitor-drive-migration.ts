import { VISITOR_TABLES, validateVisitorArchive, type VisitorArchive, type VisitorRow } from './visitor-drive-format';
import { openNotes, platformDB, sealNotes, VisitorDriveError } from './visitor-drive-store';

export async function captureVisitorArchive(communityId:number):Promise<VisitorArchive> {
  const db=platformDB();
  // The migration lock and database triggers freeze every legacy writer first.
  const results=await db.batch([
    ...VISITOR_TABLES.map(t=>db.prepare(`SELECT * FROM ${t} WHERE comunidade_id=? ORDER BY id LIMIT 100001`).bind(communityId)),
    db.prepare("SELECT * FROM layouts_interface WHERE comunidade_id=? AND escopo LIKE 'care-notes:user:%' ORDER BY id LIMIT 100001").bind(communityId),
  ]);
  if(results.some(r=>!r.results||r.results.length>100000))throw new VisitorDriveError('A comunidade excede o limite desta migração. Nenhuma exportação parcial foi gerada.');
  const tables=Object.fromEntries(VISITOR_TABLES.map((t,i)=>[t,results[i].results])) as VisitorArchive['tables'];
  const sequences=Object.fromEntries(VISITOR_TABLES.map(t=>[t,tables[t].reduce((max,r)=>Math.max(max,Number(r.id)),0)]));
  const archive:VisitorArchive={format:'vinkulo-visitors',version:1,communityId,tables,sequences,privateNotes:await sealNotes(results.at(-1)!.results)};
  validateVisitorArchive(archive,communityId);return archive;
}
export async function assertSameSource(archive:VisitorArchive) {
  const source=await captureVisitorArchive(archive.communityId);
  if(JSON.stringify(source.tables)!==JSON.stringify(archive.tables) || JSON.stringify(await openNotes(source.privateNotes))!==JSON.stringify(await openNotes(archive.privateNotes)))throw new VisitorDriveError('Os dados da origem não correspondem à cópia verificada. Prepare a migração novamente; nada foi excluído.');
}
export async function verifyArchiveSchema(archive:VisitorArchive) {
  const init=(await import('sql.js/dist/sql-asm.js')).default,SQL=await init(),memory=new SQL.Database(),db=platformDB();
  try {
    for(const table of VISITOR_TABLES){
      const schema=await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").bind(table).first<{sql:string}>();
      if(!schema)throw new VisitorDriveError('Estrutura incompatível.');
      memory.run(schema.sql);
      for(const row of archive.tables[table]){const keys=Object.keys(row);if(keys.some(k=>!/^[a-z_]+$/i.test(k)))throw new VisitorDriveError('Colunas inválidas no backup.');memory.run(`INSERT INTO ${table} (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,keys.map(k=>row[k]));}
      const indexes=await db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").bind(table).all<{sql:string}>();
      for(const index of indexes.results)memory.run(index.sql);
    }
    const notes=await openNotes(archive.privateNotes);
    if(!Array.isArray(notes)||notes.some(r=>r.comunidade_id!==archive.communityId || r.escopo!==`care-notes:user:${r.usuario_id}` || typeof r.configuracao!=='string'))throw new VisitorDriveError('As anotações privadas do backup não puderam ser validadas.');
    // Notes are protected with the installation's existing credential key.
    // A backup cannot silently move private notes to a different installation.
    const people=archive.tables.visitantes;
    const categories=new Set(archive.tables.visitante_categorias.map(r=>r.id));
    if(people.some(r=>r.categoria_id!=null&&!categories.has(r.categoria_id)))throw new VisitorDriveError('O backup tem fichas vinculadas a categorias ausentes.');
    return notes as VisitorRow[];
  } catch(e) {if(e instanceof VisitorDriveError)throw e;throw new VisitorDriveError('O backup não corresponde à estrutura atual ou a chave das anotações privadas não está disponível.');}
  finally{memory.close();}
}
