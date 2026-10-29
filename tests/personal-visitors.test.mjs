import assert from 'node:assert/strict';
import test from 'node:test';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';
import {emptyPersonalVisitors,savePersonalPerson,changePersonalPeople,addPersonalContact,validatePersonalVisitors,personalEvent} from '../app/lib/personal-visitors.ts';

test('lista pessoal preserva campos, duplicidade, contatos, arquivamento e histórico de 30 dias',()=>{
  const doc=emptyPersonalVisitors(21,1);
  const id=savePersonalPerson(doc,{nomeCompleto:'Ana Maria',dataEntrada:'2026-10-01',dataNascimento:'2000-02-29',telefone:'11988887777',categoriaNome:'Jovens',celulaNome:'Esperança',discipulado:'SIM',discipulador:'Maria',oficial:'SIM',funcaoOficial:'Diaconisa',cursoMembros:true,observacoes:'Observação privada'});
  assert.throws(()=>savePersonalPerson(doc,{nomeCompleto:'Ana Maria',dataEntrada:'2026-10-01'}),/semelhante/);
  assert.throws(()=>savePersonalPerson(doc,{nomeCompleto:'Data inválida',dataEntrada:'2026-02-30'}),/data/);
  savePersonalPerson(doc,{nomeCompleto:'Ana Maria Silva'},id);
  assert.equal(doc.people[0].observacoes,'Observação privada');assert.equal(doc.people[0].curso_membros,1);
  addPersonalContact(doc,{visitanteId:id,tipo:'TELEFONE',resultado:'Visita combinada',descricao:'Domingo',proximoContato:'2026-11-01'},'Oficial');
  assert.equal(doc.people[0].proximo_contato,'2026-11-01');
  changePersonalPeople(doc,[id],'arquivar');assert.equal(doc.people[0].ativo,0);assert.equal(doc.contacts.length,1);
  changePersonalPeople(doc,[id],'reativar');assert.equal(doc.people[0].ativo,1);
  doc.events[0].at='2020-01-01T00:00:00Z';personalEvent(doc,'Atualizado');assert.equal(doc.events.some(e=>e.at.startsWith('2020')),false);
  validatePersonalVisitors(doc,21,1);
  assert.throws(()=>validatePersonalVisitors(doc,22,1),/outra conta/);
  assert.throws(()=>validatePersonalVisitors(doc,21,2),/outra conta/);
  const bad=structuredClone(doc);bad.contacts[0].visitante_id=999;assert.throws(()=>validatePersonalVisitors(bad,21,1),/Contato/);
  changePersonalPeople(doc,[id],'excluir');assert.equal(doc.people.length,0);assert.equal(doc.contacts.length,0);
});

