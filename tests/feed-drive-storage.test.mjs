import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {journeyFixture} from './helpers/role-journey.mjs';

async function load(path){const exports={};runInNewContext(ts.transpileModule(await readFile(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({})});return exports;}
const {quotaStatus}=await load('app/lib/feed-drive-storage.ts');
const {mergeDriveNoticeMemory,parseDriveNoticeMemory}=await load('app/lib/feed-drive-notice.ts');
test('quota uses total Google storage, supports int64/unlimited and never guesses from incomplete data',()=>{
  assert.equal(quotaStatus({limit:'100',usage:'100',usageInDrive:'1'}),'FULL');
  assert.equal(quotaStatus({limit:'100',usage:'99'}),'AVAILABLE');
  assert.equal(quotaStatus({limit:'9007199254740993',usage:'9007199254740992'}),'AVAILABLE');
  assert.equal(quotaStatus({usage:'9007199254740993'}),'AVAILABLE');
  for(const bad of [null,{},'quota',{limit:'100'},{limit:'100',usage:'unknown'},{limit:'-1',usage:'1'}])assert.equal(quotaStatus(bad),'UNKNOWN');
});
test('dismissal remains a compact full warning; unknown preserves it, verified recovery and revocation clear it',()=>{
  const saved={own:{full:true,collapsed:true}};
  assert.equal(mergeDriveNoticeMemory(saved,[{id:'own',status:'FULL'}]).own.collapsed,true);
  assert.equal(mergeDriveNoticeMemory(saved,[{id:'own',status:'UNKNOWN'}]).own.full,true);
  assert.equal(Object.keys(mergeDriveNoticeMemory({},[{id:'own',status:'UNKNOWN'}])).length,0);
  assert.equal(Object.keys(mergeDriveNoticeMemory(saved,[{id:'own',status:'AVAILABLE'}])).length,0);
  assert.equal(Object.keys(mergeDriveNoticeMemory(saved,[])).length,0);
  assert.equal(mergeDriveNoticeMemory({},[{id:'own',status:'FULL'}]).own.collapsed,false);
  for(const invalid of ['bad','[]','{"own":{"full":"true","collapsed":false}}'])assert.equal(Object.keys(parseDriveNoticeMemory(invalid)).length,0);
});

async function connect(f,actor){
  const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('vinkulo-google:'+f.env.AUTH_SECRET)),'AES-GCM',false,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('refresh-'+actor.id));
  f.db.prepare('INSERT INTO google_connections(usuario_id,google_sub,google_email,refresh_token_ciphertext,refresh_token_iv,scopes,drive_enabled) VALUES(?,?,?,?,?,?,1)')
    .run(actor.id,'google-'+actor.id,'private-account@example.invalid',Buffer.from(cipher).toString('base64url'),Buffer.from(iv).toString('base64url'),'https://www.googleapis.com/auth/drive.file');
}

test('Feed Drive API: own account, explicit READ/EDIT shares, no administrator bypass, revocation, failures and recovery',async()=>{
  const f=await journeyFixture(),originalFetch=globalThis.fetch;
  try{
    Object.assign(f.env,{GOOGLE_CLIENT_ID:'quota-test',GOOGLE_CLIENT_SECRET:'quota-test-only'});
    await connect(f,f.accounts.admin);
    f.db.prepare("INSERT INTO visitante_drive(comunidade_id,usuario_id,estado,pasta_id,arquivo_id,hash,revisao) VALUES(1,?,'ACTIVE','never-read-folder','never-read-file','private-hash',1)").run(f.accounts.admin.id);
    let quota={limit:'100',usage:'100'},unavailable=false,beforeAbout;const calls=[];
    globalThis.fetch=async(input,options={})=>{
      const url=String(input);calls.push(url);
      if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'quota-access'});
      assert.equal(options.method||'GET','GET');
      assert.equal(url,'https://www.googleapis.com/drive/v3/about?fields=storageQuota(limit,usage)','must not read files, contacts or account identity');
      if(beforeAbout){const fn=beforeAbout;beforeAbout=null;fn();}
      return unavailable?new Response('Private Google failure',{status:503}):Response.json({storageQuota:quota});
    };
    const url='/api/storage/drive-status?communityId=1';
    async function read(role){const response=await f.as(role,url);assert.equal(response.status,200,await response.clone().text());assert.match(response.headers.get('cache-control'),/no-store/);return response.json();}
    assert.equal((await f.call(url)).status,401);
    assert.equal((await f.as('outside',url)).status,409);
    assert.deepEqual((await read('admin')).checks,[{id:'own',own:true,status:'FULL'}]);
    const before=calls.length;
    assert.deepEqual((await read('member')).checks,[]);assert.deepEqual((await read('official')).checks,[]);assert.equal(calls.length,before);
    const peer=await f.account('ADMIN_COMUNIDADE');
    const peerResponse=await f.call(url,{cookie:peer.cookie});assert.deepEqual((await peerResponse.json()).checks,[],'admin status does not imply a storage share');
    for(const role of ['READ','EDIT']){
      await f.share(f.accounts.member.id,role);
      assert.deepEqual((await read('member')).checks,[{id:'shared-visitors',own:false,status:'FULL'}]);
    }
    const privateResponse=JSON.stringify(await read('member'));
    assert.doesNotMatch(privateResponse,/private-account|quota-access|never-read|private-hash|usage|limit|refresh/);
    unavailable=true;assert.deepEqual((await read('member')).checks,[{id:'shared-visitors',own:false,status:'UNKNOWN'}]);unavailable=false;
    quota={limit:'100',usage:'20'};assert.equal((await read('member')).checks[0].status,'AVAILABLE');
    quota={limit:'100',usage:'100'};
    beforeAbout=()=>{
      f.db.prepare('DELETE FROM visitante_acessos WHERE usuario_id=?').run(f.accounts.member.id);
      f.db.prepare('DELETE FROM visitante_drive_acessos WHERE usuario_id=?').run(f.accounts.member.id);
    };
    assert.deepEqual((await read('member')).checks,[],'revocation during Google read removes the result');
    await f.share(f.accounts.member.id,'READ');
    await connect(f,f.accounts.member);
    assert.deepEqual((await read('member')).checks.map(c=>c.id),['own','shared-visitors']);
    f.db.prepare("UPDATE google_connections SET revoked_at=CURRENT_TIMESTAMP WHERE usuario_id=?").run(f.accounts.admin.id);
    assert.deepEqual((await read('member')).checks,[{id:'own',own:true,status:'FULL'}]);
    f.db.prepare("UPDATE usuario_comunidades SET status='INATIVO' WHERE id=?").run(f.accounts.member.membership);
    assert.equal((await f.as('member',url)).status,403);
  } finally {globalThis.fetch=originalFetch;f.db.close();}
});
