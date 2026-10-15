import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const snapshot={config:null,google:{authorized:false,available:true,email:'test@example.test'},communityId:1,userId:2};
const sheetUrl='https://docs.google.com/spreadsheets/d/test_private_spreadsheet_123456789/edit?usp=sharing';
function harness(query='', stored=null) {
 const slots=[],effects=[],requests=[],redirects=[],storage=new Map();let cursor=0;
 if(stored)storage.set('vinkulo:sheet-setup:1:2',JSON.stringify(stored));
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value]},useRef(value){const i=cursor++;return slots[i]??={current:value}},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,n)=>v!==slots[i][n])){slots[i]=deps;effects.push(fn)}}};
 const exports={};const location={search:query,href:'https://example.test/painel'+query,assign:url=>redirects.push(url)};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../app/components/VisitorSheetSettings.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='react'?hooks:jsx,AbortController,Date,Error,Math,URL,URLSearchParams,window:{location,history:{state:null,replaceState(a,b,url){location.search=url.search;location.href=url.href}}},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
 return{requests,redirects,storage,render(){cursor=0;return exports.VisitorSheetSettings({canManage:true})},flush(){effects.splice(0).forEach(fn=>fn())},open(){const tree=this.render(),target={open:true};tree.props.onToggle({target,currentTarget:target});this.render();this.flush();}};
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return[];return[node,...nodes(node.props?.children)]}
function text(node){if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'&&node?text(node.props?.children):node==null||typeof node==='boolean'?'':String(node)}
const find=(f,type)=>nodes(f.render()).find(n=>n.type===type);
async function reply(req,body,status=200){req.resolve(Response.json(body,{status}));await new Promise(r=>setImmediate(r));}

test('uma ação preserva o link antes de autorizar no Google',async()=>{
 const f=harness();f.open();await reply(f.requests[0],snapshot);
 find(f,'input').props.onChange({target:{value:sheetUrl}});f.render();find(f,'form').props.onSubmit({preventDefault(){}});
 assert.equal(JSON.parse(f.requests.at(-1).options.body).action,'connect');
 await reply(f.requests.at(-1),{authorizationRequired:true});assert.equal(JSON.parse(f.requests.at(-1).options.body).action,'authorize');
 await reply(f.requests.at(-1),{url:'https://accounts.google.com/authorization'});
 assert.equal(JSON.parse(f.storage.get('vinkulo:sheet-setup:1:2')).url,sheetUrl);assert.equal(f.redirects.length,1);
});
test('retorno autorizado conecta uma única vez e confirma fichas enviadas',async()=>{
 const f=harness('?view=visitantes&sheetSetup=authorized',{url:sheetUrl,at:Date.now()});f.render();f.flush();f.render();f.flush();
 await reply(f.requests[0],{...snapshot,google:{...snapshot.google,authorized:true}});
 assert.equal(f.requests.length,2);assert.equal(JSON.parse(f.requests[1].options.body).url,sheetUrl);assert.equal(f.storage.size,0);
 await reply(f.requests[1],{...snapshot,config:{spreadsheet_id:'test',sheet_id:7,habilitada:1,versao:2,versao_sincronizada:2,linhas:4,sincronizado_em:'2026-10-14 12:00:00',ultimo_erro:null}});
 assert.match(text(f.render()),/Envio concluído: 3 ficha/);assert.match(text(f.render()),/Sincronizada/);f.flush();f.render();assert.equal(f.requests.length,2);
});
test('cancelamento não envia dados e falha inicial não aparece como pausa',async()=>{
 const f=harness('?view=visitantes&sheetSetup=error&googleErro=Autorização%20cancelada',{url:sheetUrl,at:Date.now()});f.render();f.flush();f.render();f.flush();
 await reply(f.requests[0],{...snapshot,config:{spreadsheet_id:'test',habilitada:0,sincronizado_em:null,ultimo_erro:null}});
 assert.equal(f.requests.length,1);assert.match(text(f.render()),/Autorização cancelada/);assert.doesNotMatch(text(f.render()),/Pausada/);assert.equal(f.storage.size,0);
});
