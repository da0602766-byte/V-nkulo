import assert from 'node:assert/strict';
import test from 'node:test';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';
import { cpfLoginRequest } from './helpers/cpf-login.mjs';

test('planilha privada: sincronização atômica, retomada, texto seguro e acesso revogado', async () => {
  const {database,d1}=await createPilotD1();
  const originalFetch=globalThis.fetch;
  try {
    const worker=(await import('../dist/server/index.js')).default;
    const env={DB:d1,AUTH_SECRET:'sheet-test-secret-only',GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',ASSETS:{fetch:async()=>new Response('',{status:404})}};
    const ctx={waitUntil(){},passThroughOnException(){}};
    const uid=await createPilotUser(database,{nome:'Gestora planilha',email:'sheet@example.test',senha:'SheetTest123',memberships:[{comunidadeId:1,papel:'PASTOR'}]});
    const login=await worker.fetch(await cpfLoginRequest(env,new Request('https://localhost/api/auth/login',{method:'POST',body:new URLSearchParams({email:'sheet@example.test',senha:'SheetTest123'})})),env,ctx);
    const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    const call=(action,extra={})=>worker.fetch(new Request('https://localhost/api/pilot/visitantes/planilha',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({action,...extra})}),env,ctx);
    const authorize=await call('authorize'); assert.equal(authorize.status,200);
    const consentUrl=new URL((await authorize.json()).url);
    assert.ok(consentUrl.searchParams.get('scope').includes('/auth/spreadsheets'));
    const beforeConnection=await call('connect',{url:'https://docs.google.com/spreadsheets/d/test_private_spreadsheet_123456789/edit?usp=sharing'});
    assert.equal((await beforeConnection.json()).authorizationRequired,true);
    const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('vinkulo-google:'+env.AUTH_SECRET)),'AES-GCM',false,['encrypt']);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('test-refresh'));
    database.prepare("INSERT INTO google_connections (usuario_id,google_sub,google_email,refresh_token_ciphertext,refresh_token_iv,scopes,drive_enabled) VALUES (?,?,?,?,?,?,1)").run(uid,'test-sub','sheet@example.test',Buffer.from(ciphertext).toString('base64url'),Buffer.from(iv).toString('base64url'),'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly');
    let publicAccess=false, failWrite=false, disabledApi=true;
    const writes=[]; const sheets=[{properties:{sheetId:42,title:'Aba existente',gridProperties:{rowCount:1000,columnCount:40}}}];
    globalThis.fetch=async (input,options={})=>{
      const url=String(input); const json=body=>Response.json(body);
      if(url==='https://oauth2.googleapis.com/token')return json({access_token:'mock-access'});
      if(url.includes('/permissions?'))return json({permissions:[{type:publicAccess?'anyone':'user'}]});
      if(url.startsWith('https://sheets.googleapis.com/') && disabledApi)return Response.json({error:{details:[{reason:'SERVICE_DISABLED',metadata:{consumer:'projects/123456'}}]}},{status:403});
      if(url.startsWith('https://sheets.googleapis.com/') && !options.body)return json({sheets});
      if(url.startsWith('https://sheets.googleapis.com/') && options.body){
        const body=JSON.parse(options.body);
        if(body.requests[0].addSheet){sheets.push({properties:body.requests[0].addSheet.properties});return json({replies:[]});}
        if(failWrite)return new Response('unavailable',{status:503});
        writes.push(body); return json({replies:[]});
      }
      throw new Error('Unexpected network endpoint: '+url);
    };
    const personId=Number(database.prepare("INSERT INTO visitantes (comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado) VALUES (1,?,'2026-01-01','test',1)").run('=IMPORTXML("private")').lastInsertRowid);
    const url='https://docs.google.com/spreadsheets/d/test_private_spreadsheet_123456789/edit';
    const disabled=await call('connect',{url}); assert.equal(disabled.status,400);
    const diagnosis=await disabled.json(); assert.equal(diagnosis.code,'GOOGLE_API_DISABLED'); assert.match(diagnosis.helpUrl,/sheets.googleapis.com\?project=123456/);
    const failedConfig=database.prepare('SELECT * FROM visitante_planilha WHERE comunidade_id=1').get(); assert.equal(failedConfig.habilitada,0); assert.equal(failedConfig.sincronizado_em,null); assert.match(failedConfig.ultimo_erro,/está desativada/); assert.equal(writes.length,0);
    for(let i=0;i<8;i++) database.prepare("INSERT INTO visitante_campos(comunidade_id,nome,chave,tipo,criado_por) VALUES(1,?,?,'TEXTO',?)").run('Extra '+i,'extra '+i,uid);
    const field=database.prepare("SELECT id FROM visitante_campos WHERE chave='extra 0'").get();
    database.prepare("UPDATE visitantes SET campos_personalizados=? WHERE id=?").run(JSON.stringify({[field.id]:'=HYPERLINK("private")'}),personId);
    disabledApi=false;
    let response=await call('connect',{url}); assert.equal(response.status,200,await response.clone().text());
    let config=(await response.json()).config; assert.equal(config.ultimo_erro,null); assert.equal(config.versao,config.versao_sincronizada);
    const write=writes.at(-1).requests.find(r=>r.updateCells).updateCells;
    assert.notEqual(write.range.sheetId,42);
    assert.ok(write.range.endColumnIndex>40);
    assert.ok(writes.at(-1).requests.some(r=>r.appendDimension?.dimension==='COLUMNS'));
    assert.ok(write.rows[0].values.some(v=>v.userEnteredValue.stringValue==='Extra 0'));
    assert.ok(write.rows.some(r=>r.values.some(v=>v.userEnteredValue.stringValue==='=HYPERLINK("private")')));
    assert.ok(write.rows.some(r=>r.values.some(v=>v.userEnteredValue.stringValue==='=IMPORTXML("private")')));
    assert.ok(!JSON.stringify(write).includes('formulaValue'));
    database.prepare("UPDATE visitantes SET proxima_acao='Nova visita' WHERE id=?").run(personId);
    failWrite=true; response=await call('sync');config=(await response.json()).config; assert.ok(config.ultimo_erro);assert.ok(config.versao>config.versao_sincronizada);
    failWrite=false;response=await call('sync');config=(await response.json()).config; assert.equal(config.ultimo_erro,null);assert.equal(config.versao,config.versao_sincronizada);
    publicAccess=true;const prior=writes.length;response=await call('sync');config=(await response.json()).config;assert.match(config.ultimo_erro,/Restrinja/);assert.equal(writes.length,prior);
    publicAccess=false; database.prepare("DELETE FROM visitantes WHERE id=?").run(personId);response=await call('sync');config=(await response.json()).config;assert.equal(config.ultimo_erro,null);
    const clear=writes.at(-1).requests.find(r=>r.updateCells).updateCells;assert.ok(clear.range.endRowIndex>clear.rows.length,'removed rows are included in clear range');
    database.prepare("UPDATE usuario_comunidades SET status='SUSPENSO' WHERE usuario_id=?").run(uid);
    response=await call('sync');assert.notEqual(response.status,200);
  } finally {globalThis.fetch=originalFetch;database.close();}
});
