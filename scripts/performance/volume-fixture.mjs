import { roleFixture } from '../../tests/helpers/role-audit.mjs';

// Isolated in-memory SQLite only. Never accepts a production connection.
export async function volumeFixture(size) {
  const fixture = await roleFixture();
  const actor = await fixture.account('ADMIN_COMUNIDADE');
  const {db} = fixture;
  const insert = (sql) => db.prepare(sql);
  const user = insert('INSERT INTO usuarios(nome,email) VALUES (?,?)');
  const membership = insert("INSERT INTO usuario_comunidades(usuario_id,comunidade_id,papel,status) VALUES (?,1,'MEMBRO','ATIVO')");
  const ministry = insert('INSERT INTO ministerios_comunidade(comunidade_id,nome) VALUES (1,?)');
  const volunteer = insert("INSERT INTO ministerio_voluntarios(comunidade_id,ministerio_id,usuario_id,funcao) VALUES (1,?,?,'Apoio')");
  const schedule = insert("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status) VALUES (1,?,'Escala fictícia','2099-01-15T10:00:00Z','2099-01-15T12:00:00Z','PUBLICADA')");
  const assignment = insert("INSERT INTO escala_designacoes(comunidade_id,escala_id,voluntario_id,usuario_id,funcao) VALUES (1,?,?,?,'Apoio')");
  const event = insert("INSERT INTO eventos_comunidade(comunidade_id,titulo,inicia_em,status) VALUES (1,?,?,'PUBLICADO')");
  const notice = insert("INSERT INTO notificacoes_sistema(tipo,titulo,mensagem,area,criado_por,usuario_id,comunidade_id,criado_em) VALUES ('INFO',?,'Mensagem fictícia','MENU','volume-test',?,1,?)");
  const read = insert('INSERT INTO notificacoes_lidas(notificacao_id,usuario_id) VALUES (?,?)');
  const titles=['Escala de apoio','Evento da comunidade','Pedido de ORAÇÃO','Nova mensagem','Aviso geral'];
  db.exec('BEGIN');
  try {
    const ministries = Array.from({length:3},(_,i)=>Number(ministry.run(`Equipe fictícia ${i}`).lastInsertRowid));
    const schedules = ministries.map(m=>Number(schedule.run(m).lastInsertRowid));
    for(let i=0;i<size;i++) {
      // Reverse insertion order exercises the ordered first page, not an already sorted table.
      const id=Number(user.run(`Pessoa ${String(size-i).padStart(6,'0')}`,`volume-${i}@example.invalid`).lastInsertRowid);
      membership.run(id);
      for(let j=0;j<3;j++) {const v=Number(volunteer.run(ministries[j],id).lastInsertRowid);assignment.run(schedules[j],v,id);}
      event.run(`Evento ${i}`,`2099-${i%2?'01':'03'}-15T10:00:00Z`);
      for(let j=0;j<5;j++) {const n=Number(notice.run(titles[j],actor.id,`2099-01-${String(i%28+1).padStart(2,'0')} 10:00:00`).lastInsertRowid);if(i%2===0)read.run(n,actor.id);}
    }
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
  const measurements=[];
  const original=fixture.env.DB;
  function wrap(statement) {
    return new Proxy(statement,{get(target,key){
      if(key==='bind') return (...args)=>wrap(target.bind(...args));
      if(['all','first','run','raw'].includes(key)) return async (...args)=>{
        const start=performance.now();const result=await target[key](...args);
        measurements.push({query:target.query,bindings:target.bindings,ms:performance.now()-start,rows:Array.isArray(result?.results)?result.results.length:result?1:0,bytes:Buffer.byteLength(JSON.stringify(result))});
        return result;
      };
      return Reflect.get(target,key);
    }});
  }
  fixture.env.DB={prepare:q=>wrap(original.prepare(q)),batch:s=>original.batch(s),exec:q=>original.exec(q)};
  return {...fixture,actor,measurements};
}
