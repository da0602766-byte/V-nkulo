import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { customFieldValue, customFieldNameIssue, inferCustomFieldType, visitorExportWorksheet, visitorWorkbookTables, prepareImportRows } from '../app/lib/visitor-spreadsheet.ts';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';
import { cpfLoginRequest } from './helpers/cpf-login.mjs';

test('sugere tipos conservadores, preserva zeros e valida nome, data, horário e tamanho',()=>{
 assert.equal(inferCustomFieldType(['00123','00234']),'TEXTO');
 assert.equal(inferCustomFieldType(['12','23']),'NUMERO');
 assert.equal(inferCustomFieldType(['12,5','23.5']),'NUMERO');
 assert.equal(inferCustomFieldType(['Sim','Não']),'SIM_NAO');
 assert.equal(inferCustomFieldType(['14/04/2024','15/05/2024']),'DATA');
 assert.equal(inferCustomFieldType([new Date('2024-04-14T13:30:02.446Z')]),'DATA_HORA');
 assert.equal(inferCustomFieldType(['14/04/2024','Sem informação']),'TEXTO');
 assert.ok(customFieldNameIssue('Observações'));assert.ok(customFieldNameIssue('Idade'));assert.ok(customFieldNameIssue('Nome completo'));assert.equal(customFieldNameIssue('Motivo da visita'),'');
 assert.deepEqual(customFieldValue('Não','SIM_NAO'),{value:'NAO'});
 assert.ok(customFieldValue('31/02/2024','DATA').error);assert.ok(customFieldValue('14/04/2024 25:00','DATA_HORA').error);
 assert.ok(customFieldValue('14/04/2024 12:30','DATA').error);
 assert.ok(customFieldValue('x'.repeat(2001),'TEXTO').error);assert.ok(customFieldValue({},'TEXTO').error);
 assert.equal(customFieldValue('14/04/2024 13:30:02.446','DATA_HORA').value,'2024-04-14T13:30:02.446');
});

test('novos campos saem separados, datas/horários reimportam, zero e texto de fórmula continuam literais',()=>{
 const fields=[{id:1,nome:'Motivo da visita',chave:'motivo da visita',tipo:'TEXTO'},{id:2,nome:'Recebido em',chave:'recebido em',tipo:'DATA_HORA'},{id:3,nome:'Quantidade',chave:'quantidade',tipo:'NUMERO'},{id:4,nome:'Autorização',chave:'autorizacao',tipo:'SIM_NAO'}];
 const rows=[{Nome:'Pessoa sintética','Data de entrada':'2024-04-14',Observações:'Nota independente','Motivo da visita':'=SOMAR(1;2)','Recebido em':'2024-04-14T13:30:02.446',Quantidade:0,Autorização:'Não'}];
 const sheet=visitorExportWorksheet(XLSX,rows,fields);assert.equal(sheet.D2.t,'s');assert.equal(sheet.D2.f,undefined);assert.equal(sheet.E2.t,'n');assert.equal(sheet.F2.v,0);
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,sheet,'Pessoas');const parsed=XLSX.read(XLSX.write(w,{type:'buffer',bookType:'xlsx'}),{cellNF:true});const [table]=visitorWorkbookTables(parsed);
 const mapping=table.mapping.map((target,i)=>fields.some(f=>f.nome===table.headers[i])?`custom:${fields.find(f=>f.nome===table.headers[i]).id}`:target);
 const configs=table.headers.map(nome=>fields.find(f=>f.nome===nome)||{nome,tipo:'TEXTO'});
 const [row]=prepareImportRows(table,mapping,[],[],{},'','2026-10-17',configs);assert.deepEqual(row.issues,[]);assert.equal(row.customValues[4],'2024-04-14T13:30:02.446');assert.equal(row.customValues[5],0);assert.equal(row.customValues[6],'NAO');assert.equal(row.payload.observacoes,'Nota independente');
});

