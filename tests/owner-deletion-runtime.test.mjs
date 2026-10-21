import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import {createPilotD1} from './helpers/sqlite-d1.mjs';

test('exclusão usa D1 real: consulta sem UNION excessivo, remoção atômica e motivo de falha', async () => {
  const compile = async path => ts.transpileModule((await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^export /gm,'');
  const mf = new Miniflare({modules:true,compatibilityDate:'2026-05-15',cf:false,d1Databases:['DB'],script:`
    function isSystemOwnerAccount(user){return user.id===1;} function scheduleWebPushDelivery(){}
    ${await compile('../app/lib/account-deletion-recipients.ts')}
    ${await compile('../app/lib/delete-user-account.ts')}
    export default {fetch(request,env){return deleteUserAccount(env.DB,1,Number(new URL(request.url).searchParams.get('id')||2));}}
  `});
  try {
    const db=await mf.getD1Database('DB');
    const {database}=await createPilotD1();
    const schema=database.prepare("SELECT sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").all();
    database.close();
    for(let i=0;i<schema.length;i+=30) await db.batch(schema.slice(i,i+30).map(row=>db.prepare(row.sql)));
    await db.batch([
      db.prepare("INSERT INTO usuarios(id,nome,email,ativo) VALUES (1,'Owner','owner@test.invalid',1),(2,'Member','member@test.invalid',1),(3,'Leader','leader@test.invalid',1)"),
      db.prepare("INSERT INTO comunidades(id,nome,slug,proprietario_usuario_id) VALUES (1,'Community','community',2)"),
      db.prepare("INSERT INTO usuario_comunidades(usuario_id,comunidade_id,papel,status) VALUES(2,1,'MEMBRO','ATIVO'),(3,1,'PASTOR','ATIVO')"),
    ]);
    const result=await mf.dispatchFetch('http://test.invalid/delete');
    assert.equal(result.status,200,await result.clone().text());
    assert.equal(await db.prepare('SELECT id FROM usuarios WHERE id=2').first(),null);
    assert.equal((await db.prepare('SELECT proprietario_usuario_id FROM comunidades WHERE id=1').first()).proprietario_usuario_id,null);
    assert.equal((await db.prepare("SELECT COUNT(*) n FROM notificacoes_sistema WHERE usuario_id=3").first()).n,1);
    await db.prepare("CREATE TRIGGER block_delete BEFORE DELETE ON usuarios BEGIN SELECT RAISE(ABORT,'constraint simulated'); END").run();
    const failed=await mf.dispatchFetch('http://test.invalid/delete?id=3'),body=await failed.json();
    assert.equal(failed.status,500);assert.match(body.error,/vínculo de dados/);assert.match(body.error,/Nenhuma alteração/);assert.ok(body.reference);
    assert.ok(await db.prepare('SELECT id FROM usuarios WHERE id=3').first());
    assert.ok(await db.prepare('SELECT id FROM usuario_comunidades WHERE usuario_id=3').first());
  } finally {await mf.dispose();}
});
