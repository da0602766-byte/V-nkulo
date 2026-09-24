import { cpfLoginRequest } from './helpers/cpf-login.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const context={waitUntil(){},passThroughOnException(){}};
async function loadWorker() {
  const url=new URL("../dist/server/index.js",import.meta.url);
  url.searchParams.set("supabase-integration",`${process.pid}-${Date.now()}`);
  return (await import(url.href)).default;
}
function env(d1){return {DB:d1,AUTH_SECRET:"segredo-ficticio-do-teste-da-integracao",SYSTEM_OWNER_EMAIL:"owner.supabase@example.test",SYSTEM_OWNER_LOCKED_BEFORE:"2099-01-01T00:00:00.000Z",ASSETS:{fetch:async()=>new Response("Not found",{status:404})}};}
async function login(worker,runtime,email,password) {
  const response=await worker.fetch(await cpfLoginRequest(runtime, new Request("http://localhost/api/auth/login",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",accept:"text/html"},body:new URLSearchParams({email,senha:password})})),runtime,context);
  assert.equal(response.status,303);
  const values=typeof response.headers.getSetCookie==="function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")||""];
  return values.map(value=>value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
}
const endpoint="http://localhost/api/proprietario/integracoes/supabase";
const configuration={confirm:true,ambiente:"PRODUCAO",url:"https://example-project.supabase.co",projectRef:"example-project",anonKey:"sb_publishable_abcdefghijklmnopqrstuvwxyz",serviceRoleKey:"sb_secret_abcdefghijklmnopqrstuvwxyz",jwtSecret:"",schema:"public",bucket:"media",ativa:false};

test("integração Supabase protege acesso, cifra segredos e preserva segredo vazio",async()=>{
  const {database,d1}=await createPilotD1();
  await createPilotUser(database,{nome:"Proprietário Supabase",email:"owner.supabase@example.test",senha:"Owner123",memberships:[{comunidadeId:1,papel:"ADMIN_COMUNIDADE"}]});
  await createPilotUser(database,{nome:"Pessoa comum",email:"common.supabase@example.test",senha:"Common123",memberships:[{comunidadeId:1,papel:"MEMBRO"}]});
  const worker=await loadWorker(); const runtime=env(d1);
  for (const method of ["GET","PATCH"]) {
    const response=await worker.fetch(new Request(endpoint,{method,headers:{"content-type":"application/json"},body:method==="PATCH" ? JSON.stringify(configuration) : undefined}),runtime,context);
    assert.equal(response.status,401);
  }
  const commonCookie=await login(worker,runtime,"common.supabase@example.test","Common123");
  const forbidden=await worker.fetch(new Request(endpoint,{method:"PATCH",headers:{cookie:commonCookie,"content-type":"application/json"},body:JSON.stringify(configuration)}),runtime,context);
  assert.equal(forbidden.status,403);
  assert.equal((await forbidden.json()).error,"Esta área é exclusiva do proprietário do sistema.");

  const ownerCookie=await login(worker,runtime,"owner.supabase@example.test","Owner123");
  const invalid=await worker.fetch(new Request(endpoint,{method:"PATCH",headers:{cookie:ownerCookie,"content-type":"application/json"},body:JSON.stringify({...configuration,url:"http://outside.example.com"})}),runtime,context);
  assert.equal(invalid.status,400);
  const saved=await worker.fetch(new Request(endpoint,{method:"PATCH",headers:{cookie:ownerCookie,"content-type":"application/json"},body:JSON.stringify(configuration)}),runtime,context);
  assert.equal(saved.status,200);
  const savedBody=await saved.json();
  assert.equal(savedBody.integration.serviceRoleKey.defined,true);
  assert.equal(JSON.stringify(savedBody).includes(configuration.serviceRoleKey),false);
  const before=database.prepare("SELECT valor FROM configuracoes WHERE chave='supabase_integration'").get().valor;
  assert.equal(before.includes(configuration.serviceRoleKey),false);
  assert.match(before,/ciphertext/);

  const preserved=await worker.fetch(new Request(endpoint,{method:"PATCH",headers:{cookie:ownerCookie,"content-type":"application/json"},body:JSON.stringify({...configuration,serviceRoleKey:"",bucket:"arquivos"})}),runtime,context);
  assert.equal(preserved.status,200);
  const after=JSON.parse(database.prepare("SELECT valor FROM configuracoes WHERE chave='supabase_integration'").get().valor);
  assert.equal(after.serviceRoleKey.ciphertext,JSON.parse(before).serviceRoleKey.ciphertext);
  assert.equal(after.bucket,"arquivos");
  const read=await worker.fetch(new Request(endpoint,{headers:{cookie:ownerCookie}}),runtime,context);
  assert.equal(read.status,200);
  assert.equal(JSON.stringify(await read.json()).includes("ciphertext"),false);

  const activated=await worker.fetch(new Request(endpoint,{method:"PATCH",headers:{cookie:ownerCookie,"content-type":"application/json"},body:JSON.stringify({...configuration,serviceRoleKey:"",bucket:"arquivos",ativa:true})}),runtime,context);
  assert.equal(activated.status,200);
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=async (request, options)=>{
    assert.equal(options.redirect,"manual","segredos não seguem redirecionamentos do provedor");
    const url=String(request);
    if (url.endsWith("/storage/v1/bucket")) return Response.json([{id:"arquivos",name:"arquivos"}]);
    return Response.json({ok:true});
  };
  try {
    const tested=await worker.fetch(new Request(endpoint+"/test",{method:"POST",headers:{cookie:ownerCookie,"content-type":"application/json"},body:JSON.stringify({confirm:true})}),runtime,context);
    assert.equal(tested.status,200);
    const check=(await tested.json()).check;
    assert.equal(check.ok,true);
    assert.equal(check.bucketFound,true);
  } finally { globalThis.fetch=nativeFetch; }
  const resaved=await worker.fetch(new Request(endpoint,{method:"PATCH",headers:{cookie:ownerCookie,"content-type":"application/json"},body:JSON.stringify({...configuration,serviceRoleKey:"",bucket:"arquivos",ativa:true})}),runtime,context);
  assert.equal(resaved.status,200);
  assert.equal((await resaved.json()).integration.lastCheck,null,"salvar exige nova validação, sem reaproveitar o teste de outra configuração");
  const audit=database.prepare("SELECT metadados FROM auditoria_piloto WHERE evento='INTEGRACAO_SUPABASE_TESTADA' ORDER BY id DESC LIMIT 1").get();
  assert.ok(audit);
  assert.equal(audit.metadados.includes(configuration.serviceRoleKey),false);
  database.close();
});

test("área de publicação trata configuração ausente e todos os estados visíveis",async()=>{
  const source=await readFile(new URL("../app/components/SupabaseIntegrationForm.tsx",import.meta.url),"utf8");
  for (const text of ["Consultando a configuração protegida","Nenhuma conexão cadastrada","Não foi possível conectar","Testar conexão","aria-live"]) assert.match(source,new RegExp(text));
  const {database,d1}=await createPilotD1();
  await createPilotUser(database,{nome:"Proprietário vazio",email:"owner.supabase@example.test",senha:"Owner123",memberships:[{comunidadeId:1,papel:"ADMIN_COMUNIDADE"}]});
  const worker=await loadWorker();const runtime=env(d1);const cookie=await login(worker,runtime,"owner.supabase@example.test","Owner123");
  const response=await worker.fetch(new Request(endpoint,{headers:{cookie}}),runtime,context);
  assert.equal(response.status,200);
  assert.equal((await response.json()).integration,null);
  database.close();
});

test("fundação Supabase de comunidades usa isolamento e nunca copia dados no navegador",async()=>{
  const sql=await readFile(new URL("../supabase/migrations/0001_tenant_foundation.sql",import.meta.url),"utf8");
  const healthSql=await readFile(new URL("../supabase/migrations/0002_tenant_foundation_health.sql",import.meta.url),"utf8");
  for (const text of ["vinkulo_tenants","vinkulo_profiles","vinkulo_memberships","vinkulo_migration_runs","enable row level security","Nenhuma política de escrita de cliente"]) assert.match(sql,new RegExp(text));
  for (const text of ["vinkulo_tenant_foundation_health","rls_enabled","grant execute","service_role"]) assert.match(healthSql,new RegExp(text));
  const source=await readFile(new URL("../app/components/SupabaseTenantFoundation.tsx",import.meta.url),"utf8");
  for (const text of ["Fundação de comunidades","Perfis e vínculos são comparados em etapas próprias; arquivos e logins seguem onde estão","Verificar fundação","aria-live"]) assert.match(source,new RegExp(text));

  const {database,d1}=await createPilotD1();
  await createPilotUser(database,{nome:"Proprietário da fundação",email:"owner.supabase@example.test",senha:"Owner123",memberships:[{comunidadeId:1,papel:"ADMIN_COMUNIDADE"}]});
  const worker=await loadWorker(); const runtime=env(d1);
  const cookie=await login(worker,runtime,"owner.supabase@example.test","Owner123");
  const saved=await worker.fetch(new Request(endpoint,{method:"PATCH",headers:{cookie,"content-type":"application/json"},body:JSON.stringify({...configuration,ativa:true})}),runtime,context);
  assert.equal(saved.status,200);
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=async request=>{
    const url=String(request);
    if (url.endsWith("/rest/v1/rpc/vinkulo_tenant_foundation_health")) return Response.json([
      {table_key:"tenants",present:true,rls_enabled:true},
      {table_key:"profiles",present:true,rls_enabled:true},
      {table_key:"memberships",present:true,rls_enabled:true},
      {table_key:"migrationRuns",present:true,rls_enabled:true},
    ]);
    throw new Error(`Rota Supabase inesperada: ${url}`);
  };
  try {
    const foundation=await worker.fetch(new Request(endpoint+"/tenant-foundation",{headers:{cookie}}),runtime,context);
    assert.equal(foundation.status,200);
    const body=await foundation.json();
    assert.equal(body.check.ready,true);
    assert.deepEqual(body.check.tables,{tenants:true,profiles:true,memberships:true,migrationRuns:true});
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM auditoria_piloto WHERE evento='INTEGRACAO_SUPABASE_TENANCY_VERIFICADA'").get().total,0);
    const audited=await worker.fetch(new Request(endpoint+"/tenant-foundation",{method:"POST",headers:{cookie,"content-type":"application/json"}}),runtime,context);
    assert.equal(audited.status,200);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM auditoria_piloto WHERE evento='INTEGRACAO_SUPABASE_TENANCY_VERIFICADA'").get().total,1);
  } finally { globalThis.fetch=nativeFetch; }
  database.close();
});
