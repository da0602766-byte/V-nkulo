import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {Miniflare} from 'miniflare';

test('mobile write in Workers/D1: real transaction receipt, lost response replay and rollback',async()=>{
  const source=await readFile(new URL('../app/lib/mobile-write.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^export /gm,'');
  const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',cf:false,d1Databases:['DB'],script:`
    let db;function getD1(){return db;}async function visitorDriveConfig(){return null;} /* Legacy-storage fixture; Drive tested in visitor-drive.test.mjs */
    async function getCurrentSessionTokenHash(){return 'session';}
    async function requireTenantPermission(){return {user:{id:1,email:'runtime@example.test',ativo:true},context:{comunidadeId:1,comunidadeNome:'Test',communityAccess:'MEMBER'}};}
    const secureToken=()=>'a'.repeat(64);const rateLimit=async()=>true;
    async function privateHash(p,v){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p+v))),n=>n.toString(16).padStart(2,'0')).join('');}
    ${compiled}
    export default {async fetch(request,env){db=env.DB;try{return new URL(request.url).pathname==='/prepare'?await prepareMobileWrite(request):await createMobileVisitor(request);}catch{return Response.json({error:'transaction failed'},{status:500});}}}
  `});
  try {
    const db=await mf.getD1Database('DB');
    await db.batch([
      db.prepare('CREATE TABLE usuarios(id INTEGER PRIMARY KEY)'),db.prepare('INSERT INTO usuarios VALUES(1)'),
      db.prepare('CREATE TABLE comunidades(id INTEGER PRIMARY KEY)'),db.prepare('INSERT INTO comunidades VALUES(1)'),
      db.prepare('CREATE TABLE sessoes(usuario_id INTEGER,token_hash TEXT,expira_em TEXT)'),db.prepare("INSERT INTO sessoes VALUES(1,'session',datetime('now','+1 day'))"),
      db.prepare('CREATE TABLE visitantes(id INTEGER PRIMARY KEY,comunidade_id INTEGER,nome_completo TEXT,telefone TEXT,email TEXT,data_entrada TEXT,batizado TEXT,status TEXT,criado_por TEXT,ativo INTEGER,escopo_confirmado INTEGER)'),
      db.prepare('CREATE TABLE auditoria_piloto(comunidade_id INTEGER,usuario_id INTEGER,evento TEXT,resultado TEXT,metadados TEXT)'),
    ]);
    const deviceId='12345678-1234-4234-8234-123456789abc',operationId='22345678-1234-4234-8234-123456789abc';
    const send=(path,body)=>mf.dispatchFetch('https://test.local'+path,{method:'POST',headers:{origin:'https://test.local','content-type':'application/json','x-vinkulo-client':'android-write-1','x-vinkulo-challenge':'c'.repeat(64),authorization:'Bearer '+'a'.repeat(64)},body:JSON.stringify(body)});
    assert.equal((await send('/prepare',{deviceId})).status,200);
    const body={deviceId,operationId,visitor:{nomeCompleto:'Synthetic runtime',telefone:'',email:'',dataEntrada:'2026-09-27'}};
    const first=await send('/write',body);assert.equal(first.status,200,await first.clone().text());const receipt=await first.json();assert.equal(receipt.result,'CONFIRMED');assert.equal(receipt.visitorId,1);
    assert.deepEqual(await (await send('/write',body)).json(),receipt);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM visitantes').first()).n,1);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM auditoria_piloto').first()).n,1);
    await db.prepare("CREATE TRIGGER fail_audit BEFORE INSERT ON auditoria_piloto BEGIN SELECT RAISE(ABORT,'failure'); END").run();
    const second={...body,operationId:'32345678-1234-4234-8234-123456789abc',visitor:{...body.visitor,nomeCompleto:'Another synthetic'}};
    assert.equal((await send('/write',second)).status,500);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM visitantes').first()).n,1);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM mobile_visitor_receipts').first()).n,1);
  }finally{await mf.dispose();}
});
