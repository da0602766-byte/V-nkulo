import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

async function load(path, dependencies = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, Headers, Response, fetch, require: key => {
      if (!(key in dependencies)) throw new Error(`Unexpected import: ${key}`);
      return dependencies[key];
    } });
  return exports;
}
const media = await load("app/lib/media-feedback.ts");

test("falhas comuns e URLs externas não sugerem reconectar o Drive", async () => {
  const calls = [], notices = [];
  const report = media.createMediaFailureReporter(async (...args) => { calls.push(args); return new Response(null, { status: 404 }); }, code => notices.push(code));
  for (const src of ["/missing.png", "/local-media/file", "https://example.com/api/storage/media/x", "/api/storage/media/deleted"]) await report(src, "https://app.test");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].method, "HEAD");
  assert.deepEqual(notices, []);
});

test("múltiplos avatares com falha geram um aviso por causa, sem tempestade de requisições", async () => {
  let requests = 0;
  const notices = [];
  const report = media.createMediaFailureReporter(async () => { requests++; return new Response(null, { status: 409, headers: { "X-Vinkulo-Media-Error": "DRIVE_RECONNECT" } }); }, code => notices.push(code));
  await Promise.all(Array.from({ length: 100 }, (_, index) => report(`/api/storage/media/${index % 40}`, "https://app.test")));
  assert.equal(requests, 32);
  assert.deepEqual(notices, ["DRIVE_RECONNECT"]);
});

test("offline não é diagnosticado como token expirado; uma próxima tentativa pode funcionar", async () => {
  let offline = true;
  const notices = [];
  const report = media.createMediaFailureReporter(async () => {
    if (offline) throw new Error("offline");
    return new Response(null, { status: 409, headers: { "X-Vinkulo-Media-Error": "DRIVE_OWNER_RECONNECT" } });
  }, code => notices.push(code));
  await report("/api/storage/media/file", "https://app.test");
  assert.deepEqual(notices, []);
  offline = false;
  await report("/api/storage/media/file", "https://app.test");
  assert.deepEqual(notices, ["DRIVE_OWNER_RECONNECT"]);
});

test("placeholder suporta iniciais acentuadas e escapa marcação", () => {
  const svg = decodeURIComponent(media.imagePlaceholder("Ágata Souza").split(",")[1]);
  assert.match(svg, />ÁS<\/text>/);
  const hostile = decodeURIComponent(media.imagePlaceholder("< &").split(",")[1]);
  assert.match(hostile, /&lt;&amp;/);
  assert.doesNotMatch(hostile, /<script/);
  assert.match(decodeURIComponent(media.imagePlaceholder("", "avatar")), /<circle/);
});

test("diagnóstico separa responsável pelo Drive, sessão ausente e falha transitória sem baixar mídia", async () => {
  class DriveReconnectRequired extends Error {}
  let user = { id: 12 }, failure = new DriveReconnectRequired("Reconnect"), downloads = 0;
  const route = await load("app/api/storage/media/[token]/route.ts", {
    "../../../../lib/google-integration": {
      DriveReconnectRequired,
      readStorageReference: async () => ({ ownerId: 12, scope: "profile", fileId: "file" }),
      getDriveAccessToken: async () => { if (failure) throw failure; return "token"; },
      readDriveFile: async () => { downloads++; return new Response("file"); },
    },
    "../../../../lib/local-auth": { getSessionUser: async () => user },
  });
  const check = () => route.HEAD({}, { params: Promise.resolve({ token: "signed" }) });
  assert.equal((await check()).headers.get("X-Vinkulo-Media-Error"), "DRIVE_RECONNECT");
  user = { id: 20 };
  assert.equal((await check()).headers.get("X-Vinkulo-Media-Error"), "DRIVE_OWNER_RECONNECT");
  user = null;
  assert.equal((await check()).headers.get("X-Vinkulo-Media-Error"), "DRIVE_OWNER_RECONNECT");
  failure = new Error("network timeout");
  const transient = await check();
  assert.equal(transient.status, 503);
  assert.equal(transient.headers.get("X-Vinkulo-Media-Error"), null);
  failure = null;
  assert.equal((await check()).status, 200);
  assert.equal(downloads, 0);
});

test("onboarding usa consentimento persistido, não reaparece após escolha local ou Google", async () => {
  let preference = null;
  const route = await load("app/api/storage/preferences/route.ts", {
    "../../../../db": { getD1: () => ({ prepare: sql => ({ bind: () => ({ first: async () => sql.includes("FROM storage_preferences") ? preference : null }) }) }) },
    "../../../lib/local-auth": { getSessionUser: async () => ({ id: 12 }) },
    "../../../lib/tenant": { getActiveTenantContext: async () => ({ context: { comunidadeId: 1 } }) },
    "../../../lib/google-integration": { getGoogleConnection: async () => null, googleIntegrationAvailable: () => true },
  });
  assert.equal((await (await route.GET()).json()).needsOnboarding, true);
  for (const provider of ["LOCAL", "GOOGLE_DRIVE"]) {
    preference = { provider, consented_at: "2026-09-30" };
    assert.equal((await (await route.GET()).json()).needsOnboarding, false);
  }
});
