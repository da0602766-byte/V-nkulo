import assert from 'node:assert/strict';
import test from 'node:test';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';
import { readMessagePage, mergeChatMessages } from '../app/lib/chat-page.mjs';
import { checkSpreadsheetBytes } from '../app/lib/spreadsheet-policy.mjs';

const secret = 'test-only-secret-for-storage-security-2026';
const ctx = { waitUntil() {}, passThroughOnException() {} };
const encode = bytes => Buffer.from(bytes).toString('base64url');
const digest = async text => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex');
async function encrypted(value) {
  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`vinkulo-google:${secret}`)), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return { iv: encode(iv), ciphertext: encode(ciphertext) };
}
async function fixture() {
  const { database, d1 } = await createPilotD1();
  // Model D1's transaction serialization instead of overlapping BEGINs on one SQLite connection.
  const batch = d1.batch.bind(d1); let queue = Promise.resolve();
  d1.batch = statements => { const result = queue.then(() => batch(statements)); queue = result.catch(() => {}); return result; };
  const worker = (await import('../dist/server/index.js')).default;
  const env = { DB: d1, AUTH_SECRET: secret, GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-google-secret',
    ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
  const one = await createPilotUser(database, { nome: 'Pessoa teste A', email: 'a@example.test', senha: 'Testing1234', memberships: [{ comunidadeId: 1, papel: 'ADMIN_COMUNIDADE' }] });
  const two = await createPilotUser(database, { nome: 'Pessoa teste B', email: 'b@example.test', senha: 'Testing1234', memberships: [{ comunidadeId: 2, papel: 'MEMBRO' }] });
  const call = (path, init = {}) => worker.fetch(new Request(`https://test.invalid${path}`, init), env, ctx);
  const login = async (email, senha = 'Testing1234', origin = '192.0.2.1') => {
    const response = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': origin }, body: JSON.stringify({ email, senha }) });
    return { response, cookie: (response.headers.get('set-cookie') || '').split(';')[0] };
  };
  const cookie = (await login('a@example.test')).cookie;
  const otherCookie = (await login('b@example.test')).cookie;
  const refresh = await encrypted('test-refresh-token');
  database.prepare(`INSERT INTO google_connections (usuario_id, google_sub, google_email, refresh_token_ciphertext, refresh_token_iv, scopes, drive_enabled)
    VALUES (?, 'test-sub', 'a@example.test', ?, ?, 'drive.file', 1)`).run(one, refresh.ciphertext, refresh.iv);
  database.prepare("INSERT INTO storage_preferences (usuario_id, provider) VALUES (?, 'GOOGLE_DRIVE')").run(one);
  database.prepare("INSERT INTO community_drive_storage (comunidade_id, proprietario_usuario_id, pasta_raiz_id, pasta_midias_id, pasta_conversas_id) VALUES (1, ?, 'root', 'media', 'chats')").run(one);
  return { database, d1, env, call, login, cookie, otherCookie, one, two };
}
function fakeDrive({ corrupt = false } = {}) {
  const original = globalThis.fetch, files = new Map(); let uploads = 0, reads = 0;
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname === '/token') return Response.json({ access_token: 'test-access-token' });
    if (u.pathname.startsWith('/upload/drive/')) {
      uploads++;
      const body = Buffer.from(init.body), boundary = String(init.headers['Content-Type']).split('boundary=')[1];
      const parts = body.toString('latin1').split(`--${boundary}`);
      const metadata = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
      const part = parts[2]; const bytes = Buffer.from(part.slice(part.indexOf('\r\n\r\n') + 4, -2), 'latin1');
      const id = `file-${uploads}`;
      files.set(id, { bytes, ...metadata, id, mimeType: metadata.appProperties.type === 'chat-message' ? 'application/vnd.vinkulo.encrypted+json' : 'image/png', createdTime: new Date().toISOString(), size: String(bytes.length) });
      return Response.json(files.get(id));
    }
    if (u.searchParams.get('alt') === 'media') {
      reads++; const file = files.get(u.pathname.split('/').at(-1));
      return file ? new Response(corrupt ? 'damaged' : file.bytes, { headers: { 'content-type': file.mimeType } }) : new Response('', { status: 404 });
    }
    if (u.pathname === '/drive/v3/files' && init?.method === 'POST') return Response.json({ id: 'test-folder' });
    if (u.pathname === '/drive/v3/files') {
      const since = u.searchParams.get('q').match(/createdTime >= '([^']+)'/)?.[1];
      const all = [...files.values()].filter(f => !since || f.createdTime >= since).sort((a,b) => since ? a.createdTime.localeCompare(b.createdTime) : b.createdTime.localeCompare(a.createdTime));
      const start = Number(u.searchParams.get('pageToken') || 0), size = Number(u.searchParams.get('pageSize'));
      return Response.json({ files: all.slice(start, start + size), nextPageToken: start + size < all.length ? String(start + size) : undefined });
    }
    throw new Error(`Unexpected test URL: ${u.origin}${u.pathname}`);
  };
  return { files, get uploads() { return uploads; }, get reads() { return reads; }, restore() { globalThis.fetch = original; } };
}

