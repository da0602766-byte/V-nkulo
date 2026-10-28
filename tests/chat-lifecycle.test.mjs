import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function harness() {
  const slots = [], effects = [], requests = [], sounds = [], timers = new Map(), intervals = new Map();
  let cursor = 0, timerId = 0;
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const hooks = {
    useCallback(fn,deps) {return hooks.useMemo(()=>fn,deps);},
    useState(initial) {const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function'?initial():initial; return [slots[i], next => {slots[i]=typeof next==='function'?next(slots[i]):next;}];},
    useRef(initial) {const i=cursor++; return slots[i]??={current:initial};},
    useMemo(fn,deps) {const i=cursor++; if (!slots[i] || !same(slots[i].deps,deps)) slots[i]={value:fn(),deps}; return slots[i].value;},
    useEffect(fn,deps) {const i=cursor++; if (!slots[i] || !same(slots[i].deps,deps)) {slots[i]?.cleanup?.(); slots[i]={deps}; effects.push(()=>{slots[i].cleanup=fn();});}},
  };
  const exports = {}, window = {
    location: {href: 'https://localhost/painel?view=mensagens'},
    history: {state: null, replaceState(_state,_title,url) {window.location.href=String(url);}},
    setTimeout(fn,ms) {timers.set(++timerId,{fn,ms});return timerId;}, clearTimeout(id) {timers.delete(id);},
    setInterval(fn,ms) {intervals.set(++timerId,{fn,ms});return timerId;}, clearInterval(id) {intervals.delete(id);},
    addEventListener() {}, removeEventListener() {},
  };
  runInNewContext(ts.transpileModule(readFileSync(new URL('../app/components/PrivateChatWorkspace.tsx',import.meta.url),'utf8'), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText, {
    exports, window, URL, document: {visibilityState:'visible',addEventListener(){},removeEventListener(){}},
    FormData: class {constructor(form) {this.form=form;} get() {return this.form.message;}},
    fetch: (url,options) => new Promise((resolve,reject) => requests.push({url,options,resolve,reject})),
    require(name) {if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;if(name==='./SafeImage')return {default:'SafeImage'};if(name==='./ChatEmoji')return {default:'ChatEmoji',EmojiText:'EmojiText'};if(name==='../lib/chat-sounds')return {playChatSound(...args){sounds.push(args);}};if(name==='../lib/chat-emojis')return {CHAT_EMOJIS:[]};throw Error(name);},
  });
  return {
    requests, sounds,
    render(props) {cursor=0; return exports.default(props);},
    flush() {for(const fn of effects.splice(0))fn();for(const[id,t]of timers)if(t.ms===0){timers.delete(id);t.fn();}},
    poll() {for(const t of intervals.values())if(t.ms===3000)t.fn();},
    close() {slots.forEach(slot=>slot?.cleanup?.());},
  };
}
function nodes(n) {return Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];}
function text(n) {return Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):n==null||typeof n==='boolean'?'':String(n);}
const settle = () => new Promise(resolve=>setImmediate(resolve));
async function reply(request,data,status=200) {request.resolve(Response.json(data,{status}));await settle();}
const conversation = (id,name) => ({id,participante_id:id+100,participante_nome:name,participante_foto:null,hierarquia:'Membro',ministerio:'',online:0,last_seen:null,ultima_mensagem:null,ultimo_remetente_id:null,nao_lidas:0,atualizado_em:'2026-10-26 12:00:00'});
const message = (id,mensagem) => ({id,mensagem,remetente_id:7,remetente_nome:'Eu',criado_em:'2026-10-26 12:00:00',entregue_em:null,lida_em:null});
const workspace = messages => ({people:[],conversations:[conversation(11,'Ana'),conversation(22,'Bia')],messages,currentUserId:7});
const requestFor = (f,id) => f.requests.filter(r=>r.url==='/api/pilot/chat?conversation='+id).at(-1);
function open(f,id) {nodes(f.render()).find(n=>n.type==='button'&&n.key===String(id)).props.onClick();}
async function initialized() {const f=harness();f.render();f.flush();await reply(f.requests[0],workspace([]));return f;}
async function ready(f,id) {open(f,id);await reply(requestFor(f,id),workspace([]));f.render();f.flush();}
function send(f,content) {return nodes(f.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{message:content,reset(){}}});}

