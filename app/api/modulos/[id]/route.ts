import {getD1} from "../../../../db";
import {getSessionUser} from "../../../lib/local-auth";
import {getActiveTenantContext} from "../../../lib/tenant";
import {readLabModule,auditLab} from "../../../lib/lab-module-storage";
import {canUseModule,validateModuleValues,validModuleId,type ModuleRecord} from "../../../lib/lab-modules";
async function access(id:string,write=false){
  const user=await getSessionUser();if(!user?.ativo)return {error:Response.json({error:"Faça login."},{status:401})} as const;
  const {context}=await getActiveTenantContext(user),module=await readLabModule(id);
  if(!context||!module?.published||module.archived||!canUseModule(module.published.definition,context,write))return {error:Response.json({error:"Esta aba não está disponível para seu perfil nesta comunidade."},{status:403})} as const;
  return {user,context,module,definition:module.published.definition,prefix:`lab.record.${id}.${context.comunidadeId}.`} as const;
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,a=await access(id);if('error' in a)return a.error;
  const q=new URL(request.url).searchParams,page=Math.max(0,Math.min(10000,Number(q.get('page'))||0)),archived=q.get('archived')==='true';
  const db=getD1();
  const rows=await db.prepare("SELECT valor FROM configuracoes WHERE chave LIKE ? AND json_extract(valor,'$.archived')=? ORDER BY atualizado_em DESC,chave LIMIT 50 OFFSET ?").bind(a.prefix+'%',archived?1:0,page*50).all<{valor:string}>();
  const count=await db.prepare("SELECT COUNT(*) AS n FROM configuracoes WHERE chave LIKE ? AND json_extract(valor,'$.archived')=?").bind(a.prefix+'%',archived?1:0).first<{n:number}>();
  return Response.json({definition:a.definition,version:a.module.published!.version,community:a.context.comunidadeNome,canWrite:canUseModule(a.definition,a.context,true),records:rows.results.map(r=>JSON.parse(r.valor)),total:count?.n||0,page},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,a=await access(id,true);if('error' in a)return a.error;
  try{
    const body=await request.json();if(JSON.stringify(body).length>110000)throw new Error("Registro muito grande.");
    if(body.version!==a.module.published!.version)return Response.json({error:"A aba recebeu uma nova versão. Atualize antes de salvar."},{status:409});
    const action=String(body.action),db=getD1();
    const recordId=body.id?String(body.id):crypto.randomUUID();if(!validModuleId(recordId))throw new Error("Registro inválido.");
    const key=a.prefix+recordId,row=await db.prepare("SELECT valor FROM configuracoes WHERE chave=?").bind(key).first<{valor:string}>();
    const current=row?JSON.parse(row.valor) as ModuleRecord:null;
    if(action!=="create"&&!current)return Response.json({error:"Registro não encontrado nesta comunidade."},{status:404});
    if(action==="create"&&current)throw new Error("Registro já existe.");
    if(current&&current.revision!==Number(body.revision))return Response.json({error:"Outra pessoa alterou o registro. Atualize antes de editar."},{status:409});
    if(action==="create"&&!a.definition.allowCreate||action==="save"&&!a.definition.allowEdit||["archive","restore"].includes(action)&&!a.definition.allowArchive)throw new Error("Esta ação está desativada para a aba.");
    const now=new Date().toISOString();
    const record:ModuleRecord=current?{...current,revision:current.revision+1,updatedAt:now}:{id:recordId,revision:1,values:{},archived:false,createdAt:now,updatedAt:now};
    if(action==="create"||action==="save")record.values={...record.values,...validateModuleValues(a.definition,body.values)};
    else if(action==="archive"||action==="restore")record.archived=action==="archive";
    else throw new Error("Ação inválida.");
    const result=current?await db.prepare("UPDATE configuracoes SET valor=?,atualizado_por=?,atualizado_em=CURRENT_TIMESTAMP WHERE chave=? AND valor=?").bind(JSON.stringify(record),String(a.user.id),key,row!.valor).run():await db.prepare("INSERT OR IGNORE INTO configuracoes(chave,valor,atualizado_por) VALUES(?,?,?)").bind(key,JSON.stringify(record),String(a.user.id)).run();
    if(!Number(result.meta.changes))return Response.json({error:"Conflito de edição. Atualize e tente novamente."},{status:409});
    await auditLab(a.user.id,`LAB_REGISTRO_${action.toUpperCase()}`,id,a.context.comunidadeId);
    return Response.json({record});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"Não foi possível salvar."},{status:400});}
}
