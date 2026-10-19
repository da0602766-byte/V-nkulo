import {getD1} from "../../db";
import {MODULE_PREFIX, validModuleId, type LabModule} from "./lab-modules";
export async function readLabModule(id:string) {
  if(!validModuleId(id)) return null;
  const row=await getD1().prepare("SELECT valor FROM configuracoes WHERE chave=?").bind(MODULE_PREFIX+id).first<{valor:string}>();
  return row?JSON.parse(row.valor) as LabModule:null;
}
export async function listLabModules() {
  const rows=await getD1().prepare("SELECT valor FROM configuracoes WHERE chave LIKE 'lab.module.%' ORDER BY atualizado_em DESC LIMIT 200").all<{valor:string}>();
  return rows.results.map(r=>JSON.parse(r.valor) as LabModule);
}
export async function writeLabModule(next:LabModule, previous:LabModule|null, actor:number) {
  const db=getD1(), key=MODULE_PREFIX+next.id;
  const result= previous
    ? await db.prepare("UPDATE configuracoes SET valor=?, atualizado_por=?, atualizado_em=CURRENT_TIMESTAMP WHERE chave=? AND valor=?").bind(JSON.stringify(next),String(actor),key,JSON.stringify(previous)).run()
    : await db.prepare("INSERT OR IGNORE INTO configuracoes(chave,valor,atualizado_por) VALUES(?,?,?)").bind(key,JSON.stringify(next),String(actor)).run();
  return Number(result.meta.changes)>0;
}
export async function auditLab(actor:number,event:string,moduleId:string,community:number|null=null) {
  await getD1().prepare("INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado,metadados) VALUES(?,?,?,'SUCESSO',?)").bind(community,actor,event,JSON.stringify({moduleId})).run();
}
