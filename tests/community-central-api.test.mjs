import assert from 'node:assert/strict';
import test from 'node:test';
import { centralFixture } from './community-central.test.mjs';
import { createPilotUser } from './helpers/sqlite-d1.mjs';
import { cpfLoginRequest } from './helpers/cpf-login.mjs';

test('Rotas reais da Central e Pessoas respeitam autenticação, escopo e filtros', async () => {
  const f = await centralFixture();
  const worker = (await import('../dist/server/index.js?central-api')).default;
  const runtime = { DB:f.d1, AUTH_SECRET:'central-integration-test-only', ASSETS:{fetch:async()=>new Response('Not found',{status:404})} };
  const ctx = {waitUntil(){},passThroughOnException(){}};
  async function login(name) {
    const response = await worker.fetch(await cpfLoginRequest(runtime,new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'text/html'},body:new URLSearchParams({email:name+'@example.test',senha:'Teste123456'})})),runtime,ctx);
    assert.equal(response.status,303);
    const cookie=response.headers.getSetCookie().map(v=>v.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
    assert.ok(cookie); return cookie;
  }
  const get=(path,cookie)=>worker.fetch(new Request('http://localhost'+path,{headers:cookie?{cookie}:{}}),runtime,ctx);
  try {
    assert.notEqual((await get('/api/pilot/central')).status,200);
    const member=await login('Membro'), leader=await login('Lider'), pastor=await login('Pastor');
    const response=await get('/api/pilot/central?days=7&role=PASTOR&communityId='+f.otherCid,member);
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    const m=await response.json();assert.equal(m.community.id,f.cid);assert.equal(m.scope,'personal');assert.equal(m.errors.length,0);assert.equal(m.cellReports.length,0);assert.ok(m.ministries.every(v=>v.volunteers===null));
    const l=await (await get('/api/pilot/central',leader)).json();assert.equal(l.scope,'leadership');assert.equal(l.ministries.length,1);assert.equal(l.ministries[0].id,f.louvor);
    const p=await (await get('/api/pilot/central',pastor)).json();assert.equal(p.scope,'community');assert.equal(p.errors.length,0);assert.equal(p.ministries.length,2);
    const personal=await (await get('/api/pilot/central?scope=me',pastor)).json();assert.equal(personal.scope,'personal');assert.equal(personal.cellReports.length,0);
    assert.equal((await get('/api/pilot/central?days=999',pastor)).status,400);
    const outsider=await createPilotUser(f.db,{nome:'Sem ministério',email:'semministerio@example.test',senha:'Teste123456',memberships:[{comunidadeId:f.cid,papel:'MEMBRO'}]});
    const noMinistry=await get('/api/pilot/pessoas?aba=todos&vinculo=sem-ministerio',pastor);assert.equal(noMinistry.status,200);
    const people=await noMinistry.json();assert.equal(people.people.length,1);assert.equal(people.people[0].usuario_id,outsider);
    f.db.prepare("UPDATE escalas_ministerio SET termina_em='2999-12-31T23:59:00Z' WHERE id IN (?,?)").run(f.next,f.otherNext);
    const scheduled=await get('/api/pilot/pessoas?aba=todos&vinculo=com-escala',pastor);assert.equal(scheduled.status,200);assert.ok((await scheduled.json()).people.length>0);
    assert.equal((await get('/api/pilot/pessoas?aba=todos&vinculo=sem-titulo',pastor)).status,200);
    assert.equal((await get('/api/pilot/pessoas?vinculo=invalido',pastor)).status,400);
    const self=await (await get('/api/pilot/pessoas?aba=todos',member)).json();assert.equal(self.canViewPeople,false);assert.equal(self.people.length,0);
    f.db.prepare("UPDATE usuario_comunidades SET status='REMOVIDO' WHERE usuario_id=?").run(f.member);
    assert.equal((await get('/api/pilot/central',member)).status,403);
    const activePeople=await (await get('/api/pilot/pessoas?aba=todos',pastor)).json();
    assert.ok(!activePeople.people.some(person=>person.usuario_id===f.member));
    const activeCentral=await (await get('/api/pilot/central',pastor)).json();
    assert.equal(activePeople.counts.membros+activePeople.counts.oficiais,activeCentral.metrics.find(metric=>metric.label==='Pessoas vinculadas').value);
  } finally {f.db.close();}
});
