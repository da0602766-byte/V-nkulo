import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {createPilotD1, createPilotUser} from './helpers/sqlite-d1.mjs';

async function fixture(t) {
  const {database, d1} = await createPilotD1();
  t.after(() => database.close());
  const id = await createPilotUser(database, {nome:'Pessoa de teste',email:'feedback@example.test',senha:'Teste12345'});
  const driveCalls = [];
  const dependencies = {
    '../../../db': {getD1: () => d1},
    '../../lib/local-auth': {getSessionUser: async () => ({id,nome:'Pessoa de teste',ativo:true})},
    '../../lib/tenant': {getActiveTenantContext: async () => ({context:{comunidadeId:1}})},
    '../../lib/google-integration': {
      getDriveAccessToken: async () => {driveCalls.push('token');return 'fixture-token';},
      ensurePersonalDriveStorage: async () => ({mediaFolderId:'fixture-folder'}),
      uploadDriveFile: async () => {driveCalls.push('upload');return {id:'fixture-image'};},
      makeStorageReference: async () => 'fixture-reference',
      deleteDriveFile: async () => {driveCalls.push('delete');},
    },
  };
  const exports = {};
  const source = await readFile(new URL('../app/api/feedback/route.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>{assert.ok(name in dependencies,name);return dependencies[name];},File,FormData,Response,Uint8Array,crypto});
  const submit = (image, message='O campo de busca ficou cortado no celular.') => {
    const body = new FormData();
    for(const [key,value] of Object.entries({tipo:'PROBLEMA',categoria:'PROBLEMA_VISUAL',mensagem:message,pagina:'/painel?view=pessoas'})) body.set(key,value);
    if(image) body.set('imagem',image);
    return exports.POST(new Request('https://example.test/api/feedback',{method:'POST',body}));
  };
  return {submit,driveCalls,database};
}

test('relato de problema sem foto é salvo sem depender do Google Drive', async t => {
  const f=await fixture(t);
  const response=await f.submit();
  assert.equal(response.status,200);
  assert.equal((await response.json()).status,'PENDENTE');
  const saved=f.database.prepare('SELECT tipo,mensagem,imagem_chave,imagem_nome FROM feedback_plataforma').get();
  assert.equal(saved.tipo,'PROBLEMA');
  assert.match(saved.mensagem,/campo de busca/);
  assert.equal(saved.imagem_chave,'');assert.equal(saved.imagem_nome,'');
  assert.deepEqual(f.driveCalls,[]);
  assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM auditoria_piloto WHERE evento='FEEDBACK_PLATAFORMA_ENVIADO'").get().n,1);
});

test('anexo opcional continua usando o armazenamento existente quando informado', async t => {
  const f=await fixture(t);
  const response=await f.submit(new File([new Uint8Array([0xff,0xd8,0xff,0xe0])],'evidencia.jpg',{type:'image/jpeg'}));
  assert.equal(response.status,200);
  assert.deepEqual(f.driveCalls,['token','upload']);
  assert.equal(f.database.prepare('SELECT imagem_chave FROM feedback_plataforma').get().imagem_chave,'fixture-reference');
});

test('foto opcional não permite anexos inválidos nem descrições curtas', async t => {
  const f=await fixture(t);
  for(const image of [new File(['texto'],'arquivo.txt',{type:'text/plain'}),new File(['falso'],'foto.jpg',{type:'image/jpeg'})]) {
    assert.equal((await f.submit(image)).status,415);
  }
  assert.equal((await f.submit(undefined,'curto')).status,400);
  assert.deepEqual(f.driveCalls,[]);
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM feedback_plataforma').get().n,0);
});