test('resposta atrasada de outra conversa não troca as mensagens atuais',async()=>{
  const f=await initialized();open(f,11);const old=requestFor(f,11);open(f,22);
  await reply(requestFor(f,22),workspace([message(2,'Mensagem de Bia')]));
  await reply(old,workspace([message(1,'Mensagem de Ana')]));
  assert.match(text(f.render()),/Mensagem de Bia/);assert.doesNotMatch(text(f.render()),/Mensagem de Ana/);f.close();
});

test('envio concluído após trocar contato não aparece na conversa nova',async()=>{
  const f=await initialized();await ready(f,11);const sending=send(f,'Enviada para Ana');
  const request=f.requests.find(r=>r.options?.method==='POST');
  await ready(f,22);await reply(request,{message:message(8,'Enviada para Ana')});await sending;
  assert.doesNotMatch(text(f.render()),/Enviada para Ana/);f.close();
});

test('falha atrasada de envio não mostra erro em outra conversa',async()=>{
  const f=await initialized();await ready(f,11);const sending=send(f,'Teste');
  const request=f.requests.find(r=>r.options?.method==='POST');await ready(f,22);
  request.reject(Error('Falha antiga de Ana'));await sending;
  assert.doesNotMatch(text(f.render()),/Falha antiga de Ana/);f.close();
});

test('sondagem iniciada antes de um envio não apaga a mensagem confirmada',async()=>{
  const f=await initialized();await ready(f,11);f.poll();
  const poll=f.requests.find(r=>r.url.includes('messagesOnly=1'));
  const sending=send(f,'Mensagem confirmada');const request=f.requests.find(r=>r.options?.method==='POST');
  await reply(request,{message:message(9,'Mensagem confirmada')});await sending;
  await reply(poll,{messages:[]});
  assert.match(text(f.render()),/Mensagem confirmada/);f.close();
});

test('sair e voltar à mesma conversa invalida a resposta da visita anterior',async()=>{
  const f=await initialized();open(f,11);const old=requestFor(f,11);open(f,22);open(f,11);
  await reply(requestFor(f,11),workspace([message(4,'Atual')]));
  await reply(old,workspace([message(3,'Obsoleta')]));
  assert.match(text(f.render()),/Atual/);assert.doesNotMatch(text(f.render()),/Obsoleta/);f.close();
});

test('abrir contato trata falha de rede e permite nova tentativa',async()=>{
  const f=harness();f.render();f.flush();
  await reply(f.requests[0],{...workspace([]),people:[{id:33,nome:'Carla',foto_perfil:null,hierarquia:'Membro',ministerio:'',online:0,last_seen:null}]});
  open(f,33);f.requests.at(-1).reject(Error('Sem conexão'));await settle();
  assert.match(text(f.render()),/Sem conexão/);
  open(f,33);await reply(f.requests.at(-1),{conversationId:11});
  await reply(requestFor(f,11),workspace([message(5,'Recuperada')]));
  assert.match(text(f.render()),/Recuperada/);assert.doesNotMatch(text(f.render()),/Sem conexão/);f.close();
});

test('dois contatos abertos rapidamente preservam a escolha mais recente',async()=>{
  const f=harness();f.render();f.flush();
  const people=[33,44].map(id=>({id,nome:'Contato '+id,foto_perfil:null,hierarquia:'Membro',ministerio:'',online:0,last_seen:null}));
  await reply(f.requests[0],{...workspace([]),people});
  open(f,33);const old=f.requests.at(-1);open(f,44);
  await reply(f.requests.at(-1),{conversationId:22});
  await reply(requestFor(f,22),workspace([message(10,'Última escolha')]));
  await reply(old,{conversationId:11});
  assert.equal(requestFor(f,11),undefined);
  assert.match(text(f.render()),/Última escolha/);f.close();
});