test('Worker persiste e edita campos, exporta em colunas, protege permissões e comunidades',async()=>{
 const {database,d1}=await createPilotD1();
 try {
  const worker=(await import('../dist/server/index.js')).default;
  const env={DB:d1,AUTH_SECRET:'custom-fields-test-only',ASSETS:{fetch:async()=>new Response('',{status:404})}},ctx={waitUntil(){},passThroughOnException(){}};
  await createPilotUser(database,{nome:'Gestora teste',email:'fields@example.test',senha:'FieldsTest123',memberships:[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]});
  await createPilotUser(database,{nome:'Membro teste',email:'fields-member@example.test',senha:'FieldsTest123',memberships:[{comunidadeId:1,papel:'MEMBRO'}]});
  async function login(email){const r=await worker.fetch(await cpfLoginRequest(env,new Request('http://localhost/api/auth/login',{method:'POST',body:new URLSearchParams({email,senha:'FieldsTest123'})})),env,ctx);assert.equal(r.status,303);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
  const auth=await login('fields@example.test'),member=await login('fields-member@example.test');
  const call=(path,method='GET',body,cookie=auth)=>worker.fetch(new Request('http://localhost'+path,{method,headers:{cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
  for(const path of ['/api/pilot/visitantes/campos','/api/pilot/visitantes/exportar']){assert.equal((await call(path,'GET',null,member)).status,403);assert.notEqual((await call(path,'GET',null,'')).status,200);}
  const drafts=[{nome:'Motivo da visita',tipo:'TEXTO'},{nome:'Retorno combinado',tipo:'DATA'},{nome:'Horário do cadastro',tipo:'DATA_HORA'},{nome:'Quantidade',tipo:'NUMERO'},{nome:'Autorização adicional',tipo:'SIM_NAO'}];
  assert.equal((await call('/api/pilot/visitantes/campos','POST',{campos:drafts},member)).status,403);
  assert.equal((await call('/api/pilot/visitantes/campos','POST',{campos:[{nome:'Idade',tipo:'TEXTO'}]})).status,400);
  let response=await call('/api/pilot/visitantes/campos','POST',{campos:drafts});assert.equal(response.status,201,await response.clone().text());const {campos}=await response.json();assert.equal(campos.length,5);
  assert.equal((await call('/api/pilot/visitantes/campos','POST',{campos:[{nome:' MOTIVO da VISITA ',tipo:'TEXTO'}]})).status,201);assert.equal(database.prepare('SELECT count(*) AS n FROM visitante_campos WHERE comunidade_id=1').get().n,5);
  assert.equal((await call('/api/pilot/visitantes/campos','POST',{campos:[{nome:'Motivo da visita',tipo:'DATA'}]})).status,409);
  assert.equal((await call('/api/pilot/visitantes/campos','POST',{campos:[{nome:'Outra',tipo:'TEXTO'},{nome:'oÚtra',tipo:'TEXTO'}]})).status,400);
  const vals=Object.fromEntries(campos.map((field,i)=>[field.id,['Convite','2026-11-01','2024-04-14T13:30:02.446',0,'NAO'][i]]));
  response=await call('/api/pilot/visitantes','POST',{nomeCompleto:'Pessoa fictícia dos campos',dataEntrada:'2024-04-14',observacoes:'Nota separada',camposPersonalizados:vals});assert.equal(response.status,201,await response.clone().text());const {id}=await response.json();
  assert.deepEqual(JSON.parse(database.prepare('SELECT campos_personalizados FROM visitantes WHERE id=?').get(id).campos_personalizados),vals);
  assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{status:'INTEGRADO'})).status,200);
  assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{camposPersonalizados:{[campos[0].id]:'Novo motivo'}})).status,200);
  assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{camposPersonalizados:{[campos[1].id]:'31/02/2024'}})).status,400);
  const foreign=Number(database.prepare("INSERT INTO visitante_campos(comunidade_id,nome,chave,tipo,criado_por) VALUES(2,'Campo privado','campo privado','TEXTO',1)").run().lastInsertRowid);
  assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{camposPersonalizados:{[foreign]:'Proibido'}})).status,400);
  assert.equal((await call('/api/pilot/visitantes','POST',{nomeCompleto:'Outra pessoa',dataEntrada:'2024-04-14',camposPersonalizados:{[foreign]:'Proibido'}})).status,400);
  const person=(await (await call('/api/pilot/visitantes?id='+id)).json()).visitantes[0];assert.equal(JSON.parse(person.campos_personalizados)[campos[0].id],'Novo motivo');assert.equal(JSON.parse(person.campos_personalizados)[campos[1].id],'2026-11-01');
  for(const suffix of ['','?diretorio=1']) {
   response=await call('/api/pilot/visitantes/exportar'+suffix);assert.equal(response.status,200);const exported=await response.json(),row=exported.rows.find(v=>v.ID===id);assert.equal(row['Motivo da visita'],'Novo motivo');assert.equal(row.Quantidade,0);assert.equal(row['Retorno combinado'],'2026-11-01');assert.equal(row.Observações,'Nota separada');assert.equal(row['Autorização adicional'],'Não');assert.equal(row['Campo privado'],undefined);assert.equal(exported.campos.length,5);assert.ok(exported.rows.every(v=>Object.hasOwn(v,'Motivo da visita')));
  }
  assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{camposPersonalizados:JSON.stringify({[campos[0].id]:''})})).status,200);assert.equal(JSON.parse(database.prepare('SELECT campos_personalizados FROM visitantes WHERE id=?').get(id).campos_personalizados)[campos[0].id],undefined);
 } finally {database.close();}
});
