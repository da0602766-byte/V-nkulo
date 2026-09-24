import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { Miniflare } from "miniflare";

test("Supabase no Workers: verifica serviços e recusa redirecionamentos sem encaminhar credenciais", async () => {
  const source = await readFile(new URL("../app/lib/supabase-integration.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/^export /gm, "");
  const mf = new Miniflare({ modules: true, compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
    cf: false, script: `
    let mode, calls;
    function getRuntimeEnv() { return { AUTH_SECRET: 'supabase-runtime-test-only' }; }
    function getD1() { throw new Error('Unexpected database access'); }
    const fetch = async (url, options) => {
      const request = new Request(url, options);
      calls.push({ url: request.url, redirect: request.redirect });
      if (new URL(request.url).pathname === mode) return new Response(null, {
        status: 307, headers: { Location: 'https://untrusted.example.test' }
      });
      return Response.json(request.url.endsWith('/bucket') ? [] : {});
    };
    ${compiled}
    export default { async fetch(request) {
      mode = new URL(request.url).searchParams.get('mode'); calls = [];
      const config = await parseIntegration({ ambiente: 'HOMOLOGACAO', url: 'https://test-project.supabase.co',
        anonKey: 'sb_publishable_testonly123456789', serviceRoleKey: 'sb_secret_testonly123456789', ativa: true }, null);
      const result = await verifyIntegration(config);
      return Response.json({ result, calls });
    }};` });
  try {
    const normal = await (await mf.dispatchFetch("https://runtime.test/")).json();
    assert.equal(normal.result.ok, true);
    assert.equal(normal.calls.length, 4);
    assert.ok(normal.calls.every(call => call.redirect === "manual"));
    for (const path of ["/auth/v1/health", "/auth/v1/settings", "/rest/v1/", "/storage/v1/bucket"]) {
      const rejected = await (await mf.dispatchFetch(`https://runtime.test/?mode=${encodeURIComponent(path)}`)).json();
      assert.equal(rejected.result.ok, false, path);
      assert.ok(rejected.calls.every(call => new URL(call.url).hostname === "test-project.supabase.co"));
      assert.ok(rejected.calls.every(call => call.redirect === "manual"));
    }
  } finally { await mf.dispose(); }
});
