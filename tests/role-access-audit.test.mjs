import assert from 'node:assert/strict';
import test from 'node:test';
import {roleFixture} from './helpers/role-audit.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';

test('login comum do proprietário com vínculo legado não herda sua sessão global',async()=>{
  const f=await roleFixture();
  try {
    const owner=await f.account('SUPERADMIN',{owner:true,perfil:'ADMIN'});
    const prepared=await cpfLoginRequest(f.env,new Request('https://audit.invalid/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:owner.email,senha:'AuditOnly123!'})}));
    const response=await f.worker.fetch(new Request('https://audit.invalid/api/auth/login',{method:'POST',headers:prepared.headers,body:await prepared.text()}),f.env,f.context);
    assert.equal(response.status,200);
    const cookie=response.headers.getSetCookie().map(x=>x.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
    assert.ok(cookie);
    assert.equal((await f.call('/api/pilot/estatisticas',{cookie})).status,403);
    const data=await (await f.call('/api/pilot/comunidade-ativa',{cookie})).json();
    assert.equal(data.context.isOwner,false);
    assert.equal(data.context.isSuperadmin,false);
    assert.equal(data.context.papel,'ADMIN_COMUNIDADE');
    assert.equal((await f.call('/api/pilot/estatisticas',{cookie:owner.cookie})).status,200);
  } finally {f.db.close();}
});

const globalPaths=['/api/pilot/estatisticas','/api/pilot/editorial','/api/pilot/editorial/programacoes','/api/pilot/feature-flags','/api/pilot/usuarios-cadastro','/api/proprietario?section=users'];

test('comentário público oculta identidade privada e e-mail de ADMIN legado',async()=>{
  const f=await roleFixture();
  try {
    const author=await f.account('MEMBRO'), legacy=await f.account('MEMBRO',{perfil:'ADMIN'}), owner=await f.account('MEMBRO',{owner:true});
    const id=Number(f.db.prepare("INSERT INTO publicacoes_piloto(comunidade_id,titulo,resumo,conteudo,categoria,visibilidade,status,origem,criado_por,comentarios_habilitados) VALUES (NULL,'Auditoria','','Texto','COMUNIDADE','PLATAFORMA','PUBLICADA','PLATAFORMA',?,1)").run(owner.id).lastInsertRowid);
    f.db.prepare("INSERT INTO comentarios_publicacao(publicacao_id,usuario_id,autor_nome_snapshot,texto,perfil_visivel) VALUES (?,?,'Identidade privada','Comentário de teste',0)").run(id,author.id);
    for(const [cookie,exposeName,exposeEmail] of [['',false,false],[legacy.cookie,false,false],[author.cookie,true,false],[owner.cookie,true,true]]) {
      const response=await f.call(`/api/publicacoes/${id}/comentarios`,{cookie});
      assert.equal(response.status,200);
      const comment=(await response.json()).comentarios[0];
      assert.equal(comment.autor,exposeName?'Teste MEMBRO':'Usuário da plataforma');
      assert.equal(comment.email,exposeEmail?author.email:null);
    }
  } finally {f.db.close();}
});
for(const scenario of [
  {role:'MEMBRO'}, {role:'LIDER'}, {role:'PASTOR'}, {role:'ADMIN_COMUNIDADE'},
  {role:'MEMBRO',perfil:'ADMIN'}, {role:'SUPERADMIN'}, {role:'PROPRIETARIO_VISUALIZADOR'},
  {role:'ADMIN_COMUNIDADE',communityOwner:true}, {role:'MEMBRO',owner:true},
]) test(`matriz global: ${JSON.stringify(scenario)}`,async()=>{
  const f=await roleFixture();
  try {
    const user=await f.account(scenario.role,scenario);
    for(const path of globalPaths) {
      const response=await f.call(path,{cookie:user.cookie});
      assert.equal(response.status,scenario.owner?200:403,path);
    }
    const before=f.db.prepare('SELECT valor FROM configuracoes WHERE chave=?').get('pilot_login_config');
    const write=await f.call('/api/pilot/login-config',{cookie:user.cookie,method:'PATCH',body:{}});
    assert.equal(write.status,scenario.owner?200:403,'alteração global do login');
    if(!scenario.owner) assert.deepEqual(f.db.prepare('SELECT valor FROM configuracoes WHERE chave=?').get('pilot_login_config'),before);
    const context=await (await f.call('/api/pilot/comunidade-ativa',{cookie:user.cookie})).json();
    assert.equal(context.context.isSuperadmin,!!scenario.owner);
    if(scenario.perfil==='ADMIN') assert.equal(context.context.papel,'MEMBRO');
    if(!scenario.owner) assert.ok(!context.context.permissions.some(p=>p.startsWith('platform.')||p.startsWith('feature_flags.')));
  } finally { f.db.close(); }
});

for(const role of ['MEMBRO','LIDER','PASTOR','ADMIN_COMUNIDADE']) test(`matriz operacional: ${role}`,async()=>{
  const f=await roleFixture();
  try {
    const actor=await f.account(role);
    const manages=['PASTOR','ADMIN_COMUNIDADE'].includes(role);
    for(const [path,expected] of [
      ['/api/pilot/visitantes',role==='MEMBRO'?403:200],
      ['/api/pilot/ministerios',200],
      ['/api/pilot/eventos',200],
      ['/api/pilot/continuidade',403],
      ['/api/pilot/convites',role==='ADMIN_COMUNIDADE'?200:403],
    ]) assert.equal((await f.call(path,{cookie:actor.cookie})).status,expected,path);
    const people=await (await f.call('/api/pilot/pessoas',{cookie:actor.cookie})).json();
    assert.equal(people.canViewPeople,manages);
    if(!manages) assert.deepEqual(people.people,[]);
    const categories=await f.call('/api/pilot/visitante-categorias',{cookie:actor.cookie,method:'POST',body:{nome:`Categoria ${role}`,cor:"#225588"}});
    assert.equal(categories.status,manages?201:403,await categories.clone().text());
    const switchOther=await f.call('/api/pilot/comunidade-ativa',{cookie:actor.cookie,method:'POST',body:{comunidadeId:2}});
    assert.equal(switchOther.status,403);
  } finally {f.db.close();}
});

test('permissão explícita de categoria é revogável sem novo login',async()=>{
  const f=await roleFixture();
  try {
    const actor=await f.account('LIDER');
    f.db.prepare("INSERT INTO oficiais_comunidade(usuario_comunidade_id,titulo,permissoes) VALUES (?,'LÍDER','visitor.categories.manage')").run(actor.membership);
    let result=await f.call('/api/pilot/visitante-categorias',{cookie:actor.cookie,method:'POST',body:{nome:'Permitida',cor:'#225588'}});
    assert.equal(result.status,403); // A page permission cannot open someone else's list.
    f.db.prepare("INSERT INTO visitante_acessos(comunidade_id,usuario_id,papel) VALUES(1,?,'READ')").run(actor.id);
    result=await f.call('/api/pilot/visitante-categorias',{cookie:actor.cookie,method:'POST',body:{nome:'Leitura',cor:'#225588'}});
    assert.equal(result.status,403);
    f.db.prepare("UPDATE visitante_acessos SET papel='EDIT' WHERE comunidade_id=1 AND usuario_id=?").run(actor.id);
    result=await f.call('/api/pilot/visitante-categorias',{cookie:actor.cookie,method:'POST',body:{nome:'Permitida',cor:'#225588'}});
    assert.equal(result.status,201,await result.clone().text());
    f.db.prepare("UPDATE oficiais_comunidade SET permissoes='' WHERE usuario_comunidade_id=?").run(actor.membership);
    result=await f.call('/api/pilot/visitante-categorias',{cookie:actor.cookie,method:'POST',body:{nome:'Negada',cor:'#225588'}});
    assert.equal(result.status,403);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM visitante_categorias WHERE nome='Negada'").get().n,0);
    f.db.prepare("UPDATE oficiais_comunidade SET permissoes='visitor.categories.manage' WHERE usuario_comunidade_id=?").run(actor.membership);
    f.db.prepare('DELETE FROM visitante_acessos WHERE usuario_id=?').run(actor.id);
    result=await f.call('/api/pilot/visitante-categorias',{cookie:actor.cookie,method:'POST',body:{nome:'Compartilhamento revogado',cor:'#225588'}});
    assert.equal(result.status,403);
  } finally {f.db.close();}
});

test('hierarquia mantém ações legítimas, protege pares e isola outra comunidade',async()=>{
  const f=await roleFixture();
  try {
    const pastor=await f.account('PASTOR'), member=await f.account('MEMBRO'), admin=await f.account('ADMIN_COMUNIDADE'), peer=await f.account('ADMIN_COMUNIDADE'), outside=await f.account('MEMBRO',{community:2});
    for(const [actor,target,expected] of [[pastor,member,200],[admin,peer,403],[pastor,outside,404]]) {
      const response=await f.call('/api/pilot/pessoas',{cookie:actor.cookie,method:'PATCH',body:{membershipId:target.membership,oficial:true,papel:'LIDER',titulo:'LÍDER',permissions:[]}});
      assert.equal(response.status,expected,await response.clone().text());
    }
    const rows=(await (await f.call('/api/pilot/pessoas?aba=todos',{cookie:pastor.cookie})).json()).people;
    assert.equal(rows.find(p=>p.usuario_id===member.id).canEditHierarchy,true);
    assert.equal(rows.find(p=>p.usuario_id===admin.id).canEditHierarchy,false);
    assert.equal(rows.find(p=>p.usuario_id===admin.id).canRemove,false);
    assert.ok(!rows.some(p=>p.usuario_id===outside.id));
    assert.equal((await f.call(`/api/pilot/pessoas/${outside.membership}/ficha`,{cookie:pastor.cookie})).status,404);
    const removed=await f.call('/api/pilot/pessoas',{cookie:pastor.cookie,method:'DELETE',body:{membershipId:member.membership,action:'REMOVE_COMMUNITY'}});
    assert.equal(removed.status,200,await removed.clone().text());
    assert.equal((await f.call('/api/pilot/ministerios',{cookie:member.cookie})).status,403);
  } finally {f.db.close();}
});

test('proprietário global é protegido e pode administrar hierarquias da comunidade',async()=>{
  const f=await roleFixture();
  try {
    const owner=await f.account('MEMBRO',{owner:true}), pastor=await f.account('PASTOR');
    for(const method of ['PATCH','DELETE']) {
      assert.equal((await f.call('/api/pilot/pessoas',{cookie:pastor.cookie,method,body:{membershipId:owner.membership,oficial:false,action:'REMOVE_COMMUNITY'}})).status,403);
    }
    assert.equal((await f.call('/api/pilot/pessoas',{cookie:owner.cookie,method:'PATCH',body:{membershipId:pastor.membership,oficial:true,papel:'ADMIN_COMUNIDADE',titulo:'PASTOR',permissions:[]}})).status,200);
  } finally {f.db.close();}
});

test('redução de cargo, vínculo suspenso e conta inativa bloqueiam a sessão já aberta',async()=>{
  const f=await roleFixture();
  try {
    const actor=await f.account('PASTOR');
    assert.equal((await f.call('/api/pilot/visitantes',{cookie:actor.cookie})).status,200);
    f.db.prepare("UPDATE usuario_comunidades SET papel='MEMBRO' WHERE id=?").run(actor.membership);
    assert.equal((await f.call('/api/pilot/visitantes',{cookie:actor.cookie})).status,403);
    f.db.prepare("UPDATE usuario_comunidades SET status='SUSPENSO' WHERE id=?").run(actor.membership);
    assert.equal((await f.call('/api/pilot/ministerios',{cookie:actor.cookie})).status,403);
    f.db.prepare('UPDATE usuarios SET ativo=0 WHERE id=?').run(actor.id);
    assert.equal((await f.call('/api/pilot/ministerios',{cookie:actor.cookie})).status,401);
    assert.equal((await f.call('/api/pilot/pessoas')).status,401);
  } finally {f.db.close();}
});

for(const targetRole of ['PASTOR','ADMIN_COMUNIDADE','SUPERADMIN']) test(`pastor não rebaixa nem remove ${targetRole}`,async()=>{
  const f=await roleFixture();
  try {
    const actor=await f.account('PASTOR'); const target=await f.account(targetRole);
    const patch=await f.call('/api/pilot/pessoas',{cookie:actor.cookie,method:'PATCH',body:{membershipId:target.membership,oficial:false,papel:'MEMBRO'}});
    assert.equal(patch.status,403);
    const removal=await f.call('/api/pilot/pessoas',{cookie:actor.cookie,method:'DELETE',body:{membershipId:target.membership,action:'REMOVE_COMMUNITY'}});
    assert.equal(removal.status,403);
    assert.deepEqual({...f.db.prepare('SELECT papel,status FROM usuario_comunidades WHERE id=?').get(target.membership)},{papel:targetRole,status:'ATIVO'});
  } finally { f.db.close(); }
});

test('pastor não altera nem remove proprietário cadastrado, mesmo com papel membro',async()=>{
  const f=await roleFixture();
  try {
    const actor=await f.account('PASTOR'); const target=await f.account('MEMBRO',{communityOwner:true});
    for(const method of ['PATCH','DELETE']) {
      const response=await f.call('/api/pilot/pessoas',{cookie:actor.cookie,method,body:{membershipId:target.membership,oficial:false,papel:'MEMBRO',action:'REMOVE_COMMUNITY'}});
      assert.equal(response.status,403,method);
    }
    assert.equal(f.db.prepare('SELECT status FROM usuario_comunidades WHERE id=?').get(target.membership).status,'ATIVO');
  } finally {f.db.close();}
});


test('ADMIN legado com vínculo membro continua no grupo de comunicação de membros',async()=>{
  const f=await roleFixture();
  try {
    const legacy=await f.account('MEMBRO',{perfil:'ADMIN'}), member=await f.account('MEMBRO'), leader=await f.account('LIDER');
    const data=await (await f.call('/api/pilot/chat',{cookie:legacy.cookie})).json();
    assert.ok(data.people.some(p=>p.id===member.id));
    assert.ok(!data.people.some(p=>p.id===leader.id));
    await f.call('/api/pilot/presenca',{cookie:member.cookie,method:'POST'});
    await f.call('/api/pilot/presenca',{cookie:leader.cookie,method:'POST'});
    const presence=await (await f.call('/api/pilot/presenca',{cookie:legacy.cookie,method:'POST'})).json();
    assert.equal(presence.people.find(p=>p.userId===member.id).canMessage,true);
    assert.equal(presence.people.find(p=>p.userId===leader.id).canMessage,false);
    const denied=await f.call('/api/pilot/chat',{cookie:legacy.cookie,method:'POST',body:{targetUserId:leader.id,message:'Mensagem fictícia'}});
    assert.equal(denied.status,403);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM conversas_privadas').get().n,0);
    assert.equal((await f.call('/api/pilot/chat',{cookie:legacy.cookie,method:'POST',body:{targetUserId:member.id}})).status,200);
  } finally {f.db.close();}
});

test('aviso de continuidade vai somente ao proprietário protegido e exige sessão global para leitura',async()=>{
  const f=await roleFixture();
  try {
    const owner=await f.account('MEMBRO',{owner:true}), legacy=await f.account('MEMBRO',{perfil:'ADMIN'}), requester=await f.account('ADMIN_COMUNIDADE',{communityOwner:true});
    const response=await f.call('/api/pilot/continuidade',{cookie:requester.cookie,method:'POST',body:{type:'DESATIVACAO',category:'OUTRO',reason:'Auditoria local',description:'Solicitação fictícia da auditoria de acessos.',password:'AuditOnly123!',confirmation:'SOLICITAR'}});
    assert.equal(response.status,201,await response.clone().text());
    const notifications=f.db.prepare("SELECT usuario_id,destino_rota FROM notificacoes_sistema WHERE titulo='Nova solicitação de continuidade'").all();
    assert.deepEqual(notifications.map(n=>n.usuario_id),[owner.id]);
    assert.equal(notifications[0].destino_rota,'/proprietario');
    // Avisos antigos dirigidos por engano ao ADMIN legado também ficam ocultos.
    f.db.prepare("INSERT INTO notificacoes_sistema(tipo,titulo,mensagem,area,usuario_id,criado_por) VALUES ('ALERTA','Nova solicitação de continuidade','Privado','CONTINUIDADE',?,'teste')").run(legacy.id);
    const notices=await (await f.call('/api/pilot/notificacoes',{cookie:legacy.cookie})).text();
    assert.ok(!notices.includes('Nova solicitação de continuidade'));
  } finally {f.db.close();}
});
