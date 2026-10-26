import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilotD1} from './helpers/sqlite-d1.mjs';

test('compartilhamento público protege conteúdo e metadados de publicações restritas',async()=>{
  const {database:db,d1}=await createPilotD1();
  try {
    const worker=(await import('../dist/server/index.js')).default;
    const env={DB:d1,AUTH_SECRET:'share-audit-only',ASSETS:{fetch:async()=>new Response('',{status:404})}};
    const ctx={waitUntil(){},passThroughOnException(){}};
    const post=Number(db.prepare(`INSERT INTO publicacoes_piloto(comunidade_id,titulo,resumo,conteudo,categoria,visibilidade,status,origem,audiencia_tipo,imagem_url)
      VALUES(1,'MARCADOR_TITULO_PRIVADO','Resumo','MARCADOR_CONTEUDO_PRIVADO','COMUNIDADE','PLATAFORMA','PUBLICADA','COMUNIDADE','PUBLICO','https://example.test/private-marker.png')`).run().lastInsertRowid);
    const call=()=>worker.fetch(new Request('https://localhost/compartilhar/publicacao/'+post),env,ctx);
    const checkPrivate=async()=>{
      const response=await call(),html=await response.text();
      assert.equal(response.status,404);
      assert.doesNotMatch(html,/MARCADOR_TITULO_PRIVADO|MARCADOR_CONTEUDO_PRIVADO|private-marker\.png/);
      const comments=await worker.fetch(new Request('https://localhost/api/publicacoes/'+post+'/comentarios'),env,ctx);
      assert.equal(comments.status,404);
    };
    db.exec("UPDATE comunidades SET status='ATIVA',feed_publico_habilitado=1 WHERE id=1");
    assert.equal((await call()).status,200);
    db.prepare("UPDATE publicacoes_piloto SET audiencia_tipo='MINISTERIOS' WHERE id=?").run(post);
    await checkPrivate();
    db.prepare("UPDATE publicacoes_piloto SET audiencia_tipo='PUBLICO',visibilidade='COMUNIDADE' WHERE id=?").run(post);
    await checkPrivate();
    db.prepare("UPDATE publicacoes_piloto SET visibilidade='PLATAFORMA',status='RASCUNHO' WHERE id=?").run(post);
    await checkPrivate();
    db.prepare("UPDATE publicacoes_piloto SET status='PUBLICADA' WHERE id=?").run(post);
    db.exec("UPDATE comunidades SET feed_publico_habilitado=0 WHERE id=1");
    await checkPrivate();
    db.exec("UPDATE comunidades SET feed_publico_habilitado=1,status='ARQUIVADA' WHERE id=1");
    await checkPrivate();
    db.exec("UPDATE comunidades SET status='ATIVA' WHERE id=1");
    const restored=await call();assert.equal(restored.status,200);assert.match(await restored.text(),/MARCADOR_CONTEUDO_PRIVADO/);
  }finally{db.close();}
});
