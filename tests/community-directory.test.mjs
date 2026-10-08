import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function moduleAt(path, require, extras={}) {
 const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require,...extras});return exports;
}
const search=moduleAt('app/lib/directory-search.ts');
const types=moduleAt('app/components/cells/types.ts');
function hooks(){const values=[];let cursor=0;return {reset(){cursor=0},useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return[values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value}]}};}
const data=[{id:1,nome:'Esperança',endereco_publico:'São José',lider_nome:'João',rede:'Famílias',dias_reuniao:['QUA'],status:'participo'},{id:2,nome:'Renovação',endereco_publico:'Centro',lider_nome:'Maria',rede:'Jovens',dias_reuniao:['SAB'],status:'aberta'}];
test('Busca encontra bairro e liderança sem exigir acentos ou caixa',()=>{
 assert.equal(search.matchesDirectorySearch(' sao jose ','São José'),true);
 assert.equal(search.matchesDirectorySearch('JOAO',null,'João'),true);
 assert.equal(search.matchesDirectorySearch('  ',null),true);
 assert.equal(search.matchesDirectorySearch('jose','Centro'),false);
});
test('Diretório combina busca, rede, dia e participação e limpa todos os filtros',()=>{
 const h=hooks();const m=moduleAt('app/components/cells/CellDirectoryFilters.tsx',name=>name==='react'?h:name==='react/jsx-runtime'?jsx:name.includes('directory-search')?search:types);
 const render=()=>{h.reset();return m.useCellDirectory(data,c=>c.status)};
 let d=render();d.setSearch('sao jose');d.setRede('Famílias');d.setDia('QUA');d.setStatus('participo');
 d=render();assert.deepEqual(Array.from(d.filtered,c=>c.id),[1]);
 d.setDia('SAB');d=render();assert.equal(d.filtered.length,0);assert.equal(d.active,true);
 d.reset();d=render();assert.equal(d.filtered.length,2);assert.equal(d.active,false);
});

function dataHarness(){
 const h=hooks(),effects=[],timers=[],requests=[];
 const m=moduleAt('app/components/cells/useCellsData.ts',()=>({...h,useCallback:fn=>fn,useEffect:fn=>effects.push(fn)}),{Date,Error,window:{setTimeout:fn=>timers.push(fn),clearTimeout(){},setInterval(){},clearInterval(){}},fetch:(url)=>new Promise(resolve=>requests.push({url,resolve}))});
 const render=()=>{h.reset();return m.useCellsData()};
 render();for(const effect of effects.splice(0))effect();for(const timer of timers.splice(0))timer();
 return {requests,render};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('Falha inicial de Células permanece distinta de uma lista vazia e aceita nova tentativa',async()=>{
 const f=dataHarness();assert.equal(f.render().hasLoaded,false);assert.equal(f.render().loading,true);
 f.requests[0].resolve(Response.json({error:'Sem conexão'},{status:503}));await settle();
 let state=f.render();assert.equal(state.loading,false);assert.equal(state.hasLoaded,false);assert.equal(state.loadError,'Sem conexão');
 const retry=state.retryLoad();assert.equal(f.render().loading,true);
 f.requests.at(-1).resolve(Response.json({celulas:[],canManage:false}));await retry;
 state=f.render();assert.equal(state.hasLoaded,true);assert.equal(state.loadError,'');assert.equal(state.cells.length,0);
});
test('Falha de atualização preserva dados anteriores e informa que não foram atualizados',async()=>{
 const f=dataHarness();f.requests[0].resolve(Response.json({celulas:data,canManage:true}));await settle();
 const retry=f.render().reload();f.requests.at(-1).resolve(Response.json({error:'Falha temporária'},{status:503}));await retry;
 const state=f.render();assert.equal(state.cells.length,2);assert.equal(state.hasLoaded,true);assert.equal(state.loadError,'Falha temporária');assert.equal(state.error,'');
});
