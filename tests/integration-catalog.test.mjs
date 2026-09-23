import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

async function load(path, deps) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: key => { assert.ok(key in deps, key); return deps[key]; }, Response, Date });
  return exports;
}
async function fixture() {
  let config = null, fail = false, user = null;
  let updatedAt = new Date(Date.now() - 60000).toISOString();
  let sync = { enabled: false, lastSuccessAt: null, lastError: null };
  let schedule = { lastHeartbeatAt: null };
  const catalog = await load("app/lib/integration-catalog.ts", {
    "../../db": { getD1: () => ({}) },
    "./supabase-integration": { readIntegration: async () => { if (fail) throw new Error("segredo"); return config ? { config, updatedAt } : null; } },
    "./supabase-auto-sync": { getAutoSyncStatus: async () => sync },
    "./supabase-schedule": { getScheduleStatus: async () => schedule },
  });
  const route = await load("app/api/proprietario/integracoes/route.ts", {
    "../../../lib/local-auth": { getSessionUser: async () => user }, "../../../lib/integration-catalog": catalog,
  });
  const connector = async () => (await catalog.getIntegrationCatalog()).connectors.find(c => c.id === "supabase");
  return { catalog, route, connector, config: value => { config = value; }, sync: value => { sync = value; },
    schedule: value => { schedule = value; }, fail: () => { fail = true; }, user: value => { user = value; }, updated: value => { updatedAt = value; } };
}

test("catálogo: somente proprietário ativo, sem cache ou rotas de mutação genérica", async () => {
  const f = await fixture();
  assert.equal((await f.route.GET()).status, 401);
  f.user({ ativo: true, system_owner: false }); assert.equal((await f.route.GET()).status, 403);
  f.user({ ativo: false, system_owner: true }); assert.equal((await f.route.GET()).status, 401);
  f.user({ ativo: true, system_owner: true });
  const response = await f.route.GET();
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(Object.keys(f.route), ["GET"]);
});

test("catálogo: configuração, pausa, teste recente e verificação vencida têm estados distintos", async () => {
  const f = await fixture();
  assert.equal((await f.connector()).status, "not_connected");
  f.config({ ativa: false }); assert.equal((await f.connector()).status, "paused");
  f.config({ ativa: true, serviceRoleKey: { ciphertext: "secreto" } }); assert.equal((await f.connector()).status, "attention");
  f.config({ ativa: true, serviceRoleKey: {}, lastCheck: { ok: true, checkedAt: new Date().toISOString() } });
  assert.equal((await f.connector()).status, "connected");
  f.config({ ativa: true, serviceRoleKey: {}, lastCheck: { ok: true, checkedAt: new Date(Date.now()-86400001).toISOString() } });
  assert.equal((await f.connector()).status, "attention");
});

test("catálogo: sincronização precisa de heartbeat e sucesso posterior à configuração", async () => {
  const f = await fixture();
  f.config({ ativa: true, serviceRoleKey: {} });
  f.sync({ enabled: true, lastSuccessAt: new Date().toISOString(), lastError: null });
  assert.equal((await f.connector()).status, "attention");
  f.schedule({ lastHeartbeatAt: new Date().toISOString() });
  assert.equal((await f.connector()).status, "connected");
  f.updated(new Date(Date.now() + 1000).toISOString());
  assert.equal((await f.connector()).status, "attention", "sucesso da credencial anterior não valida uma configuração nova");
  f.sync({ enabled: true, lastSuccessAt: new Date().toISOString(), lastError: "chave privada" });
  assert.equal((await f.connector()).status, "attention");
  assert.doesNotMatch(JSON.stringify(await f.catalog.getIntegrationCatalog()), /chave privada/);
});

test("catálogo: não expõe segredos, não simula conectores e isola falha de um adaptador", async () => {
  const f = await fixture();
  f.config({ ativa: true, serviceRoleKey: { iv: "iv-secreto", ciphertext: "conteudo-secreto" }, anonKey: "publica", url: "https://privado.supabase.co" });
  let catalog = await f.catalog.getIntegrationCatalog();
  assert.doesNotMatch(JSON.stringify(catalog), /ciphertext|conteudo-secreto|iv-secreto|anonKey|privado.supabase/);
  for (const id of ["whatsapp", "booking", "airbnb"]) {
    const entry = catalog.connectors.find(c => c.id === id);
    assert.equal(entry.available, false); assert.equal(entry.status, "unavailable"); assert.equal(entry.capabilities.length, 0);
  }
  f.fail(); catalog = await f.catalog.getIntegrationCatalog();
  assert.equal(catalog.connectors[0].status, "attention");
  assert.equal(catalog.connectors.length, 4); assert.doesNotMatch(JSON.stringify(catalog), /segredo/);
});
