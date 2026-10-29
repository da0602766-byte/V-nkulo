import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

test('Chromium embedded push endpoint is accepted without broadening Google hosts',async()=>{
  const source=await readFile(new URL('../app/lib/web-push.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('exports','require',code)(exports,()=>({}));
  for(const url of ['https://jmt17.google.com/fcm/send/test-token','https://fcm.googleapis.com/wp/test-token','https://updates.push.services.mozilla.com/wpush/v2/test']) assert.equal(exports.isTrustedPushEndpoint(url),true,url);
  for(const url of ['http://jmt17.google.com/fcm/send/token','https://jmt17.google.com:444/fcm/send/token','https://jmt17.google.com/other/token','https://jmt17.google.com/fcm/send/token?redirect=bad','https://jmt17.google.com.attacker.test/fcm/send/token','https://jmt18.google.com/fcm/send/token','https://user@jmt17.google.com/fcm/send/token','https://127.0.0.1/fcm/send/token']) assert.equal(exports.isTrustedPushEndpoint(url),false,url);
});
