import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
const commerce={PLAN_LIMITS:[],PLAN_RESOURCES:[],formatPlanPrice:()=> 'R$ 10,00/mês'};
const modules={COMMUNITY_MODULES:[]};

function formHarness(component, props={}) {
 const slots=[],effects=[],requests=[];let cursor=0;
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=value]},useRef(initial){const i=cursor++;return slots[i]??={current:initial}},useEffect(fn){cursor++;effects.push(fn)}};
 const exports={};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../app/components/'+component,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='react'?hooks:name==='react/jsx-runtime'?jsx:name.endsWith('/commerce-types')?commerce:name.endsWith('/community-modules')?modules:name.endsWith('/AccessPortal')?{AccessShell:'shell',CpfField:'cpf',PasswordField:'password',postAccess:(url,body)=>new Promise((resolve,reject)=>requests.push({url,body,resolve,reject}))}:{default:'link'},Date,Error,FormData:class{constructor(form){this.form=form}*[Symbol.iterator](){yield* Object.entries(this.form)}get(key){return this.form[key]??null}}});
 return{requests,props,render(){cursor=0;return exports.default(props)},flush(){for(const fn of effects.splice(0))fn()}};
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return[];return[node,...nodes(node.props?.children)]}
const find=(tree,type,predicate=()=>true)=>nodes(tree).find(n=>n.type===type&&predicate(n));
const consent=tree=>find(tree,'input',n=>n.props.type==='checkbox');
const event=(data={})=>({preventDefault(){},currentTarget:data});
const plan={id:'um',nome:'Plano um',descricao:'Condições',valor_centavos:1000,periodicidade:'MENSAL',versao:1,duracao_dias:30,limites:{},modulos:[],recursos:[],condicoes:'Teste'};
const contracting=()=>formHarness('ContractingForm.tsx',{token:'fake',plans:[plan,{...plan,id:'dois',nome:'Plano dois'}],expiresAt:'2026-10-25T12:00:00Z'});

test('contratação não envia aceite inventado e exige nova confirmação ao trocar plano ou versão',async()=>{
 const f=contracting();const unaccepted=find(f.render(),'form').props.onSubmit(event());assert.equal(f.requests.length,0);await unaccepted;
 consent(f.render()).props.onChange({target:{checked:true}});assert.equal(consent(f.render()).props.checked,true);
 find(f.render(),'input',n=>n.props.value==='dois').props.onChange();assert.equal(consent(f.render()).props.checked,false);
 await find(f.render(),'form').props.onSubmit(event({aceite:'on'}));assert.equal(f.requests.length,0);
 consent(f.render()).props.onChange({target:{checked:true}});f.props.plans=[plan,{...plan,id:'dois',versao:2}];assert.equal(consent(f.render()).props.checked,false);
});

test('contratação bloqueia envio duplicado e troca de plano; libera tentativa após erro com foco',async()=>{
 const f=contracting();consent(f.render()).props.onChange({target:{checked:true}});
 const submit=find(f.render(),'form').props.onSubmit;const pending=submit(event({aceite:'on',email:'qa@example.invalid'}));void submit(event({aceite:'on'}));assert.equal(f.requests.length,1);
 assert.equal(find(f.render(),'fieldset',n=>n.props.className==='contract-plan-options').props.disabled,true);
 assert.ok(find(f.render(),'fieldset',n=>n.props.className==='commercial-form-fields').props.disabled);
 assert.equal(f.requests[0].body.planoId,'um');assert.equal(f.requests[0].body.aceite,true);
 f.requests[0].reject(new Error('Condições alteradas. Recarregue a proposta.'));await pending;
 let focused=false;const feedback=find(f.render(),'p',n=>n.props.role==='alert');feedback.props.ref.current={focus(){focused=true}};f.flush();assert.equal(focused,true);assert.equal(find(f.render(),'fieldset').props.disabled,false);
 const retry=find(f.render(),'form').props.onSubmit(event({aceite:'on'}));f.requests[1].resolve({message:'Aguarde análise'});await retry;
 assert.ok(find(f.render(),'div',n=>n.props.role==='status'));assert.equal(find(f.render(),'form'),undefined);
});

test('LOG1 mantém dados enquanto envia, impede duplicação e foca confirmação',async()=>{
 const f=formHarness('Log1Form.tsx');const submit=find(f.render(),'form').props.onSubmit;
 const pending=submit(event({nome:'Solicitante fictício',aceite:'on'}));void submit(event({aceite:'on'}));assert.equal(f.requests.length,1);assert.equal(find(f.render(),'fieldset').props.disabled,true);
 assert.equal(f.requests[0].body.aceite,true);f.requests[0].resolve({message:'Recebido para análise'});await pending;
 let focused=false;find(f.render(),'div',n=>n.props.role==='status').props.ref.current={focus(){focused=true}};f.flush();assert.ok(focused);assert.equal(find(f.render(),'form'),undefined);
});
