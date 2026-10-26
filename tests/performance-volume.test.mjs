import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { volumeFixture } from '../scripts/performance/volume-fixture.mjs';
import { notificationCategory, NOTIFICATION_CATEGORY_SQL } from '../app/lib/notification-category.ts';

test('volume: paginação de pessoas preserva empates, filtros e vínculos', async t => {
  const f=await volumeFixture(120);t.after(()=>f.db.close());
  f.db.exec("UPDATE usuarios SET nome='Nome repetido' WHERE email IN ('volume-0@example.invalid','volume-1@example.invalid'); UPDATE usuarios SET ativo=0 WHERE email='volume-2@example.invalid'");
  const other=await f.account('MEMBRO',{community:2});
  const expected=f.db.prepare("SELECT u.id FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id=u.id WHERE uc.comunidade_id=1 AND uc.status='ATIVO' AND u.ativo=1 ORDER BY u.nome,uc.id").all().map(r=>r.id);
  const seen=[];let cursor='';
  do {
    const r=await f.call('/api/pilot/pessoas?aba=todos&limite=17'+(cursor?'&cursor='+cursor:''),{cookie:f.actor.cookie});assert.equal(r.status,200);
    const data=await r.json();assert.ok(data.people.length<=17);assert.equal(data.counts.membros,120);
    for(const person of data.people){seen.push(person.usuario_id);if(person.usuario_id!==f.actor.id){assert.equal(person.proximas_escalas,3);assert.match(person.ministerios,/Equipe fictícia 0/);}}
    cursor=data.nextCursor;
  }while(cursor);
  assert.deepEqual(seen,expected);assert.equal(new Set(seen).size,seen.length);assert.ok(!seen.includes(other.id));
  const search=await (await f.call('/api/pilot/pessoas?aba=todos&busca=Nome%20repetido',{cookie:f.actor.cookie})).json();assert.equal(search.people.length,2);
  const scheduled=await (await f.call('/api/pilot/pessoas?aba=todos&vinculo=com-escala',{cookie:f.actor.cookie})).json();assert.ok(scheduled.people.every(p=>p.proximas_escalas===3));
  const empty=await (await f.call('/api/pilot/pessoas?busca=inexistente',{cookie:f.actor.cookie})).json();assert.deepEqual(empty.people,[]);assert.equal(empty.nextCursor,null);
  const noAccess=await (await f.call('/api/pilot/pessoas?aba=todos',{cookie:other.cookie})).json();assert.equal(noAccess.canViewPeople,false);assert.deepEqual(noAccess.people,[]);
});

test('volume: contador não transfere histórico e preserva preferências, privacidade e cursor', async t => {
  const f=await volumeFixture(1000);t.after(()=>f.db.close());
  const other=await f.account('MEMBRO',{community:2});
  f.db.prepare("INSERT INTO notificacoes_sistema(usuario_id,titulo,mensagem,criado_por,destino_rota) VALUES (?,'Oculto','Técnico','test','/proprietario')").run(f.actor.id);
  f.db.prepare("INSERT INTO notificacoes_sistema(usuario_id,titulo,mensagem,criado_por) VALUES (?,'Outro usuário','Privado','test')").run(other.id);
  f.db.prepare("INSERT INTO configuracoes(chave,valor,atualizado_por) VALUES (?,?,'test')").run(`notification_preferences:${f.actor.id}`,JSON.stringify({pedidos:false,eventos:false}));
  f.measurements.length=0;
  const first=await (await f.call('/api/pilot/notificacoes?limite=100',{cookie:f.actor.cookie})).json();
  assert.equal(first.unread,1500);assert.ok(first.nextCursor);assert.ok(first.notifications.every(n=>!['pedidos','eventos'].includes(n.category)&&!['Oculto','Outro usuário'].includes(n.title)));
  assert.ok(f.measurements.reduce((s,q)=>s+q.rows,0)<120,'returned database rows must stay bounded with 2500 unread notices');
  assert.equal(f.measurements.find(q=>q.query.includes('GROUP BY category')).rows,5);
  const second=await (await f.call('/api/pilot/notificacoes?limite=100&cursor='+first.nextCursor,{cookie:f.actor.cookie})).json();
  assert.equal(second.unread,1500);assert.ok(second.notifications.every(n=>!first.notifications.some(a=>a.id===n.id)));
  const read=await f.call('/api/pilot/notificacoes',{cookie:f.actor.cookie,method:'PATCH',body:{todas:true}});assert.equal(read.status,200);
  const cleared=await (await f.call('/api/pilot/notificacoes',{cookie:f.actor.cookie})).json();assert.equal(cleared.unread,0);
  assert.ok(f.db.prepare("SELECT id FROM notificacoes_sistema WHERE titulo='Oculto'").get());
});

test('categorias: SQLite e JavaScript mantêm precedência, caixa e acentos', async t => {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec('CREATE TABLE notificacoes_sistema(tipo TEXT,area TEXT,titulo TEXT)');
  const examples=[['INFO','MENU','PEDIDO DE ORAÇÃO','pedidos'],['INFO','MENU','oração','pedidos'],['EVENTO','MENU','Escala','escalas'],['INFO','MINISTERIO','Mensagem','escalas'],['INFO','MENU','Evento com pedido','eventos'],['INFO','CHAT','Solicitação','pedidos'],['INFO','MENU','MENSAGEM','mensagens'],['INFO','MENU','Atualização','sistema'],['INFO','MENU','OraÇÃo','pedidos'],['INFO','MENU','oração e evento','eventos']];
  for(const [tipo,area,titulo,expected] of examples){db.prepare('DELETE FROM notificacoes_sistema').run();db.prepare('INSERT INTO notificacoes_sistema VALUES (?,?,?)').run(tipo,area,titulo);assert.equal(notificationCategory({tipo,area,titulo}),expected);assert.equal(db.prepare(`SELECT ${NOTIFICATION_CATEGORY_SQL} AS category FROM notificacoes_sistema n`).get().category,expected);}
});

test('categorias e paginação materializada executam no D1/workerd', async t => {
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-05-15',cf:false,d1Databases:['DB'],script:"export default {fetch(){return new Response('test')}}"}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE notificacoes_sistema(id INTEGER PRIMARY KEY,tipo TEXT,area TEXT,titulo TEXT)').run();
  await db.batch(['ORAÇÃO','Escala','Evento'].map((title,i)=>db.prepare("INSERT INTO notificacoes_sistema VALUES (?,'INFO','MENU',?)").bind(i+1,title)));
  const r=await db.prepare(`WITH page AS MATERIALIZED (SELECT id FROM notificacoes_sistema ORDER BY id DESC LIMIT 2) SELECT n.id, ${NOTIFICATION_CATEGORY_SQL} AS category FROM page JOIN notificacoes_sistema n ON n.id=page.id ORDER BY n.id DESC`).all();
  assert.deepEqual(r.results,[{id:3,category:'eventos'},{id:2,category:'escalas'}]);
});