test('private files: anonymous, foreign tenant, revoked membership and public/private transitions', async () => {
  const f = await fixture(); const drive = fakeDrive(); let bucketReads = 0;
  try {
    const key = 'images/post-image/1/12345678-1234-1234-1234-123456789abc.png', url = `/api/pilot/uploads/${key}`;
    f.env.BUCKET = { get: async () => { bucketReads++; return { body: new Response('image').body, httpMetadata: { contentType: 'image/png' } }; } };
    f.database.prepare("UPDATE publicacoes_piloto SET imagem_url = ?, visibilidade = 'COMUNIDADE', audiencia_tipo = 'PUBLICO', aprovacao_status = 'APROVADA' WHERE id = 1").run(url);
    assert.equal((await f.call(url)).status, 404);
    assert.equal((await f.call(url, { headers: { cookie: f.otherCookie } })).status, 404);
    assert.equal(bucketReads, 0);
    let response = await f.call(url, { headers: { cookie: f.cookie } });
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    f.database.prepare("UPDATE usuario_comunidades SET status = 'INATIVO' WHERE usuario_id = ?").run(f.one);
    assert.equal((await f.call(url, { headers: { cookie: f.cookie } })).status, 404);
    f.database.prepare("UPDATE publicacoes_piloto SET visibilidade = 'PLATAFORMA' WHERE id = 1").run();
    assert.equal((await f.call(url)).status, 200);
    f.database.prepare("UPDATE publicacoes_piloto SET visibilidade = 'COMUNIDADE' WHERE id = 1").run();
    assert.equal((await f.call(url + '?download=1')).status, 404);
    f.database.prepare("INSERT INTO storage_files (id, scope, owner_id, file_id) VALUES ('12345678-1234-1234-1234-123456789abc', 'public', ?, 'secret-drive')").run(f.one);
    const driveUrl = '/api/storage/media/12345678-1234-1234-1234-123456789abc';
    f.database.prepare('UPDATE publicacoes_piloto SET imagem_url = ? WHERE id = 1').run(driveUrl);
    assert.equal((await f.call(driveUrl)).status, 404);
    assert.equal((await f.call(driveUrl, { headers: { cookie: f.otherCookie } })).status, 404);
    assert.equal(drive.reads, 0);
  } finally { drive.restore(); f.database.close(); }
});

test('uploads use Drive exclusively and an unavailable Drive never writes a platform copy', async () => {
  const f = await fixture(); const drive = fakeDrive(); let puts = 0;
  f.env.BUCKET = { put: async () => { puts++; } };
  const upload = () => { const form = new FormData(); form.set('purpose','post-image'); form.set('file',new File([new Uint8Array([137,80,78,71,13,10,26,10,0,1])],'test.png',{type:'image/png'})); return f.call('/api/pilot/uploads',{method:'POST',headers:{cookie:f.cookie},body:form}); };
  try {
    let response = await upload(); assert.equal(response.status,200); const result = await response.json();
    assert.equal(result.storage,'GOOGLE_DRIVE'); assert.equal(puts,0); assert.equal(drive.uploads,1);
    assert.equal((await f.call(result.url,{headers:{cookie:f.cookie}})).status,200);
    assert.equal((await f.call(result.url)).status,404);
    f.database.prepare('UPDATE google_connections SET drive_enabled = 0').run();
    response = await upload(); assert.equal(response.status,409); assert.equal(puts,0); assert.equal(drive.uploads,1);
  } finally { drive.restore(); f.database.close(); }
});

