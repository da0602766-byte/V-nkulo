import assert from 'node:assert/strict';
import test from 'node:test';
import {ministryCatalogFixture} from './helpers/ministry-catalog-fixture.mjs';

test('member catalog counts real active participants without exposing roster or management',async()=>{
 const f=await ministryCatalogFixture();
 try{
  const result=await f.call('/api/pilot/ministerios',f.member);assert.equal(result.status,200);
  const data=await result.json();const first=data.ministerios.find(m=>m.id===f.ministries[0].id);
  assert.equal(first.total_integrantes,2);assert.equal(first.confirmacoes_pendentes,1);assert.equal(first.can_manage,0);assert.deepEqual(first.voluntarios,[]);
  assert.equal(first.responsavel_titulo_oficial,'ASPIRANTE');
  const schedule=f.db.prepare('SELECT id FROM escalas_ministerio WHERE ministerio_id=?').get(first.id).id;
  const response=await f.call(`/api/pilot/escalas/${schedule}`,f.member,'PATCH',{acao:'RESPONDER',status:'CONFIRMADA'});assert.equal(response.status,200,await response.clone().text());
  const confirmed=(await (await f.call('/api/pilot/ministerios',f.member)).json()).ministerios.find(m=>m.id===first.id);assert.equal(confirmed.confirmacoes_pendentes,0);assert.ok(!data.ministerios.some(m=>m.id===f.hidden));
  assert.equal((await f.call(`/api/pilot/ministerios/${first.id}`,f.member,'PATCH',{acao:'ATUALIZAR',nome:'Alteração indevida'})).status,403);
  const other=await (await f.call('/api/pilot/ministerios',f.outsider)).json();assert.ok(!other.ministerios.some(m=>m.id===first.id));
  f.db.prepare("UPDATE usuario_comunidades SET status='INATIVO' WHERE usuario_id=? AND comunidade_id=1").run(f.officials[0].id);
  const after=(await (await f.call('/api/pilot/ministerios',f.member)).json()).ministerios.find(m=>m.id===first.id);
  assert.equal(after.total_integrantes,1);assert.equal(after.responsavel_titulo_oficial,null);
 }finally{f.db.close();}
});
test('official badges are scoped to active membership in posts and comments',async()=>{
 const f=await ministryCatalogFixture();
 try{
  const posts=(await (await f.call('/api/pilot/publicacoes?limit=50',f.member)).json()).publicacoes;
  for(let i=0;i<4;i++){
   assert.equal(posts.find(p=>p.id===f.posts[i]).autor_titulo_oficial,f.officials[i].title);
   const comments=await (await f.call(`/api/pilot/publicacoes/${f.posts[i]}/comentarios`,f.member)).json();assert.equal(comments.comentarios[0].officialTitle,f.officials[i].title);
  }
  f.db.prepare("INSERT INTO usuario_comunidades(usuario_id,comunidade_id,papel,status) VALUES(?,2,'MEMBRO','ATIVO')").run(f.officials[0].id);
  const post=Number(f.db.prepare("INSERT INTO publicacoes_piloto(comunidade_id,titulo,resumo,conteudo,categoria,visibilidade,status,origem,criado_por) VALUES(2,'Outra comunidade','','Teste','COMUNIDADE','COMUNIDADE','PUBLICADA','COMUNIDADE',?)").run(f.officials[0].id).lastInsertRowid);
  const other=(await (await f.call('/api/pilot/publicacoes?limit=50',f.outsider)).json()).publicacoes;assert.equal(other.find(p=>p.id===post).autor_titulo_oficial,null);
  f.db.prepare('DELETE FROM oficiais_comunidade WHERE usuario_comunidade_id IN (SELECT id FROM usuario_comunidades WHERE usuario_id=?)').run(f.officials[1].id);
  const after=(await (await f.call('/api/pilot/publicacoes?limit=50',f.member)).json()).publicacoes;assert.equal(after.find(p=>p.id===f.posts[1]).autor_titulo_oficial,null);
 }finally{f.db.close();}
});