test('rede lenta não acumula sondagens da mesma conversa',async()=>{
  const f=await initialized();await ready(f,11);f.poll();f.poll();f.poll();
  assert.equal(f.requests.filter(r=>r.url.includes('messagesOnly=1')).length,1);f.close();
});

test('reenviar mensagem com falha mantém o destinatário e remove a pendência',async()=>{
  const f=await initialized();await ready(f,11);const sending=send(f,'Tentar novamente');
  f.requests.find(r=>r.options?.method==='POST').reject(Error('Falha simulada'));await sending;
  const retry=nodes(f.render()).find(n=>n.type==='button'&&text(n).includes('toque para reenviar'));
  assert.ok(retry);retry.props.onClick();
  const request=f.requests.filter(r=>r.options?.method==='POST').at(-1);
  assert.equal(JSON.parse(request.options.body).targetUserId,111);
  await reply(request,{message:message(11,'Tentar novamente')});
  assert.doesNotMatch(text(f.render()),/toque para reenviar/);
  assert.doesNotMatch(text(f.render()),/Falha simulada/);
  assert.equal(nodes(f.render()).filter(n=>n.type==='p'&&text(n)==='Tentar novamente').length,1);f.close();
});


test('chat minimizado não confirma leitura e retoma ao restaurar', async()=>{
  const f=await initialized();await ready(f,11);
  f.render({visible:false});f.flush();
  const before=f.requests.length;f.poll();
  assert.equal(f.requests.length,before,'minimizado não deve buscar nem ler mensagens');
  f.render({visible:true});f.flush();
  assert.ok(f.requests.slice(before).some(r=>r.options?.method==='PATCH'),'restaurar confirma leitura');
  f.close();
});

test('minimizar enquanto carrega impede confirmação tardia de leitura', async()=>{
  const f=await initialized();open(f,11);const request=requestFor(f,11);
  f.render({visible:false});f.flush();
  await reply(request,workspace([]));
  assert.equal(f.requests.filter(r=>r.options?.method==='PATCH').length,0);
  f.close();
});

test('aviso reabre o mesmo remetente depois de outra conversa', async()=>{
  const f=await initialized();
  f.render({initialTargetUserId:111,openSequence:1});f.flush();
  const first=f.requests.filter(r=>r.options?.method==='POST').at(-1);
  await reply(first,{conversationId:11});await reply(requestFor(f,11),workspace([]));
  await ready(f,22);
  f.render({initialTargetUserId:111,openSequence:2});f.flush();
  const second=f.requests.filter(r=>r.options?.method==='POST').at(-1);
  assert.notEqual(second,first);assert.equal(JSON.parse(second.options.body).targetUserId,111);
  await reply(second,{conversationId:11});await reply(requestFor(f,11),workspace([message(30,'Conversa reaberta pelo aviso')]));
  assert.match(text(f.render({initialTargetUserId:111,openSequence:2})),/Conversa reaberta pelo aviso/);f.close();
});


test('sons: abrir histórico é silencioso e somente mensagem nova recebida toca',async()=>{
  const f=await initialized();open(f,11);
  await reply(requestFor(f,11),workspace([{...message(20,'Histórico'),remetente_id:8}]));f.render();f.flush();
  assert.equal(f.sounds.length,0);
  f.poll();const poll=f.requests.findLast(r=>r.url.includes('messagesOnly'));
  await reply(poll,workspace([{...message(20,'Histórico'),remetente_id:8},{...message(21,'Nova'),remetente_id:8}]));f.render();f.flush();
  assert.deepEqual(f.sounds,[['received',21]]);f.close();
});
