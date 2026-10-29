import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
function moduleAt(file,deps={}) {const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{assert.ok(name in deps,name);return deps[name];},Response,URL,Buffer,Date});return exports;}
const {momentIsActive}=moduleAt('app/lib/feed-moments.ts');
test('Momentos: apenas opt-in publicado e não expirado aparece; limite exato de 24h',()=>{
 const now=Date.parse('2026-10-28T18:00:00Z');
 assert.equal(momentIsActive({status:'PUBLICADA'},now),false);
 assert.equal(momentIsActive({status:'RASCUNHO',momento_expira_em:'2026-10-29 18:00:00'},now),false);
 assert.equal(momentIsActive({status:'PUBLICADA',momento_expira_em:'2026-10-28 18:00:01'},now),true);
 assert.equal(momentIsActive({status:'PUBLICADA',momento_expira_em:'2026-10-28 18:00:00'},now),false);
 assert.equal(momentIsActive({status:'PUBLICADA',momento_expira_em:'invalid'},now),false);
});
test('Momentos: opção persiste no servidor, não inclui posts antigos e respeita comunidade',async t=>{
 const {database,d1}=await createPilotD1();t.after(()=>database.close());
 const id=await createPilotUser(database,{nome:'Autor',email:'moment@test.invalid',senha:'Teste12345'});
 const access={user:{id,email:'moment@test.invalid',system_owner:false},context:{comunidadeId:1,permissions:['feed.view','feed.publish','feed.moderate']}};
 const deps={'../../../../db':{getD1:()=>d1},'../../../lib/tenant':{requireTenantPermission:async()=>access},'../../../lib/feed-cursor':moduleAt('app/lib/feed-cursor.ts'),'../../../lib/feed-validation':moduleAt('app/lib/feed-validation.ts'),'../../../lib/editorial-scheduler':{publishDueEditorialEntries:async()=>{}},'../../../lib/local-auth':{isSystemOwnerAccount:()=>false},'../../../lib/tenant-audit':{recordTenantAudit:async()=>{}},'../../../lib/pilot-notifications':{notifyUser:async()=>{}}};
 const route=moduleAt('app/api/pilot/publicacoes/route.ts',deps);
 const post=async(extra={})=>{const r=await route.POST(new Request('https://test.invalid/api/pilot/publicacoes',{method:'POST',body:JSON.stringify({titulo:'Momento de teste',conteudo:'Um encontro para compartilhar.',categoria:'COMUNIDADE',status:'PUBLICADA',...extra})}));return {...await r.json(),httpStatus:r.status};};
 const normal=await post(),moment=await post({mostrarMomento:true}),draft=await post({mostrarMomento:true,status:'RASCUNHO'});
 assert.equal(normal.httpStatus,201);assert.equal(moment.httpStatus,201);
 const list=await (await route.GET(new Request('https://test.invalid/api/pilot/publicacoes?limit=50'))).json();
 assert.equal(list.publicacoes.find(p=>p.id===normal.id).momento_expira_em,null);
 const opted=list.publicacoes.find(p=>p.id===moment.id);assert.equal(momentIsActive(opted,Date.now()),true);
 assert.equal(momentIsActive(list.publicacoes.find(p=>p.id===draft.id),Date.now()),false);
 assert.equal((await post({mostrarMomento:true,canalFeed:false,canalLateral:true})).httpStatus,400);
 database.prepare("UPDATE publicacoes_piloto SET aprovado_em=datetime('now','-25 hours') WHERE id=?").run(moment.id);
 const expired=await (await route.GET(new Request('https://test.invalid/api/pilot/publicacoes?limit=50'))).json();
 assert.equal(momentIsActive(expired.publicacoes.find(p=>p.id===moment.id),Date.now()),false);
 assert.ok(expired.publicacoes.some(p=>p.id===moment.id),'expirar momento não apaga publicação');
 const patch=moduleAt('app/api/pilot/publicacoes/[id]/route.ts',{'../../../../../db':deps['../../../../db'],'../../../../lib/feed-validation':deps['../../../lib/feed-validation'],'../../../../lib/tenant':deps['../../../lib/tenant'],'../../../../lib/tenant-audit':deps['../../../lib/tenant-audit'],'../../../../lib/pilot-notifications':deps['../../../lib/pilot-notifications']});
 database.prepare("UPDATE publicacoes_piloto SET criado_em=datetime('now','-2 days'), aprovado_em=NULL WHERE id=?").run(draft.id);
 const promoted=await patch.PATCH(new Request('https://test.invalid',{method:'PATCH',body:JSON.stringify({titulo:'Momento publicado',conteudo:'Agora o rascunho está pronto.',categoria:'COMUNIDADE',status:'PUBLICADA'})}),{params:Promise.resolve({id:String(draft.id)})});
 assert.equal(promoted.status,200);
 const promotedList=await (await route.GET(new Request('https://test.invalid/api/pilot/publicacoes?limit=50'))).json();
 assert.equal(momentIsActive(promotedList.publicacoes.find(p=>p.id===draft.id),Date.now()),true,'24h começam ao publicar o rascunho');
 access.context.comunidadeId=2;
 const other=await (await route.GET(new Request('https://test.invalid/api/pilot/publicacoes?limit=50'))).json();
 assert.equal(other.publicacoes.some(p=>p.id===moment.id),false);
});

