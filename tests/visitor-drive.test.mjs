import assert from 'node:assert/strict';
import test from 'node:test';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';

test('Drive: migração verificada, fonte externa, isolamento, concessão/revogação, recuperação e falhas sem perda',async()=>{
  const {database:db,d1}=await createPilotD1(),originalFetch=globalThis.fetch;
  try {
    const worker=(await import('../dist/server/index.js')).default;
    const env={DB:d1,AUTH_SECRET:'drive-storage-tests-only',GOOGLE_CLIENT_ID:'drive-test',GOOGLE_CLIENT_SECRET:'drive-test-secret',ASSETS:{fetch:async()=>new Response('',{status:404})}};
    const ctx={waitUntil(){},passThroughOnException(){}};
    const owner=await createPilotUser(db,{nome:'Gestor Drive',email:'drive-owner@example.test',senha:'DriveTest123',memberships:[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]});
    const editor=await createPilotUser(db,{nome:'Outro gestor',email:'drive-editor@example.test',senha:'DriveTest123',memberships:[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]});
    await createPilotUser(db,{nome:'Outra comunidade',email:'drive-other@example.test',senha:'DriveTest123',memberships:[{comunidadeId:2,papel:'ADMIN_COMUNIDADE'}]});
    const login=async email=>{const r=await worker.fetch(await cpfLoginRequest(env,new Request('https://localhost/api/auth/login',{method:'POST',body:new URLSearchParams({email,senha:'DriveTest123'})})),env,ctx);assert.equal(r.status,303);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');};
    const ownerCookie=await login('drive-owner@example.test'),editorCookie=await login('drive-editor@example.test'),otherCookie=await login('drive-other@example.test');
    const call=(path,method='GET',body,cookie=ownerCookie)=>worker.fetch(new Request('https://localhost'+path,{method,headers:{cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
    const storage=(action,extra={},cookie=ownerCookie)=>call('/api/pilot/visitantes/armazenamento','POST',{action,...extra},cookie);
    const ok=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
    const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('vinkulo-google:'+env.AUTH_SECRET)),'AES-GCM',false,['encrypt']);
    const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('refresh-test'));
    db.prepare('INSERT INTO google_connections(usuario_id,google_sub,google_email,refresh_token_ciphertext,refresh_token_iv,scopes,drive_enabled) VALUES(?,?,?,?,?,?,1)').run(owner,'drive-test-sub','drive-owner@example.test',Buffer.from(cipher).toString('base64url'),Buffer.from(iv).toString('base64url'),'https://www.googleapis.com/auth/drive.file');
    const files=new Map();let seq=0,failRead=false,failUpload=false,publicAccess=false,beforeUpload;
    globalThis.fetch=async(input,options={})=>{
      const url=String(input);
      if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'access-test'});
      if(url.startsWith('https://www.googleapis.com/upload/drive/v3/files')){
        if(failUpload)return new Response('Unavailable',{status:503});
        if(beforeUpload){const f=beforeUpload;beforeUpload=null;await f();}
        const text=new TextDecoder().decode(options.body),boundary=String(options.headers['Content-Type']).split('boundary=')[1];
        const parts=text.split('--'+boundary);const payload=parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/,'');
        const id='file-'+(++seq);files.set(id,payload);return Response.json({id});
      }
      if(url.startsWith('https://www.googleapis.com/drive/v3/files?')&&options.method==='POST'){const id='folder-'+(++seq);files.set(id,null);return Response.json({id});}
      if(url.startsWith('https://www.googleapis.com/drive/v3/files/')){
        const u=new URL(url),id=u.pathname.split('/').at(-1);
        if(!files.has(id))return new Response('',{status:404});
        if(u.searchParams.get('alt')==='media')return failRead?new Response('',{status:503}):new Response(files.get(id),{headers:{'Content-Type':'application/json'}});
        return Response.json({id,trashed:false,capabilities:{canEdit:true},permissions:[{type:publicAccess?'anyone':'user',role:'owner'}]});
      }
      throw new Error('Unexpected external request '+url);
    };
    const created=await call('/api/pilot/visitantes','POST',{nomeCompleto:'Pessoa com histórico',dataEntrada:'2026-10-01',dataNascimento:'1990-03-01',observacoes:'Observação preservada'});
    assert.equal(created.status,201,await created.clone().text());const {id}=await created.json();
    assert.equal((await call('/api/pilot/acompanhamentos','POST',{visitanteId:id,tipo:'TELEFONE',resultado:'Contato preservado'})).status,201);
    assert.equal((await call('/api/pilot/anotacoes','POST',{titulo:'Nota privada de outro gestor',texto:'Somente o autor'} ,editorCookie)).status,200);
    db.prepare("INSERT INTO visitantes(comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado) VALUES(2,'Não migrar','2026-10-01','test',1)").run();
    const legacy=await ok(await call('/api/pilot/visitantes/pagina','GET',null,editorCookie));assert.ok(legacy.visitantes.some(p=>p.id===id));
    const authResponse=await storage('authorize'),authUrl=new URL((await ok(authResponse)).url);
    const callback=await worker.fetch(new Request('https://localhost/api/auth/google/callback?error=access_denied&state='+encodeURIComponent(authUrl.searchParams.get('state')),{headers:{cookie:authResponse.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')}}),env,ctx);
    assert.match(callback.headers.get('location'),/visitantes\?section=armazenamento/);
    // Refuse a corrupted upload/read; preserve the source and resumable lock.
    failRead=true;assert.equal((await storage('prepare')).status,503);assert.equal(db.prepare('SELECT count(*) n FROM visitantes WHERE comunidade_id=1').get().n,1);
    assert.throws(()=>db.prepare("UPDATE visitantes SET nome_completo='Perda' WHERE id=?").run(id),/VISITOR_DRIVE_REQUIRED/);
    failRead=false;let prepared=await ok(await storage('prepare'));assert.equal(prepared.counts.visitantes,1);
    let verified=await ok(await storage('verify'));assert.equal((await storage('activate',{revision:verified.revision,confirmation:'SEM CONFIRMAÇÃO'})).status,409);
    const backupBefore=await ok(await call('/api/pilot/visitantes/backup'));assert.equal(backupBefore.tables.acompanhamentos.length,1);assert.ok(!JSON.stringify(backupBefore).includes('Somente o autor'));
    await ok(await storage('activate',{revision:verified.revision,confirmation:'MIGRAR VISITANTES'}));
    for(const table of ['visitantes','acompanhamentos','visitor_contacts','visitor_visits','visitante_categorias','visitante_campos'])assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE comunidade_id=1`).get().n,0,table);
    assert.equal(db.prepare("SELECT count(*) n FROM layouts_interface WHERE comunidade_id=1 AND escopo LIKE 'care-notes:user:%'").get().n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM visitantes WHERE comunidade_id=2').get().n,1);
    let page=await ok(await call('/api/pilot/visitantes/pagina'));assert.equal(page.visitantes.find(p=>p.id===id).observacoes,'Observação preservada');
    assert.equal((await call('/api/pilot/visitantes/pagina','GET',null,editorCookie)).status,403);
    await ok(await storage('grant',{userId:editor,role:'READ'}));
    page=await ok(await call('/api/pilot/visitantes/pagina','GET',null,editorCookie));assert.equal(page.visitantes.length,1);
    assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{nomeCompleto:'Não autorizado'},editorCookie)).status,403);
    await ok(await storage('grant',{userId:editor,role:'EDIT'}));
    const staleRevision=(await ok(await call('/api/pilot/visitantes/pagina'))).visitantes[0]._driveRevision;
    await ok(await call(`/api/pilot/visitantes/${id}`,'PATCH',{nomeCompleto:'Editado no Drive'},editorCookie));
    const stale=await worker.fetch(new Request(`https://localhost/api/pilot/visitantes/${id}`,{method:'PATCH',headers:{cookie:ownerCookie,'Content-Type':'application/json','X-Vinkulo-Visitor-Revision':String(staleRevision)},body:JSON.stringify({nomeCompleto:'Edição antiga'})}),env,ctx);assert.equal(stale.status,409,await stale.clone().text());
    page=await ok(await call('/api/pilot/visitantes/pagina'));assert.equal(page.visitantes[0].nome_completo,'Editado no Drive');
    assert.equal(db.prepare('SELECT count(*) n FROM visitantes WHERE comunidade_id=1').get().n,0);
    const notes=await ok(await call('/api/pilot/anotacoes','GET',null,editorCookie));assert.equal(notes.anotacoes[0].texto,'Somente o autor');
    const ownerNotes=await ok(await call('/api/pilot/anotacoes'));assert.equal(ownerNotes.anotacoes.length,0);
    assert.equal((await call('/api/pilot/anotacoes','POST',{titulo:'Minha nota',texto:'Persistida no Drive'})).status,200);
    assert.equal((await ok(await call('/api/pilot/anotacoes'))).anotacoes[0].texto,'Persistida no Drive');
    // Remote failure never acknowledges an unsaved edit or recreates source rows.
    failUpload=true;assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{nomeCompleto:'Não salvo'})).status,503);failUpload=false;
    page=await ok(await call('/api/pilot/visitantes/pagina'));assert.equal(page.visitantes[0].nome_completo,'Editado no Drive');
    beforeUpload=()=>storage('revoke',{userId:editor}).then(ok);
    assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{nomeCompleto:'Revogado durante envio'},editorCookie)).status,409);
    assert.equal((await call('/api/pilot/visitantes/pagina','GET',null,editorCookie)).status,403);
    assert.equal((await call('/api/pilot/visitantes/backup','GET',null,editorCookie)).status,403);
    const other=await ok(await call('/api/pilot/visitantes/pagina','GET',null,otherCookie));assert.equal(other.visitantes.some(p=>p.nome_completo==='Editado no Drive'),false);
    const state=await ok(await call('/api/pilot/visitantes/armazenamento'));
    const wrong=structuredClone(backupBefore);wrong.communityId=2;
    assert.notEqual((await storage('restore',{archive:wrong,revision:state.revision,confirmation:'RESTAURAR BACKUP'})).status,200);
    await ok(await storage('restore',{archive:backupBefore,revision:state.revision,confirmation:'RESTAURAR BACKUP'}));
    page=await ok(await call('/api/pilot/visitantes/pagina'));assert.equal(page.visitantes[0].nome_completo,'Pessoa com histórico');
    const history=await ok(await call(`/api/pilot/acompanhamentos?visitanteId=${id}`));assert.equal(history.acompanhamentos[0].resultado,'Contato preservado');
    const category=await call('/api/pilot/visitante-categorias','POST',{nome:'Categoria Drive',icone:'◎',cor:'#7357e8'});assert.equal(category.status,201,await category.clone().text());const categoryId=(await category.json()).id;
    const custom=await call('/api/pilot/visitantes/campos','POST',{campos:[{nome:'Observação adicional',tipo:'TEXTO'}]});assert.equal(custom.status,201,await custom.clone().text());const fieldId=(await custom.json()).campos[0].id;
    const imported=await call('/api/pilot/visitantes','POST',{nomeCompleto:'Importação de planilha',dataEntrada:'2026-10-01',categoriaId:categoryId,camposPersonalizados:{[fieldId]:'Zeros 001 e acentos ç ã'}});assert.equal(imported.status,201,await imported.clone().text());
    const exported=await ok(await call('/api/pilot/visitantes/exportar'));assert.ok(exported.rows.some(r=>r['Observação adicional']==='Zeros 001 e acentos ç ã'));
    for(const path of ['/api/pilot/visitante-categorias','/api/pilot/celulas','/api/pilot/ministerios'])await ok(await call(path));
    const cell=Number(db.prepare("INSERT INTO celulas(comunidade_id,nome,responsavel,criado_por,escopo_confirmado) VALUES(1,'Célula Drive','Gestor','test',1)").run().lastInsertRowid);
    await ok(await call(`/api/pilot/visitantes/${id}`,'PATCH',{celulaId:cell}));
    failUpload=true;assert.equal((await call(`/api/pilot/celulas/${cell}`,'DELETE')).status,503);assert.equal(db.prepare('SELECT ativo FROM celulas WHERE id=?').get(cell).ativo,1);failUpload=false;
    await ok(await call(`/api/pilot/celulas/${cell}`,'DELETE'));assert.equal(db.prepare('SELECT ativo FROM celulas WHERE id=?').get(cell).ativo,0);
    assert.equal((await ok(await call('/api/pilot/visitantes/pagina'))).visitantes.find(p=>p.id===id).celula_id,null);
    await ok(await call(`/api/pilot/visitantes/${id}`,'DELETE'));
    page=await ok(await call('/api/pilot/visitantes/pagina'));assert.equal(page.visitantes.find(p=>p.id===id).ativo,0);
    await ok(await call(`/api/pilot/visitantes/${id}`,'PATCH',{reativar:true}));
    await ok(await call(`/api/pilot/visitantes/${id}?permanente=1`,'DELETE'));
    const empty=await ok(await call('/api/pilot/visitantes/backup'));assert.equal(empty.tables.visitantes.length,1);assert.equal(empty.tables.acompanhamentos.length,0);
    publicAccess=true;assert.equal((await storage('verify')).status,403);publicAccess=false;
    assert.throws(()=>db.prepare("INSERT INTO visitantes(comunidade_id,nome_completo,data_entrada,criado_por) VALUES(1,'Bloqueado','2026-10-01','test')").run(),/VISITOR_DRIVE_REQUIRED/);
  }finally{globalThis.fetch=originalFetch;db.close();}
});