test('reset token: simultaneous requests have one winner and invalidate old sessions', async () => {
  const f = await fixture();
  try {
    f.database.prepare("INSERT INTO redefinicoes_senha (usuario_id,token_hash,expira_em,usado) VALUES (?, ?, datetime('now','+1 hour'), 0)").run(f.one,await digest('single-use'));
    const reset = senha => f.call('/api/auth/redefinir-senha',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'single-use',senha})});
    const responses = await Promise.all([reset('FirstPassword123'),reset('SecondPassword123')]);
    assert.equal(responses.filter(r => r.status === 200).length,1);
    assert.equal(responses.filter(r => r.status === 400).length,1);
    assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id = ?').get(f.one).n,0);
    const old = await f.call('/api/storage/preferences',{headers:{cookie:f.cookie}}); assert.equal(old.status,401);
    const winner = responses[0].status === 200 ? 'FirstPassword123' : 'SecondPassword123';
    assert.equal((await f.login('a@example.test',winner)).response.status,200);
    assert.equal((await reset('ThirdPassword123')).status,400);
  } finally { f.database.close(); }
});

test('login conceals account existence and wrong attempts cannot lock another origin', async () => {
  const f = await fixture();
  try {
    const missing = (await f.login('missing@example.test','Wrong1234')).response;
    const wrong = (await f.login('a@example.test','Wrong1234')).response;
    assert.equal(missing.status,wrong.status); assert.deepEqual(await missing.json(),await wrong.json());
    for (let i=0;i<4;i++) await f.login('a@example.test','Wrong1234','192.0.2.2');
    assert.equal((await f.login('a@example.test','Testing1234','192.0.2.3')).response.status,200);
  } finally { f.database.close(); }
});

test('migration corruption keeps original content and reference intact', async () => {
  const f = await fixture(); const drive = fakeDrive({corrupt:true}); let deletes=0;
  const url='/api/pilot/uploads/images/post-image/1/12345678-1234-1234-1234-123456789abc.png';
  f.env.BUCKET={get:async()=>({body:new Response('original-bytes').body,httpMetadata:{contentType:'image/png'}}),delete:async()=>{deletes++;}};
  try {
    f.database.prepare('UPDATE publicacoes_piloto SET imagem_url = ? WHERE id=1').run(url);
    const response=await f.call('/api/storage/migrate',{method:'POST',headers:{cookie:f.cookie}});
    assert.equal(response.status,409); assert.equal(deletes,0);
    assert.equal(f.database.prepare('SELECT imagem_url FROM publicacoes_piloto WHERE id=1').get().imagem_url,url);
  } finally { drive.restore(); f.database.close(); }
});

test('chat: known files skipped before download, bounded parallelism and explicit partial failures', async () => {
  let active=0,max=0,read=0;
  const files=Array.from({length:12},(_,i)=>({id:String(i),mimeType:'application/vnd.vinkulo.encrypted+json',createdTime:'2026-09-04T10:00:00Z'}));
  const page=await readMessagePage(files,{knownIds:['0','1'],read:async file=>{read++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;if(file.id==='5')throw Error('test');return{id:Number(file.id),mensagem:'test',criado_em:'2026-09-04T10:00:00Z'};}});
  assert.equal(read,10);assert.ok(max<=4);assert.equal(page.partial,true);assert.deepEqual(page.failedFileIds,['5']);
  assert.equal(mergeChatMessages(page.messages,page.messages).length,9);
});

test('spreadsheet size and decompression limits reject oversize content before parsing',()=>{
  assert.throws(()=>checkSpreadsheetBytes(new ArrayBuffer(6*1024*1024)),/5 MB/);
  const buffer=new ArrayBuffer(68);const view=new DataView(buffer);view.setUint32(0,0x02014b50,true);
  // A deliberately malformed ZIP is also rejected rather than parsed.
  view.setUint32(0,0x04034b50,true);assert.throws(()=>checkSpreadsheetBytes(buffer),/inválido/);
});

