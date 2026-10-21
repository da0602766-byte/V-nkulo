import assert from 'node:assert/strict';
import test from 'node:test';
import {createPilotD1, createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';

test('ministry removal enforces ownership and scoped leadership, preserves history and blocks future assignments', async () => {
  const {database: db, d1} = await createPilotD1();
  const tasks = [];
  const ctx = {waitUntil(p) { tasks.push(p); }, passThroughOnException() {}};
  const env = {DB: d1, AUTH_SECRET: 'ministry-removal-test', ASSETS: {fetch: async () => new Response('', {status:404})}};
  const worker = (await import('../dist/server/index.js')).default;
  let ip = 1;
  const call = (path, cookie, method = 'GET', body) => worker.fetch(new Request('https://test.invalid' + path, {
    method, headers: {cookie, origin:'https://test.invalid', 'content-type':'application/json', 'cf-connecting-ip':`192.0.2.${ip++}`},
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, ctx);
  async function user(name, role, community = 1) {
    const email = name + '@example.test';
    const id = await createPilotUser(db, {nome:name, email, senha:'Teste123!', memberships:[{comunidadeId:community,papel:role}]});
    const request = await cpfLoginRequest(env, new Request('https://test.invalid/api/auth/login', {method:'POST', headers:{'content-type':'application/json','cf-connecting-ip':`192.0.2.${ip++}`}, body:JSON.stringify({email,senha:'Teste123!'})}));
    const response = await worker.fetch(request, env, ctx);
    assert.equal(response.status,200,await response.clone().text());
    return {id, cookie:response.headers.get('set-cookie').match(/__Host-adote_session=[^;]+/)[0]};
  }
  try {
    const owner = await user('owner','MEMBRO');
    db.prepare('UPDATE comunidades SET proprietario_usuario_id=? WHERE id=1').run(owner.id);
    const leader = await user('leader','LIDER');
    const coLeader = await user('coleader','LIDER');
    const otherLeader = await user('otherleader','LIDER');
    const pastor = await user('pastor','PASTOR');
    const admin = await user('admin','ADMIN_COMUNIDADE');
    const member = await user('member','MEMBRO');
    const outsider = await user('outsider','ADMIN_COMUNIDADE',2);
    const ministry = Number(db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,categoria,status,responsavel_usuario_id) VALUES(1,'Remoção teste','LOUVOR','ATIVO',?)").run(leader.id).lastInsertRowid);
    const otherMinistry = Number(db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,categoria,status,responsavel_usuario_id) VALUES(1,'Outro ministério','MIDIA','ATIVO',?)").run(otherLeader.id).lastInsertRowid);
    const add = (u, role='VOLUNTARIO', m=ministry) => Number(db.prepare("INSERT INTO ministerio_voluntarios(comunidade_id,ministerio_id,usuario_id,funcao,papel,ativo) VALUES(1,?,?,'Apoio',?,1)").run(m,u.id,role).lastInsertRowid);
    const target = add(member);
    const leaderVolunteer = add(leader,'LIDER');
    const coLeaderVolunteer = add(coLeader,'LIDER');
    add(otherLeader,'LIDER',otherMinistry);
    const remove = (actor, id=target, m=ministry) => call('/api/pilot/ministerios/'+m,actor.cookie,'PATCH',{acao:'REMOVER_VOLUNTARIO',voluntarioId:id});
    for (const actor of [pastor,admin,otherLeader,member]) {
      assert.equal((await remove(actor)).status,403);
    }
    assert.equal((await remove(outsider)).status,404);
    assert.equal((await remove({cookie:''})).status,401);
    for (const [actor, expected] of [[owner,1],[leader,1],[coLeader,1],[pastor,0],[admin,0]]) {
      const response = await call('/api/pilot/ministerios',actor.cookie);
      assert.equal(response.status,200,await response.clone().text());
      const item = (await response.json()).ministerios.find(m=>m.id===ministry);
      assert.ok(item, `Ministry missing for actor ${actor.id}`);
      assert.equal(item.can_remove_members,expected);
    }
    assert.equal((await remove(leader,coLeaderVolunteer)).status,403);
    assert.equal((await remove(owner,leaderVolunteer)).status,409);
    assert.equal((await remove(owner,-1)).status,400);
    assert.equal((await remove(owner,999999)).status,404);
    assert.equal((await remove(owner,target,otherMinistry)).status,404);
    const schedule = Number(db.prepare("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status) VALUES(1,?,'Teste','2099-01-01T18:00:00Z','2099-01-01T20:00:00Z','PUBLICADA')").run(ministry).lastInsertRowid);
    db.prepare("INSERT INTO escala_designacoes(comunidade_id,escala_id,voluntario_id,usuario_id,funcao,status,ativo) VALUES(1,?,?,?,'Apoio','CONFIRMADA',1)").run(schedule,target,member.id);
    assert.equal((await remove(leader)).status,409);
    db.prepare("UPDATE escalas_ministerio SET status='ENCERRADA',inicia_em='2020-01-01T18:00:00Z',termina_em='2020-01-01T20:00:00Z' WHERE id=?").run(schedule);
    const team = Number(db.prepare("INSERT INTO ministerio_equipes(comunidade_id,ministerio_id,nome) VALUES(1,?,'Equipe teste')").run(ministry).lastInsertRowid);
    db.prepare('INSERT INTO ministerio_equipe_membros(comunidade_id,ministerio_id,equipe_id,voluntario_id) VALUES(1,?,?,?)').run(ministry,team,target);
    const response = await remove(coLeader);
    assert.equal(response.status,200,await response.clone().text());
    assert.equal(db.prepare('SELECT ativo FROM ministerio_voluntarios WHERE id=?').get(target).ativo,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_designacoes WHERE voluntario_id=?').get(target).n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM ministerio_equipe_membros WHERE voluntario_id=?').get(target).n,0);
    assert.equal(db.prepare('SELECT status FROM usuario_comunidades WHERE usuario_id=? AND comunidade_id=1').get(member.id).status,'ATIVO');
    assert.equal((await remove(owner)).status,404);
    assert.equal((await remove(owner,coLeaderVolunteer)).status,200);
    assert.equal((await remove(coLeader,leaderVolunteer)).status,403);
  } finally {
    await Promise.allSettled(tasks);
    db.close();
  }
});
