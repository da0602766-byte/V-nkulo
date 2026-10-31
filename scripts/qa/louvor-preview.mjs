// Local QA with synthetic data; no connection to the production database.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createPilotD1,createPilotUser} from '../../tests/helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from '../../tests/helpers/cpf-login.mjs';
import worker from '../../dist/server/index.js';
const {database:db,d1}=await createPilotD1(),base='http://localhost:4178',root=path.resolve('dist/client');
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2','.html':'text/html'};
async function asset(request){const file=path.resolve(root,'.'+decodeURIComponent(new URL(request.url).pathname));if(!file.startsWith(root+path.sep))return new Response('',{status:404});try{return new Response(await fs.readFile(file),{headers:{'content-type':mime[path.extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}
const env={DB:d1,AUTH_SECRET:'synthetic-louvor-preview-only',ASSETS:{fetch:asset}},ctx={waitUntil(p){p.catch(()=>{});},passThroughOnException(){}};
const users={};for(const [name,role] of [['Gestor','ADMIN_COMUNIDADE'],['Integrante','MEMBRO']])users[name]=await createPilotUser(db,{nome:name+' de exemplo',email:name+'@preview.invalid',senha:'TesteLocal123!',memberships:[{comunidadeId:1,papel:role}]});
db.prepare("UPDATE comunidades SET nome='Comunidade de exemplo' WHERE id=1").run();
for(const id of Object.values(users)){
 db.prepare("INSERT INTO storage_preferences(usuario_id,provider) VALUES(?,'LOCAL')").run(id);
 db.prepare("INSERT INTO usuario_introducoes(usuario_id,comunidade_id,tipo) VALUES(?,0,'PLATAFORMA'),(?,1,'COMUNIDADE')").run(id,id);
}
const ministry=Number(db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,categoria,status,responsavel_usuario_id,descricao) VALUES(1,'Louvor','LOUVOR','ATIVO',?,'Músicas, equipes e escalas da comunidade.')").run(users.Gestor).lastInsertRowid);
const team=Number(db.prepare("INSERT INTO ministerio_equipes(comunidade_id,ministerio_id,nome) VALUES(1,?,'Equipe de domingo')").run(ministry).lastInsertRowid);
const volunteers={};for(const [name,id] of Object.entries(users)){
 volunteers[name]=Number(db.prepare("INSERT INTO ministerio_voluntarios(comunidade_id,ministerio_id,usuario_id,funcao,papel,ativo) VALUES(1,?,?,'Vocal',?,1)").run(ministry,id,name==='Gestor'?'LIDER':'VOLUNTARIO').lastInsertRowid);
 db.prepare('INSERT INTO ministerio_equipe_membros(comunidade_id,ministerio_id,equipe_id,voluntario_id) VALUES(1,?,?,?)').run(ministry,team,volunteers[name]);
}
for(const [name,id] of Object.entries(users))for(const title of ['Mil graus','Sou livre','Uma canção de esperança para todas as gerações da nossa comunidade'])db.prepare('INSERT INTO louvor_musicas_pessoais(usuario_id,titulo,chave,links) VALUES(?,?,?,?)').run(id,title,title,JSON.stringify([{id:'youtube',tipo:'YOUTUBE',titulo:'YouTube',url:'https://www.youtube.com/'},{id:'cifra',tipo:'CIFRA_CLUB',titulo:'Cifra Club',url:'https://www.cifraclub.com.br/'}]));
db.prepare("INSERT INTO louvor_compartilhamentos(comunidade_id,dono_id,destinatario_id,status) VALUES(1,?,?,'PENDENTE')").run(users.Gestor,users.Integrante);
const starts=new Date(Date.now()+86400000).toISOString(),ends=new Date(Date.now()+90000000).toISOString();
const schedule=Number(db.prepare("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,equipe_id,titulo,inicia_em,termina_em,status,responsavel_usuario_id,fio_etapas,repertorio,criado_por) VALUES(1,?,?,'Culto de domingo',?,?,'RASCUNHO',?,?,?,?)").run(ministry,team,starts,ends,users.Gestor,JSON.stringify([{id:'som',titulo:'Testar microfones',feito:false},{id:'repertorio',titulo:'Repertório fechado',feito:false}]),JSON.stringify(['Mil graus','Sou livre']),users.Gestor).lastInsertRowid);
db.prepare('INSERT INTO escala_equipes(comunidade_id,escala_id,equipe_id,funcao) VALUES(1,?,?,?)').run(schedule,team,'Vocal e instrumentos');
for(const [name,id] of Object.entries(users))db.prepare("INSERT INTO escala_designacoes(comunidade_id,escala_id,voluntario_id,usuario_id,equipe_id,funcao) VALUES(1,?,?,?,?,'Vocal')").run(schedule,volunteers[name],id,team);
db.prepare("INSERT INTO notificacoes_sistema(tipo,titulo,mensagem,area,usuario_id,destino_rota,criado_por) VALUES('IMPORTANTE','Nova escala ministerial','Você foi escalado para Culto de domingo.','ESCALAS',?,'/painel?view=ministerios','qa')").run(users.Gestor);
const login=async(name)=>worker.fetch(await cpfLoginRequest(env,new Request(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:name+'@preview.invalid',senha:'TesteLocal123!'})})),env,ctx);
const seed=await login('Gestor'),cookie=seed.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const colleague=await createPilotUser(db,{nome:'Colega de teste',email:'colega@preview.invalid',senha:'TesteLocal123!',memberships:[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]});
await worker.fetch(new Request(base+'/api/pilot/chat',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({targetUserId:colleague,message:'Conversa de exemplo para conferir o layout.'})}),env,ctx);
await worker.fetch(new Request(base+'/api/pilot/solicitacoes',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({tipo:'ORACAO',titulo:'Oração pela família',descricao:'Um pedido de teste para a revisão local.',visibilidade:'GESTORES'})}),env,ctx);
http.createServer(async(req,res)=>{try{const url=new URL(req.url,base);let response;if(url.pathname==='/qa-login'){
 const result=await login(url.searchParams.get('member')?'Integrante':'Gestor');response=new Response(null,{status:302,headers:{location:`/painel?view=ministerios&ministry=${ministry}`}});for(const value of result.headers.getSetCookie())response.headers.append('set-cookie',value);
 }else{const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request(url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});response=url.pathname.startsWith('/assets/')?await asset(request):await worker.fetch(request,env,ctx);}
 res.writeHead(response.status,{...Object.fromEntries(response.headers),...(response.headers.getSetCookie().length?{'set-cookie':response.headers.getSetCookie()}:{})});res.end(Buffer.from(await response.arrayBuffer()));
 }catch(cause){console.error(cause);res.writeHead(500);res.end('Erro na prévia local.');}}).listen(4178,'127.0.0.1',()=>console.log('Prévia local: '+base+'/qa-login'));