test('chat endpoint paginates, polls incrementally, reports partial loads and enforces consent and membership', async () => {
  const f = await fixture(); const drive = fakeDrive();
  try {
    const target = await createPilotUser(f.database, {nome:'Pessoa teste C',email:'c@example.test',senha:'Testing1234',memberships:[{comunidadeId:1,papel:'LIDER'}]});
    const opened = await f.call('/api/pilot/chat',{method:'POST',headers:{cookie:f.cookie,'content-type':'application/json'},body:JSON.stringify({targetUserId:target,message:''})});
    assert.equal(opened.status,200); const {conversationId} = await opened.json();
    const add = async (id, corrupt=false) => {
      const date = new Date(Date.UTC(2026,8,4,12,0,id)).toISOString();
      const bytes = Buffer.from(JSON.stringify({version:1,...await encrypted(JSON.stringify({id,remetente_id:target,remetente_nome:'Teste',mensagem:`Mensagem ${id}`,criado_em:date,lida_em:null}))}));
      drive.files.set(`msg-${id}`,{id:`msg-${id}`,bytes:corrupt?Buffer.from('damaged'):bytes,size:String(bytes.length),createdTime:date,mimeType:'application/vnd.vinkulo.encrypted+json',appProperties:{conversationId:String(conversationId)}});
    };
    for(let i=1;i<=35;i++) await add(i);
    const path=`/api/pilot/chat?messagesOnly=1&conversation=${conversationId}`;
    const get=async query=>(await f.call(path+query,{headers:{cookie:f.cookie}})).json();
    const initial=await get('');assert.equal(initial.messages.length,30);assert.equal(initial.partial,false);assert.ok(initial.nextPageToken);assert.equal(drive.reads,30);
    const older=await get(`&pageToken=${initial.nextPageToken}`);assert.equal(older.messages.length,5);assert.equal(older.nextPageToken,null);assert.equal(drive.reads,35);
    const known=[...initial.messages,...older.messages].map(m=>m.fileId).join(',');
    const query=`&since=${encodeURIComponent(initial.syncSince)}&known=${known}`;
    // Drain metadata pages without re-reading any known content.
    let page=await get(query);assert.equal(page.messages.length,0);assert.equal(drive.reads,35);
    while(page.nextPageToken) page=await get(query+`&pageToken=${page.nextPageToken}`);
    assert.equal(drive.reads,35);
    await add(36);await add(37,true);
    page=await get(query);let received=[...page.messages],partial=page.partial;
    while(page.nextPageToken){page=await get(query+`&pageToken=${page.nextPageToken}`);received.push(...page.messages);partial ||= page.partial;}
    assert.equal(received.length,1);assert.equal(received[0].id,36);assert.equal(partial,true);assert.deepEqual(page.failedFileIds,['msg-37']);
    assert.equal(page.syncSince,initial.syncSince);
    const before=drive.reads; f.database.prepare('UPDATE storage_preferences SET auto_load_recent=0 WHERE usuario_id=?').run(f.one);
    const consent=await get('');assert.equal(consent.recentContentLoaded,false);assert.equal(consent.messages.length,0);assert.equal(drive.reads,before);
    f.database.prepare("UPDATE usuario_comunidades SET status='INATIVO' WHERE usuario_id=?").run(target);
    assert.equal((await f.call(path+'&loadRecent=1',{headers:{cookie:f.cookie}})).status,404);
  } finally { drive.restore();f.database.close(); }
});

test('successful media migration retains the original, preserves privacy and is resumable',async()=>{
  const f=await fixture();const drive=fakeDrive();let deletes=0;
  const url='/api/pilot/uploads/images/post-image/1/12345678-1234-1234-1234-123456789abc.png';
  f.env.BUCKET={get:async()=>({body:new Response('original-bytes').body,httpMetadata:{contentType:'image/png'}}),delete:async()=>{deletes++;}};
  try {
    f.database.prepare("UPDATE publicacoes_piloto SET imagem_url=?, visibilidade='COMUNIDADE' WHERE id=1").run(url);
    const response=await f.call('/api/storage/migrate',{method:'POST',headers:{cookie:f.cookie}});assert.equal(response.status,200);
    const replacement=f.database.prepare('SELECT imagem_url FROM publicacoes_piloto WHERE id=1').get().imagem_url;
    assert.match(replacement,/^\/api\/storage\/media\//);assert.equal(deletes,0);
    assert.equal((await f.call(replacement)).status,404);assert.equal((await f.call(replacement,{headers:{cookie:f.cookie}})).status,200);
    assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM storage_migration_copies').get().n,1);
    const uploads=drive.uploads;
    assert.equal((await f.call('/api/storage/migrate',{method:'POST',headers:{cookie:f.cookie}})).status,200);assert.equal(drive.uploads,uploads);assert.equal(deletes,0);
  } finally {drive.restore();f.database.close();}
});

test('shared pages conceal private content and script nonces match the response policy',async()=>{
  const f=await fixture();
  try {
    f.database.prepare("UPDATE publicacoes_piloto SET titulo='PRIVATE_CONTENT_SENTINEL', conteudo='PRIVATE_BODY_SENTINEL', visibilidade='COMUNIDADE' WHERE id=1").run();
    const privatePage=await f.call('/compartilhar/publicacao/1');assert.equal(privatePage.status,404);
    const html=await privatePage.text();assert.doesNotMatch(html,/PRIVATE_CONTENT_SENTINEL|PRIVATE_BODY_SENTINEL/);
    f.database.prepare("UPDATE publicacoes_piloto SET visibilidade='PLATAFORMA',audiencia_tipo='PUBLICO',aprovacao_status='APROVADA' WHERE id=1").run();
    const publicPage=await f.call('/compartilhar/publicacao/1');assert.equal(publicPage.status,200);
    const policy=publicPage.headers.get('content-security-policy');const nonce=policy.match(/script-src[^;]*'nonce-([^']+)'/)[1];
    assert.doesNotMatch(policy.match(/script-src [^;]+/)[0],/unsafe-inline/);
    const publicHtml=await publicPage.text();assert.match(publicHtml,/PRIVATE_CONTENT_SENTINEL/);
    const scripts=[...publicHtml.matchAll(/<script\b([^>]*)>/g)].map(m=>m[1]);assert.ok(scripts.length>0);
    for(const attributes of scripts.filter(a=>!a.includes('application/ld+json'))) assert.ok(attributes.includes(`nonce="${nonce}"`),`Script missing matching nonce: ${attributes}`);
    const next=await f.call('/login');assert.ok(!next.headers.get('content-security-policy').includes(nonce));
    assert.match(publicPage.headers.get('cache-control'),/no-store/);
  } finally {f.database.close();}
});

