import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';

async function moduleAt(file,dependencies) {
  const source=await readFile(new URL('../'+file,import.meta.url),'utf8'),exports={};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,crypto,Date,Error,require:name=>{assert.ok(name in dependencies,name);return dependencies[name];}});
  return exports;
}

test('sincronização bloqueia responsável rebaixado mesmo com perfil ADMIN e token salvo',async()=>{
  const {database:db,d1}=await createPilotD1();
  try {
    const id=await createPilotUser(db,{nome:'Gestor rebaixado',email:'sheet-revoked@test.invalid',senha:'Ficticia123',perfil:'ADMIN'});
    db.prepare("INSERT INTO visitante_planilha(comunidade_id,usuario_id,spreadsheet_id,sheet_id,habilitada) VALUES (1,?,'fake-only',42,1)").run(id);
    let tokenReads=0;
    const sheet=await moduleAt('app/lib/visitor-sheets.ts',{
      '../../db':{getD1:()=>d1},
      './google-integration':{getDriveAccessToken:async()=>{tokenReads++;throw Error('External access forbidden in test');},getGoogleConnection:async()=>{tokenReads++;return null;}},
      './visitor-export':{},'./visitor-custom-fields':{},'./visitor-drive-store':{visitorDriveConfig:async()=>null},
    });
    await sheet.syncVisitorSheet(d1,1);
    const config=db.prepare('SELECT ultimo_erro,lock_ate FROM visitante_planilha WHERE comunidade_id=1').get();
    assert.match(config.ultimo_erro,/perdeu o acesso de gestão/);
    assert.equal(config.lock_ate,0);
    assert.equal(tokenReads,0);
  } finally {db.close();}
});

test('avisos de entrada alcançam gestores reais e proprietário local, sem ADMIN membro',async()=>{
  const {database:db,d1}=await createPilotD1();
  try {
    const legacy=await createPilotUser(db,{nome:'Legado',email:'legacy@test.invalid',senha:'Ficticia123',perfil:'ADMIN'});
    const pastor=await createPilotUser(db,{nome:'Pastor',email:'pastor@test.invalid',senha:'Ficticia123',memberships:[{comunidadeId:1,papel:'PASTOR'}]});
    const owner=await createPilotUser(db,{nome:'Proprietário local',email:'owner@test.invalid',senha:'Ficticia123',memberships:[]});
    db.prepare('UPDATE comunidades SET proprietario_usuario_id=? WHERE id=1').run(owner);
    const sent=[];
    const notifications=await moduleAt('app/lib/pilot-notifications.ts',{'./system-notifications':{createSystemNotification:async(_db,input)=>sent.push(input)},'./local-auth':{findSystemOwnerAccount:async()=>null}});
    await notifications.notifyCommunityManagers(d1,{communityId:1,communityName:'Fictícia',applicantName:'Pessoa fictícia',requestId:1,createdBy:'teste'});
    assert.deepEqual(sent.map(n=>n.usuarioId).sort(),[pastor,owner].sort());
    assert.ok(!sent.some(n=>n.usuarioId===legacy));
  } finally {db.close();}
});