test('oficial abre aba pessoal sem receber lista do dono; storage e Drive são isolados por conta e comunidade',async()=>{
  const {database:db,d1}=await createPilotD1(),originalFetch=globalThis.fetch;
  try{
    const worker=(await import('../dist/server/index.js')).default;
    const env={DB:d1,AUTH_SECRET:'personal-visitors-test-only',GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',ASSETS:{fetch:async()=>new Response('',{status:404})}},ctx={waitUntil(){},passThroughOnException(){}};
    const owner=await createPilotUser(db,{nome:'Gestor',email:'personal-owner@example.test',senha:'PersonalTest123',memberships:[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]});
    const official=await createPilotUser(db,{nome:'Oficial',email:'personal-official@example.test',senha:'PersonalTest123',memberships:[{comunidadeId:1,papel:'MEMBRO'},{comunidadeId:2,papel:'MEMBRO'}]});
    const other=await createPilotUser(db,{nome:'Outra oficial',email:'personal-other@example.test',senha:'PersonalTest123'});
    const member=await createPilotUser(db,{nome:'Membro sem permissão',email:'personal-member@example.test',senha:'PersonalTest123'});
    const setPermissions=db.prepare("INSERT INTO oficiais_comunidade(usuario_comunidade_id,titulo,permissoes) SELECT id,'DIÁCONO',? FROM usuario_comunidades WHERE usuario_id=?");
    setPermissions.run('visitors.view,visitors.create,visitors.edit',official);setPermissions.run('visitors.view',other);
    async function login(email){const r=await worker.fetch(await cpfLoginRequest(env,new Request('https://localhost/api/auth/login',{method:'POST',body:new URLSearchParams({email,senha:'PersonalTest123'})})),env,ctx);assert.equal(r.status,303);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
    const cookie=await login('personal-official@example.test'),ownerCookie=await login('personal-owner@example.test'),otherCookie=await login('personal-other@example.test'),memberCookie=await login('personal-member@example.test');
    const endpoint=id=>`/api/pilot/visitantes/pessoal?usuario=${id}&comunidade=1`;
    const call=(path,method='GET',body,auth=cookie)=>worker.fetch(new Request('https://localhost'+path,{method,headers:{cookie:auth,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
    const ok=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
    const privateId=Number(db.prepare("INSERT INTO visitantes(comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado) VALUES(1,'Lista particular do administrador','2026-10-01','owner',1)").run().lastInsertRowid);
    const existingCount=db.prepare('SELECT count(*) n FROM visitantes').get().n;
    let html=await (await call('/painel')).text();assert.match(html,/visitorPersonalAccess[^,]{0,30}true/);assert.match(html,/>Visitantes</);
    assert.match(await (await call('/painel/visitantes')).text(),/Meus visitantes/);
    assert.match(await (await call('/painel/visitantes?lista=compartilhada')).text(),/Lista compartilhada indisponível/);
    for(const path of ['/api/pilot/visitantes/pagina','/api/pilot/visitantes','/api/pilot/visitantes/exportar','/api/pilot/visitantes/backup','/api/pilot/acompanhamentos'])assert.equal((await call(path)).status,403,path);
    assert.equal((await call(`/api/pilot/visitantes/${privateId}`,'PATCH',{nomeCompleto:'Não autorizado'})).status,403);
    assert.equal((await call(endpoint(member),'GET',null,memberCookie)).status,403);
    assert.equal((await call(endpoint(official),'GET',null,otherCookie)).status,409);
    assert.equal((await call(endpoint(official).replace('comunidade=1','comunidade=2'))).status,409);
    let state=await ok(await call(endpoint(official)));assert.equal(state.provider,null);
    await ok(await call(endpoint(official),'POST',{action:'local'}));
    state=await ok(await call(endpoint(official)));assert.equal(state.provider,'LOCAL');assert.equal(state.document,undefined);
    assert.equal((await ok(await call(endpoint(other),'GET',null,otherCookie))).provider,null);
    assert.equal(db.prepare('SELECT count(*) n FROM storage_preferences WHERE usuario_id=?').get(official).n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM visitante_pessoal_storage WHERE usuario_id=? AND comunidade_id=2').get(official).n,0);
    // An explicit read share opens the old list but does not inherit the official's edit grant.
    await ok(await call('/api/pilot/visitantes/compartilhamento','POST',{action:'grant',userId:official,role:'READ'},ownerCookie));
    assert.ok((await ok(await call('/api/pilot/visitantes/pagina'))).visitantes.some(p=>p.id===privateId));
    assert.equal((await call(`/api/pilot/visitantes/${privateId}`,'PATCH',{nomeCompleto:'Still denied'})).status,403);
    await ok(await call('/api/pilot/visitantes/compartilhamento','POST',{action:'revoke',userId:official},ownerCookie));
    // The owner's Drive can be unavailable; opening an official's own workspace
    // must not read that account's Google token or contacts.
    db.prepare("INSERT INTO visitante_drive(comunidade_id,usuario_id,estado,pasta_id,arquivo_id,hash,revisao) VALUES(1,?,'ACTIVE','owner-folder','owner-file','owner-hash',7)").run(owner);
    const ownerBefore=db.prepare('SELECT * FROM visitante_drive WHERE comunidade_id=1').get();
    assert.equal((await call('/painel')).status,200);assert.match(await (await call('/painel/visitantes')).text(),/Meus visitantes/);
    const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('vinkulo-google:'+env.AUTH_SECRET)),'AES-GCM',false,['encrypt']);
    for(const [id,email] of [[official,'personal-official@example.test'],[other,'personal-other@example.test']]){
      const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('refresh-'+id));
      db.prepare('INSERT INTO google_connections(usuario_id,google_sub,google_email,refresh_token_ciphertext,refresh_token_iv,scopes,drive_enabled) VALUES(?,?,?,?,?,?,1)').run(id,'personal-sub-'+id,email,Buffer.from(cipher).toString('base64url'),Buffer.from(iv).toString('base64url'),'https://www.googleapis.com/auth/drive.file');
    }
    const files=new Map();let seq=0,failRead=false,failUpload=false,beforeUpload;
    globalThis.fetch=async(input,options={})=>{
      const url=String(input);
      if(url==='https://oauth2.googleapis.com/token'){const refresh=new URLSearchParams(options.body).get('refresh_token');assert.ok(refresh===`refresh-${official}`||refresh===`refresh-${other}`);return Response.json({access_token:refresh});}
      const token=options.headers?.Authorization;
      if(url.startsWith('https://www.googleapis.com/upload/drive/v3/files')){
        if(failUpload)return new Response('',{status:503});if(beforeUpload){const f=beforeUpload;beforeUpload=null;await f();}
        const text=new TextDecoder().decode(options.body),boundary=String(options.headers['Content-Type']).split('boundary=')[1];
        const parts=text.split('--'+boundary),payload=parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/,'');
        const id='file-'+(++seq);files.set(id,{payload,token});return Response.json({id});
      }
      if(url.startsWith('https://www.googleapis.com/drive/v3/files?')&&options.method==='POST'){const id='folder-'+(++seq);files.set(id,{payload:null,token});return Response.json({id});}
      if(url.startsWith('https://www.googleapis.com/drive/v3/files/')){
        const u=new URL(url),id=u.pathname.split('/').at(-1),file=files.get(id);assert.ok(file,`No access to owner's file: ${id}`);assert.equal(file.token,token);
        if(u.searchParams.get('alt')==='media')return failRead?new Response('',{status:503}):new Response(file.payload);
        return Response.json({id,trashed:false,capabilities:{canEdit:true},permissions:[{type:'user',role:'owner'}]});
      }
      throw new Error('Unexpected external request '+url);
    };
    const auth=await call(endpoint(official),'POST',{action:'authorize'}),authBody=await ok(auth);
    const stateParam=new URL(authBody.url).searchParams.get('state');
    const denied=await worker.fetch(new Request('https://localhost/api/auth/google/callback?error=access_denied&state='+encodeURIComponent(stateParam),{headers:{cookie:cookie+'; '+auth.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')}}),env,ctx);
    assert.match(denied.headers.get('location'),/visitantes\?lista=pessoal/);
    const doc=emptyPersonalVisitors(official,1);savePersonalPerson(doc,{nomeCompleto:'Pessoa exclusiva do oficial',dataEntrada:'2026-10-01'});
    failRead=true;assert.equal((await call(endpoint(official),'POST',{action:'drive',document:doc})).status,503);failRead=false;
    assert.equal((await ok(await call(endpoint(official)))).provider,'LOCAL');
    let result=await ok(await call(endpoint(official),'POST',{action:'drive',document:doc}));assert.equal(result.document.people[0].nome_completo,'Pessoa exclusiva do oficial');
    assert.equal(db.prepare('SELECT count(*) n FROM visitantes').get().n,existingCount);assert.deepEqual(db.prepare('SELECT * FROM visitante_drive WHERE comunidade_id=1').get(),ownerBefore);
    await ok(await call(endpoint(other),'POST',{action:'drive'},otherCookie));
    const others=await ok(await call(endpoint(other)+'&dados=1','GET',null,otherCookie));assert.equal(others.document.people.length,0);assert.notEqual(others.folderUrl,(await ok(await call(endpoint(official)))).folderUrl);
    const foreign=structuredClone(result.document);foreign.userId=other;
    assert.equal((await call(endpoint(official),'PATCH',{revision:result.document.revision,document:foreign})).status,400);
    const stale=structuredClone(result.document),updated=structuredClone(stale);savePersonalPerson(updated,{nomeCompleto:'Atualização pessoal'},1);
    failUpload=true;assert.equal((await call(endpoint(official),'PATCH',{revision:stale.revision,document:updated})).status,503);failUpload=false;
    assert.equal((await ok(await call(endpoint(official)+'&dados=1'))).document.people[0].nome_completo,'Pessoa exclusiva do oficial');
    result=await ok(await call(endpoint(official),'PATCH',{revision:stale.revision,document:updated}));
    assert.equal((await call(endpoint(official),'PATCH',{revision:stale.revision,document:stale})).status,409);
    assert.equal((await call(endpoint(official),'POST',{action:'local'})).status,409);
    // A competing successful save wins; the older request cannot swap its pointer.
    const base=structuredClone(result.document),competing=structuredClone(base);savePersonalPerson(competing,{nomeCompleto:'Edição concorrente'},1);
    beforeUpload=async()=>{await ok(await call(endpoint(official),'PATCH',{revision:base.revision,document:competing}));};
    assert.equal((await call(endpoint(official),'PATCH',{revision:base.revision,document:base})).status,409);
    result=await ok(await call(endpoint(official)+'&dados=1'));assert.equal(result.document.people[0].nome_completo,'Edição concorrente');
    beforeUpload=()=>db.prepare('UPDATE oficiais_comunidade SET permissoes=\'\' WHERE usuario_comunidade_id IN (SELECT id FROM usuario_comunidades WHERE usuario_id=?)').run(official);
    assert.equal((await call(endpoint(official),'PATCH',{revision:result.document.revision,document:result.document})).status,403);
    assert.equal((await call(endpoint(official))).status,403);
    assert.deepEqual(db.prepare('SELECT * FROM visitante_drive WHERE comunidade_id=1').get(),ownerBefore);
    assert.equal(db.prepare('SELECT nome_completo FROM visitantes WHERE id=?').get(privateId).nome_completo,'Lista particular do administrador');
    db.prepare("INSERT INTO configuracoes(chave,valor,atualizado_por) VALUES('community_modules:1','[\"feed\"]','test') ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run();
    assert.equal((await call(endpoint(other),'GET',null,otherCookie)).status,403);
  }finally{globalThis.fetch=originalFetch;db.close();}
});
