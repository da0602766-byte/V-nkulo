import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';
const worker=(await import('../dist/server/index.js')).default;
const ctx={waitUntil(p){p.catch(()=>{});},passThroughOnException(){}};

test('parking personal view only returns the signed-in account reservations and preserves management scope',async()=>{
  const {database:db,d1}=await createPilotD1();
  const env={DB:d1,AUTH_SECRET:'parking-personal-test',ASSETS:{fetch:async()=>new Response('',{status:404})}};
  async function user(email,communityId,papel){
    const id=await createPilotUser(db,{nome:'Pessoa de teste',email,senha:'Teste123!',memberships:[{comunidadeId:communityId,papel}]});
    const request=await cpfLoginRequest(env,new Request('https://test.invalid/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'https://test.invalid'},body:JSON.stringify({email,senha:'Teste123!'})}));
    const response=await worker.fetch(request,env,ctx);assert.equal(response.status,200);
    return {id,cookie:response.headers.get('set-cookie').match(/__Host-adote_session=[^;]+/)[0]};
  }
  const admin=await user('parking-admin@test.invalid',1,'ADMIN_COMUNIDADE');
  const member=await user('parking-member@test.invalid',1,'MEMBRO');
  const other=await user('parking-other@test.invalid',2,'ADMIN_COMUNIDADE');
  function reservation(user,tenant,code){
    const sector=db.prepare("INSERT INTO estacionamento_setores(comunidade_id,nome) VALUES(?,?)").run(tenant,code).lastInsertRowid;
    const space=db.prepare("INSERT INTO estacionamento_vagas(comunidade_id,setor_id,codigo) VALUES(?,?,?)").run(tenant,sector,code).lastInsertRowid;
    db.prepare("INSERT INTO estacionamento_reservas(comunidade_id,vaga_id,usuario_id,nome_completo,email,documento_hash,documento_mascarado,inicio_em,fim_em,codigo) VALUES(?,?,?,'Pessoa teste','teste@example.invalid','test','***','2026-10-01T10:00:00Z','2026-10-01T12:00:00Z',?)").run(tenant,space,user.id,code);
  }
  reservation(admin,1,'VK-AAAA');reservation(member,1,'VK-BBBB');reservation(other,2,'VK-CCCC');
  async function get(user,query=''){
    const response=await worker.fetch(new Request('https://test.invalid/api/pilot/estacionamento/reservas'+query,{headers:{cookie:user.cookie}}),env,ctx);
    assert.equal(response.status,200);return response.json();
  }
  const own=await get(admin,'?scope=mine');assert.equal(own.canManage,false);assert.deepEqual(own.reservas.map(r=>r.codigo),['VK-AAAA']);
  const management=await get(admin);assert.equal(management.canManage,true);assert.equal(management.reservas.length,2);
  const memberView=await get(member,'?scope=all');assert.equal(memberView.canManage,false);assert.deepEqual(memberView.reservas.map(r=>r.codigo),['VK-BBBB']);
  assert.deepEqual((await get(other,'?scope=mine')).reservas.map(r=>r.codigo),['VK-CCCC']);
  db.close();
});