test('spreadsheet worker preserves accented content in export/import and rejects excess rows',async()=>{
  const previous=globalThis.self;let result;
  globalThis.self={postMessage:value=>{result=value;}};
  try {
    await import('../app/lib/spreadsheet-worker.ts');
    const rows=[{Nome:'Pessoa fictícia',Email:'teste@example.test'},{Nome:'João de teste',Email:'joao@example.test'}];
    self.onmessage({data:{action:'export',rows}});assert.ok(result.buffer instanceof ArrayBuffer);
    const buffer=result.buffer;self.onmessage({data:{action:'read',buffer}});assert.deepEqual(result.rows,rows);
    self.onmessage({data:{action:'export',rows:Array.from({length:2001},()=>rows[0])}});assert.match(result.error,/2.000/);
  } finally {if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
});

test('Drive reads bound retries, honor long Retry-After and do not retry permission denial',async()=>{
  const {driveRead}=await import('../app/lib/drive-request.ts');const original=globalThis.fetch;let calls=0;
  try {
    globalThis.fetch=async()=>++calls<3?new Response('',{status:429}):new Response('ok');
    assert.equal((await driveRead('https://test.invalid',{})).status,200);assert.equal(calls,3);
    calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'60'}});};
    assert.equal((await driveRead('https://test.invalid',{})).status,429);assert.equal(calls,1);
    calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:{errors:[{reason:'insufficientPermissions'}]}},{status:403});};
    assert.equal((await driveRead('https://test.invalid',{})).status,403);assert.equal(calls,1);
  } finally {globalThis.fetch=original;}
});

test('Drive encryption rotation reads legacy and previous key versions without rewriting history',async()=>{
  const f=await fixture();const drive=fakeDrive();
  try {
    const target=await createPilotUser(f.database,{nome:'Pessoa teste rotação',email:'rotation@example.test',senha:'Testing1234',memberships:[{comunidadeId:1,papel:'LIDER'}]});
    f.env.GOOGLE_ENCRYPTION_KEYS=JSON.stringify({one:'synthetic-key-one-32-characters-long',two:'synthetic-key-two-32-characters-long'});f.env.GOOGLE_ENCRYPTION_KEY_ID='one';
    const send=()=>f.call('/api/pilot/chat',{method:'POST',headers:{cookie:f.cookie,'content-type':'application/json'},body:JSON.stringify({targetUserId:target,message:'Mensagem fictícia de rotação'})});
    let response=await send();assert.equal(response.status,201);const {conversationId}=await response.json();
    assert.equal(JSON.parse(drive.files.get('file-1').bytes).keyId,'one');
    f.env.GOOGLE_ENCRYPTION_KEY_ID='two';response=await send();assert.equal(response.status,201);
    assert.equal(JSON.parse(drive.files.get('file-2').bytes).keyId,'two');
    const page=await(await f.call(`/api/pilot/chat?conversation=${conversationId}&messagesOnly=1`,{headers:{cookie:f.cookie}})).json();
    assert.equal(page.partial,false);assert.equal(page.messages.length,2);
    f.env.GOOGLE_ENCRYPTION_KEYS=JSON.stringify({two:'synthetic-key-two-32-characters-long'});
    const missing=await(await f.call(`/api/pilot/chat?conversation=${conversationId}&messagesOnly=1`,{headers:{cookie:f.cookie}})).json();
    assert.equal(missing.partial,true);assert.equal(missing.messages.length,1);assert.deepEqual(missing.failedFileIds,['file-1']);
  }finally{drive.restore();f.database.close();}
});

