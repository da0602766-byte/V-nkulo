import assert from 'node:assert/strict';
import test from 'node:test';
import { roleFixture } from './helpers/role-audit.mjs';

test('commercial community owner can read reports and delegate pastoral access', async t => {
  const f = await roleFixture();
  t.after(() => f.db.close());
  const owner = await f.account('ADMIN_COMUNIDADE', { communityOwner: true });
  const admin = await f.account('ADMIN_COMUNIDADE');
  const pastor = await f.account('PASTOR');
  const leader = await f.account('LIDER');
  const member = await f.account('MEMBRO');
  const outside = await f.account('ADMIN_COMUNIDADE', { community: 2, communityOwner: true });
  const call = (actor, path, method = 'GET', body) => f.call(path, { cookie: actor.cookie, method, body });
  const central = async actor => {
    const response = await call(actor, '/api/pilot/central');
    assert.equal(response.status, 200);
    return response.json();
  };
  const cellId = Number(f.db.prepare(`INSERT INTO celulas(comunidade_id,nome,responsavel,criado_por,ativo,escopo_confirmado)
    VALUES(1,'Célula QA','Liderança','qa',1,1)`).run().lastInsertRowid);
  f.db.prepare(`INSERT INTO celula_relatorios(comunidade_id,celula_id,data_reuniao,aconteceu,presentes,enviado_por_usuario_id)
    VALUES(1,?,date('now'),1,8,?)`).run(cellId, leader.id);

  assert.equal((await central(owner)).cellReports.length, 1);
  assert.equal((await (await call(owner, '/api/pilot/pastoral-dashboard')).json()).canManageAccess, true);
  for (const actor of [admin, pastor, leader, member, outside]) {
    assert.equal((await central(actor)).cellReports.length, 0);
  }
  const endpoint = '/api/pilot/pastoral-dashboard';
  assert.equal((await call(owner, endpoint, 'PATCH', { userId: pastor.id, enabled: true })).status, 200);
  assert.equal((await central(pastor)).cellReports.length, 1);
  assert.equal((await call(pastor, endpoint, 'PATCH', { userId: pastor.id, enabled: true })).status, 403);
  assert.equal((await call(owner, endpoint, 'PATCH', { userId: pastor.id, enabled: false })).status, 200);
  assert.equal((await central(pastor)).cellReports.length, 0);
});
