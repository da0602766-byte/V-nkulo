import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
const module={};runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/feed-prayers.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:module});
test('Feed mostra somente as próprias orações da comunidade ativa e não revela notas internas',async()=>{
 const {database,d1}=await createPilotD1();try{
 const a=await createPilotUser(database,{nome:'Pessoa A',email:'a@feed.test',senha:'test-password'});
 const b=await createPilotUser(database,{nome:'Pessoa B',email:'b@feed.test',senha:'test-password'});
 const insert=database.prepare("INSERT INTO solicitacoes_comunidade(comunidade_id,solicitante_id,tipo,titulo,descricao)VALUES(?,?,?,?,?)");
 const own=Number(insert.run(1,a,'ORACAO','Minha oração','Mensagem particular').lastInsertRowid);
 insert.run(1,b,'ORACAO','Outro usuário','Não expor');insert.run(2,a,'ORACAO','Outra comunidade','Não misturar');insert.run(1,a,'VISITA','Visita','Outro tipo');
 database.prepare("INSERT OR IGNORE INTO solicitacao_repositorios(comunidade_id,tipo,nome)VALUES(1,'ORACAO','Oração')").run();
 const repo=database.prepare("SELECT id FROM solicitacao_repositorios WHERE comunidade_id=1 AND tipo='ORACAO'").get().id;
 const item=Number(database.prepare("INSERT INTO solicitacao_repositorio_itens(repositorio_id,comunidade_id,solicitacao_id,status)VALUES(?,1,?,'EM_ORACAO')").run(repo,own).lastInsertRowid);
 const event=database.prepare("INSERT INTO solicitacao_eventos(comunidade_id,item_id,solicitacao_id,tipo,mensagem,visivel_membro)VALUES(1,?,?,'ATUALIZACAO',?,?)");
 event.run(item,own,'Estamos orando com você.',1);event.run(item,own,'Nota interna sigilosa.',0);
 const data=await module.loadFeedPrayers(d1,1,a);assert.equal(data.items.length,1);assert.equal(data.items[0].id,own);assert.equal(data.items[0].status,'EM_ORACAO');assert.equal(data.items[0].atualizacao,'Estamos orando com você.');assert.equal(data.userId,a);assert.equal(data.communityId,1);
 for(let i=0;i<6;i++)insert.run(1,a,'ORACAO','Pedido '+i,'Mensagem '+i);
 const limited=await module.loadFeedPrayers(d1,1,a);assert.equal(limited.items.length,5);assert.equal(limited.hasMore,true);assert.equal(limited.items[0].titulo,'Pedido 5');
 }finally{database.close();}
});
