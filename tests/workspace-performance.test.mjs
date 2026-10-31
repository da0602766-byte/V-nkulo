import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,nodes,text,runScenarios,visitorSnapshot,ministrySnapshot} from './helpers/workspace-performance.mjs';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

test('real component actions avoid redundant reads in tabs, ministry entry/dialog and profile save',async()=>{
  assert.deepEqual(await runScenarios(),{visitorTabReads:0,ministryEntryReads:2,ministryDialogReads:1,profileReads:0});
});

test('visitor explicit refresh still verifies permissions and clears revoked private data',async()=>{
  const h=harness('visitors/VisitorApp',{communityName:'Teste',userName:'Pessoa',permissions:[],isOwner:false});h.render();h.flush();
  await h.reply(h.requests.find(r=>r.api),{...visitorSnapshot,visitantes:[{id:'1',nome:'Privado'}]});
  nodes(h.render()).find(n=>n.type==='button'&&text(n)==='Atualizar').props.onClick();
  h.requests.at(-1).reject(Object.assign(new Error('Acesso removido'),{status:403}));await new Promise(r=>setImmediate(r));
  assert.equal(nodes(h.render()).find(n=>n.type==='people'),undefined);assert.match(text(h.render()),/Acesso removido/);h.close();
});

test('ministry initial response is discarded after unmount',async()=>{
  const h=harness('SecretaryMinisterialWorkspace',{communityName:'Teste',preferenceKey:'1:1',permissions:[]});h.render();h.flush();h.close();
  for(const r of h.requests){assert.equal(r.options.signal.aborted,true);await h.reply(r,ministrySnapshot);}
  assert.equal(h.lateUpdates,0);
});

test('failed profile save preserves editor and never announces success or reloads listing',async()=>{
  const h=harness('PeopleWorkspace',{communityName:'Teste',mode:'self'});h.render();h.flush();h.timers();
  await h.reply(h.requests[0],{me:{id:1,nome:'Teste',telefone:'old'},people:[],canViewPeople:false,canManage:false});
  const form={values:{telefone:'draft'}};
  const save=h.render().props.onSubmit({preventDefault(){},currentTarget:form});
  await h.reply(h.requests[1],{error:'Falha simulada'},503);await save;
  const tree=h.render();assert.equal(tree.props.me.telefone,'old');assert.equal(tree.props.error,'Falha simulada');assert.equal(tree.props.message,'');assert.equal(form.values.telefone,'draft');assert.equal(h.requests.length,2);h.close();
});

test('notification visibility bursts share an in-flight read; mutations invalidate it and late responses are ignored',async()=>{
  const h=harness('PilotNotificationCenter',{});h.render();h.flush();h.timers();
  assert.equal(h.requests.length,1);const old=h.requests[0];
  h.event('visibilitychange');h.event('visibilitychange');assert.equal(h.requests.length,1);
  h.event('adote:refresh-notifications');assert.equal(h.requests.length,2);assert.equal(old.options.signal.aborted,true);
  await h.reply(h.requests[1],{notifications:[]});await h.reply(old,{notifications:[{id:1,title:'Obsoleto',read:false,category:'sistema'}]});
  assert.doesNotMatch(text(h.render()),/Obsoleto/);h.event('visibilitychange');const pending=h.requests.at(-1);h.close();await h.reply(pending,{notifications:[]});assert.equal(h.lateUpdates,0);
});

test('workspace preloading downloads code once, obeys data saver and retries failed imports',async()=>{
  const source=readFileSync(new URL('../app/lib/workspace-preload.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={},calls=[],navigator={connection:{saveData:true,effectiveType:'4g'}},document={documentElement:{dataset:{}}};let fail=false;
  runInNewContext(code,{exports,navigator,document,require:name=>{calls.push(name);if(fail)throw Error('Offline');return {};}});
  const flush=()=>new Promise(r=>setImmediate(r));
  exports.preloadWorkspace('ministerios');await flush();assert.equal(calls.length,0);
  navigator.connection.saveData=false;exports.preloadWorkspace('ministerios');exports.preloadWorkspace('ministerios');await flush();assert.equal(calls.length,1);
  document.documentElement.dataset.dataSaver='true';exports.preloadWorkspace('pessoas');await flush();assert.equal(calls.length,1);
  document.documentElement.dataset.dataSaver='false';navigator.connection.effectiveType='2g';exports.preloadWorkspace('pessoas');await flush();assert.equal(calls.length,1);
  navigator.connection.effectiveType='4g';fail=true;exports.preloadWorkspace('pessoas');await flush();fail=false;exports.preloadWorkspace('pessoas');await flush();assert.equal(calls.length,3);
});

test('ministry resources load on entry to details, retry failed reads and retain the catalogue',async()=>{
  const h=harness('SecretaryMinisterialWorkspace',{communityName:'Teste',preferenceKey:'1:1',permissions:[]});h.render();h.flush();
  const ministry={id:1,nome:'Louvor',categoria:'LOUVOR',voluntarios:[],categorias_visitantes:[],can_manage:0,total_integrantes:0,confirmacoes_pendentes:0};
  for(const r of h.requests)await h.reply(r,{...ministrySnapshot,ministerios:[ministry]});
  nodes(h.render()).find(n=>n.props['aria-label']==='Abrir ministério Louvor').props.onClick();h.render();h.flush();h.timers();
  const resources=h.requests.find(r=>r.url.endsWith('/recursos'));assert.ok(resources);
  await h.reply(resources,{error:'Falha temporária'},503);assert.match(text(h.render()),/Falha temporária/);
  nodes(h.render()).find(n=>n.type==='button'&&text(n)==='Tentar novamente').props.onClick();
  await h.reply(h.requests.at(-1),ministrySnapshot);
  assert.match(text(h.render()),/Louvor/);assert.doesNotMatch(text(h.render()),/Falha temporária/);
  h.close();
  const teams=h.requests.find(r=>r.url.includes('/equipes?'));
  assert.equal(teams.options.signal.aborted,true);await h.reply(teams,{equipes:[]});assert.equal(h.lateUpdates,0);
});

test('a slow profile refresh cannot overwrite the canonical saved response',async()=>{
  const h=harness('PeopleWorkspace',{communityName:'Teste',mode:'self'});h.render();h.flush();h.timers();
  await h.reply(h.requests[0],{me:{id:1,nome:'Teste',telefone:'old'},people:[]});
  h.render().props.onRetry();const old=h.requests.at(-1);
  const save=h.render().props.onSubmit({preventDefault(){},currentTarget:{values:{telefone:'new'}}});
  await h.reply(h.requests.at(-1),{updated:true,profile:{id:1,telefone:'normalized'}});await save;
  assert.equal(old.options.signal.aborted,true);await h.reply(old,{me:{id:1,telefone:'old'},people:[]});
  assert.equal(h.render().props.me.telefone,'normalized');h.close();
});
