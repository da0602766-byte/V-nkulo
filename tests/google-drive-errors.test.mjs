import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

async function load(path, dependencies={}, globals={}) {
  const exports={};
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,Response,AbortSignal,TextEncoder,Uint8Array,crypto,require:key=>{assert.ok(key in dependencies,'Unexpected import '+key);return dependencies[key];},...globals});
  return exports;
}
const errors=await load('app/lib/google-drive-errors.ts');

for(const [status,reason,expectedStatus,message] of [
  [403,'storageQuotaExceeded',507,/armazenamento.*cheio/],
  [401,'authError',503,/autorização.*expirou/],
  [403,'userRateLimitExceeded',503,/limite temporário/],
  [403,'rateLimitExceeded',503,/limite temporário/],
  [429,'',503,/limite temporário/],
  [403,'insufficientFilePermissions',503,/permissão de edição/],
  [404,'notFound',503,/pasta.*não foi encontrada/],
  [500,'backendError',503,/não confirmou/],
]) test(`Google Drive: ${status}/${reason} has an actionable, private error`,async()=>{
  const error=await errors.googleDriveWriteError(Response.json({error:{message:'PRIVATE_ACCOUNT_AND_FILE',errors:[{reason}]}},{status}));
  assert.ok(error instanceof errors.GoogleDriveWriteError);
  assert.equal(error.status,expectedStatus);assert.match(error.message,message);
  assert.match(error.message,/anteriores foram preservados/);assert.doesNotMatch(error.message,/PRIVATE/);
});

test('non-JSON Google responses remain safe and retryable',async()=>{
  const error=await errors.googleDriveWriteError(new Response('<html>Private proxy error</html>',{status:502}));
  assert.equal(error.status,503);assert.doesNotMatch(error.message,/Private proxy/);
});

test('both folder creation and multipart uploads preserve Google quota errors',async()=>{
  let full=true;const calls=[];
  const google=await load('app/lib/google-integration.ts',{
    '../../db':{},'../../db/runtime-env':{},'./google-drive-errors':errors,
  },{fetch:async(url,init)=>{
    calls.push({url,init});
    if(full)return Response.json({error:{errors:[{reason:'storageQuotaExceeded'}]}},{status:403});
    return Response.json({id:'saved-file'});
  }});
  await assert.rejects(google.createDriveFolder('test-only','Visitantes'),e=>e.status===507);
  const file={name:'Categoria com acentos.json',type:'application/json',bytes:new TextEncoder().encode('{"nome":"Oficial"}'),parentId:'private-folder'};
  await assert.rejects(google.uploadDriveFile('test-only',file),e=>e.status===507);
  assert.equal(calls.length,2,'quota failures must not trigger automatic upload retries');
  full=false;
  assert.equal((await google.uploadDriveFile('test-only',file)).id,'saved-file');
  assert.match(new TextDecoder().decode(calls[2].init.body),/Oficial/);
});
