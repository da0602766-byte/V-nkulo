import assert from 'node:assert/strict';
import test from 'node:test';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';

test('Visitantes: compartilhar com membro comum, editar, revogar e respeitar comunidade e cargo',async()=>{
  const {database:db,d1}=await createPilotD1();
  try {
    const worker=(await import('../dist/server/index.js')).default;
    const env={DB:d1,AUTH_SECRET:'visitor-sharing-test-only',ASSETS:{fetch:async()=>new Response('',{status:404})}};
    const ctx={waitUntil(){},passThroughOnException(){}};
    const create=(nome,papel='MEMBRO',comunidadeId=1)=>createPilotUser(db,{nome,email:`${nome}@example.test`,senha:'SharingTest123',memberships:[{comunidadeId,papel}]});
    const admin=await create('admin','ADMIN_COMUNIDADE'),member=await create('member'),other=await create('other','MEMBRO',2),leader=await create('leader','LIDER');
    const login=async name=>{const r=await worker.fetch(await cpfLoginRequest(env,new Request('https://localhost/api/auth/login',{method:'POST',body:new URLSearchParams({email:`${name}@example.test`,senha:'SharingTest123'})})),env,ctx);assert.equal(r.status,303);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');};
    const adminCookie=await login('admin'),memberCookie=await login('member'),otherCookie=await login('other'),leaderCookie=await login('leader');
    const call=(path,method='GET',body,cookie=adminCookie)=>worker.fetch(new Request('https://localhost'+path,{method,headers:{cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
    const sharing='/api/pilot/visitantes/compartilhamento',page='/api/pilot/visitantes/pagina';
    const share=(userId,role='READ',action='grant',cookie=adminCookie)=>call(sharing,'POST',{action,userId,role},cookie);
    const ok=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
    assert.equal((await call(page,'GET',null,memberCookie)).status,403);
    assert.equal((await call(sharing,'GET',null,'')).status,401);
    const hidden=await ok(await call(sharing,'GET',null,memberCookie));assert.equal(hidden.canManage,false);assert.deepEqual(hidden.members,[]);
    assert.equal((await share(member,'EDIT','grant',leaderCookie)).status,403);
    assert.equal((await share(other)).status,400);assert.equal((await share(admin)).status,400);assert.equal((await share(member,'ADMIN')).status,400);
    const list=await ok(await call(sharing));assert.ok(list.members.some(m=>m.id===member));assert.ok(!list.members.some(m=>m.id===other));
    assert.deepEqual((await ok(await call(`${sharing}?busca=member`))).members.map(m=>m.id),[member]);
    await ok(await share(member));
    let snapshot=await ok(await call(page,'GET',null,memberCookie));assert.ok(snapshot.permissions.includes('visitors.view'));assert.ok(!snapshot.permissions.includes('visitors.edit'));
    assert.equal((await call('/painel/visitantes','GET',null,memberCookie)).status,200);
    await ok(await call('/api/pilot/visitantes/exportar','GET',null,memberCookie));
    assert.equal((await call('/api/pilot/visitantes','POST',{nomeCompleto:'Negado'},memberCookie)).status,403);
    assert.equal((await share(other,'EDIT','grant',memberCookie)).status,403);
    await ok(await share(member,'EDIT'));
    const created=await call('/api/pilot/visitantes','POST',{nomeCompleto:'Ficha compartilhada',dataEntrada:'2026-10-25'},memberCookie);assert.equal(created.status,201,await created.clone().text());const {id}=await created.json();
    await ok(await call(`/api/pilot/visitantes/${id}`,'PATCH',{nomeCompleto:'Ficha atualizada'},memberCookie));
    assert.equal((await call(`/api/pilot/visitantes/${id}`,'DELETE',null,memberCookie)).status,403);
    assert.equal((await call('/api/pilot/acompanhamentos','POST',{visitanteId:id,tipo:'TELEFONE',resultado:'Contato compartilhado'},memberCookie)).status,201);
    assert.equal((await call('/api/pilot/visitante-categorias','POST',{nome:'Negado'},memberCookie)).status,403);
    await ok(await share(member,'READ'));
    assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{nomeCompleto:'Negado'},memberCookie)).status,403);
    db.prepare("UPDATE usuario_comunidades SET status='INATIVO' WHERE usuario_id=?").run(member);
    assert.notEqual((await call(page,'GET',null,memberCookie)).status,200);assert.equal((await share(member)).status,400);
    await ok(await share(member,undefined,'revoke'));
    db.prepare("UPDATE usuario_comunidades SET status='ATIVO' WHERE usuario_id=?").run(member);
    assert.equal((await call(page,'GET',null,memberCookie)).status,403);
    await ok(await share(leader));await ok(await share(leader,undefined,'revoke'));
    await ok(await call(page,'GET',null,leaderCookie));
    assert.equal((await call(page,'GET',null,otherCookie)).status,403);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM oficiais_comunidade WHERE usuario_comunidade_id IN (SELECT id FROM usuario_comunidades WHERE usuario_id=?)").get(member).n,0);
    assert.ok(db.prepare("SELECT COUNT(*) n FROM visitante_acesso_historico").get().n>=6);
    // Grants survive switching storage; Drive's restriction still caps the access.
    await ok(await share(member));
    db.prepare("INSERT INTO visitante_drive(comunidade_id,usuario_id,estado) VALUES(1,?,'ACTIVE')").run(admin);
    const drivePermissions=await ok(await call('/api/pilot/visitantes/compartilhamento','GET',null,memberCookie));assert.equal(drivePermissions.canManage,false);
    await ok(await share(member,'EDIT'));
    assert.equal(db.prepare('SELECT papel FROM visitante_drive_acessos WHERE comunidade_id=1 AND usuario_id=?').get(member).papel,'EDIT');
    await ok(await share(member,undefined,'revoke'));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM visitante_drive_acessos WHERE usuario_id=?').get(member).n,0);
    assert.equal((await call(page,'GET',null,memberCookie)).status,403);
  } finally {db.close();}
});

test('Visitantes: avisos privados, histórico paginado, expiração, recuperação de falha e entrada pela comunidade correta',async()=>{
  const {database:db,d1}=await createPilotD1();
  try {
    const worker=(await import('../dist/server/index.js')).default;
    const env={DB:d1,AUTH_SECRET:'visitor-history-test-only',ASSETS:{fetch:async()=>new Response('',{status:404})}};
    const ctx={waitUntil(){},passThroughOnException(){}};
    const create=(nome,memberships)=>createPilotUser(db,{nome,email:`${nome}@history.test`,senha:'HistoryTest123',memberships});
    const admin=await create('admin',[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]);
    const member=await create('member',[{comunidadeId:1,papel:'MEMBRO'},{comunidadeId:2,papel:'MEMBRO'}]);
    const peer=await create('peer',[{comunidadeId:1,papel:'MEMBRO'}]);
    const outsider=await create('outsider',[{comunidadeId:2,papel:'ADMIN_COMUNIDADE'}]);
    const login=async name=>{const r=await worker.fetch(await cpfLoginRequest(env,new Request('https://localhost/api/auth/login',{method:'POST',body:new URLSearchParams({email:`${name}@history.test`,senha:'HistoryTest123'})})),env,ctx);assert.equal(r.status,303);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');};
    const adminCookie=await login('admin'),memberCookie=await login('member'),peerCookie=await login('peer'),outsiderCookie=await login('outsider');
    const call=(path,method='GET',body,cookie=adminCookie)=>worker.fetch(new Request('https://localhost'+path,{method,headers:{cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
    const endpoint='/api/pilot/visitantes/compartilhamento';
    const ok=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
    const share=(role='READ',userId=member)=>call(endpoint,'POST',{action:'grant',userId,role});
    const count=table=>db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
    const initial=await ok(await share());assert.equal(initial.changed,true);assert.equal(initial.notified,true);
    const firstHistory=count('visitante_acesso_historico');
    const notice=db.prepare("SELECT * FROM notificacoes_sistema WHERE criado_por='visitor-sharing'").get();
    assert.equal(notice.usuario_id,member);assert.equal(notice.comunidade_id,1);assert.equal(notice.remetente_usuario_id,admin);
    assert.match(notice.destino_rota,/section=compartilhar&comunidade=1/);
    assert.equal((await ok(await call('/api/pilot/notificacoes','GET',null,memberCookie))).notifications.find(n=>n.id===notice.id)?.destination,notice.destino_rota);
    for(const cookie of [peerCookie,outsiderCookie,adminCookie])assert.equal((await ok(await call('/api/pilot/notificacoes','GET',null,cookie))).notifications.some(n=>n.id===notice.id),false);
    assert.equal((await ok(await share())).changed,false);assert.equal(count('visitante_acesso_historico'),firstHistory);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM notificacoes_sistema WHERE criado_por='visitor-sharing'").get().n,1);
    // Simulated failure must roll back the permission and audit row as well as the notice.
    db.exec("CREATE TRIGGER fail_share_notice BEFORE INSERT ON notificacoes_sistema WHEN NEW.criado_por='visitor-sharing' BEGIN SELECT RAISE(ABORT,'simulated notification failure'); END");
    assert.equal((await share('EDIT')).status,503);
    assert.equal(db.prepare('SELECT papel FROM visitante_acessos WHERE usuario_id=?').get(member).papel,'READ');
    assert.equal(count('visitante_acesso_historico'),firstHistory);db.exec('DROP TRIGGER fail_share_notice');
    // A second manager changes the role between the read and the atomic batch.
    const batch=d1.batch.bind(d1);let conflict=true;
    d1.batch=async statements=>{if(conflict&&statements.some(s=>s.query.includes('INSERT INTO visitante_acesso_historico'))){conflict=false;db.prepare("UPDATE visitante_acessos SET papel='EDIT' WHERE usuario_id=?").run(member);}return batch(statements);};
    assert.equal((await share('EDIT')).status,409);d1.batch=batch;
    assert.equal(count('visitante_acesso_historico'),firstHistory);
    await ok(await share('READ'));
    await ok(await share('READ',peer));
    for(let i=0;i<23;i++)await ok(await share(i%2===0?'EDIT':'READ'));
    const page1=await ok(await call(endpoint));assert.equal(page1.history.length,20);assert.ok(page1.nextCursor);
    const page2=await ok(await call(`${endpoint}?history=1&before=${page1.nextCursor}`));assert.ok(page2.history.length);assert.equal(page2.nextCursor,null);
    assert.equal(new Set([...page1.history,...page2.history].map(h=>h.id)).size,count('visitante_acesso_historico'));
    const personal=await ok(await call(endpoint,'GET',null,peerCookie));assert.equal(personal.history.length,1);assert.equal(personal.history[0].membro,'peer');assert.deepEqual(personal.grants,[]);
    assert.deepEqual((await ok(await call(endpoint,'GET',null,outsiderCookie))).history,[]);
    assert.equal((await call(endpoint+'?before=-1')).status,400);
    // Exact 30-day boundary physically purges history and notices without deleting grants.
    db.prepare("UPDATE visitante_acesso_historico SET criado_em=datetime('now','-30 days') WHERE membro_id=?").run(peer);
    db.prepare("UPDATE notificacoes_sistema SET criado_em=datetime('now','-30 days') WHERE usuario_id=? AND criado_por='visitor-sharing'").run(peer);
    assert.deepEqual((await ok(await call(endpoint,'GET',null,peerCookie))).history,[]);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM visitante_acesso_historico WHERE membro_id=?').get(peer).n,0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM notificacoes_sistema WHERE usuario_id=? AND criado_por='visitor-sharing'").get(peer).n,0);
    assert.equal(db.prepare('SELECT papel FROM visitante_acessos WHERE usuario_id=?').get(peer).papel,'READ');
    // Migration blocker is explicit and creates neither a grant nor a notification.
    db.prepare("INSERT INTO visitante_drive(comunidade_id,usuario_id,estado) VALUES(1,?,'REVIEW')").run(admin);
    const beforeLocked=count('visitante_acesso_historico');assert.equal((await share('EDIT',peer)).status,409);
    assert.equal((await ok(await call(endpoint))).locked,true);assert.equal(count('visitante_acesso_historico'),beforeLocked);
    db.exec("UPDATE visitante_drive SET estado='ACTIVE' WHERE comunidade_id=1");
    await ok(await call('/api/pilot/visitantes/armazenamento','POST',{action:'grant',userId:peer,role:'EDIT'}));
    assert.equal(db.prepare('SELECT papel FROM visitante_acessos WHERE usuario_id=?').get(peer).papel,'EDIT');
    assert.equal(db.prepare('SELECT papel FROM visitante_drive_acessos WHERE usuario_id=?').get(peer).papel,'EDIT');
    // Older Drive-only grants gain the dashboard permission on their next save.
    db.prepare('DELETE FROM visitante_acessos WHERE usuario_id=?').run(peer);
    await ok(await call('/api/pilot/visitantes/armazenamento','POST',{action:'grant',userId:peer,role:'EDIT'}));
    assert.equal(db.prepare('SELECT papel FROM visitante_acessos WHERE usuario_id=?').get(peer).papel,'EDIT');
    await ok(await call(endpoint,'POST',{action:'revoke',userId:peer}));
    const removed=db.prepare("SELECT * FROM notificacoes_sistema WHERE usuario_id=? AND criado_por='visitor-sharing' ORDER BY id DESC LIMIT 1").get(peer);
    assert.match(removed.titulo,/removido/);assert.equal(removed.destino_rota,'/painel?view=inicio');
    db.exec('DELETE FROM visitante_drive');
    const switchResponse=await call('/api/pilot/comunidade-ativa','POST',{comunidadeId:2},memberCookie);assert.equal(switchResponse.status,200);
    const switchedCookie=memberCookie+'; '+switchResponse.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    const entry=await call('/painel/visitantes?section=compartilhar&comunidade=1','GET',null,switchedCookie);
    assert.equal(entry.status,200);assert.match(await entry.text(),/Abrir esta comunidade/);
    const denied=await call('/painel/visitantes?comunidade=1','GET',null,outsiderCookie);assert.match(await denied.text(),/compartilhamento não está disponível/);
    const auth=await call(notice.destino_rota,'GET',null,'');assert.equal(auth.status,307);assert.match(auth.headers.get('location'),/returnTo=.*comunidade/);
  } finally {db.close();}
});
