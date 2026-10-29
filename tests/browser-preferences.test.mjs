import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToString} from 'react-dom/server';

function load(hooks, window) {
  const exports={};
  const source=ts.transpileModule(readFileSync(new URL('../app/components/useBrowserStorage.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,window,Event,require:name=>{assert.equal(name,'react');return hooks;}});
  return exports.useBrowserStorage;
}
const parse=raw=>raw==='true';
function browser(blocked=false){
  const events=new EventTarget(), storage=new Map();
  return {storage,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),localStorage:{getItem(key){if(blocked)throw Error('Storage denied');return storage.get(key)??null;},setItem(key,value){if(blocked)throw Error('Storage denied');storage.set(key,value);},removeItem(key){if(blocked)throw Error('Storage denied');storage.delete(key);}}};
}
function client(window){
  let notifications=0;
  const cleanups=[];
  const hook=load({useCallback:fn=>fn,useMemo:fn=>fn(),useSyncExternalStore(subscribe,snapshot){cleanups.push(subscribe(()=>notifications++));return snapshot();}},window);
  return {hook,notifications:()=>notifications,close:()=>cleanups.forEach(cleanup=>cleanup())};
}

test('preferências têm snapshot de servidor estável mesmo com valor salvo no navegador',()=>{
  const window=browser();window.storage.set('menu','true');
  const usePreference=load(React,window);
  function Probe(){const [value]=usePreference('menu',parse);return React.createElement('span',null,String(value));}
  assert.equal(renderToString(React.createElement(Probe)),'<span>false</span>');
});

test('preferências sincronizam consumidores e abas, isolando a chave da comunidade',()=>{
  const window=browser(),f=client(window);
  const [,setValue]=f.hook('community-a',parse);
  f.hook('community-a',parse);
  setValue(true);
  assert.equal(f.notifications(),2);
  assert.equal(f.hook('community-a',parse)[0],true);
  assert.equal(f.hook('community-b',parse)[0],false);
  window.storage.set('community-a','false');window.dispatchEvent(new Event('storage'));
  assert.equal(f.hook('community-a',parse)[0],false);
  f.close();const count=f.notifications();window.dispatchEvent(new Event('storage'));assert.equal(f.notifications(),count);
});

test('preferência continua editável quando o navegador bloqueia localStorage',()=>{
  const f=client(browser(true));const [,setValue]=f.hook('menu',parse);
  setValue(true);assert.equal(f.hook('menu',parse)[0],true);
  setValue(current=>!current);assert.equal(f.hook('menu',parse)[0],false);f.close();
});
