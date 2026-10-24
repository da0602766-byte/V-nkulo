import assert from 'node:assert/strict';
import {createPilotD1, createPilotUser} from './sqlite-d1.mjs';
import {cpfLoginRequest} from './cpf-login.mjs';

export async function roleFixture() {
  const {database: db, d1} = await createPilotD1();
  const worker = (await import('../../dist/server/index.js')).default;
  const env = {DB:d1, AUTH_SECRET:'isolated-role-audit-only', SYSTEM_OWNER_EMAIL:'owner@audit.invalid', SYSTEM_OWNER_LOCKED_BEFORE:'2099-01-01', ASSETS:{fetch:async()=>new Response('',{status:404})}};
  const context = {waitUntil(p){p.catch(()=>{});},passThroughOnException(){}};
  let serial = 0;
  async function call(path, {cookie='', method='GET', body}={}) {
    return worker.fetch(new Request(`https://audit.invalid${path}`, {method, headers:{cookie,origin:'https://audit.invalid','content-type':'application/json','cf-connecting-ip':`192.0.2.${++serial%200+1}`},body:body===undefined?undefined:JSON.stringify(body)}),env,context);
  }
  async function account(role, {perfil='ACOMPANHANTE', owner=false, communityOwner=false, community=1}={}) {
    const email=owner?env.SYSTEM_OWNER_EMAIL:`person-${++serial}@audit.invalid`;
    const id=await createPilotUser(db,{nome:`Teste ${role}`,email,senha:'AuditOnly123!',perfil,memberships:[{comunidadeId:community,papel:role}]});
    if(communityOwner) db.prepare('UPDATE comunidades SET proprietario_usuario_id=? WHERE id=?').run(id,community);
    const request=await cpfLoginRequest(env,new Request('https://audit.invalid/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,senha:'AuditOnly123!'})}));
    const response=await worker.fetch(request,env,context);
    assert.equal(response.status,200,await response.clone().text());
    const cookie=response.headers.getSetCookie().map(x=>x.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
    assert.ok(cookie);
    const membership=db.prepare('SELECT id FROM usuario_comunidades WHERE usuario_id=? AND comunidade_id=?').get(id,community).id;
    return {id,email,cookie,membership};
  }
  return {db,env,call,account,worker,context};
}
