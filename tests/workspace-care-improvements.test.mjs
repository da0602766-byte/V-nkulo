import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';

async function fixture() {
  const {database:db,d1}=await createPilotD1();
  const worker=(await import('../dist/server/index.js')).default;
  const env={DB:d1,AUTH_SECRET:'workspace-density-synthetic-test',ASSETS:{fetch:async()=>new Response('',{status:404})}};
  const ctx={waitUntil(p){p.catch(()=>{});},passThroughOnException(){}};
  const ids={},cookies={};
  for(const [name,community,role] of [['leader',1,'ADMIN_COMUNIDADE'],['member',1,'MEMBRO'],['other',1,'MEMBRO'],['foreign',2,'ADMIN_COMUNIDADE']]){
    ids[name]=await createPilotUser(db,{nome:name,email:name+'@ux.example.test',senha:'TesteDensidade123',memberships:[{comunidadeId:community,papel:role}]});
    const response=await worker.fetch(await cpfLoginRequest(env,new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:name+'@ux.example.test',senha:'TesteDensidade123'})})),env,ctx);
    assert.equal(response.status,200);
    cookies[name]=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  }
  async function call(user,path,body,method=body?'POST':'GET') {
    const response=await worker.fetch(new Request('http://localhost'+path,{method,headers:{cookie:cookies[user],'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env,ctx);
    return {status:response.status,data:await response.json()};
  }
  const scheduled=()=>worker.fetch(new Request('http://localhost/api/system/supabase-sync',{method:'POST',headers:{authorization:'Bearer '+createHash('sha256').update('vinkulo:supabase-schedule:v1:https://adote-gestao.da0602766.chatgpt.site:'+env.AUTH_SECRET).digest('hex')}}),env,ctx);
  return {db,ids,call,scheduled};
}

test('scheduled reminders work with the site closed and skip inactive memberships',async()=>{
  const {db,ids,call,scheduled}=await fixture();
  try {
    for(const user of ['member','other']) {
      await call(user,'/api/pilot/anotacoes',{titulo:'Lembrete agendado',lembreteEm:new Date(Date.now()+600000).toISOString()});
      db.prepare("UPDATE layouts_interface SET configuracao=json_set(configuracao,'$.notes[0].lembreteEm','2026-01-01T12:00:00.000Z') WHERE usuario_id=? AND escopo=?").run(ids[user],`care-notes:user:${ids[user]}`);
    }
    db.prepare("UPDATE usuario_comunidades SET status='INATIVO' WHERE usuario_id=?").run(ids.other);
    const response=await scheduled();
    assert.equal(response.status,200,await response.text());
    await scheduled();
    const rows=db.prepare("SELECT usuario_id FROM notificacoes_sistema WHERE criado_por='care-note-reminder'").all();
    assert.equal(rows.length,1); assert.equal(rows[0].usuario_id,ids.member);
  } finally {db.close();}
});

test('post-it reminder: private, optional, validated, delivered once and rearmable',async()=>{
  const {db,ids,call}=await fixture();
  try {
    const url='/api/pilot/anotacoes';
    assert.equal((await call('member',url,{titulo:'Sem lembrete'})).status,200);
    assert.equal((await call('member',url,{titulo:'Inválido',lembreteEm:'garbage'})).status,400);
    assert.equal((await call('member',url,{titulo:'Passado',lembreteEm:'2020-01-01T12:00:00Z'})).status,400);
    const reminder=new Date(Date.now()+600000).toISOString();
    const created=await call('member',url,{titulo:'Cuidado privado',texto:'Não expor no push',lembreteEm:reminder});
    assert.equal(created.status,200,JSON.stringify(created.data));
    const note=created.data.anotacao;
    assert.equal(note.lembreteEm,reminder);
    assert.equal((await call('other',url,{id:note.id,titulo:'Ataque'},'PATCH')).status,404);
    assert.equal((await call('foreign',url)).data.anotacoes.length,0);
    await call('member','/api/pilot/notificacoes');
    assert.equal(db.prepare("SELECT count(*) n FROM notificacoes_sistema WHERE criado_por='care-note-reminder'").get().n,0);
    const makeDue=()=>db.prepare("UPDATE layouts_interface SET configuracao=json_set(configuracao,'$.notes[0].lembreteEm','2026-01-01T12:00:00.000Z') WHERE usuario_id=? AND escopo=?").run(ids.member,`care-notes:user:${ids.member}`);
    makeDue();
    await call('other','/api/pilot/notificacoes');
    assert.equal(db.prepare("SELECT count(*) n FROM notificacoes_sistema WHERE criado_por='care-note-reminder'").get().n,0);
    await Promise.all([call('member','/api/pilot/notificacoes'),call('member','/api/pilot/notificacoes')]);
    let notices=db.prepare("SELECT * FROM notificacoes_sistema WHERE criado_por='care-note-reminder'").all();
    assert.equal(notices.length,1); assert.equal(notices[0].usuario_id,ids.member);
    assert.ok(notices[0].destino_rota.includes(encodeURIComponent(note.id)));
    assert.ok(!notices[0].mensagem.includes('Não expor'));
    const stored=(await call('member',url)).data.anotacoes[0];
    assert.ok(stored.lembreteEnviadoEm);
    const changed=await call('member',url,{id:note.id,lembreteEm:new Date(Date.now()+1200000).toISOString()},'PATCH');
    assert.equal(changed.status,200); assert.equal(changed.data.anotacao.lembreteEnviadoEm,null);
    makeDue(); await call('member','/api/pilot/notificacoes');
    assert.equal(db.prepare("SELECT count(*) n FROM notificacoes_sistema WHERE criado_por='care-note-reminder'").get().n,2);
    await call('member',url,{id:note.id,lembreteEm:null},'PATCH');
    assert.equal((await call('member',url)).data.anotacoes[0].lembreteEm,null);
  } finally {db.close();}
});

test('optional request location persists only with its protected request',async()=>{
  const {db,ids,call}=await fixture();
  try {
    const base={tipo:'VISITA',titulo:'Visita de cuidado',descricao:'Gostaria de receber uma visita da equipe.',visibilidade:'PRIVADA'};
    const created=await call('member','/api/pilot/solicitacoes',{...base,localizacao:'Bairro Exemplo, Rua de teste 42'});
    assert.equal(created.status,201,JSON.stringify(created.data));
    const row=db.prepare('SELECT descricao FROM solicitacoes_comunidade WHERE solicitante_id=? ORDER BY id DESC LIMIT 1').get(ids.member);
    assert.match(row.descricao,/Localização informada: Bairro Exemplo/);
    assert.equal((await call('member','/api/pilot/solicitacoes',base)).status,201);
    assert.equal((await call('member','/api/pilot/solicitacoes',{...base,descricao:'x',localizacao:'Texto longo não substitui a descrição'})).status,400);
    const other=await call('other','/api/pilot/solicitacoes');
    assert.ok(!JSON.stringify(other.data).includes('Rua de teste 42'));
  } finally {db.close();}
});

test('cell request notifies leaders, decision notifies requester without duplicate',async()=>{
  const {db,ids,call}=await fixture();
  try {
    const cell=Number(db.prepare("INSERT INTO celulas(comunidade_id,nome,responsavel,lider_usuario_id,escopo_confirmado,criado_por) VALUES(1,'Célula QA','leader',?,1,'leader@ux.example.test')").run(ids.leader).lastInsertRowid);
    const request=await call('member',`/api/pilot/celulas/${cell}`,{acao:'SOLICITACAO_CRIAR',autorizacaoContato:true,contato:'qa@example.test'},'PATCH');
    assert.equal(request.status,201,JSON.stringify(request.data));
    const leaderNotice=db.prepare("SELECT * FROM notificacoes_sistema WHERE titulo='Nova solicitação na célula' AND usuario_id=?").all(ids.leader);
    assert.equal(leaderNotice.length,1); assert.match(leaderNotice[0].destino_rota,/aba=solicitacoes/);
    const decision={acao:'SOLICITACAO_DECIDIR',solicitacaoId:request.data.id,status:'APROVADA'};
    assert.equal((await call('other',`/api/pilot/celulas/${cell}`,decision,'PATCH')).status,403);
    assert.equal((await call('leader',`/api/pilot/celulas/${cell}`,decision,'PATCH')).status,200);
    assert.equal((await call('leader',`/api/pilot/celulas/${cell}`,decision,'PATCH')).status,409);
    assert.equal(db.prepare("SELECT count(*) n FROM notificacoes_sistema WHERE titulo='Resposta à solicitação de célula' AND usuario_id=?").get(ids.member).n,1);
  } finally {db.close();}
});

test('parking overview includes vehicle bookings beyond queue pagination, hidden from members',async()=>{
  const {db,ids,call}=await fixture();
  try {
    const sector=Number(db.prepare("INSERT INTO estacionamento_setores(comunidade_id,nome) VALUES(1,'QA')").run().lastInsertRowid);
    const space=Number(db.prepare("INSERT INTO estacionamento_vagas(comunidade_id,setor_id,codigo) VALUES(1,?,'QA42')").run(sector).lastInsertRowid);
    for(let i=0;i<4;i++) db.prepare("INSERT INTO estacionamento_reservas(comunidade_id,vaga_id,usuario_id,nome_completo,email,telefone,placa_veiculo,tipo_veiculo,modelo_veiculo,cor_veiculo,documento_hash,documento_mascarado,inicio_em,fim_em,codigo,status) VALUES(1,?,?,'Pessoa de teste','qa@example.test','','QAQ1234','CARRO','Modelo QA','Prata','qa','***',?,?,?,'CONFIRMADA')")
      .run(space,ids.member,new Date(Date.now()+(i+1)*86400000).toISOString(),new Date(Date.now()+(i+1)*86400000+3600000).toISOString(),'QA-DENSITY-'+i);
    const overview=await call('leader','/api/pilot/estacionamento');
    assert.equal(overview.status,200,JSON.stringify(overview.data));
    const bookings=overview.data.reservasVagas.filter(r=>r.vaga_id===space);
    assert.equal(bookings.length,3,JSON.stringify({permissions:overview.data.permissions,context:overview.data.context,reservations:db.prepare("SELECT vaga_id,inicio_em,fim_em,datetime('now') n FROM estacionamento_reservas WHERE vaga_id=?").all(space)})); assert.equal(bookings[0].total,4); assert.equal(bookings[0].modelo_veiculo,'Modelo QA');
    const memberOverview=await call('member','/api/pilot/estacionamento');
    assert.equal(memberOverview.status,403); assert.equal(memberOverview.data.reservasVagas,undefined);
    assert.ok(!(await call('foreign','/api/pilot/estacionamento')).data.reservasVagas.some(r=>r.vaga_id===space));
  } finally {db.close();}
});
