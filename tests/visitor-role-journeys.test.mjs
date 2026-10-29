import assert from 'node:assert/strict';
import test from 'node:test';
import {journeyFixture} from './helpers/role-journey.mjs';

async function ok(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}

test('anotações não revelam visitantes sem compartilhamento, inclusive após revogação',async()=>{
  const f=await journeyFixture();
  try{
    const url='/api/pilot/anotacoes';
    for(const role of ['member','official'])assert.deepEqual((await ok(await f.as(role,url))).visitantes,[],role);
    assert.deepEqual((await ok(await f.as('admin',url))).visitantes.map(v=>v.id),[f.visitor]);
    await ok(await f.share(f.accounts.member.id));
    assert.deepEqual((await ok(await f.as('member',url))).visitantes.map(v=>v.id),[f.visitor]);
    await ok(await f.share(f.accounts.member.id,'READ','revoke'));
    assert.deepEqual((await ok(await f.as('member',url))).visitantes,[]);
  }finally{f.db.close();}
});

for(const role of ['member','official','admin'])test(`anotações: criar, editar, privacidade e remover como ${role}`,async()=>{
  const f=await journeyFixture();
  try{
    const url='/api/pilot/anotacoes',peer=role==='admin'?'member':'admin';
    const note=(await ok(await f.as(role,url,'POST',{titulo:'Nota privada '+role,texto:'Somente meu usuário'}))).anotacao;
    assert.equal((await ok(await f.as(peer,url))).anotacoes.some(n=>n.id===note.id),false);
    assert.equal((await f.as(peer,url,'PATCH',{id:note.id,titulo:'Negado'})).status,404);
    const updated=await ok(await f.as(role,url,'PATCH',{id:note.id,titulo:'Atualizada',checklist:[{texto:'Conferido',concluido:true}]}));
    assert.equal(updated.anotacao.checklist[0].concluido,true);
    await ok(await f.as(role,url+'?id='+note.id,'DELETE'));
    assert.deepEqual((await ok(await f.as(role,url))).anotacoes,[]);
  }finally{f.db.close();}
});

test('jornada oficial: pessoal independente, compartilhamento, edição, redução e revogação',async()=>{
  const f=await journeyFixture();
  try{
    const url='/api/pilot/visitantes/pagina',directory='/api/pilot/visitantes/listas';
    assert.equal((await f.as('official',url)).status,403);
    const personal=await f.as('official','/painel/visitantes');assert.match(await personal.text(),/Meus visitantes|PersonalVisitorApp/);
    assert.deepEqual((await ok(await f.as('official',directory))).lists,[]);
    await ok(await f.share(f.accounts.official.id,'EDIT'));
    const shared=await ok(await f.as('official',directory));assert.equal(shared.lists.length,1);
    const page=await ok(await f.as('official',url));assert.deepEqual(page.visitantes.map(v=>v.id),[f.visitor]);
    const created=await ok(await f.as('official','/api/pilot/visitantes','POST',{nomeCompleto:'Cadastro do oficial na lista compartilhada',dataEntrada:'2026-10-26'}),201);
    await ok(await f.as('official','/api/pilot/visitantes/'+created.id,'PATCH',{nomeCompleto:'Revisado pelo oficial'}));
    assert.equal((await f.as('official','/api/pilot/visitantes/'+f.foreignVisitor,'PATCH',{nomeCompleto:'Não autorizado'})).status,404);
    assert.equal((await f.as('official','/api/pilot/visitantes/'+created.id,'DELETE')).status,403);
    assert.equal((await f.as('official','/api/pilot/visitantes/compartilhamento','POST',{action:'grant',userId:f.accounts.member.id,role:'EDIT'})).status,403);
    await ok(await f.share(f.accounts.official.id,'READ'));
    assert.equal((await f.as('official','/api/pilot/visitantes/'+created.id,'PATCH',{nomeCompleto:'Não permitido'})).status,403);
    await ok(await f.share(f.accounts.official.id,'READ','revoke'));
    assert.equal((await f.as('official',url)).status,403);
    assert.deepEqual((await ok(await f.as('official',directory))).lists,[]);
    assert.equal((await f.as('official','/painel/visitantes')).status,200);
    assert.equal(f.db.prepare('SELECT nome_completo FROM visitantes WHERE id=?').get(created.id).nome_completo,'Revisado pelo oficial');
  }finally{f.db.close();}
});
