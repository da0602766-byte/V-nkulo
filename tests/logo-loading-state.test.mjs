import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const exports={};
runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/logo-loading-state.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URLSearchParams});
test('loading continuation rejects corrupt, expired and future session values',()=>{
 for(const raw of [null,'invalid','{}',JSON.stringify({started:1001,label:'x'}),JSON.stringify({started:-30000,label:'x'}),JSON.stringify({started:990,label:1})])assert.equal(exports.parseLogoLoadingState(raw,1000),null);
 const state=exports.parseLogoLoadingState(JSON.stringify({started:990,label:'Abrindo Visitantes…'}),1000);
 assert.equal(state.started,990);assert.equal(state.label,'Abrindo Visitantes…');
});
function bootstrap(pathname,search='',raw=null){
 const dataset={},styles={};
 runInNewContext(exports.LOGO_LOADING_BOOTSTRAP,{document:{documentElement:{dataset,style:{setProperty:(key,value)=>styles[key]=value}}},location:{pathname,search},sessionStorage:{getItem:()=>raw},URLSearchParams});
 return {dataset,styles};
}
test('bootstrap hides an eligible destination before page content is parsed',()=>{
 for(const [route,query]of [['/painel',''],['/painel','?view=inicio'],['/painel/visitantes','?section=listas']])assert.equal(bootstrap(route,query).dataset.logoTransition,'waiting');
 for(const [route,query]of [['/login',''],['/painel','?view=pessoas'],['/proprietario','']])assert.equal(bootstrap(route,query).dataset.logoTransition,undefined);
});
test('an active transition keeps its animation time across documents and expires safely',()=>{
 const value=JSON.stringify({started:Date.now()-2500,label:'Entrando na comunidade…'}),state=bootstrap('/destino','',value);
 assert.equal(state.dataset.logoTransition,'waiting');assert.ok(Number.parseFloat(state.styles['--vinkulo-loading-offset'])<=-2500);
 assert.equal(bootstrap('/login','',JSON.stringify({started:Date.now()-31000,label:'Antigo'})).dataset.logoTransition,undefined);
});
