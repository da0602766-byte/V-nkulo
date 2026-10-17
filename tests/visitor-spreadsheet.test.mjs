import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { inferCustomFieldType, importDate, visitorWorkbookTables, prepareImportRows, readVisitorWorkbook, visitorExportWorksheet, suggestField } from '../app/lib/visitor-spreadsheet.ts';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';
import { cpfLoginRequest } from './helpers/cpf-login.mjs';

const headers=['Carimbo de data/hora','Nome Completo','Data de nascimento','Mês','Semana','Data','Gênero','Batismo','Número','Motivo da Visita','Tipo','0Responsável - Kids','Responsável  - Teen','Encontro com Deus','EC 27/08 ESTATUS'];
function workbook(rows, name='Cadastros de Pessoas') { const w=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),name); return w; }
function example() { return workbook([headers,[45396.5625,'Pessoa de teste',37497,'Abril','Domingo',45396,'Grupo de exemplo','Sim',47999998888,'Convidado','O2','','','Não participou','Convidado']]); }
const prepare=(table, options={})=>prepareImportRows(table,options.mapping||table.mapping,options.categories||[],options.cells||[],options.choices||{},options.fallback||'','2026-10-16');

test('reconhece os títulos do arquivo legado e mantém categorias, contatos e datas',()=>{
 const w=example(); w.Sheets[w.SheetNames[0]].A2.z='dd/mm/yyyy hh:mm';w.Sheets[w.SheetNames[0]].C2.z='mm/dd/yy';w.Sheets[w.SheetNames[0]].F2.z='mm/dd/yy';
 const [table]=visitorWorkbookTables(w),[row]=prepare(table);
 assert.equal(row.payload.telefone,'47999998888');assert.equal(row.payload.categoriaNome,'O2');assert.equal(row.payload.dataEntrada,'2024-04-14');assert.equal(row.payload.dataNascimento,'2002-08-29');assert.equal(row.payload.batizado,'SIM');assert.equal(row.payload.encontroComDeus,false);assert.deepEqual(row.issues,[]);
 assert.equal(row.payload.observacoes,'');assert.equal(row.customValues[0],'2024-04-14T13:30:00');assert.equal(row.customValues[9],'Convidado');assert.equal(row.customValues[14],'Convidado');
 assert.equal(suggestField('  RESPONSÁVEL  - Teen '),'parente');
});
test('não adivinha datas inválidas nem perde o valor original',()=>{
 for(const date of ['31/02/2024','2024-02-30','14/04/24','texto',60]) assert.equal(importDate(date),'');
 assert.equal(importDate('29/02/2024'),'2024-02-29');assert.equal(importDate('2024-04-14 13:30:00'),'2024-04-14');
 const [table]=visitorWorkbookTables(workbook([['Nome','Data','Nascimento'],['Teste','31/02/2024','29/02/2024']]));
 const [row]=prepare(table,{fallback:'2026-10-01'});assert.match(row.issues.join(),/31\/02\/2024/);assert.equal(row.payload.dataNascimento,'2024-02-29');
 const [missing]=visitorWorkbookTables(workbook([['Nome','Telefone'],['Teste','001234']]));assert.ok(prepare(missing)[0].issues.length);assert.equal(prepare(missing,{fallback:'2024-04-14'})[0].payload.dataEntrada,'2024-04-14');
});
test('CSV brasileiro preserva acentos, números e datas ambíguas sem conversão americana',()=>{
 const bytes=new TextEncoder().encode('Nome Completo,Número,Data,Data de nascimento,Tipo\nTeste,001234,10/05/2024,01/12/1995,Teen');
 const [table]=visitorWorkbookTables(readVisitorWorkbook(XLSX,bytes.buffer,true));
 const [row]=prepare(table);assert.equal(row.payload.telefone,'001234');assert.equal(row.payload.dataEntrada,'2024-05-10');assert.equal(row.payload.dataNascimento,'1995-12-01');assert.deepEqual(row.issues,[]);
});
test('detecta cabeçalhos abaixo do título e listas lado a lado sem juntar ou duplicar',()=>{
 const w=workbook([['Relatório'],['Nome completo','Tipo','','Nome completo','Tipo'],['Pessoa um','Teen','','Pessoa dois','O2']]);w.Sheets[w.SheetNames[0]]['!ref']='A1:Z50500';
 const tables=visitorWorkbookTables(w);assert.equal(tables.length,2);assert.equal(tables[0].rows.length,1);assert.equal(tables[1].rows.length,1);assert.equal(tables[0].headerRow,2);assert.equal(prepare(tables[1],{fallback:'2024-04-14'})[0].payload.nomeCompleto,'Pessoa dois');
});
test('usa datas do sistema 1904 e preserva zeros no telefone textual',()=>{
 const w=workbook([['Nome','Data','Telefone'],['Teste',1,'0012345']]);w.Workbook={WBProps:{date1904:true}};w.Sheets[w.SheetNames[0]].B2.z='mm/dd/yy';
 const [row]=prepare(visitorWorkbookTables(w)[0]);assert.equal(row.payload.dataEntrada,'1904-01-02');assert.equal(row.payload.telefone,'0012345');
});
test('categorias são revisáveis, campos desconhecidos preservados e excesso bloqueado',()=>{
 const [table]=visitorWorkbookTables(workbook([['Nome','Data','Tipo','Célula','Nova coluna'],['Teste','14/04/2024','Teen','Horizonte','Contexto']]));
 const [row]=prepare(table,{categories:[{id:7,nome:'TEEN'}],cells:[{id:4,nome:'Horizonte'}]});assert.equal(row.payload.categoriaId,'7');assert.equal(row.payload.celulaId,'4');assert.equal(row.payload.observacoes,'');assert.equal(row.customValues[4],'Contexto');
 const [other]=prepare(table,{categories:[{id:8,nome:'Jovens'}],choices:{Teen:'8'}});assert.equal(other.payload.categoriaNome,'Jovens');assert.equal(other.payload.categoriaId,'8');
 const [none]=prepare(table,{choices:{Teen:'none'}});assert.equal(none.payload.categoriaNome,'');assert.match(none.payload.observacoes,/Categoria original: Teen/);
 table.rows[0].values[4]='x'.repeat(2100);assert.match(prepare(table)[0].issues.join(),/2000 caracteres/);
});
test('exportação tem datas numéricas ordenáveis e reimporta o mesmo dia, categoria e telefone',()=>{
 const rows=[{Nome:'Teste','Data de nascimento':'2002-08-29','Data de entrada':'2024-04-14',Telefone:'001234567',Categoria:'Kids',Observações:'Motivo da Visita: Convidado'}];
 const sheet=visitorExportWorksheet(XLSX,rows);assert.equal(sheet.B2.t,'n');assert.equal(sheet.B2.z,'dd/mm/yyyy');assert.equal(sheet.D2.t,'s');assert.ok(sheet['!autofilter']);
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,sheet,'Pessoas');const parsed=XLSX.read(XLSX.write(w,{type:'buffer',bookType:'xlsx'}),{cellNF:true});const [result]=prepare(visitorWorkbookTables(parsed)[0]);assert.equal(result.payload.dataNascimento,'2002-08-29');assert.equal(result.payload.dataEntrada,'2024-04-14');assert.equal(result.payload.telefone,'001234567');assert.equal(result.payload.categoriaNome,'Kids');assert.match(result.payload.observacoes,/Motivo da Visita: Convidado/);
});
test('mais de uma coluna de data conflitante exige revisão',()=>{
 const [table]=visitorWorkbookTables(workbook([['Nome','Data','Entrada'],['Teste','14/04/2024','15/04/2024']]));assert.match(prepare(table)[0].issues.join(),/Mais de uma coluna/);
});
test('Worker salva campos reconhecidos, exporta observações e bloqueia duplicata e usuário sem acesso',async()=>{
 const {database,d1}=await createPilotD1();try{
  const worker=(await import('../dist/server/index.js')).default;
  const env={DB:d1,AUTH_SECRET:'import-test-secret',ASSETS:{fetch:async()=>new Response('',{status:404})}},ctx={waitUntil(){},passThroughOnException(){}};
  await createPilotUser(database,{nome:'Gestor',email:'import@example.test',senha:'TestImport123',memberships:[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]});
  const login=await worker.fetch(await cpfLoginRequest(env,new Request('http://localhost/api/auth/login',{method:'POST',body:new URLSearchParams({email:'import@example.test',senha:'TestImport123'})})),env,ctx);assert.equal(login.status,303);
  const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const call=(path,body,auth=cookie)=>worker.fetch(new Request('http://localhost'+path,{method:body?'POST':'GET',headers:{cookie:auth,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
  const [table]=visitorWorkbookTables(example()),[row]=prepare(table);
  const drafts=table.headers.flatMap((nome,i)=>table.mapping[i]==='extra'?[{nome,tipo:inferCustomFieldType(table.rows.map(r=>r.values[i]))}]:[]);
  const defined=await call('/api/pilot/visitantes/campos',{campos:drafts});assert.equal(defined.status,201,await defined.clone().text());const {campos}=await defined.json();
  row.payload.camposPersonalizados=JSON.stringify(Object.fromEntries(Object.entries(row.customValues).map(([i,value])=>[campos.find(f=>f.nome===table.headers[i]).id,value])));
  const result=await call('/api/pilot/visitantes',row.payload);assert.equal(result.status,201,await result.clone().text());
  const {id}=await result.json();const exported=await (await call('/api/pilot/visitantes/exportar')).json(),saved=exported.rows.find(item=>item.ID===id);assert.equal(saved.Categoria,'O2');assert.equal(saved.Telefone,'47999998888');assert.equal(saved['Data de entrada'],'2024-04-14');assert.equal(saved.Observações,'');assert.equal(saved['Motivo da Visita'],'Convidado');assert.equal(saved['EC 27/08 ESTATUS'],'Convidado');assert.equal((await call('/api/pilot/visitantes',row.payload)).status,409);assert.notEqual((await call('/api/pilot/visitantes',row.payload,'')).status,201);
 }finally{database.close();}
});
