import assert from 'node:assert/strict';
import test from 'node:test';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';

test('Diretório: lista pessoal, responsáveis, acesso entre comunidades e revogação',async()=>{
  const {database:db,d1}=await createPilotD1();
  try{
    const worker=(await import('../dist/server/index.js')).default;
    const env={DB:d1,AUTH_SECRET:'directory-test-only',ASSETS:{fetch:async()=>new Response('',{status:404})}},ctx={waitUntil(){},passThroughOnException(){}};
    const create=(nome,memberships)=>createPilotUser(db,{nome,email:nome+'@directory.test',senha:'Directory123',memberships});
    const owner=await create('Clara',[{comunidadeId:1,papel:'PASTOR'}]);
    const manager=await create('Daniel',[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]);
    const secondOwner=await create('Marina',[{comunidadeId:2,papel:'PASTOR'}]);
    const member=await create('Bruno',[{comunidadeId:1,papel:'MEMBRO'},{comunidadeId:2,papel:'MEMBRO'}]);
    await create('Carla',[{comunidadeId:1,papel:'MEMBRO'}]);
    db.prepare('UPDATE comunidades SET proprietario_usuario_id=? WHERE id=1').run(owner);
    db.prepare('UPDATE comunidades SET proprietario_usuario_id=? WHERE id=2').run(secondOwner);
    db.prepare("INSERT INTO oficiais_comunidade(usuario_comunidade_id,titulo,permissoes) SELECT id,'DIÁCONO','visitors.view' FROM usuario_comunidades WHERE usuario_id=? AND comunidade_id=1").run(member);
    const login=async name=>{const r=await worker.fetch(await cpfLoginRequest(env,new Request('https://localhost/api/auth/login',{method:'POST',body:new URLSearchParams({email:name+'@directory.test',senha:'Directory123'})})),env,ctx);assert.equal(r.status,303);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');};
    const memberCookie=await login('Bruno'),managerCookie=await login('Daniel'),secondCookie=await login('Marina'),outsiderCookie=await login('Carla');
    const call=(path,method='GET',body,cookie=memberCookie)=>worker.fetch(new Request('https://localhost'+path,{method,headers:{cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
    const ok=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
    const directory=()=>call('/api/pilot/visitantes/listas');
    let response=await directory();assert.match(response.headers.get('cache-control'),/no-store/);
    let lists=(await ok(response)).lists;assert.deepEqual(lists,[]);
    assert.deepEqual((await ok(await call('/api/pilot/visitantes/listas','GET',null,managerCookie))).lists,[]);
    assert.deepEqual((await ok(await call('/api/pilot/visitantes/listas','GET',null,await login('Clara')))).lists,[]);
    assert.deepEqual((await ok(await call('/api/pilot/visitantes/listas','GET',null,outsiderCookie))).lists,[]);
    assert.equal((await call('/api/pilot/visitantes/listas','GET',null,'')).status,401);
    for(const [cookie,role] of [[managerCookie,'READ'],[secondCookie,'EDIT']])await ok(await call('/api/pilot/visitantes/compartilhamento','POST',{action:'grant',userId:member,role},cookie));
    lists=(await ok(await directory())).lists;assert.equal(lists.length,1);
    const first=lists.find(l=>l.id==='compartilhada:1'),second=lists.find(l=>l.id==='compartilhada:2');
    assert.equal(first.title,'Lista de Clara');assert.equal(first.ownerName,'Clara');assert.equal(first.sharedByName,'Daniel');assert.equal(first.access,'READ');assert.equal(first.own,false);
    assert.equal(second,undefined);
    assert.match(await (await call('/painel/visitantes?lista=pessoal&section=listas')).text(),/Listas disponíveis/);
    // Listing other communities cannot change the active community or expose files/contacts.
    assert.equal((await ok(await call('/api/pilot/comunidade-ativa'))).context.comunidadeId,1);
    assert.doesNotMatch(JSON.stringify(lists),/arquivo_id|pasta_id|telefone|hash|document|people/);
    db.exec("UPDATE visitante_acesso_historico SET criado_em=datetime('now','-31 days')");
    await ok(await call('/api/pilot/visitantes/compartilhamento'));
    assert.equal(db.prepare('SELECT count(*) n FROM visitante_acesso_historico').get().n,0);
    assert.equal((await ok(await directory())).lists.find(l=>l.id===first.id).sharedByName,'Daniel');
    // Merely opening the directory must not connect to a Drive or require a token.
    db.prepare("INSERT INTO visitante_drive(comunidade_id,usuario_id,estado,pasta_id,arquivo_id,hash) VALUES(1,?,'ACTIVE','private-folder','private-file','private-hash')").run(owner);
    assert.equal((await ok(await directory())).lists.length,1);
    db.prepare('DELETE FROM visitante_acessos WHERE comunidade_id=1 AND usuario_id=?').run(member);
    db.prepare("INSERT INTO visitante_drive_acessos(comunidade_id,usuario_id,papel) VALUES(1,?,'READ')").run(member);
    assert.equal((await ok(await directory())).lists.find(l=>l.id===first.id).access,'READ');
    const legacyContext=(await ok(await call('/api/pilot/comunidade-ativa'))).context;
    assert.ok(legacyContext.permissions.includes('visitors.view'));assert.ok(!legacyContext.permissions.includes('visitors.edit'));
    db.prepare("INSERT INTO visitante_acessos(comunidade_id,usuario_id,papel,concedido_por) VALUES(1,?,'READ',?)").run(member,manager);
    db.prepare("INSERT INTO visitante_drive_acessos(comunidade_id,usuario_id,papel) VALUES(1,?,'READ')").run(manager);
    const managed=(await ok(await call('/api/pilot/visitantes/listas','GET',null,managerCookie))).lists;
    assert.equal(managed[0].access,'READ'); // Role alone cannot bypass a Drive ACL.
    db.exec('DELETE FROM visitante_drive_acessos; DELETE FROM visitante_drive');
    await ok(await call('/api/pilot/visitantes/compartilhamento','POST',{action:'revoke',userId:member},managerCookie));
    assert.equal((await ok(await directory())).lists.some(l=>l.id===first.id),false);
    assert.equal((await call('/api/pilot/visitantes/pagina')).status,403);
    const switchResponse=await call('/api/pilot/comunidade-ativa','POST',{comunidadeId:2});
    const switched=memberCookie+'; '+switchResponse.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    assert.equal((await call('/api/pilot/visitantes/pagina','GET',null,switched)).status,200);
    assert.match(await (await call('/painel/visitantes?lista=pessoal','GET',null,switched)).text(),/Lista pessoal indisponível nesta comunidade/);
    const entry=await (await call('/painel/visitantes?lista=pessoal&section=pessoas&comunidade=1','GET',null,switched)).text();assert.match(entry,/Abrir esta comunidade/);assert.match(entry,/lista=pessoal/);assert.match(entry,/section=pessoas/);
    assert.match(await (await call('/painel/visitantes?lista=pessoal&section=pessoas&comunidade=1')).text(),/Meus visitantes/);
    const auth=await call('/painel/visitantes?lista=compartilhada&section=pessoas&comunidade=2','GET',null,'');assert.equal(auth.status,307);assert.match(decodeURIComponent(auth.headers.get('location')),/lista=compartilhada&section=pessoas/);
    db.prepare("INSERT INTO configuracoes(chave,valor,atualizado_por) VALUES('community_modules:2','[\"people\"]','test')").run();
    assert.equal((await ok(await directory())).lists.some(l=>l.communityId===2),false);
    db.exec("DELETE FROM configuracoes WHERE chave='community_modules:2'; UPDATE usuario_comunidades SET status='INATIVO' WHERE comunidade_id=2");
    assert.equal((await ok(await directory())).lists.some(l=>l.communityId===2),false);
    db.prepare('DELETE FROM oficiais_comunidade WHERE usuario_comunidade_id IN (SELECT id FROM usuario_comunidades WHERE usuario_id=?)').run(member);
    assert.deepEqual((await ok(await directory())).lists,[]);
    assert.match(await (await call('/painel/visitantes?section=listas')).text(),/Listas disponíveis/);
    db.prepare('UPDATE usuarios SET ativo=0 WHERE id=?').run(member);
    assert.notEqual((await directory()).status,200);
  }finally{db.close();}
});
