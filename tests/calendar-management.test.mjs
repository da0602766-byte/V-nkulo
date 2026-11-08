import assert from 'node:assert/strict';
import test from 'node:test';
import {roleFixture} from './helpers/role-audit.mjs';
const path='/api/pilot/agenda/tarefas';
const range='?de=2026-11-01T00:00:00Z&ate=2026-12-01T00:00:00Z';
const draft={titulo:'Tarefa de auditoria',status:'PLANEJADO',prioridade:'P2',visibilidade:'PRIVADO',iniciaEm:null,terminaEm:null,prazoEm:'2026-11-20T12:00:00Z'};
async function fixture(){const f=await roleFixture();const admin=await f.account('ADMIN_COMUNIDADE',{communityOwner:true}),member=await f.account('MEMBRO'),other=await f.account('MEMBRO'),outside=await f.account('ADMIN_COMUNIDADE',{community:2,communityOwner:true});return {...f,admin,member,other,outside,as:(actor,url,method='GET',body)=>f.call(url,{cookie:actor.cookie,method,body})};}

test('Calendar tasks: authentication, tenant isolation, private backlog and real persistence',async()=>{
  const f=await fixture();try{
    assert.equal((await f.call(path+range)).status,401);
    const created=await f.as(f.member,path,'POST',draft);assert.equal(created.status,201,await created.clone().text());const row=await created.json();
    for(const actor of [f.admin,f.other,f.outside]){const response=await f.as(actor,path+range);assert.equal(response.status,200);assert.equal((await response.json()).itens.some(item=>item.origemId===row.id),false);}
    const own=await (await f.as(f.member,path+range)).json();assert.equal(own.itens.length,1);assert.equal(own.itens[0].iniciaEm,null);assert.equal(own.itens[0].prazoEm,new Date(draft.prazoEm).toISOString());assert.equal(own.itens[0].podeEditar,true);
    const forbidden=await f.as(f.outside,path,'PATCH',{...draft,id:row.id,versao:1});assert.equal(forbidden.status,404);
  }finally{f.db.close();}
});
test('Calendar tasks: only managers assign and share; unrelated members can read but cannot edit',async()=>{
  const f=await fixture();try{
    for(const change of [{responsavelId:f.other.id},{visibilidade:'COMUNIDADE'}])assert.equal((await f.as(f.member,path,'POST',{...draft,...change})).status,403);
    assert.equal((await f.as(f.admin,path,'POST',{...draft,responsavelId:f.member.id})).status,400,'private tasks stay with their creator');
    const response=await f.as(f.admin,path,'POST',{...draft,responsavelId:f.member.id,visibilidade:'COMUNIDADE'});assert.equal(response.status,201);const row=await response.json();
    const read=await (await f.as(f.other,path+range)).json();assert.equal(read.itens[0].podeEditar,false);
    assert.equal((await f.as(f.other,path,'PATCH',{...draft,id:row.id,versao:1,responsavelId:f.member.id,visibilidade:'COMUNIDADE'})).status,403);
    assert.equal((await f.as(f.member,path,'PATCH',{...draft,id:row.id,versao:1,responsavelId:f.member.id,visibilidade:'COMUNIDADE',status:'EM_ANDAMENTO'})).status,200);
    assert.equal((await f.as(f.admin,path,'POST',{...draft,responsavelId:f.outside.id,visibilidade:'COMUNIDADE'})).status,400);
  }finally{f.db.close();}
});
test('Calendar tasks: revisions reject stale saves and preserve schedule on conflict',async()=>{
  const f=await fixture();try{
    const a=await (await f.as(f.member,path,'POST',draft)).json();
    const update={...draft,id:a.id,versao:1,iniciaEm:'2026-11-08T13:00:00Z',terminaEm:'2026-11-08T14:00:00Z'};
    const saved=await f.as(f.member,path,'PATCH',update);assert.equal(saved.status,200);assert.equal((await saved.json()).versao,2);
    assert.equal((await f.as(f.member,path,'PATCH',{...update,titulo:'Tentativa obsoleta'})).status,409);
    assert.equal(f.db.prepare('SELECT titulo FROM agenda_tarefas WHERE id=?').get(a.id).titulo,draft.titulo);
    const overlap=await f.as(f.member,path,'POST',{...draft,iniciaEm:'2026-11-08T13:30:00Z'});assert.equal(overlap.status,409);assert.equal((await overlap.json()).conflito,true);
    assert.equal((await f.as(f.member,path,'POST',{...draft,iniciaEm:'2026-11-08T13:30:00Z',aceitarConflito:true})).status,201);
    const unschedule=await f.as(f.member,path,'PATCH',{...draft,id:a.id,versao:2});assert.equal(unschedule.status,200);assert.equal(f.db.prepare('SELECT inicia_em FROM agenda_tarefas WHERE id=?').get(a.id).inicia_em,null);
  }finally{f.db.close();}
});
test('Calendar tasks: hidden private conflicts return a generic warning without leaking details',async()=>{
  const f=await fixture();try{
    await f.as(f.member,path,'POST',{...draft,titulo:'Segredo particular',iniciaEm:'2026-11-08T13:00:00Z'});
    const response=await f.as(f.admin,path,'POST',{...draft,responsavelId:f.member.id,visibilidade:'COMUNIDADE',iniciaEm:'2026-11-08T13:30:00Z'});
    assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/Segredo particular/);
  }finally{f.db.close();}
});
test('Calendar tasks: status, dates, blocked reason and range validation',async()=>{
  const f=await fixture();try{
    for(const change of [{status:'PUBLICADO'},{prioridade:'P0'},{status:'BLOQUEADO'},{terminaEm:'2026-11-08T13:30:00Z'},{prazoEm:'não é data'},{iniciaEm:'2026-11-08T14:00:00Z',terminaEm:'2026-11-08T13:00:00Z'}])assert.equal((await f.as(f.member,path,'POST',{...draft,...change})).status,400);
    for(const body of [null,[]])assert.equal((await f.as(f.member,path,'POST',body)).status,400);
    assert.equal((await f.as(f.member,path+'?de=2026-01-01&ate=2026-12-31')).status,400);
    const completed=await (await f.as(f.member,path,'POST',{...draft,status:'CONCLUIDO'})).json();
    const before=f.db.prepare('SELECT concluido_em FROM agenda_tarefas WHERE id=?').get(completed.id).concluido_em;assert.ok(before);
    assert.equal((await f.as(f.member,path,'PATCH',{...draft,id:completed.id,versao:1,status:'CONCLUIDO',titulo:'Concluída'})).status,200);
    assert.equal(f.db.prepare('SELECT concluido_em FROM agenda_tarefas WHERE id=?').get(completed.id).concluido_em,before);
  }finally{f.db.close();}
});
test('Personal calendar: owner-only edits, private descriptions and optimistic revision',async()=>{
  const f=await fixture();try{
    const response=await f.as(f.member,'/api/pilot/agenda','POST',{titulo:'Compromisso privado',descricao:'Observação particular',iniciaEm:'2026-11-08T13:00:00Z'});assert.equal(response.status,201);const row=await response.json();
    const body={id:row.id,versao:1,acao:'EDITAR',titulo:'Atualizado',iniciaEm:'2026-11-08T15:00:00Z'};
    assert.equal((await f.as(f.admin,'/api/pilot/agenda','PATCH',body)).status,404);
    assert.equal((await f.as(f.member,'/api/pilot/agenda','PATCH',body)).status,200);
    assert.equal((await f.as(f.member,'/api/pilot/agenda','PATCH',body)).status,409);
    const read=await (await f.as(f.admin,'/api/pilot/agenda'+range)).json();assert.equal(read.itens.some(item=>item.origemId===row.id&&item.camada==='PESSOAL'),false);
    const conflict=await f.as(f.member,path,'POST',{...draft,iniciaEm:body.iniciaEm});assert.equal(conflict.status,409);
  }finally{f.db.close();}
});
test('Personal calendar: overnight items remain visible and public edits return to approval',async()=>{
  const f=await fixture();try{
    const personal=await (await f.as(f.member,'/api/pilot/agenda','POST',{titulo:'Compromisso que cruza a meia-noite',iniciaEm:'2026-11-07T23:00:00Z',terminaEm:'2026-11-08T02:00:00Z',visibilidade:'PUBLICO'})).json();
    const slice='?de=2026-11-08T00:00:00Z&ate=2026-11-08T23:59:59Z';
    const own=await (await f.as(f.member,'/api/pilot/agenda'+slice)).json();assert.ok(own.itens.some(item=>item.origemId===personal.id&&item.camada==='PESSOAL'));
    assert.equal((await f.as(f.admin,'/api/pilot/agenda','PATCH',{id:personal.id,acao:'APROVAR'})).status,200);
    const approved=f.db.prepare('SELECT versao FROM agenda_compromissos WHERE id=?').get(personal.id);assert.equal(approved.versao,2);
    const edited=await f.as(f.member,'/api/pilot/agenda','PATCH',{id:personal.id,versao:2,acao:'EDITAR',titulo:'Texto alterado após aprovação',iniciaEm:'2026-11-07T23:00:00Z',terminaEm:'2026-11-08T02:00:00Z'});assert.equal(edited.status,200,await edited.clone().text());
    const row=f.db.prepare('SELECT aprovacao_status,aprovado_por,aprovado_em,versao FROM agenda_compromissos WHERE id=?').get(personal.id);assert.equal(row.aprovacao_status,'PENDENTE');assert.equal(row.aprovado_por,null);assert.equal(row.aprovado_em,null);assert.equal(row.versao,3);
    const other=await (await f.as(f.other,'/api/pilot/agenda'+slice)).json();assert.equal(other.itens.some(item=>item.origemId===personal.id&&item.camada==='PESSOAL'),false);
  }finally{f.db.close();}
});
