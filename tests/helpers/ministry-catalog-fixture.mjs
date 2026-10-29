import assert from 'node:assert/strict';
import {createPilotD1,createPilotUser} from './sqlite-d1.mjs';
import {cpfLoginRequest} from './cpf-login.mjs';

export async function ministryCatalogFixture(){
  const {database:db,d1}=await createPilotD1();
  const worker=(await import('../../dist/server/index.js')).default;
  const ctx={waitUntil(){},passThroughOnException(){}};
  const env={DB:d1,AUTH_SECRET:'local-ministry-layout-only',ASSETS:{fetch:async()=>new Response('',{status:404})}};
  let ip=10;
  const call=(path,actor,method='GET',body)=>worker.fetch(new Request('https://test.invalid'+path,{method,headers:{cookie:actor?.cookie||'',origin:'https://test.invalid','content-type':'application/json','cf-connecting-ip':`192.0.2.${ip++}`},body:body===undefined?undefined:JSON.stringify(body)}),env,ctx);
  async function user(name,role='MEMBRO',community=1){
    const email=name.replaceAll(' ','').toLowerCase()+'@example.test';
    const id=await createPilotUser(db,{nome:name,email,senha:'Teste123!',memberships:[{comunidadeId:community,papel:role}]});
    const response=await worker.fetch(await cpfLoginRequest(env,new Request('https://test.invalid/api/auth/login',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':`192.0.2.${ip++}`},body:JSON.stringify({email,senha:'Teste123!'})})),env,ctx);
    assert.equal(response.status,200,await response.clone().text());
    return {id,cookie:response.headers.get('set-cookie').match(/__Host-adote_session=[^;]+/)[0]};
  }
  const admin=await user('Gestor de teste','ADMIN_COMUNIDADE');
  const member=await user('Membro de teste');
  const outsider=await user('Outra comunidade','ADMIN_COMUNIDADE',2);
  const officials=[];
  for(const [name,title] of [['Ana Aspirante','ASPIRANTE'],['Diana Diaconisa','DIACONISA'],['Pedro Presbitero','PRESBÍTERO'],['Paula Pastora','PASTORA']]){
    const person=await user(name);person.title=title;
    db.prepare('INSERT INTO oficiais_comunidade(usuario_comunidade_id,titulo) SELECT id,? FROM usuario_comunidades WHERE usuario_id=? AND comunidade_id=1').run(title,person.id);
    officials.push(person);
  }
  const ministries=[];
  const names=['Louvor e Adoração','Vínkulo Kids','Mídia e Comunicação · nome longo para conferir a leitura','Recepção'];
  for(let i=0;i<4;i++){
    const id=Number(db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,descricao,categoria,status,responsavel_usuario_id,banner_url) VALUES(1,?,?,?,'ATIVO',?,?)").run(names[i],i===3?'':'Uma equipe dedicada a servir a comunidade. Conheça as atividades, acompanhe suas escalas e participe com seus dons.',['LOUVOR','CRIANCAS','MIDIA','RECEPCAO'][i],officials[i].id,i===1?'/cell-community-art.png':'').lastInsertRowid);
    const volunteer=Number(db.prepare("INSERT INTO ministerio_voluntarios(comunidade_id,ministerio_id,usuario_id,funcao,papel,ativo) VALUES(1,?,?,'Apoio','VOLUNTARIO',1)").run(id,member.id).lastInsertRowid);
    db.prepare("INSERT INTO ministerio_voluntarios(comunidade_id,ministerio_id,usuario_id,funcao,papel,ativo) VALUES(1,?,?,'Liderança','LIDER',1)").run(id,officials[i].id);
    ministries.push({id,volunteer});
  }
  const schedule=Number(db.prepare("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status) VALUES(1,?,'Encontro da equipe','2099-01-01T18:00:00Z','2099-01-01T20:00:00Z','PUBLICADA')").run(ministries[0].id).lastInsertRowid);
  db.prepare("INSERT INTO escala_designacoes(comunidade_id,escala_id,voluntario_id,usuario_id,funcao,status,ativo) VALUES(1,?,?,?,'Apoio','PENDENTE',1)").run(schedule,ministries[0].volunteer,member.id);
  const hidden=Number(db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,categoria,status) VALUES(1,'Equipe sem vínculo','OUTRO','ATIVO')").run().lastInsertRowid);
  const posts=[];
  for(const official of officials){
    const post=Number(db.prepare("INSERT INTO publicacoes_piloto(comunidade_id,titulo,resumo,conteudo,categoria,visibilidade,status,origem,criado_por,canal_feed) VALUES(1,?,'','Bem-vindos à nossa comunidade.','COMUNIDADE','COMUNIDADE','PUBLICADA','COMUNIDADE',?,1)").run(official.title,official.id).lastInsertRowid);
    posts.push(post);
    db.prepare("INSERT INTO comentarios_publicacao(publicacao_id,usuario_id,autor_nome_snapshot,texto) VALUES(?,?,'Oficial','Bem-vindos!')").run(post,official.id);
  }
  return {db,d1,worker,env,ctx,call,admin,member,outsider,officials,ministries,hidden,posts};
}
