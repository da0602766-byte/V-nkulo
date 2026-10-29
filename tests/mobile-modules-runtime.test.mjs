import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test('module outbox in real D1: note JSON append/receipt changes, replay and transactional rollback',async()=>{
  const files=['mobile-write','mobile-module-contract','mobile-module-storage','mobile-module-snapshot','mobile-module-operations','mobile-modules'];
  const sources=await Promise.all(files.map(async name=>ts.transpileModule((await readFile(new URL('../app/lib/'+name+'.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^export /gm,'')));
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-05-15',cf:false,d1Databases:['DB'],script:`
    let db;function getD1(){return db;}async function visitorDriveConfig(){return null;} /* Legacy-storage fixture; Drive tested in visitor-drive.test.mjs */async function getCurrentSessionTokenHash(){return 'session';}
    async function requireTenantPermission(){return {user:{id:1,email:'runtime@example.test',ativo:true},context:{comunidadeId:1,comunidadeNome:'Test',communityAccess:'MEMBER',permissions:['dashboard.view']}};}
    const secureToken=()=>'a'.repeat(64);const rateLimit=async()=>true;function scheduleWebPushDelivery(){}
    async function privateHash(p,v){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p+v))),n=>n.toString(16).padStart(2,'0')).join('');}
    ${sources.join('\n')}
    export default {async fetch(request,env){db=env.DB;try{return new URL(request.url).pathname==='/prepare'?await prepareModule(request):await writeModule(request);}catch{return Response.json({error:'transaction failed'},{status:500});}}}
  `}));
  try{
    const db=await mf.getD1Database('DB');
    await db.batch([
      db.prepare('CREATE TABLE usuarios(id INTEGER PRIMARY KEY)'),db.prepare('INSERT INTO usuarios VALUES(1)'),
      db.prepare('CREATE TABLE comunidades(id INTEGER PRIMARY KEY)'),db.prepare('INSERT INTO comunidades VALUES(1)'),
      db.prepare('CREATE TABLE sessoes(usuario_id INTEGER,token_hash TEXT,expira_em TEXT)'),db.prepare("INSERT INTO sessoes VALUES(1,'session',datetime('now','+1 day'))"),
      db.prepare('CREATE TABLE ministerio_checklist_itens(id INTEGER PRIMARY KEY)'),
      db.prepare('CREATE TABLE layouts_interface(comunidade_id INTEGER,usuario_id INTEGER,escopo TEXT,tipo TEXT,nome TEXT,configuracao TEXT,atualizado_por INTEGER,atualizado_em TEXT,versao INTEGER DEFAULT 1,UNIQUE(comunidade_id,escopo))'),
      db.prepare('CREATE TABLE auditoria_piloto(comunidade_id INTEGER,usuario_id INTEGER,evento TEXT,resultado TEXT,metadados TEXT)'),
    ]);
    const deviceId='12345678-1234-4234-8234-123456789abc',operationId='22345678-1234-4234-8234-123456789abc';
    const send=(path,body)=>mf.dispatchFetch('https://test.local'+path,{method:'POST',headers:{origin:'https://test.local','content-type':'application/json','x-vinkulo-client':'android-modules-1','x-vinkulo-challenge':'c'.repeat(64),authorization:'Bearer '+'a'.repeat(64)},body:JSON.stringify(body)});
    const prepared=await send('/prepare',{module:'notes',deviceId});assert.equal(prepared.status,200,await prepared.clone().text());
    const body={module:'notes',deviceId,operationId,payload:{titulo:'Synthetic runtime',texto:'Private',cor:'amarelo'}};
    const first=await send('/write',body);assert.equal(first.status,200,await first.clone().text());const receipt=await first.json();assert.equal(receipt.resultId,operationId);
    assert.deepEqual(await(await send('/write',body)).json(),receipt);
    const second={...body,operationId:'32345678-1234-4234-8234-123456789abc'};assert.equal((await send('/write',second)).status,200);
    assert.equal((await db.prepare("SELECT json_array_length(configuracao,'$.notes') n FROM layouts_interface").first()).n,2);
    await db.prepare("CREATE TRIGGER fail_audit BEFORE INSERT ON auditoria_piloto BEGIN SELECT RAISE(ABORT,'failure'); END").run();
    assert.equal((await send('/write',{...body,operationId:'42345678-1234-4234-8234-123456789abc'})).status,500);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM mobile_module_receipts').first()).n,2);
    assert.equal((await db.prepare("SELECT json_array_length(configuracao,'$.notes') n FROM layouts_interface").first()).n,2);
  }finally{await mf.dispose();}
});
