import assert from 'node:assert/strict';
import test from 'node:test';
import { roleFixture } from './helpers/role-audit.mjs';

test('cell report creation never overwrites an older submission; explicit corrections are versioned', async t => {
  const f = await roleFixture();
  t.after(() => f.db.close());
  const leader = await f.account('LIDER');
  const owner = await f.account('ADMIN_COMUNIDADE', { communityOwner: true });
  const cell = Number(f.db.prepare(`INSERT INTO celulas(comunidade_id,nome,responsavel,lider_usuario_id,criado_por,ativo,escopo_confirmado)
    VALUES(1,'Grupo QA','Liderança',?,'qa',1,1)`).run(leader.id).lastInsertRowid);
  const day = new Date().toISOString().slice(0,10);
  const save = body => f.call(`/api/pilot/celulas/${cell}`, { cookie: leader.cookie, method: 'PATCH', body: { dataReuniao: day, ...body } });
  assert.equal((await save({ acao: 'RELATORIO_CRIAR', presentes: 8, observacoes: 'Primeira versão' })).status, 200);
  assert.equal((await save({ acao: 'RELATORIO_CRIAR', presentes: 9 })).status, 409);
  const report = f.db.prepare('SELECT id,versao FROM celula_relatorios WHERE celula_id=?').get(cell);
  const correction = { acao: 'RELATORIO_CORRIGIR', relatorioId: report.id, versao: report.versao, aconteceu: false, presentes: 10, visitantes: 2 };
  assert.equal((await save(correction)).status, 200);
  assert.equal((await save(correction)).status, 409);
  const rows = (await (await f.call('/api/pilot/central', { cookie: owner.cookie })).json()).cellReports;
  assert.equal(rows[0].happened, false);
  assert.equal(rows[0].attendees, 0);
  assert.equal(f.db.prepare('SELECT observacoes FROM celula_relatorio_revisoes WHERE relatorio_id=? AND versao=1').get(report.id).observacoes, 'Primeira versão');
});
