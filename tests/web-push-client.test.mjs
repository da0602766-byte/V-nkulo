import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

async function fixture({ permission = "default", state = "activated" } = {}) {
  const calls = [], handlers = new Map(), timers = new Map();
  const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]);
  let saved = true;
  const worker = { state, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) };
  const registration = { active: state === "activated" ? worker : null, installing: state === "activated" ? null : worker,
    pushManager: { getSubscription: async () => null, subscribe: async options => {
      calls.push("subscribe"); assert.equal(worker.state, "activated"); assert.equal(options.userVisibleOnly, true);
      return { toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/test" }) };
    } } };
  const exports = {};
  const source = await readFile(new URL("../app/lib/web-push-client.ts", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Uint8Array, atob, Response,
    window: { PushManager: {}, Notification: {} }, Notification: { permission, requestPermission: async () => { calls.push("permission"); return "granted"; } },
    navigator: { serviceWorker: { register: async () => { calls.push("register"); return registration; } } },
    setTimeout: fn => { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    fetch: async (_url, options) => { calls.push(options?.method === "POST" ? "save" : "config"); return options?.method === "POST"
      ? Response.json(saved ? { ok: true } : { error: "Sessão expirada" }, { status: saved ? 200 : 401 })
      : Response.json({ publicKey: key.toString("base64url") }); },
  });
  return { client: exports, calls, worker, handlers, timers, failSave: () => { saved = false; } };
}

test("PWA: pede permissão no clique antes da rede e só salva após inscrição real", async () => {
  const f = await fixture();
  await f.client.subscribeWebPushNotifications();
  assert.deepEqual(f.calls, ["permission", "config", "register", "subscribe", "save"]);
  assert.equal(f.timers.size, 0);
});

test("PWA: aparelho novo aguarda ativação do worker antes de inscrever", async () => {
  const f = await fixture({ state: "installing" });
  const pending = f.client.subscribeWebPushNotifications();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.includes("subscribe"), false);
  f.worker.state = "activated"; f.handlers.get("statechange")();
  await pending;
  assert.equal(f.calls.at(-1), "save"); assert.equal(f.handlers.size, 0); assert.equal(f.timers.size, 0);
});

test("PWA: permissão bloqueada, instalação falha ou demorada não anunciam ativação", async () => {
  const denied = await fixture({ permission: "denied" });
  await assert.rejects(denied.client.subscribeWebPushNotifications(), /permissão/);
  assert.deepEqual(denied.calls, []);
  for (const reason of ["redundant", "timeout"]) {
    const f = await fixture({ permission: "granted", state: "installing" });
    const pending = f.client.subscribeWebPushNotifications();
    const rejected = assert.rejects(pending, /interrompida|demorou/);
    await new Promise(resolve => setImmediate(resolve));
    if (reason === "timeout") [...f.timers.values()][0]();
    else { f.worker.state = reason; f.handlers.get("statechange")(); }
    await rejected;
    assert.equal(f.calls.includes("subscribe"), false); assert.equal(f.handlers.size, 0); assert.equal(f.timers.size, 0);
  }
});

test("PWA: erro ao vincular aparelho à sessão é devolvido ao usuário", async () => {
  const f = await fixture({ permission: "granted" }); f.failSave();
  await assert.rejects(f.client.subscribeWebPushNotifications(), /Sessão expirada/);
});