test('a failed reset transaction rolls back the password, token and sessions together',async()=>{
  const f=await fixture();
  try{
    f.database.prepare("INSERT INTO redefinicoes_senha(usuario_id,token_hash,expira_em,usado) VALUES(?,?,datetime('now','+1 hour'),0)").run(f.one,await digest('rollback-token'));
    const before=f.database.prepare('SELECT senha_hash FROM usuarios WHERE id=?').get(f.one).senha_hash;
    const sessions=f.database.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id=?').get(f.one).n;
    f.database.exec("CREATE TRIGGER fail_token_update BEFORE UPDATE ON redefinicoes_senha BEGIN SELECT RAISE(ABORT,'Synthetic rollback failure'); END");
    const response=await f.call('/api/auth/redefinir-senha',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'rollback-token',senha:'Changed12345'})});
    assert.ok(response.status>=400);assert.equal(f.database.prepare('SELECT senha_hash FROM usuarios WHERE id=?').get(f.one).senha_hash,before);
    assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id=?').get(f.one).n,sessions);
    assert.equal(f.database.prepare('SELECT usado FROM redefinicoes_senha WHERE token_hash=?').get(await digest('rollback-token')).usado,0);
  }finally{f.database.close();}
});

test('knowing another community file address cannot attach it to a publication',async()=>{
  const f=await fixture();
  try{
    f.database.prepare("INSERT INTO storage_files(id,scope,owner_id,file_id,uploaded_by,community_id,purpose) VALUES('12345678-1234-1234-1234-123456789abc','community',?,'foreign-file',?,2,'post-image')").run(f.two,f.two);
    const before=f.database.prepare('SELECT COUNT(*) AS n FROM publicacoes_piloto').get().n;
    const response=await f.call('/api/pilot/publicacoes',{method:'POST',headers:{cookie:f.cookie,'content-type':'application/json'},body:JSON.stringify({titulo:'Teste de associação',conteudo:'Conteúdo fictício',imagemUrl:'/api/storage/media/12345678-1234-1234-1234-123456789abc'})});
    assert.equal(response.status,403);assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM publicacoes_piloto').get().n,before);
    assert.match(f.database.prepare('SELECT senha_hash FROM usuarios WHERE id=?').get(f.one).senha_hash,/^pbkdf2-sha256\$600000\$/);
  }finally{f.database.close();}
});

test('legacy chat migration processes bounded batches and keeps every source message',async()=>{
  const f=await fixture();const drive=fakeDrive();
  try {
    const target=await createPilotUser(f.database,{nome:'Pessoa teste legado',email:'legacy@example.test',senha:'Testing1234',memberships:[{comunidadeId:1,papel:'LIDER'}]});
    const conv=Number(f.database.prepare("INSERT INTO conversas_privadas(comunidade_id,usuario_menor_id,usuario_maior_id,ciclo_mes,storage_provider) VALUES(1,?,?,strftime('%Y-%m','now'),'PLATFORM')").run(Math.min(f.one,target),Math.max(f.one,target)).lastInsertRowid);
    for(let i=1;i<=25;i++)f.database.prepare('INSERT INTO mensagens_privadas(conversa_id,remetente_id,mensagem) VALUES(?,?,?)').run(conv,target,`Mensagem fictícia legada ${i}`);
    const migrate=()=>f.call('/api/storage/migrate',{method:'POST',headers:{cookie:f.cookie}});
    assert.equal((await migrate()).status,200);assert.equal(drive.uploads,20);
    assert.equal(f.database.prepare('SELECT storage_provider FROM conversas_privadas WHERE id=?').get(conv).storage_provider,'MIGRATING');
    assert.equal((await migrate()).status,200);assert.equal(drive.uploads,25);
    assert.equal(f.database.prepare('SELECT storage_provider FROM conversas_privadas WHERE id=?').get(conv).storage_provider,'GOOGLE_DRIVE');
    assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM mensagens_privadas WHERE conversa_id=?').get(conv).n,25);
    assert.equal((await migrate()).status,200);assert.equal(drive.uploads,25);
  }finally{drive.restore();f.database.close();}
});
