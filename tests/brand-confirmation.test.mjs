import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function fixture(onConfirm) {
  const slots=[];let index=0,cancels=0;
  const hooks={useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=value;}];},useRef(initial){const i=index++;return slots[i]??={current:initial};}};
  const exports={};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../app/components/visitors/Views.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,require(name){if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;if(name==='./Dialog')return {Dialog:'dialog'};return {};}});
  return {get cancels(){return cancels;},render(){index=0;return exports.Confirm({title:'Confirmar ação',body:'Aplicar a alteração?',action:'Confirmar',onCancel(){cancels++;},onConfirm});}};
}
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const action=f=>nodes(f.render()).filter(n=>n.type==='button').at(-1);

test('confirmação de Visitantes mantém a marca pendente até a resposta e bloqueia duplicação',async()=>{
  let release,calls=0;const f=fixture(()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  const callback=action(f).props.onClick;
  const pending=callback();await callback();
  assert.equal(calls,1);assert.equal(f.render().props.busy,true);assert.equal(action(f).props.disabled,true);
  f.render().props.onClose();assert.equal(f.cancels,0);
  release();await pending;assert.equal(f.render().props.busy,false);
  f.render().props.onClose();assert.equal(f.cancels,1);
});

test('falha em confirmação mantém o erro visível e permite nova tentativa',async()=>{
  let fail=true;const f=fixture(async()=>{if(fail)throw Error('Não foi possível salvar');});
  await action(f).props.onClick();
  assert.equal(f.render().props.failed,true);
  assert.equal(nodes(f.render()).find(n=>n.props?.role==='alert').props.children,'Não foi possível salvar');
  fail=false;await action(f).props.onClick();assert.equal(f.render().props.failed,false);
});
