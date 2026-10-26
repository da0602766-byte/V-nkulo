import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("Firebase no Workers: OAuth/FCM aceitam Request nativa e recusam redirecionamentos", async () => {
  const source = await readFile(new URL("../app/lib/firebase-integration.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/^export /gm, "");
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
    cf: false, bindings: { AUTH_SECRET: "runtime-test-only-secret" }, script: `
    let runtimeEnv, mode, calls;
    function getRuntimeEnv() { return runtimeEnv; }
    function getD1() { throw new Error('Unexpected database access'); }
    // Construct the real Workers Request before simulating Google. A Node-only
    // mock accepts redirect:error and missed the production TypeError.
    const fetch = async (url, options) => {
      const request = new Request(url, options);
      calls.push({ url: request.url, redirect: request.redirect });
      const oauth = request.url === 'https://oauth2.googleapis.com/token';
      if ((mode === 'oauth-redirect' && oauth) || (mode === 'fcm-redirect' && !oauth)) {
        return new Response(null, { status: 307, headers: { Location: 'https://untrusted.example.test' } });
      }
      return Response.json(oauth ? { access_token: 'fake-token', expires_in: 3600 } : {});
    };
    ${compiled}
    export default { async fetch(request, env) {
      runtimeEnv = env; mode = new URL(request.url).searchParams.get('mode'); calls = [];
      try {
        const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
          publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']);
        const pem = ['-----BEGIN PRIVATE KEY-----', btoa(String.fromCharCode(...new Uint8Array(
          await crypto.subtle.exportKey('pkcs8', pair.privateKey)))), '-----END PRIVATE KEY-----'].join('\\n');
        const config = await prepareFirebaseCredential(JSON.stringify({ type: 'service_account', project_id: FIREBASE_PROJECT,
          client_email: 'test@vinkulo-256e8.iam.gserviceaccount.com', private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' }));
        const checked = await verifyFirebaseConfig(config);
        return Response.json({ ok: !!checked.checkedAt, calls });
      } catch (error) { return Response.json({ ok: false, inputError: error instanceof FirebaseInputError, calls }); }
    }};` }));
  try {
    const normal = await (await mf.dispatchFetch("https://runtime.test/")).json();
    assert.equal(normal.ok, true);
    assert.deepEqual(normal.calls, [
      { url: "https://oauth2.googleapis.com/token", redirect: "manual" },
      { url: "https://fcm.googleapis.com/v1/projects/vinkulo-256e8/messages:send", redirect: "manual" },
    ]);
    for (const mode of ["oauth-redirect", "fcm-redirect"]) {
      const rejected = await (await mf.dispatchFetch(`https://runtime.test/?mode=${mode}`)).json();
      assert.equal(rejected.ok, false); assert.equal(rejected.inputError, true);
      assert.equal(rejected.calls.length, mode === "oauth-redirect" ? 1 : 2);
      assert.ok(rejected.calls.every(call => !call.url.includes("untrusted")));
    }
  } finally { await mf.dispose(); }
});
