import assert from 'node:assert/strict';
import test from 'node:test';
import { roleFixture } from './helpers/role-audit.mjs';

test('server closes the shift and correction reaches the operator and the authorized pastor', async t => {
  const f = await roleFixture();
  t.after(() => f.db.close());
  const admin = await f.account('ADMIN_COMUNIDADE', { communityOwner: true });
  const operator = await f.account('MEMBRO');
  const pastor = await f.account('PASTOR');
  const other = await f.account('ADMIN_COMUNIDADE', { community: 2, communityOwner: true });
  const ministry = Number(f.db.prepare(`INSERT INTO ministerios_comunidade(comunidade_id,nome,categoria,responsavel_usuario_id)
    VALUES(1,'Estacionamento QA','ESTACIONAMENTO',?)`).run(admin.id).lastInsertRowid);
  const volunteer = Number(f.db.prepare(`INSERT INTO ministerio_voluntarios(comunidade_id,ministerio_id,usuario_id,funcao)
    VALUES(1,?,?,'Portaria')`).run(ministry,operator.id).lastInsertRowid);
  const shift = Number(f.db.prepare(`INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status)
    VALUES(1,?,'Plantão QA',datetime('now','-4 hours'),datetime('now','-3 hours'),'PUBLICADA')`).run(ministry).lastInsertRowid);
  f.db.prepare(`INSERT INTO escala_designacoes(comunidade_id,escala_id,voluntario_id,usuario_id,funcao,status)
    VALUES(1,?,?,?,'Portaria','CONFIRMADA')`).run(shift,volunteer,operator.id);

  for (let i = 0; i < 2; i++) {
    const background = [];
    f.worker.scheduled({}, f.env, { waitUntil: promise => background.push(promise) });
    await Promise.all(background);
  }
  const generated = f.db.prepare('SELECT id,status FROM estacionamento_relatorios_escala WHERE escala_id=?').all(shift);
  assert.equal(generated.length, 1);
  assert.equal(generated[0].status, 'AGUARDANDO_LIDER');
  const {id} = generated[0];
  const endpoint = '/api/pilot/estacionamento/relatorios';
  const get = async actor => (await f.call(`${endpoint}?id=${id}`, { cookie: actor.cookie })).json();
  const act = (actor, acao, values = {}) => f.call(endpoint, { cookie: actor.cookie, method: 'PATCH', body: { id, acao, ...values } });
  assert.equal((await get(pastor)).relatorios.length, 0);
  assert.equal((await act(admin, 'CORRIGIR')).status, 400);
  assert.equal((await act(admin, 'CORRIGIR', { motivo: 'Revise a descrição.' })).status, 200);
  assert.equal((await get(operator)).relatorios[0].motivo_correcao, 'Revise a descrição.');
  assert.equal((await act(operator, 'ENVIAR', { resumo: 'Descrição revisada.' })).status, 200);
  assert.equal((await act(admin, 'CONFIRMAR')).status, 200);
  assert.equal((await act(admin, 'CONFIRMAR')).status, 409);
  assert.equal((await get(pastor)).relatorios[0].resumo, 'Descrição revisada.');
  assert.equal((await get(other)).relatorios.length, 0);
  const notice = f.db.prepare(`SELECT comunidade_id,destino_rota FROM notificacoes_sistema
    WHERE usuario_id=? AND entidade_id=? AND titulo='Relatório de estacionamento revisado'`).all(pastor.id,id);
  assert.equal(notice.length, 1);
  assert.equal(notice[0].comunidade_id, 1);
  assert.equal(notice[0].destino_rota, `/painel?view=estacionamento&relatorio=${id}`);
});
