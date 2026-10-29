// Local QA only. Synthetic in-memory database, real production worker and login.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createPilotD1,createPilotUser} from '../../tests/helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from '../../tests/helpers/cpf-login.mjs';
import worker from '../../dist/server/index.js';
const {database:db,d1}=await createPilotD1();
const base='http://localhost:4178';
const root=path.resolve('dist/client');
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2','.html':'text/html'};
async function asset(request){
  const rel=decodeURIComponent(new URL(request.url).pathname);
  const file=path.resolve(root,'.'+rel);
  if(!file.startsWith(root+path.sep))return new Response('',{status:404});
  try {return new Response(await fs.readFile(file),{headers:{'content-type':mime[path.extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}
}
const env={DB:d1,AUTH_SECRET:'local-preview-synthetic-only',ASSETS:{fetch:asset}};
const ctx={waitUntil(p){p.catch(()=>{});},passThroughOnException(){}};
db.exec("UPDATE comunidades SET nome='Comunidade QA · teste local' WHERE id=1; DELETE FROM estacionamento_reservas; DELETE FROM estacionamento_movimentacoes; DELETE FROM estacionamento_vagas; DELETE FROM estacionamento_setores; DELETE FROM eventos_comunidade;");
const member=await createPilotUser(db,{nome:'Membro de teste',email:'membro.qa@example.invalid',senha:'TesteLocal123!',memberships:[{comunidadeId:1,papel:'MEMBRO'}]});
const manager=await createPilotUser(db,{nome:'Gestor de teste',email:'gestor.qa@example.invalid',senha:'TesteLocal123!',memberships:[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]});
const start=new Date(Date.now()+45*60_000).toISOString(),end=new Date(Date.now()+165*60_000).toISOString();
const event=Number(db.prepare("INSERT INTO eventos_comunidade(comunidade_id,titulo,inicia_em,termina_em,status,publico) VALUES(1,'Encontro da comunidade · QA',?,?,'PUBLICADO',1)").run(start,end).lastInsertRowid);
for(const [sectorName,rows,columns] of [['Setor A',5,6],['Setor B',3,5]]){
  const sector=Number(db.prepare("INSERT INTO estacionamento_setores(comunidade_id,nome,cor,ordem) VALUES(1,?,'#5B2FC4',?)").run(sectorName,sectorName==='Setor A'?1:2).lastInsertRowid);
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const n=row*columns+col+1,code=sectorName.slice(-1)+'-'+String(n).padStart(2,'0');
    const id=Number(db.prepare("INSERT INTO estacionamento_vagas(comunidade_id,setor_id,codigo,tipo,status,posicao_x,posicao_y) VALUES(1,?,?,?,?,?,?)").run(sector,code,col>=4&&row===0?'PCD':'COMUM',n===8?'BLOQUEADA':n%7===0?'OCUPADA':'LIVRE',col*76,row*72+(row>1?28:0)).lastInsertRowid);
    if(n%5===0&&n%7!==0)db.prepare("INSERT INTO estacionamento_reservas(comunidade_id,vaga_id,usuario_id,evento_id,evento_titulo,nome_completo,email,telefone,placa_veiculo,tipo_veiculo,modelo_veiculo,cor_veiculo,documento_hash,documento_mascarado,inicio_em,fim_em,codigo,status) VALUES(1,?,?,?,'Encontro da comunidade · QA',?,'pessoa.qa@example.invalid','47999998888',?,'CARRO','Modelo QA','Prata','qa','***',?,?,?,'CONFIRMADA')").run(id,member,event,'Pessoa de teste '+n,'QAQ'+n+'A23',start,end,'VK-'+String(id).padStart(24,'A'));
    if(n%7===0)db.prepare("INSERT INTO estacionamento_movimentacoes(comunidade_id,vaga_id,placa,responsavel,tipo_veiculo,vinculo,criado_por,atualizado_por) VALUES(1,?,?,'Pessoa de teste','CARRO','MEMBRO',?,?)").run(id,'QAT'+n+'A23',member,member);
  }
}
// Optional synthetic cards for visual review of every reservation state.
if (process.env.PARKING_QA_CARDS === '1') {
 const slots=db.prepare("SELECT id FROM estacionamento_vagas v WHERE status='LIVRE' AND NOT EXISTS (SELECT 1 FROM estacionamento_reservas r WHERE r.vaga_id=v.id) LIMIT 6").all();
 const examples=[['CHECKIN',true,'Marina Oliveira'],['PENDENTE',false,'Rafael Santos'],['CONFIRMADA',false,'Camila Almeida'],['CHECKIN',false,'Lucas Ferreira'],['CANCELADA',false,'Beatriz Costa'],['RECUSADA',false,'Antônio de Albuquerque e Silva']];
 examples.forEach(([status,closed,name],index)=>{
  const plate='QAC'+String(index+1).padStart(4,'0'),slot=slots[index].id;
  const entered=status==='CHECKIN'?new Date(Date.now()-60*60_000).toISOString():null;
  const left=closed?new Date(Date.now()-15*60_000).toISOString():null;
  const periodStart=entered?new Date(Date.now()-90*60_000).toISOString():start;
  const id=Number(db.prepare("INSERT INTO estacionamento_reservas(comunidade_id,vaga_id,usuario_id,evento_id,evento_titulo,nome_completo,email,telefone,placa_veiculo,tipo_veiculo,modelo_veiculo,cor_veiculo,documento_hash,documento_mascarado,inicio_em,fim_em,codigo,status,checkin_em) VALUES(1,?,?,?,'Culto de domingo',?,'contato.exemplo@example.invalid','47999998888',?,'CARRO','Honda Civic','Prata','qa-cards','***.***.***-18',?,?,?,?,?)").run(slot,member,event,name,plate,periodStart,end,'QA-CARD-'+index,status,entered).lastInsertRowid);
  if(entered) {
   db.prepare("INSERT INTO estacionamento_movimentacoes(comunidade_id,vaga_id,placa,responsavel,tipo_veiculo,vinculo,criado_por,atualizado_por,status,entrada_em,saida_em,observacoes) VALUES(1,?,?,?,'CARRO','MEMBRO',?,?,?,?,?,?)").run(slot,plate,name,member,member,closed?'ENCERRADA':'NO_LOCAL',entered,left,'Entrada liberada por QR da reserva '+id+'.');
   if(!closed)db.prepare("UPDATE estacionamento_vagas SET status='OCUPADA' WHERE id=?").run(slot);
  }
 });
}
// Full-workspace QA uses only the local in-memory database.
if (process.env.PARKING_QA_FULL === '1') {
 const operator=await createPilotUser(db,{nome:'Operador de teste',email:'operador.qa@example.invalid',senha:'TesteLocal123!',memberships:[{comunidadeId:1,papel:'MEMBRO'}]});
 const helper=await createPilotUser(db,{nome:'Auxiliar de teste',email:'auxiliar.qa@example.invalid',senha:'TesteLocal123!',memberships:[{comunidadeId:1,papel:'MEMBRO'}]});
 const ministry=Number(db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,categoria,responsavel_usuario_id) VALUES(1,'Equipe do estacionamento QA','ESTACIONAMENTO',?)").run(manager).lastInsertRowid);
 const shiftStart=new Date(Date.now()-30*60_000).toISOString(),shiftEnd=new Date(Date.now()+90*60_000).toISOString();
 const shift=Number(db.prepare("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status) VALUES(1,?,'Plantão da noite QA',?,?,'PUBLICADA')").run(ministry,shiftStart,shiftEnd).lastInsertRowid);
 for(const user of [operator,manager,helper]) {
  const volunteer=Number(db.prepare("INSERT INTO ministerio_voluntarios(comunidade_id,ministerio_id,usuario_id,funcao,papel,ativo) VALUES(1,?,?,'Portaria',?,1)").run(ministry,user,user===manager?'LIDER':'VOLUNTARIO').lastInsertRowid);
  if(user!==helper) db.prepare("INSERT INTO escala_designacoes(comunidade_id,escala_id,voluntario_id,usuario_id,funcao,status,ativo) VALUES(1,?,?,?,'Portaria','CONFIRMADA',1)").run(shift,volunteer,user);
 }
 for(const [n,status] of ['AGUARDANDO_LIDER','AGUARDANDO_LIDER','ENVIADO_PASTOR'].entries()) {
  const past=Number(db.prepare("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status) VALUES(1,?,?,? ,?,'PUBLICADA')").run(ministry,'Plantão concluído QA '+(n+1),new Date(Date.now()-(n+2)*86400_000).toISOString(),new Date(Date.now()-(n+2)*86400_000+7200_000).toISOString()).lastInsertRowid);
  db.prepare("INSERT INTO estacionamento_relatorios_escala(comunidade_id,escala_id,usuario_id,resumo,entradas,saidas,ocorrencias,status) VALUES(1,?,?,'Fluxo organizado. Equipe orientou as chegadas e conferiu as saídas.',24,24,1,?)").run(past,operator,status);
 }
 for(const [severity,description] of [['BAIXA','Orientação de chegada no setor A concluída.'],['MEDIA','Veículo estacionado fora da marcação; responsável orientado.'],['ALTA','Acesso ao setor B bloqueado temporariamente. Equipe no local.']]) db.prepare("INSERT INTO estacionamento_ocorrencias(comunidade_id,tipo,descricao,gravidade,status,criado_por) VALUES(1,'ORIENTACAO',?,?,'ABERTA',?)").run(description,severity,manager);
}
http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,base);
  let response;
  if(['/qa-login/member','/qa-login/manager','/qa-login/operator'].includes(url.pathname)){
    const email=url.pathname.endsWith('member')?'membro.qa@example.invalid':url.pathname.endsWith('operator')?'operador.qa@example.invalid':'gestor.qa@example.invalid';
    const login=await cpfLoginRequest(env,new Request(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,senha:'TesteLocal123!'})}));
    const result=await worker.fetch(login,env,ctx);
    response=new Response(null,{status:302,headers:{location:'/painel?view=estacionamento'}});
    for(const cookie of result.headers.getSetCookie())response.headers.append('set-cookie',cookie);
  }else{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const request=new Request(url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
    response=url.pathname.startsWith('/assets/')?await asset(request):await worker.fetch(request,env,ctx);
  }
  res.writeHead(response.status,{...Object.fromEntries(response.headers),...(response.headers.getSetCookie().length ? {'set-cookie':response.headers.getSetCookie()} : {})});res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error.message);res.writeHead(500);res.end('Falha na prévia local.');}
}).listen(4178,'127.0.0.1',()=>console.log('Prévia local: '+base+'/qa-login/member · '+base+'/qa-login/manager'));
