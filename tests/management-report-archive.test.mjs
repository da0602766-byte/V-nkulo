import assert from 'node:assert/strict';
import test from 'node:test';
import { roleFixture } from './helpers/role-audit.mjs';

test('management archive counts scheduled cells, pages historical results and exports only the permitted recorte', async t => {
  const f = await roleFixture();
  t.after(() => f.db.close());
  const owner = await f.account('ADMIN_COMUNIDADE', { communityOwner: true });
  const member = await f.account('MEMBRO');
  const other = await f.account('ADMIN_COMUNIDADE', { community: 2, communityOwner: true });
  const call = (actor,path) => f.call(path, { cookie: actor.cookie });
  const insertCell = f.db.prepare(`INSERT INTO celulas(comunidade_id,nome,responsavel,criado_por,ativo,escopo_confirmado)
    VALUES(?,?,'Liderança','qa',1,1)`);
  const cell = Number(insertCell.run(1,'Horizonte QA').lastInsertRowid);
  const missing = Number(insertCell.run(1,'Atrasada QA').lastInsertRowid);
  const outside = Number(insertCell.run(2,'Externa QA').lastInsertRowid);
  const date = '2026-08-21';
  const insertAgenda = f.db.prepare(`INSERT INTO celula_agenda(comunidade_id,celula_id,titulo,inicia_em,termina_em)
    VALUES(1,?,'Encontro',?,?)`);
  for (const id of [cell,missing]) insertAgenda.run(id,`${date}T19:00:00Z`,`${date}T21:00:00Z`);
  const insertReport = f.db.prepare(`INSERT INTO celula_relatorios(comunidade_id,celula_id,data_reuniao,presentes,observacoes)
    VALUES(?,?,?,?,?)`);
  for (let day = 1; day <= 21; day++) insertReport.run(1,cell,`2026-08-${String(day).padStart(2,'0')}`,6,'Nota autorizada');
  insertReport.run(2,outside,date,6,'Nota externa');
  const base = '/api/pilot/relatorios?from=2026-08-01&to=2026-08-30&area=cells';
  const summary = await (await call(owner,base)).json();
  assert.equal(summary.total,22);
  assert.equal(summary.rows.length,20);
  assert.deepEqual(summary.metrics,{expected:2,received:1,overdue:1,reviewing:0,correcting:0,attendance:126,meetings:21});
  const queue = await (await call(owner,`${base}&queue=1`)).json();
  assert.deepEqual(queue.rows.map(row => row.groupName),['Atrasada QA']);
  assert.equal((await (await call(owner,`${base}&page=2`)).json()).rows.length,2);
  assert.equal((await (await call(member,base)).json()).total,0);
  assert.equal((await (await call(other,base)).json()).total,1);
  const csv = await (await call(owner,`${base}&group=Horizonte&status=RECEBIDO&format=csv`)).text();
  assert.equal(csv.match(/Nota autorizada/g)?.length,21);
  assert.doesNotMatch(csv,/Atrasada QA|Nota externa/);

  const plan = { id:'qa-reporting',nome:'QA',valor_centavos:0,periodicidade:'UNICO',duracao_dias:null,ativo:true,
    modulos:['ministries','parking','cells'],recursos:[],limites:{usuarios:null,administradores:null,cadastros:null,celulas:null,ministerios:null} };
  f.db.prepare("INSERT INTO planos_plataforma(id,nome,valor_centavos,periodicidade) VALUES(?,?,0,'UNICO')").run(plan.id,plan.nome);
  f.db.prepare(`INSERT INTO assinaturas_comunidade(comunidade_id,plano_id,status,contrato,fundamento,aprovado_por)
    VALUES(1,?,'ATIVA',?,'GRATUITO',?)`).run(plan.id,JSON.stringify(plan),owner.id);
  for (const path of [base,'/api/pilot/central?view=reports','/api/pilot/estacionamento/relatorios','/api/pilot/pastoral-dashboard']) {
    assert.equal((await call(owner,path)).status,403,path);
  }
  assert.equal((await call(owner,'/api/pilot/central')).status,200);
  assert.equal((await call(owner,`/api/pilot/celulas/${cell}`)).status,200);
});
