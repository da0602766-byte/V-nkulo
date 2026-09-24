import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { Miniflare } from "miniflare";

test("Web Push no Workers: cifra real, Request nativa e redirecionamentos sem seguir destino", async () => {
  const compile = async path => ts.transpileModule(await readFile(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const cryptoCode = await compile("app/lib/web-push-crypto.ts");
  const transportCode = await compile("app/lib/web-push.ts");
  const mf = new Miniflare({ modules: true, compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], cf: false,
    script: `
    const cryptography = (() => { const exports = {}; ${cryptoCode}; return exports; })();
    let mode, calls;
    const transport = (() => {
      const exports = {};
      const require = name => name === './web-push-crypto' ? cryptography : { getRuntimeEnv: () => ({}) };
      const fetch = async (url, options) => {
        // Native Workers Request catches unsupported options that Node mocks miss.
        const request = new Request(url, options);
        const bytes = new Uint8Array(await request.arrayBuffer());
        calls.push({ redirect: request.redirect, origin: new URL(request.url).origin,
          encoding: request.headers.get('Content-Encoding'), vapid: request.headers.get('Authorization')?.startsWith('vapid t='),
          ttl: request.headers.get('TTL'), bytes: bytes.length, cleartext: new TextDecoder().decode(bytes).includes('test-private-content') });
        return new Response(null, { status: mode === 'redirect' ? 307 : 201,
          ...(mode === 'redirect' ? { headers: { Location: 'https://untrusted.example.test' } } : {}) });
      };
      ${transportCode}; return exports;
    })();
    export default { async fetch(request) {
      mode = new URL(request.url).searchParams.get('mode'); calls = [];
      try {
        const pair = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign','verify']);
        const receiver = await crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits']);
        const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/g,'');
        const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          p256dh: encode(await crypto.subtle.exportKey('raw', receiver.publicKey)), auth: encode(crypto.getRandomValues(new Uint8Array(16))) };
        const config = { publicKey: encode(await crypto.subtle.exportKey('raw', pair.publicKey)),
          privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey), subject: 'mailto:test@example.test' };
        const result = await transport.sendWebPush(subscription, 'test-private-content', config, { ttl:60, topic:'n-1', urgent:true });
        return Response.json({ status: result.status, calls });
      } catch (error) { return Response.json({ error: error.message, calls }); }
    }};` });
  try {
    const normal = await (await mf.dispatchFetch("https://runtime.test/")).json();
    assert.equal(normal.status, 201, normal.error);
    assert.equal(normal.calls.length, 1);
    assert.equal(normal.calls[0].redirect, "manual");
    assert.equal(normal.calls[0].encoding, "aes128gcm");
    assert.equal(normal.calls[0].vapid, true); assert.equal(normal.calls[0].cleartext, false);
    assert.ok(normal.calls[0].bytes > 100); assert.equal(normal.calls[0].ttl, "60");
    const redirected = await (await mf.dispatchFetch("https://runtime.test/?mode=redirect")).json();
    assert.equal(redirected.status, 307); assert.equal(redirected.calls.length, 1);
    assert.equal(redirected.calls[0].origin, "https://fcm.googleapis.com");
  } finally { await mf.dispose(); }
});
