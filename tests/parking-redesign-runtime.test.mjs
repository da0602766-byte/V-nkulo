import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';
const worker=(await import('../dist/server/index.js')).default;
const ctx={waitUntil(p){p.catch(()=>{});},passThroughOnException(){}};

async function setup(){
  const {database:db,d1}=await createPilotD1();
  // D1 serializes transactional batches; the in-memory adapter yields between statements.
  const originalBatch=d1.batch.bind(d1);let queue=Promise.resolve();
  d1.batch=statements=>{const result=queue.then(()=>originalBatch(statements));queue=result.catch(()=>{});return result;};
  const env={DB:d1,AUTH_SECRET:'parking-redesign-isolated-test',ASSETS:{fetch:async()=>new Response('',{status:404})}};
  async function user(name,tenant,role){
    const email=name+'@example.invalid';const id=await createPilotUser(db,{nome:name,email,senha:'Teste123!',memberships:[{comunidadeId:tenant,papel:role}]});
    const request=await cpfLoginRequest(env,new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,senha:'Teste123!'})}));
    const response=await worker.fetch(request,env,ctx);assert.equal(response.status,200);
    return {id,cookie:response.headers.get('set-cookie').match(/__Host-adote_session=[^;]+/)[0]};
  }
  const member=await user('Membro QA',1,'MEMBRO'),second=await user('Segundo QA',1,'MEMBRO'),admin=await user('Gestor QA',1,'ADMIN_COMUNIDADE'),other=await user('Outra Comunidade QA',2,'ADMIN_COMUNIDADE');
  const start=new Date(Date.now()-30*60_000).toISOString(),end=new Date(Date.now()+90*60_000).toISOString();
  const event=Number(db.prepare("INSERT INTO eventos_comunidade(comunidade_id,titulo,inicia_em,termina_em,status,publico) VALUES(1,'Atividade QA',?,?,'PUBLICADO',1)").run(start,end).lastInsertRowid);
  const sector=Number(db.prepare("INSERT INTO estacionamento_setores(comunidade_id,nome) VALUES(1,'Setor QA')").run().lastInsertRowid);
  const space=Number(db.prepare("INSERT INTO estacionamento_vagas(comunidade_id,setor_id,codigo,posicao_x,posicao_y) VALUES(1,?,'QA01',72,0)").run(sector).lastInsertRowid);
  const space2=Number(db.prepare("INSERT INTO estacionamento_vagas(comunidade_id,setor_id,codigo,posicao_x,posicao_y,tipo) VALUES(1,?,'QA02',144,0,'PCD')").run(sector).lastInsertRowid);
  const base={vagaId:space,eventoId:event,nomeCompleto:'Pessoa Sintética QA',email:'pessoa@example.invalid',telefone:'47999998888',placaVeiculo:'QAQ1A23',tipoVeiculo:'CARRO',modeloVeiculo:'Modelo QA',corVeiculo:'Prata',inicioEm:start,fimEm:end,requestId:crypto.randomUUID()};
  async function call(user,path='',method='GET',body){
    const response=await worker.fetch(new Request('http://localhost/api/pilot/estacionamento'+path,{method,headers:{...(user?{cookie:user.cookie}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
    return {status:response.status,body:await response.json()};
  }
  return {db,env,member,second,admin,other,event,sector,space,space2,base,call};
}

test('Configurador recebe setores vazios ativos da própria comunidade e consegue criar as primeiras vagas',async t=>{
  const f=await setup();t.after(()=>f.db.close());
  const created=await f.call(f.admin,'/mapa','POST',{action:'CRIAR_SETOR',nome:'Setor vazio QA',cor:'#6542aa',ordem:3});
  assert.equal(created.status,201,JSON.stringify(created));
  const inactive=Number(f.db.prepare("INSERT INTO estacionamento_setores(comunidade_id,nome,ativo) VALUES(1,'Setor inativo QA',0)").run().lastInsertRowid);
  const outside=Number(f.db.prepare("INSERT INTO estacionamento_setores(comunidade_id,nome) VALUES(2,'Setor de outra comunidade')").run().lastInsertRowid);
  const data=await f.call(f.admin);
  assert.equal(data.status,200);
  assert.ok(data.body.setores.some(s=>s.id===created.body.id && s.nome==='Setor vazio QA'));
  assert.equal(data.body.vagas.some(v=>v.setor_id===created.body.id),false);
  assert.equal(data.body.setores.some(s=>s.id===inactive||s.id===outside),false);
  assert.equal((await f.call(f.member,'/disponibilidade')).body.setores,undefined);
  const spaces=await f.call(f.admin,'/mapa','POST',{action:'CRIAR_VAGAS',setorId:created.body.id,prefixo:'NOV',quantidade:2,tipo:'COMUM'});
  assert.equal(spaces.status,201,JSON.stringify(spaces));
  assert.equal((await f.call(f.admin)).body.vagas.filter(v=>v.setor_id===created.body.id).length,2);
});

test('P0: reservas concorrentes, retry idempotente, evento obrigatório e abertura no servidor',async t=>{
  const f=await setup();t.after(()=>f.db.close());
  assert.equal((await f.call(f.member,'/reservas','POST',{...f.base,eventoId:''})).status,400);
  f.db.prepare('UPDATE eventos_comunidade SET reservas_abrem_em=? WHERE id=?').run(new Date(Date.now()+60_000).toISOString(),f.event);
  assert.equal((await f.call(f.member,'/reservas','POST',f.base)).status,409);
  f.db.prepare('UPDATE eventos_comunidade SET reservas_abrem_em=NULL WHERE id=?').run(f.event);
  const results=await Promise.all([f.call(f.member,'/reservas','POST',f.base),f.call(f.second,'/reservas','POST',{...f.base,requestId:crypto.randomUUID()})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM estacionamento_reservas WHERE vaga_id=?').get(f.space).n,1);
  const winner=results[0].status===201?f.member:f.second;
  if(winner===f.member){
    const replay=await f.call(winner,'/reservas','POST',f.base);assert.equal(replay.status,200);assert.equal(replay.body.id,results[0].body.id);
    assert.equal((await f.call(winner,'/reservas','POST',{...f.base,corVeiculo:'Azul'})).status,409);
  }
  const anotherEvent=Number(f.db.prepare("INSERT INTO eventos_comunidade(comunidade_id,titulo,inicia_em,termina_em,status,publico) VALUES(1,'Evento sobreposto QA',?,?,'PUBLICADO',1)").run(f.base.inicioEm,f.base.fimEm).lastInsertRowid);
  assert.equal((await f.call(f.member,'/reservas','POST',{...f.base,eventoId:anotherEvent,requestId:crypto.randomUUID()})).status,409);
  const adjacent=await f.call(f.member,'/reservas','POST',{...f.base,inicioEm:f.base.fimEm,fimEm:new Date(Date.parse(f.base.fimEm)+3600000).toISOString(),requestId:crypto.randomUUID()});
  assert.equal(adjacent.status,201,JSON.stringify(adjacent));
});

test('P0: privacidade, isolamento, cancelamento próprio e negação após entrada',async t=>{
  const f=await setup();t.after(()=>f.db.close());
  const created=await f.call(f.member,'/reservas','POST',f.base);assert.equal(created.status,201,JSON.stringify(created));
  assert.equal((await f.call(null,'/disponibilidade')).status,401);
  assert.equal((await f.call(f.second,'/reservas','PATCH',{id:created.body.id,acao:'CANCELAR_PROPRIA'})).status,404);
  assert.equal((await f.call(f.other,'/reservas','PATCH',{id:created.body.id,acao:'CONFIRMAR'})).status,404);
  assert.equal((await f.call(f.member,'/reservas','PATCH',{id:created.body.id,acao:'CONFIRMAR'})).status,403);
  const map=await f.call(f.second,'/disponibilidade?eventoId='+f.event);assert.equal(map.status,200);
  assert.equal(map.body.vagas.find(v=>v.id===f.space).reservada,1);
  for(const space of map.body.vagas)for(const key of ['usuario_id','nome_completo','placa_veiculo','telefone','email','codigo_reserva','observacoes'])assert.equal(space[key],undefined);
  assert.equal((await f.call(f.member,'/reservas','PATCH',{id:created.body.id,acao:'CANCELAR_PROPRIA'})).status,200);
  assert.equal(f.db.prepare('SELECT status FROM estacionamento_reservas WHERE id=?').get(created.body.id).status,'CANCELADA');
  const next=await f.call(f.member,'/reservas','POST',{...f.base,requestId:crypto.randomUUID()});assert.equal(next.status,201);
  assert.equal((await f.call(f.admin,'/reservas','PATCH',{id:next.body.id,acao:'CONFIRMAR'})).status,200);
  assert.equal((await f.call(f.admin,'/reservas','PATCH',{id:next.body.id,acao:'CHECKIN',eventoId:f.event+999})).status,409);
  const entries=await Promise.all([f.call(f.admin,'/reservas','PATCH',{id:next.body.id,acao:'CHECKIN'}),f.call(f.admin,'/reservas','PATCH',{id:next.body.id,acao:'CHECKIN'})]);
  assert.deepEqual(entries.map(r=>r.status).sort(),[200,409]);
  assert.equal((await f.call(f.member,'/reservas','PATCH',{id:next.body.id,acao:'CANCELAR_PROPRIA'})).status,409);
  assert.equal((await f.call(f.member,'/reservas','DELETE',{id:next.body.id})).status,409);
  const movement=f.db.prepare("SELECT id FROM estacionamento_movimentacoes WHERE vaga_id=? AND status='NO_LOCAL'").all(f.space);assert.equal(movement.length,1);
  assert.equal((await f.call(f.admin,'/'+movement[0].id,'PATCH')).status,200);
  const exitAt=f.db.prepare('SELECT saida_em FROM estacionamento_movimentacoes WHERE id=?').get(movement[0].id).saida_em;
  assert.equal((await f.call(f.admin,'/'+movement[0].id,'PATCH')).status,200);
  assert.equal(f.db.prepare('SELECT saida_em FROM estacionamento_movimentacoes WHERE id=?').get(movement[0].id).saida_em,exitAt);
  assert.equal(f.db.prepare('SELECT status FROM estacionamento_vagas WHERE id=?').get(f.space).status,'LIVRE');
});

test('P0/P1: editor detecta sobreposição, versão obsoleta e comunidade; filtros/paginação reais',async t=>{
  const f=await setup();t.after(()=>f.db.close());
  const position={action:'ATUALIZAR_POSICAO',vagaId:f.space,posicaoX:72,posicaoY:72,previousX:72,previousY:0};
  assert.equal((await f.call(f.member,'/mapa','PATCH',position)).status,403);
  assert.equal((await f.call(f.other,'/mapa','PATCH',position)).status,409);
  const saved=await f.call(f.admin,'/mapa','PATCH',position);assert.equal(saved.status,200,JSON.stringify(saved));
  assert.equal((await f.call(f.admin,'/mapa','PATCH',{...position,posicaoY:144})).status,409);
  assert.equal((await f.call(f.admin,'/mapa','PATCH',{...position,previousY:72,posicaoX:144,posicaoY:0})).status,409);
  assert.equal((await f.call(f.admin,'/mapa','PATCH',{...position,posicaoX:-1})).status,400);
  for(let n=0;n<85;n++)f.db.prepare("INSERT INTO estacionamento_reservas(comunidade_id,vaga_id,usuario_id,evento_id,nome_completo,email,telefone,placa_veiculo,documento_hash,documento_mascarado,inicio_em,fim_em,codigo,status) VALUES(1,?,?,?,'Histórico QA','qa@example.invalid','','HIS1A23','test','***',?,? ,?,'CANCELADA')").run(f.space,f.member.id,f.event,f.base.inicioEm,f.base.fimEm,'VK-HIST'+n);
  const page=await f.call(f.admin,'/reservas?q=HIS1A23&status=CANCELADA&page=3&pageSize=40');assert.equal(page.status,200);assert.equal(page.body.total,85);assert.equal(page.body.reservas.length,5);
  assert.equal((await f.call(f.second,'/reservas?q=HIS1A23')).body.total,0);
  assert.equal((await f.call(f.other,'/reservas?q=HIS1A23')).body.total,0);
  const map=await f.call(f.member,'/disponibilidade?eventoId='+f.event);assert.equal(map.body.vagas.find(v=>v.id===f.space).posicao_y,72);
  assert.equal(map.body.stats.total,map.body.stats.livres+map.body.stats.ocupadas+map.body.stats.reservadas+map.body.stats.indisponiveis);
});

test('P0: entrada manual concorrente, permanência além da janela e revogação de vínculo',async t=>{
  const f=await setup();t.after(()=>f.db.close());
  const input={vagaId:f.space,placa:'MAN1A23',responsavel:'Pessoa QA',tipoVeiculo:'CARRO',vinculo:'MEMBRO'};
  const entered=await Promise.all([f.call(f.admin,'','POST',input),f.call(f.admin,'','POST',{...input,vagaId:f.space2})]);
  assert.deepEqual(entered.map(r=>r.status).sort(),[201,409]);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM estacionamento_movimentacoes WHERE placa='MAN1A23' AND status='NO_LOCAL'").get().n,1);
  assert.equal((await f.call(f.admin,'/99999999','PATCH')).status,404);
  const occupied=f.db.prepare("SELECT vaga_id FROM estacionamento_movimentacoes WHERE placa='MAN1A23'").get().vaga_id;
  f.db.prepare("UPDATE estacionamento_movimentacoes SET entrada_em=datetime('now','-2 days') WHERE vaga_id=?").run(occupied);
  const map=await f.call(f.member,'/disponibilidade?eventoId='+f.event);
  assert.equal(map.body.vagas.find(s=>s.id===occupied).status,'OCUPADA');
  assert.equal((await f.call(f.member,'/reservas','POST',{...f.base,vagaId:occupied})).status,409);
  f.db.prepare("UPDATE usuario_comunidades SET status='REMOVIDO' WHERE usuario_id=?").run(f.member.id);
  assert.equal((await f.call(f.member,'/reservas','POST',{...f.base,vagaId:f.space2})).status,403);
});

test('P0: edição em lote é integral; setor não sobrescreve versão de outro gestor',async t=>{
  const f=await setup();t.after(()=>f.db.close());
  const first={vagaId:f.space,posicaoX:72,posicaoY:100,previousX:72,previousY:0};
  const second={vagaId:f.space2,posicaoX:144,posicaoY:100,previousX:144,previousY:99};
  assert.equal((await f.call(f.admin,'/mapa','PATCH',{action:'ATUALIZAR_POSICOES',positions:[first,second]})).status,409);
  assert.equal(f.db.prepare('SELECT posicao_y FROM estacionamento_vagas WHERE id=?').get(f.space).posicao_y,0);
  second.previousY=0;
  assert.equal((await f.call(f.admin,'/mapa','PATCH',{action:'ATUALIZAR_POSICOES',positions:[first,second]})).status,200);
  const original=f.db.prepare('SELECT * FROM estacionamento_setores WHERE id=?').get(f.sector);
  const rename={action:'ATUALIZAR_SETOR',setorId:f.sector,nome:'Setor editado QA',cor:original.cor,ordem:original.ordem,previousNome:original.nome,previousCor:original.cor,previousOrdem:original.ordem};
  assert.equal((await f.call(f.admin,'/mapa','PATCH',rename)).status,200);
  assert.equal((await f.call(f.admin,'/mapa','PATCH',{...rename,nome:'Sobrescrita obsoleta QA'})).status,409);
});

test('P1: relatório usa totais persistidos, histórico é paginado e notificação não desfaz reserva',async t=>{
  const f=await setup();t.after(()=>f.db.close());
  f.db.exec('DELETE FROM estacionamento_movimentacoes WHERE comunidade_id=1');
  const ministry=Number(f.db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,categoria,responsavel_usuario_id) VALUES(1,'Equipe QA','ESTACIONAMENTO',?)").run(f.admin.id).lastInsertRowid);
  const shift=Number(f.db.prepare("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status) VALUES(1,?,'Plantão QA',?,?,'PUBLICADA')").run(ministry,f.base.inicioEm,f.base.fimEm).lastInsertRowid);
  const report=Number(f.db.prepare('INSERT INTO estacionamento_relatorios_escala(comunidade_id,escala_id,usuario_id) VALUES(1,?,?)').run(shift,f.admin.id).lastInsertRowid);
  for(let n=0;n<85;n++)f.db.prepare("INSERT INTO estacionamento_movimentacoes(comunidade_id,vaga_id,placa,responsavel,tipo_veiculo,vinculo,status,entrada_em,saida_em,criado_por,atualizado_por) VALUES(1,?,'HIS1A23','Histórico QA','CARRO','MEMBRO','ENCERRADA',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?)").run(f.space,f.admin.id,f.admin.id);
  const posted=await f.call(f.admin,'/relatorios','PATCH',{id:report,acao:'ENVIAR',resumo:'Resumo QA',entradas:9999,saidas:0,ocorrencias:9999});assert.equal(posted.status,200,JSON.stringify(posted));
  const saved=f.db.prepare('SELECT entradas,saidas,ocorrencias FROM estacionamento_relatorios_escala WHERE id=?').get(report);
  assert.deepEqual({...saved},{entradas:85,saidas:85,ocorrencias:0});
  const page=await f.call(f.admin,'/movimentacoes?q=HIS1A23&status=ENCERRADA&page=3');assert.equal(page.body.total,85);assert.equal(page.body.movimentacoes.length,5);
  assert.equal((await f.call(f.member,'/movimentacoes')).status,403);
  assert.equal((await f.call(f.other,'/movimentacoes?q=HIS1A23')).body.total,0);
  f.db.exec("CREATE TRIGGER qa_notification_failure BEFORE INSERT ON notificacoes_sistema BEGIN SELECT RAISE(ABORT,'QA notification failure'); END");
  const created=await f.call(f.member,'/reservas','POST',f.base);assert.equal(created.status,201,JSON.stringify(created));assert.equal(created.body.notificationWarning,true);
  assert.equal(f.db.prepare('SELECT status FROM estacionamento_reservas WHERE id=?').get(created.body.id).status,'PENDENTE');
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM auditoria_piloto WHERE evento='ESTACIONAMENTO_NOTIFICACAO_FALHOU'").get().n,1);
});

test('P1: disponibilidade com 600 vagas e 5.000 reservas históricas permanece íntegra',async t=>{
  const f=await setup();t.after(()=>f.db.close());
  for(let n=0;n<598;n++)f.db.prepare("INSERT INTO estacionamento_vagas(comunidade_id,setor_id,codigo,posicao_x,posicao_y) VALUES(1,?,?,?,?)").run(f.sector,'PERF'+n,(n%30)*76,100+Math.floor(n/30)*72);
  for(let n=0;n<5000;n++)f.db.prepare("INSERT INTO estacionamento_reservas(comunidade_id,vaga_id,usuario_id,evento_id,nome_completo,email,documento_hash,documento_mascarado,inicio_em,fim_em,codigo,status) VALUES(1,?,?,?,'Histórico QA','qa@example.invalid','test','***',?,?,?,'CANCELADA')").run(f.space,f.member.id,f.event,f.base.inicioEm,f.base.fimEm,'VK-PERF'+n);
  const started=performance.now();const map=await f.call(f.member,'/disponibilidade?eventoId='+f.event);
  t.diagnostic(`600 vagas / 5.000 reservas: ${Math.round(performance.now()-started)} ms no SQLite local (não representa rede/D1 de produção)`);
  assert.equal(map.status,200);assert.equal(map.body.vagas.filter(s=>s.setor_id===f.sector).length,600);
  assert.equal(map.body.vagas.find(s=>s.id===f.space).reservada,0);
  assert.equal((await f.call(f.member,'/reservas?page=125')).body.reservas.length,40);
});

test('P0: falha de auditoria reverte a reserva; retry confirmado tem um único efeito',async t=>{
  const f=await setup();t.after(()=>f.db.close());
  f.db.exec("CREATE TRIGGER qa_audit_failure BEFORE INSERT ON auditoria_piloto WHEN NEW.evento='ESTACIONAMENTO_RESERVA_CRIADA' BEGIN SELECT RAISE(ABORT,'QA audit failure'); END");
  const failed=await f.call(f.member,'/reservas','POST',f.base).catch(()=>({status:500}));
  assert.equal(failed.status,500);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM estacionamento_reservas WHERE vaga_id=?').get(f.space).n,0);
  f.db.exec('DROP TRIGGER qa_audit_failure');
  assert.equal((await f.call(f.member,'/reservas','POST',f.base)).status,201);
  assert.equal((await f.call(f.member,'/reservas','POST',f.base)).status,200);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM auditoria_piloto WHERE evento='ESTACIONAMENTO_RESERVA_CRIADA'").get().n,1);
});
