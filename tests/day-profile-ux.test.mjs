import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function harness(path, props={}) {
 const slots=[],effects=[],timers=new Map(),requests=[];let cursor=0,timerId=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;};
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},useRef(initial){const i=cursor++;return slots[i]??={current:initial}},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn()})}}};
 const clock={setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)},setInterval(){return ++timerId},clearInterval(){}};
 const exports={};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../app/components/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='react'?hooks:name==='react/jsx-runtime'?jsx:{default:'stub'},Date,Error,AbortController,URL,FormData:class{constructor(form){this.form=form}get(key){return this.form[key]??null}},window:{...clock,location:{href:'https://example.invalid/painel?view=conta'}},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
 return {requests,render(){cursor=0;return exports.default(props)},flush(){for(const effect of effects.splice(0))effect();const batch=[...timers.values()];timers.clear();for(const fn of batch)fn()}};
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return[];return[node,...nodes(node.props?.children)]}
function text(node){if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'&&node?text(node.props?.children):node==null||typeof node==='boolean'?'':String(node)}
const find=(tree,type,filter=()=>true)=>nodes(tree).find(n=>n.type===type&&filter(n));
const button=(tree,label)=>find(tree,'button',n=>text(n)===label);
const change=(node,value)=>node.props.onChange({target:{value}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function reply(request,data,status=200){request.resolve(Response.json(data,{status}));await settle()}
const resumo={registros:1,visitantes:0,pedidos:0,escalas:{total:0,confirmadas:0},visitantesPorCategoria:[]};
const item=(id,titulo)=>({id,titulo,camada:'PESSOAS',ocorreEm:'2026-01-01T12:00:00',origem:'Manual',detalhe:'',manual:true});
const day=()=>{const f=harness('DayThreadWorkspace.tsx',{permissions:['leadership.panel.view']});f.render();f.flush();return f};
const accountData={account:{nome:'Pessoa de teste',email:'teste@example.invalid',fotoPerfil:'',dataNascimento:'',biografia:'Rascunho'},fields:[{id:'telefone',label:'Telefone',type:'tel',value:'',private:true},{id:'cidade',label:'Cidade',type:'text',value:'',private:false}]};
const account=()=>{const f=harness('AccountProfileWorkspace.tsx');f.render();f.flush();return f};

test('Fio oculta registros e totais antigos imediatamente e ignora resposta cancelada',async()=>{
 const f=day();await reply(f.requests[0],{itens:[item('1','Registro anterior')],resumo});
 change(find(f.render(),'input',n=>n.props.type==='date'),'2026-01-02');let tree=f.render();assert.doesNotMatch(text(tree),/Registro anterior/);assert.equal(find(tree,'article'),undefined);assert.match(text(tree),/Organizando o dia/);f.flush();const slow=f.requests.at(-1);
 change(find(f.render(),'input',n=>n.props.type==='date'),'2026-01-03');f.render();f.flush();assert.equal(slow.options.signal.aborted,true);
 await reply(f.requests.at(-1),{itens:[item('2','Registro correto')],resumo});await reply(slow,{itens:[item('3','Resposta atrasada')],resumo});
 tree=f.render();assert.match(text(tree),/Registro correto/);assert.doesNotMatch(text(tree),/Resposta atrasada|no fio de hoje|Ainda hoje|Depois deste ponto/);
});
test('Fio diferencia falha de consulta de dia vazio e permite tentar novamente',async()=>{
 const f=day();await reply(f.requests[0],{error:'Falha na consulta'},503);let tree=f.render();assert.equal(find(tree,'p',n=>n.props.role==='alert').props.children,'Falha na consulta');assert.doesNotMatch(text(tree),/Nada registrado|Nada mais marcado/);
 button(tree,'Tentar novamente').props.onClick();f.render();f.flush();await reply(f.requests.at(-1),{itens:[],resumo});assert.match(text(f.render()),/Nada registrado neste dia/);
});
test('Fio limpa seleção sem resultados e permite voltar ao dia atual',async()=>{
 const f=day();await reply(f.requests[0],{itens:[item('1','Pessoa recebida')],resumo});button(f.render(),'Cultos').props.onClick();assert.match(text(f.render()),/Nenhum registro nas camadas selecionadas/);button(f.render(),'Limpar filtros').props.onClick();assert.match(text(f.render()),/Pessoa recebida/);
 const today=find(f.render(),'input',n=>n.props.type==='date').props.value;change(find(f.render(),'input',n=>n.props.type==='date'),'2026-01-01');button(f.render(),'Voltar para hoje').props.onClick();assert.equal(find(f.render(),'input',n=>n.props.type==='date').props.value,today);
});
test('Fio bloqueia registro duplicado e preserva rascunho após erro',async()=>{
 const f=day();await reply(f.requests[0],{itens:[],resumo});button(f.render(),'Registrar no fio').props.onClick();change(find(f.render(),'input',n=>n.props.maxLength===160),'Registro de teste');const submit=find(f.render(),'form').props.onSubmit;submit({preventDefault(){}});submit({preventDefault(){}});assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);assert.equal(find(f.render(),'input',n=>n.props.type==='date').props.disabled,true);
 await reply(f.requests.at(-1),{error:'Sem conexão'},503);const tree=f.render();assert.match(text(tree),/Sem conexão.*Seus dados continuam/);assert.equal(find(tree,'input',n=>n.props.maxLength===160).props.value,'Registro de teste');assert.equal(button(tree,'Registrar').props.disabled,false);
});
test('Perfil oferece recuperação de falha de carregamento',async()=>{
 const f=account();await reply(f.requests[0],{error:'Conta indisponível'},503);assert.match(text(f.render()),/Conta indisponível/);button(f.render(),'Tentar novamente').props.onClick();assert.match(text(f.render()),/Carregando sua conta/);f.render();f.flush();await reply(f.requests.at(-1),accountData);assert.match(text(f.render()),/Meu perfil e privacidade/);
});
test('Perfil envia privacidade de cada campo uma vez e preserva o formulário após falha',async()=>{
 const f=account();await reply(f.requests[0],accountData);const submit=find(f.render(),'form').props.onSubmit;const event={preventDefault(){},currentTarget:{nome:'Pessoa de teste',biografia:'Rascunho','field:telefone':'1234567890','private:telefone':'on','field:cidade':'Cidade de teste'}};submit(event);submit(event);const writes=f.requests.filter(r=>r.options.method==='PATCH');assert.equal(writes.length,1);assert.deepEqual(JSON.parse(writes[0].options.body).privacy,{telefone:true,cidade:false});assert.equal(find(f.render(),'fieldset').props.disabled,true);
 await reply(writes[0],{error:'Falha ao salvar'},503);let tree=f.render();assert.match(text(tree),/Falha ao salvar.*Seus dados continuam/);assert.equal(find(tree,'textarea',n=>n.props.name==='biografia').props.defaultValue,'Rascunho');assert.equal(button(tree,'Salvar minha conta').props.disabled,false);
 find(tree,'form').props.onSubmit(event);await reply(f.requests.at(-1),{});tree=f.render();assert.equal(find(tree,'p',n=>n.props.role==='alert'),undefined);assert.match(text(tree),/Informações da conta atualizadas/);
});
test('Perfil identifica cada privacidade e mantém dados pessoais antes do armazenamento',async()=>{
 const f=account();await reply(f.requests[0],accountData);const tree=f.render(),all=nodes(tree);assert.deepEqual(all.filter(n=>n.type==='input'&&n.props.type==='checkbox').map(n=>n.props['aria-label']),['Manter Telefone privado','Manter Cidade privado']);assert.ok(all.indexOf(find(tree,'form'))<all.indexOf(find(tree,'div',n=>n.props.id==='account-storage')));assert.equal(find(tree,'input',n=>n.props.type==='email').props.readOnly,true);
});
test('Armazenamento encerra o carregamento em falha e permite recuperação',async()=>{
 const f=harness('StoragePrivacyWorkspace.tsx');f.render();f.flush();await reply(f.requests[0],{error:'Armazenamento indisponível'},503);assert.match(text(f.render()),/Armazenamento indisponível/);assert.equal(f.render().props['aria-busy'],false);button(f.render(),'Tentar novamente').props.onClick();f.render();f.flush();await reply(f.requests.at(-1),{userId:1,profilePhoto:'',googleAvailable:false,google:null,preference:{provider:'LOCAL',auto_load_recent:0},communityStorage:null,canConfigureCommunity:false});assert.match(text(f.render()),/Escolha onde guardar seus arquivos/);
});
