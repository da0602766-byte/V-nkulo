import type { Database, SqlValue } from 'sql.js';
import type { TenantContext } from './tenant';
import { getRuntimeEnv } from '../../db/runtime-env';
import { VISITOR_TABLES, type VisitorArchive, type VisitorRow } from './visitor-drive-format';
import { driveAccess, openNotes, ownerToken, platformDB, readArchive, sealNotes, visitorDriveConfig, VisitorDriveError, writeArchive, type VisitorDriveConfig } from './visitor-drive-store';

const quoted=(name:string)=>`"${name.replaceAll('"','""')}"`;
const isWrite=(sql:string)=>/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
const references=(sql:string,table:string)=>new RegExp('\\b(?:FROM|JOIN|INTO|UPDATE)\\s+[`"\\[]?'+table+'\\b','i').test(sql);
type SchemaRow={name:string;tbl_name:string;type:string;sql:string};
// The module contains SQLite code only. Every request has its own Database;
// no visitor data, file handles or Google tokens enter a module-level cache.
export class VisitorDriveRuntime {
  db: D1Database;
  error?: VisitorDriveError;
  private memory?:Database;
  private archive?:VisitorArchive;
  private token='';
  private dirty=false;
  private loading?:Promise<void>;
  private schema:SchemaRow[]=[];
  private hydrated=new Set<string>();
  private queue:Promise<unknown>=Promise.resolve();
  private notesBefore='';
  private deferred:{sql:string;bindings:SqlValue[]}[]=[];
  private base: D1Database;
  constructor(public config:VisitorDriveConfig,public context:TenantContext,public role:'READ'|'EDIT'|null,private method:string) {
    this.base=platformDB();
    this.db={prepare:(sql:string)=>new DriveStatement(this,sql),batch:(items:DriveStatement[])=>this.batch(items),exec:()=>{throw new VisitorDriveError('Operação não suportada no arquivo de Visitantes.');}} as unknown as D1Database;
  }
  private external(sql:string,bindings:unknown[]) {
    return VISITOR_TABLES.some(t=>references(sql,t)) || (references(sql,'layouts_interface')&&(/care-notes/.test(sql)||bindings.some(v=>typeof v==='string'&&v.startsWith('care-notes:'))));
  }
  private async initialize() {
    if(this.loading)return this.loading;
    this.loading=(async()=>{
      this.token=await ownerToken(this.config);
      this.archive=await readArchive(this.config,this.token);
      const init=(await import('sql.js/dist/sql-asm.js')).default;
      const SQL=await init();this.memory=new SQL.Database();
      this.memory.run('PRAGMA foreign_keys=OFF');
      this.schema=(await this.base.prepare("SELECT name,tbl_name,type,sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all<SchemaRow>()).results;
      for(const table of VISITOR_TABLES) this.createTable(table,this.role?this.archive.tables[table]:[]);
      const notes=await openNotes(this.archive.privateNotes);
      // Private notes are never made visible to another community user, including managers.
      this.createTable('layouts_interface',notes.filter(r=>r.usuario_id===this.context.userId) as VisitorRow[]);
      this.memory.run("DELETE FROM sqlite_sequence WHERE name='layouts_interface'");
      this.memory.run('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)',['layouts_interface',notes.reduce((max,r)=>Math.max(max,Number(r.id)||0),0)]);
      this.notesBefore=JSON.stringify(this.rows('layouts_interface'));
      for(const table of VISITOR_TABLES){this.memory.run('DELETE FROM sqlite_sequence WHERE name=?',[table]);this.memory.run('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)',[table,this.archive.sequences[table]]);}
      for(const table of ['acompanhamentos','visitor_contacts','visitor_visits'])this.memory.run(`CREATE TRIGGER drive_cascade_${table} AFTER DELETE ON visitantes BEGIN DELETE FROM ${table} WHERE visitante_id=OLD.id; END`);
      // The original quota remains enforced in the ephemeral database.
      await this.hydrate('assinaturas_comunidade');
      const triggers=await this.base.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name IN ('plano_cadastros_insert','plano_cadastros_update')").all<{sql:string}>();
      for(const trigger of triggers.results)this.memory.run(trigger.sql);
    })();return this.loading;
  }
  private createTable(name:string,rows:VisitorRow[]) {
    const schema=this.schema.find(s=>s.type==='table'&&s.name===name);if(!schema)throw new VisitorDriveError('A estrutura de Visitantes precisa ser atualizada antes de continuar.');
    this.memory!.run(schema.sql);
    for(const row of rows){const keys=Object.keys(row);this.memory!.run(`INSERT INTO ${quoted(name)} (${keys.map(quoted).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,keys.map(k=>row[k]));}
    for(const index of this.schema.filter(s=>s.type==='index'&&s.tbl_name===name))this.memory!.run(index.sql);
    this.hydrated.add(name);
  }
  private async hydrate(name:string) {
    if(this.hydrated.has(name))return;
    // The source is the installed schema, never a name or SQL from an imported archive.
    const columns=(await this.base.prepare(`PRAGMA table_info(${quoted(name)})`).all<{name:string}>()).results.map(c=>c.name);
    let query=`SELECT * FROM ${quoted(name)}`,params:SqlValue[]=[];
    if(columns.includes('comunidade_id')){query+=' WHERE comunidade_id=?';params=[this.context.comunidadeId];}
    else if(name==='comunidades'){query+=' WHERE id=?';params=[this.context.comunidadeId];}
    else if(name==='usuarios'){query+=' WHERE id IN (SELECT usuario_id FROM usuario_comunidades WHERE comunidade_id=?)';params=[this.context.comunidadeId];}
    else throw new VisitorDriveError(`Esta consulta precisa de adaptação para o Drive (${name}).`);
    const result=await this.base.prepare(query+' LIMIT 10001').bind(...params).all<VisitorRow>();
    if(result.results.length>10000)throw new VisitorDriveError('A consulta de vínculos excedeu o limite. Nenhum resultado parcial foi apresentado.');
    this.createTable(name,result.results);
  }
  private rows(table:string):VisitorRow[] {
    const s=this.memory!.prepare(`SELECT * FROM ${quoted(table)} ORDER BY id`),rows:VisitorRow[]=[];
    try{while(s.step())rows.push(s.getAsObject() as VisitorRow);}finally{s.free();}return rows;
  }
  run(sql:string,bindings:SqlValue[],kind:'all'|'run'|'first'|'raw',column?:string,rawColumns=false) {
    if(!this.external(sql,bindings))return this.execute(sql,bindings,kind,column,rawColumns);
    const work=this.queue.then(()=>this.execute(sql,bindings,kind,column,rawColumns));
    this.queue=work.catch(error=>{if(error instanceof VisitorDriveError)this.error=error;});return work;
  }
  private async execute(sql:string,bindings:SqlValue[],kind:'all'|'run'|'first'|'raw',column?:string,rawColumns=false,forceMemory=false):Promise<unknown> {
    if(!forceMemory&&!this.external(sql,bindings)) {
      const s=this.base.prepare(sql).bind(...bindings);
      if(kind==='first'){const row=await s.first<Record<string,unknown>>();return column?(row?.[column]??null):row;}
      if(kind==='raw'){const r=await s.all<Record<string,unknown>>();const keys=Object.keys(r.results[0]||{}),values=r.results.map(row=>keys.map(k=>row[k]));return rawColumns?[keys,...values]:values;}
      return s[kind]();
    }
    await this.initialize();
    const target=sql.match(/^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+[`"\[]?(\w+)/i)?.[1];
    const write=isWrite(sql);
    if(write){
      const expected=getRuntimeEnv().visitorExpectedRevision;
      if(this.method!=='GET'&&expected!==undefined&&expected!==this.config.revisao)throw new VisitorDriveError('Os cadastros mudaram desde que você abriu a edição. Reabra a ficha atualizada para evitar sobrescrever outra alteração.');
      const metadata=forceMemory&&target==='celulas';
      if(!target||(![...VISITOR_TABLES,'layouts_interface'].includes(target)&&!metadata))throw new VisitorDriveError('Esta operação depende de dados externos. Use a aba Visitantes.');
      if(this.method==='GET')return {success:true,results:[],meta:{changes:0,last_row_id:0}};
      if(this.config.estado!=='ACTIVE')throw new VisitorDriveError('Confirme a migração antes de alterar os cadastros.');
      if(target!=='layouts_interface'&&this.role!=='EDIT')throw new VisitorDriveError('Seu acesso aos cadastros permite somente consulta.',403);
    }
    const referenced=this.schema.filter(s=>s.type==='table'&&references(sql,s.name));
    for(const table of referenced)await this.hydrate(table.name);
    const statement=this.memory!.prepare(sql),rows:Record<string,SqlValue>[]=[],values:SqlValue[][]=[];
    let names:string[]=[];
    try {statement.bind(bindings);names=statement.getColumnNames();while(statement.step()){rows.push(statement.getAsObject());values.push(statement.get());}} finally {statement.free();}
    const changes=write?this.memory!.getRowsModified():0;
    if(write&&forceMemory&&target&&!VISITOR_TABLES.includes(target as typeof VISITOR_TABLES[number])&&target!=='layouts_interface')this.deferred.push({sql,bindings});
    if(changes)this.dirty=true;
    if(kind==='first')return column?(rows[0]?.[column]??null):(rows[0]??null);
    if(kind==='raw')return rawColumns?[names,...values]:values;
    const last=Number(this.memory!.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0]||0);
    return {success:true,results:rows,meta:{changes,last_row_id:last,duration:0,rows_read:rows.length,rows_written:changes}};
  }
  private batch(items:DriveStatement[]) {
    const work=this.queue.then(async()=>{
      if(items.every(s=>!this.external(s.sql,s.bindings)))return this.base.batch(items.map(s=>this.base.prepare(s.sql).bind(...s.bindings)));
      await this.initialize();const dirtyBefore=this.dirty,deferredBefore=this.deferred.length;
      for(const table of this.schema.filter(s=>s.type==='table'&&items.some(item=>references(item.sql,s.name))))await this.hydrate(table.name);
      this.memory!.run('BEGIN');
      try{const results=[];for(const s of items)results.push(await this.execute(s.sql,s.bindings,'all',undefined,false,true));this.memory!.run('COMMIT');return results;}
      catch(e){this.memory!.run('ROLLBACK');this.dirty=dirtyBefore;this.deferred.length=deferredBefore;throw e;}
    });this.queue=work.catch(error=>{if(error instanceof VisitorDriveError)this.error=error;});return work;
  }
  async finish(success:boolean) {
    try {
      await this.queue;
      if(!this.memory||!success)return;
      const current=await visitorDriveConfig(this.context.comunidadeId);
      const member=await this.base.prepare(`SELECT u.id FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id=u.id JOIN comunidades c ON c.id=uc.comunidade_id WHERE u.id=? AND u.ativo=1 AND uc.id=? AND uc.comunidade_id=? AND uc.status='ATIVO' AND c.status='ATIVA'`).bind(this.context.userId,this.context.membershipId,this.context.comunidadeId).first();
      if(!member)throw new VisitorDriveError('Seu vínculo com a comunidade não está mais ativo.',403);
      if(!current||current.revisao!==this.config.revisao||await driveAccess(current,this.context.userId)!==this.role)throw new VisitorDriveError('O arquivo ou suas permissões mudaram. Atualize antes de continuar.');
      if(!this.dirty)return;
      const next=structuredClone(this.archive!);
      if(this.role==='EDIT')for(const table of VISITOR_TABLES){next.tables[table]=this.rows(table);const seq=this.memory.exec(`SELECT seq FROM sqlite_sequence WHERE name='${table}'`)[0]?.values[0]?.[0];next.sequences[table]=Math.max(next.sequences[table],Number(seq)||0);}
      const mine=this.rows('layouts_interface');
      if(JSON.stringify(mine)!==this.notesBefore){const notes=await openNotes(next.privateNotes);next.privateNotes=await sealNotes([...notes.filter(r=>r.usuario_id!==this.context.userId),...mine]);}
      const saved=await writeArchive(current,this.token,next);
      // A pointer swap is the only authoritative commit. Racing edits never overwrite each other.
      try {
        const result=await this.base.batch([
          this.base.prepare(`UPDATE visitante_drive SET arquivo_id=?,hash=?,
            revisao=CASE WHEN revisao=? AND estado='ACTIVE' THEN revisao+1 ELSE -1 END,verificado_em=CURRENT_TIMESTAMP WHERE comunidade_id=?`)
            .bind(saved.arquivo_id,saved.hash,current.revisao,current.comunidade_id),
          ...this.deferred.map(s=>this.base.prepare(s.sql).bind(...s.bindings)),
        ]);
        if(!result[0].meta.changes)throw new VisitorDriveError('Outra pessoa salvou antes de você. Atualize e reaplique sua alteração.');
      }catch(e){if(/CHECK|revisao/.test(String(e)))throw new VisitorDriveError('Outra pessoa salvou antes de você. Atualize e reaplique sua alteração.');throw e;}
    } finally {this.memory?.close();this.memory=undefined;this.archive=undefined;this.token='';}
  }
}
class DriveStatement {
  constructor(private runtime:VisitorDriveRuntime,public sql:string,public bindings:SqlValue[]=[]){}
  bind(...values:SqlValue[]){return new DriveStatement(this.runtime,this.sql,values);}
  all(){return this.runtime.run(this.sql,this.bindings,'all');}
  run(){return this.runtime.run(this.sql,this.bindings,'run');}
  first(column?:string){return this.runtime.run(this.sql,this.bindings,'first',column);}
  raw(options?:{columnNames?:boolean}){return this.runtime.run(this.sql,this.bindings,'raw',undefined,options?.columnNames);}
}
export async function attachVisitorDrive(context:TenantContext) {
  const env=getRuntimeEnv();if(!env.DB||!env.requestMethod)return;
  if(env.visitorDrive?.context.comunidadeId===context.comunidadeId){filterDrivePermissions(context,env.visitorDrive.role);return;}
  const config=await visitorDriveConfig(context.comunidadeId);if(!config||config.estado==='LOCKED'||config.estado==='PURGING')return;
  const role=context.temporaryAccess?null:await driveAccess(config,context.userId);
  env.visitorDrive=new VisitorDriveRuntime(config,context,role,env.requestMethod);
  filterDrivePermissions(context,role);
}
function filterDrivePermissions(context:TenantContext,role:'READ'|'EDIT'|null) {
  if(role!=='EDIT')context.permissions=context.permissions.filter(p=>!['visitors.create','visitors.edit','visitors.deactivate','visitor.categories.manage','followups.manage'].includes(p));
  if(!role)context.permissions=context.permissions.filter(p=>!['visitors.view','followups.view'].includes(p));
}
