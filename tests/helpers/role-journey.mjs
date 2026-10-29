import {roleFixture} from './role-audit.mjs';

export async function journeyFixture(){
  const f=await roleFixture();
  const admin=await f.account('ADMIN_COMUNIDADE',{communityOwner:true});
  const member=await f.account('MEMBRO');
  const official=await f.account('MEMBRO');
  const outside=await f.account('ADMIN_COMUNIDADE',{community:2,communityOwner:true});
  const accounts={admin,member,official,outside};
  for(const [key,actor] of Object.entries(accounts))f.db.prepare('UPDATE usuarios SET nome=? WHERE id=?').run('QA '+key,actor.id);
  f.db.prepare("INSERT INTO oficiais_comunidade(usuario_comunidade_id,titulo,permissoes) VALUES (?,'DIÁCONO','visitors.view,visitors.create,visitors.edit')").run(official.membership);
  f.db.prepare("UPDATE comunidades SET nome='Comunidade QA local' WHERE id=1").run();
  const visitor=Number(f.db.prepare("INSERT INTO visitantes(comunidade_id,nome_completo,data_entrada,telefone,criado_por,escopo_confirmado) VALUES (1,'Contato QA do administrador','2026-10-01','11999990001','qa',1)").run().lastInsertRowid);
  const foreignVisitor=Number(f.db.prepare("INSERT INTO visitantes(comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado) VALUES (2,'Contato QA externo','2026-10-01','qa',1)").run().lastInsertRowid);
  return {...f,accounts,visitor,foreignVisitor,
    as:(key,path,method='GET',body)=>f.call(path,{cookie:accounts[key]?.cookie||'',method,body}),
    share:(userId,role='READ',action='grant')=>f.call('/api/pilot/visitantes/compartilhamento',{cookie:admin.cookie,method:'POST',body:{userId,role,action}})};
}
