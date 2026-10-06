import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createPilotD1 } from './helpers/sqlite-d1.mjs';

async function route(path, dependencies) {
  const exports = {};
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    { exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, Response, URL, Buffer, console });
  return exports;
}
async function fixture(t) {
  const {database, d1} = await createPilotD1();
  t.after(() => database.close());
  database.exec(`INSERT INTO usuarios(id,nome,email) VALUES (90001,'Pessoa QA','pessoa@qa.test');
    INSERT INTO usuario_comunidades(id,usuario_id,comunidade_id,papel,status) VALUES(90001,90001,1,'MEMBRO','ATIVO'),(90002,90001,2,'MEMBRO','ATIVO');
    INSERT INTO ministerios_comunidade(id,comunidade_id,nome) VALUES(90001,1,'Ministério QA'),(90002,2,'Privado de outra comunidade');
    INSERT INTO ministerio_voluntarios(id,comunidade_id,ministerio_id,usuario_id,funcao,dias_disponiveis)
      VALUES(90001,1,90001,90001,'Apoio','["DOM"]'),(90002,2,90002,90001,'Outro','[]');
    INSERT INTO ministerio_equipes(id,comunidade_id,ministerio_id,nome) VALUES(90001,1,90001,'Equipe QA');
    INSERT INTO ministerio_equipe_membros(comunidade_id,ministerio_id,equipe_id,voluntario_id) VALUES(1,90001,90001,90001);
    INSERT INTO escalas_ministerio(id,comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status)
      VALUES(90001,1,90001,'Escala QA',datetime('now','+1 day'),datetime('now','+1 day','+2 hours'),'PUBLICADA'),
      (90002,2,90002,'Escala de outro tenant',datetime('now','+1 day'),datetime('now','+1 day','+2 hours'),'PUBLICADA');
    INSERT INTO escala_designacoes(id,comunidade_id,escala_id,voluntario_id,usuario_id,funcao,status)
      VALUES(90001,1,90001,90001,90001,'Apoio','CONFIRMADA'),(90002,2,90002,90002,90001,'Apoio','CONFIRMADA');
    INSERT INTO ministerio_checklist_itens(comunidade_id,escala_id,designacao_id,tarefa,status)
      VALUES(1,90001,90001,'Preparar sala','FEITO'),(2,90002,90002,'Tarefa privada','PENDENTE');
    INSERT INTO indisponibilidades(comunidade_id,usuario_id,titulo,data_inicio,data_fim)
      VALUES(1,90001,'Motivo privado',date('now','+2 days'),date('now','+2 days')),
      (2,90001,'Outro tenant',date('now','+2 days'),date('now','+2 days'));`);
  let access = {user:{id:90000,system_owner:false}, context:{comunidadeId:1,membershipId:90001,papel:'ADMIN_COMUNIDADE',permissions:['people.view','ministries.view','cells.view','schedules.view','schedules.manage']}};
  const fiche = await route('app/api/pilot/pessoas/[id]/ficha/route.ts', {
    '../../../../../../db':{getD1:()=>d1}, '../../../../../lib/tenant':{requireTenantPermission:async()=>access},
  });
  return {database, d1, fiche, get access(){return access;}, set access(value){access=value;}};
}
test('ficha reúne registros reais e isola todos os vínculos por comunidade', async t => {
  const f = await fixture(t);
  const response = await f.fiche.GET(new Request('https://qa.test/api'), {params:Promise.resolve({id:'90001'})});
  assert.equal(response.status,200);
  const data = await response.json();
  assert.equal(data.ministries.length,1); assert.equal(data.ministries[0].equipes,'Equipe QA');
  assert.equal(data.schedules.length,1); assert.equal(data.participation.total,1);
  assert.equal(data.participation.proximas,1); assert.equal(data.participation.confirmadas,1);
  assert.equal(data.checklist.length,1); assert.equal(data.checklist[0].tarefa,'Preparar sala');
  assert.equal(data.unavailable.length,1); assert.equal('titulo' in data.unavailable[0],false);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await f.fiche.GET(new Request('https://qa.test/api'),{params:Promise.resolve({id:'90002'})})).status,404);
});
test('ficha nega acesso e respeita as permissões de cada módulo', async t => {
  const f = await fixture(t);
  f.access.context.permissions = [];
  assert.equal((await f.fiche.GET(new Request('https://qa.test/api'),{params:Promise.resolve({id:'90001'})})).status,403);
  f.access.context.permissions = ['people.view'];
  const data = await (await f.fiche.GET(new Request('https://qa.test/api'),{params:Promise.resolve({id:'90001'})})).json();
  assert.equal(data.canViewAvailability,false); assert.equal(data.canViewSchedules,false);
  assert.equal(data.schedules.length,0); assert.equal(data.ministries.length,0); assert.equal(data.checklist.length,0);
});
test('listagem Todas inclui oficiais e membros, com totais e próximos compromissos corretos', async t => {
  const f = await fixture(t);
  f.database.exec(`INSERT INTO oficiais_comunidade(usuario_comunidade_id,titulo,permissoes) VALUES(90001,'LÍDER','');`);
  const list = await route('app/api/pilot/pessoas/route.ts', {
    '../../../../db':{getD1:()=>f.d1}, '../../../lib/tenant':{requireTenantPermission:async()=>f.access},
    '../../../lib/tenant-policy.mjs':{OFFICIAL_PERMISSION_CATALOG:[]}, '../../../lib/people-validation':{},
    '../../../lib/local-auth':{isSystemOwnerAccount:()=>false}, '../../../lib/pilot-notifications':{},
    '../../../lib/recepcao':{}, '../../../lib/tenant-audit':{},
  });
  const data = await (await list.GET(new Request('https://qa.test/api/pilot/pessoas?aba=todos&busca=Pessoa%20QA'))).json();
  assert.equal(data.people.length,1); assert.equal(data.people[0].oficial,1);
  assert.equal(data.people[0].ministerios,'Ministério QA'); assert.equal(data.people[0].proximas_escalas,1);
  const members = await (await list.GET(new Request('https://qa.test/api/pilot/pessoas?aba=membros&busca=Pessoa%20QA'))).json();
  assert.equal(members.people.length,0); assert.ok(data.counts.oficiais>=1);
});
