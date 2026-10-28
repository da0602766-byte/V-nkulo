import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/chat-arrivals.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const {incomingChatArrivals}=exports;
const row=(message=10)=>({id:1,participante_id:7,nao_lidas:1,ultima_recebida_id:message});
test('avisos: primeira sincronização e mensagens já anunciadas ficam silenciosas',()=>{
 assert.equal(incomingChatArrivals([row()],null,null,true).length,0);
 assert.equal(incomingChatArrivals([row()],new Map([[1,10]]),null,true).length,0);
});
test('avisos: nova mensagem com a mesma contagem é detectada pelo id',()=>{
 assert.equal(incomingChatArrivals([row(11)],new Map([[1,10]]),null,true).length,1);
});
test('avisos: chat visível não alerta; minimizado e outra conversa alertam',()=>{
 const previous=new Map([[1,9]]);
 assert.equal(incomingChatArrivals([row()],previous,7,true).length,0);
 assert.equal(incomingChatArrivals([row()],previous,null,true).length,1);
 assert.equal(incomingChatArrivals([row()],previous,8,true).length,1);
});
test('avisos: preferência desativada e mensagens lidas não exibem prévias',()=>{
 assert.equal(incomingChatArrivals([row()],new Map(),null,false).length,0);
 assert.equal(incomingChatArrivals([{...row(),nao_lidas:0}],new Map(),null,true).length,0);
});
