import {getSessionUser} from "../../../lib/local-auth";
import {getD1} from "../../../../db";
import {parseModule,moduleIssues,newModuleDefinition,type LabModule,type ModuleRelease} from "../../../lib/lab-modules";
import {readLabModule,listLabModules,writeLabModule,auditLab} from "../../../lib/lab-module-storage";
async function owner(){const u=await getSessionUser();return u?.ativo&&u.system_owner?u:null;}
export async function GET(){
  if(!await owner())return Response.json({error:"Acesso exclusivo do proprietário."},{status:403});
  const communities=await getD1().prepare("SELECT id,nome FROM comunidades WHERE status='ATIVA' ORDER BY nome").all();
  return Response.json({modules:await listLabModules(),communities:communities.results},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
  const u=await owner();if(!u)return Response.json({error:"Acesso exclusivo do proprietário."},{status:403});
  try {
    if(Number(request.headers.get('content-length'))>150000)return Response.json({error:"Conteúdo muito grande."},{status:413});
    const body=await request.json() as Record<string,unknown>;
    if(JSON.stringify(body).length>150000)return Response.json({error:"Conteúdo muito grande."},{status:413});
    const action=String(body.action),current=body.id?await readLabModule(String(body.id)):null;
    if(action!=="create"&&!current)return Response.json({error:"Aba não encontrada."},{status:404});
    if(current && Number(body.revision)!==current.revision)return Response.json({error:"Esta aba foi alterada em outra janela. Recarregue antes de continuar."},{status:409});
    const now=new Date().toISOString();
    let next:LabModule=current?{...current,revision:current.revision+1,updatedAt:now}:{id:crypto.randomUUID(),revision:1,draft:newModuleDefinition(),published:null,releases:[],updatedAt:now,archived:false};
    if(action==="create"||action==="save")next.draft=parseModule(body.definition||next.draft);
    else if(action==="publish"||action==="rollback") {
      if(current!.archived)throw new Error("Restaure a aba antes de publicar.");
      const definition=action==="rollback"?current!.releases.find(r=>r.version===Number(body.version))?.definition:current!.draft;
      if(!definition)throw new Error("Versão não encontrada.");
      const issues=moduleIssues(definition);if(issues.length)throw new Error(issues.join(" "));
      // Keep stable field types across releases so saved records remain readable.
      for(const release of current!.releases)for(const old of release.definition.fields){const f=definition.fields.find(f=>f.id===old.id);if(f&&f.type!==old.type)throw new Error(`O campo ${old.label} já foi publicado. Crie outro campo para mudar seu tipo.`);}
      const count=await getD1().prepare(`SELECT COUNT(*) AS n FROM comunidades WHERE status='ATIVA' AND id IN (${definition.communities.map(()=>'?').join(',')})`).bind(...definition.communities).first<{n:number}>();
      if(Number(count?.n)!==definition.communities.length)throw new Error("Uma comunidade selecionada não está ativa. Revise os destinos.");
      const release:ModuleRelease={version:(current!.releases.at(-1)?.version||0)+1,at:now,note:String(body.note|| (action==="rollback"?`Retorno à versão ${body.version}`:"Publicação")).slice(0,240),definition};
      if(current!.releases.length>=100)throw new Error("Limite de 100 versões desta aba atingido.");
      next={...next,published:release,releases:[...current!.releases,release]};
    } else if(action==="unpublish")next.published=null;
    else if(action==="archive") {next.archived=true;next.published=null;}
    else if(action==="restore")next.archived=false;
    else if(action==="duplicate") {next={...next,id:crypto.randomUUID(),revision:1,draft:{...current!.draft,name:`Cópia de ${current!.draft.name}`.slice(0,80)},published:null,releases:[],archived:false};}
    else throw new Error("Ação inválida.");
    if(!await writeLabModule(next,action==="duplicate"?null:current,u.id))return Response.json({error:"Conflito de edição. Recarregue e tente novamente."},{status:409});
    await auditLab(u.id,`LAB_MODULO_${action.toUpperCase()}`,next.id);
    return Response.json({module:next});
  } catch(e){return Response.json({error:e instanceof Error?e.message:"Não foi possível salvar."},{status:400});}
}
