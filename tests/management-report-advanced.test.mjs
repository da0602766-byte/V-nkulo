import assert from 'node:assert/strict';
import test from 'node:test';
import * as xlsx from 'xlsx';
import { roleFixture } from './helpers/role-audit.mjs';

test('report comparison uses adjacent intervals and produces an XLSX with summary and filtered records', async t => {
  const f = await roleFixture();
  t.after(() => f.db.close());
  const owner = await f.account('ADMIN_COMUNIDADE',{ communityOwner:true });
  const cell = Number(f.db.prepare(`INSERT INTO celulas(comunidade_id,nome,responsavel,criado_por,escopo_confirmado)
    VALUES(1,'Célula QA','Gestor','qa',1)`).run().lastInsertRowid);
  const report = f.db.prepare('INSERT INTO celula_relatorios(comunidade_id,celula_id,data_reuniao,aconteceu,presentes) VALUES(1,?,?,1,?)');
  report.run(cell,'2026-08-12',15); report.run(cell,'2026-08-03',5);
  f.db.prepare(`INSERT INTO visitantes(comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado,tipo_pessoa,status)
    VALUES(1,'Pessoa QA','2026-08-12','qa',1,'VISITANTE','INTEGRADO')`).run();
  const get = query => f.call(`/api/pilot/relatorios?from=2026-08-10&to=2026-08-19&area=cells&${query}`,{ cookie:owner.cookie });
  const result = await (await get('compare=1')).json();
  assert.equal(result.metrics.attendance,15);
  assert.equal(result.comparison.previous.metrics.attendance,5);
  assert.equal(result.comparison.previous.period.from,'2026-07-31');
  assert.ok(result.comparison.visitors.current.registered >= 1);
  assert.ok(result.comparison.visitors.current.integrated >= 1);
  const response = await get('format=xlsx');
  assert.equal(response.status,200);
  const book = xlsx.read(await response.arrayBuffer());
  assert.deepEqual(book.SheetNames,['Resumo','Registros']);
  const records = xlsx.utils.sheet_to_json(book.Sheets.Registros);
  assert.equal(records.length,1);
  assert.equal(records[0].Presentes,15);
});

test('schedule is owner-only and an overdue run creates one scoped notice across two executions', async t => {
  const f = await roleFixture();
  t.after(() => f.db.close());
  const owner = await f.account('ADMIN_COMUNIDADE',{ communityOwner:true });
  const admin = await f.account('ADMIN_COMUNIDADE');
  const endpoint = '/api/pilot/relatorios/agendamento';
  const save = (actor,body) => f.call(endpoint,{ cookie:actor.cookie,method:'PUT',body });
  const values = { frequencia:'SEMANAL',dias:7,area:'cells',grupo:'Equipe QA' };
  assert.equal((await save(admin,values)).status,403);
  assert.equal((await save(owner,values)).status,200);
  const now = new Date();
  const earlier = new Date(now.getTime()-60_000).toISOString();
  f.db.prepare('UPDATE relatorios_agendamentos SET proxima_execucao=? WHERE usuario_id=?').run(earlier,owner.id);
  for(let iteration=0;iteration<2;iteration++){
    const pending=[];
    f.worker.scheduled({},f.env,{ waitUntil:promise=>pending.push(promise) });
    await Promise.all(pending);
  }
  const notices=f.db.prepare(`SELECT comunidade_id,usuario_id,destino_rota FROM notificacoes_sistema WHERE titulo='Resumo de gestão disponível'`).all();
  assert.equal(notices.length,1);
  assert.equal(notices[0].comunidade_id,1);
  assert.equal(notices[0].usuario_id,owner.id);
  assert.match(notices[0].destino_rota,/view=relatorios.*group=Equipe\+QA/);
  assert.equal((await save(owner,{ frequencia:'DESATIVADO' })).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS total FROM relatorios_agendamentos').get().total,0);
});
