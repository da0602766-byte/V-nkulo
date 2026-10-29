import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../app/lib/agenda-request.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(fetch) { const exports={}; runInNewContext(code,{exports,fetch,AbortController,TypeError,Error,setTimeout,clearTimeout}); return exports; }
test('temporary network failure is retried once and recovers without a visible error', async()=>{
  let calls=0; const api=load(async()=>{ if(++calls===1)throw new TypeError('Failed to fetch'); return Response.json({itens:[{id:'event-1'}]}); });
  const result=await api.readAgendaJson('/api/pilot/agenda'); assert.equal(calls,2); assert.equal(result.itens[0].id,'event-1');
});
test('persistent network failures are bounded and translated; saving warns before retrying',async()=>{
  let calls=0; const api=load(async()=>{calls++;throw new TypeError('Failed to fetch');});
  await assert.rejects(api.readAgendaJson('/api/pilot/agenda'),/Verifique sua conexão/); assert.equal(calls,2);
  assert.match(api.agendaErrorMessage(new TypeError('Failed to fetch'),true),/confira a agenda antes/);
});
test('expired sessions are never retried and retain the access status for clearing private data',async()=>{
  let calls=0;const api=load(async()=>{calls++;return new Response('login',{status:401});});
  await assert.rejects(api.readAgendaJson('/api/pilot/eventos'),error=>error.status===401&&/sessão expirou/.test(error.message)); assert.equal(calls,1);
});
test('cancelling a superseded request does not replay it',async()=>{
  let calls=0;const controller=new AbortController();
  const api=load(async(_url,{signal})=>{calls++; return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));});
  const reading=api.readAgendaJson('/api/pilot/agenda',controller.signal);controller.abort();
  await assert.rejects(reading,/aborted/);assert.equal(calls,1);
});
