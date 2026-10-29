import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

async function moduleAt(path, dependencies={}, globals={}) {
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8'),exports={};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{assert.ok(name in dependencies,name);return dependencies[name];},...globals});
  return exports;
}
const content=await moduleAt('app/lib/device-notification-content.ts');
const notices=[
  {id:501,title:'Nova solicitação de entrada',message:'Ana solicitou entrada em Comunidade Esperança.',read:false,destination:'/painel?view=comunidade'},
  {id:502,title:'Escala confirmada',message:'Seu plantão de domingo começa às 18h.',read:false,destination:'/painel?view=escalas'},
  {id:503,title:'Reserva aprovada',message:'A vaga A02 está reservada para o culto de domingo.',read:false,destination:'/painel?view=estacionamento'},
];

test('notificações preservam diferenças, normalizam linhas e limitam prévias sem cortar emoji',()=>{
  const result=content.deviceNotificationContent('  Reserva\n aprovada  ','Sua vaga\n\tA02 está confirmada.');
  assert.equal(result.title,'Reserva aprovada');assert.equal(result.body,'Sua vaga A02 está confirmada.');
  const long=content.deviceNotificationContent('🚗'.repeat(130),'😀'.repeat(520));
  assert.equal(Array.from(long.title).length,120);assert.equal(Array.from(long.body).length,500);assert.ok(long.body.endsWith('😀…'));
  assert.ok(content.deviceNotificationContent(null,' ').title);assert.ok(content.deviceNotificationContent('',null).body);
});

for(const native of [true,false])test(`avisos específicos no ${native?'Android':'fallback web'}, uma vez por ID`,async()=>{
  const sent=[],saved=new Map();
  const registration={showNotification:async(title,options)=>sent.push({title,...options})};
  const globals={window:{VinkuloFcmActive:false,Notification:{},localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)}},document:{visibilityState:'visible'},navigator:{serviceWorker:{ready:Promise.resolve(registration)}},Notification:{permission:'granted'}};
  const sync=await moduleAt('app/lib/device-notification-sync.ts',{
    './device-notification-content':content,
    './androidNativeBridge':{isNativeNotificationBridgeAvailable:()=>native,showDeviceNotification:notice=>{sent.push(notice);return true;}},
    './web-push-client':{isWebPushSupported:()=>false},
  },globals);
  await sync.showUnreadDeviceNotifications([...notices,{...notices[0],id:504,read:true}]);
  assert.equal(sent.length,3);
  for(let i=0;i<3;i++){assert.equal(sent[i].title,notices[i].title);assert.equal(sent[i].body,notices[i].message);assert.equal(sent[i].tag,`vinkulo-notification-${notices[i].id}`);assert.equal(native?sent[i].url:sent[i].data.url,notices[i].destination);}
  await sync.showUnreadDeviceNotifications(notices);assert.equal(sent.length,3);
  globals.window.VinkuloFcmActive=true;await sync.showUnreadDeviceNotifications([{...notices[0],id:505}]);assert.equal(sent.length,3);
});
