import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function harness(file,initialProps){
  const slots=[],effects=[],requests=[];let cursor=0,rendering=false,renderAgain=false,props=initialProps;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const memo=(factory,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:factory(),deps};return slots[i].value;};
  const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;if(rendering)renderAgain=true;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}}};
  const exports={};
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../app/components/${file}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,AbortController,Error,fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),require(name){if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;if(name.endsWith('.css'))return {};if(['./StableLink','./VinkuloMark','./LabModuleForm','./LabLayoutView','./LabRecordContent','./SafeImage'].includes(name))return {default:name};throw Error(name);}});
  return {requests,render(next=props){props=next;let tree,attempts=0;do{renderAgain=false;cursor=0;rendering=true;tree=exports.default(props);rendering=false;assert.ok(++attempts<10,'render must stabilize');}while(renderAgain);return tree;},flush(){for(const fn of effects.splice(0))fn();},close(){slots.forEach(slot=>slot?.cleanup?.());}};
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);return node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];}
function text(node){if(Array.isArray(node))return node.map(text).join('');return node&&typeof node==='object'?text(node.props?.children):node==null||typeof node==='boolean'?'':String(node);}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function reply(request,data,status=200){request.resolve(Response.json(data,{status}));await settle();}
const data=name=>({definition:{name,description:'',allowCreate:false},community:'Teste',records:[],total:0,page:0,canWrite:false});

test('trocar aba oculta consulta anterior e ignora resposta atrasada',async()=>{
  const f=harness('LabModuleRuntime',{id:'first'});f.render();f.flush();const old=f.requests[0];
  assert.match(text(f.render({id:'second'})),/Carregando aba/);f.flush();assert.equal(old.options.signal.aborted,true);
  await reply(f.requests[1],data('Resultado atual'));await reply(old,data('Resultado antigo'));
  assert.match(text(f.render()),/Resultado atual/);assert.doesNotMatch(text(f.render()),/Resultado antigo/);f.close();
});
test('consulta de aba mostra erro e permite recuperar pelo botão Atualizar',async()=>{
  const f=harness('LabModuleRuntime',{id:'first'});f.render();f.flush();await reply(f.requests[0],{error:'Falha simulada'},503);
  assert.match(text(f.render()),/Falha simulada/);
  nodes(f.render()).find(n=>n.type==='button'&&text(n)==='Atualizar').props.onClick();
  assert.match(text(f.render()),/Carregando aba/);await reply(f.requests[1],data('Recuperado'));assert.match(text(f.render()),/Recuperado/);f.close();
});
test('menu de abas remove imediatamente itens da comunidade anterior',async()=>{
  const f=harness('LabModuleNav',{communityId:1});f.render();f.flush();await reply(f.requests[0],{modules:[{id:'a',name:'Somente A'}]});
  assert.match(text(f.render()),/Somente A/);assert.equal(f.render({communityId:2}),null);f.flush();
  await reply(f.requests[1],{modules:[{id:'b',name:'Somente B'}]});assert.doesNotMatch(text(f.render()),/Somente A/);assert.match(text(f.render()),/Somente B/);f.close();
});
test('arte e permissão de editar não permanecem ao trocar comunidade',async()=>{
  const f=harness('PrayerWelcomeArt',{communityId:1});f.render();f.flush();await reply(f.requests[0],{communityId:1,highlight:{prayerImageUrl:'/first.png',prayerImageAlt:'Primeira'},canEdit:true});
  assert.match(text(f.render()),/Editar imagem/);const tree=f.render({communityId:2});assert.doesNotMatch(text(tree),/Editar imagem/);assert.equal(nodes(tree).find(n=>n.type==='./SafeImage'),undefined);f.close();
});
