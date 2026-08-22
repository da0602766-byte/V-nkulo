import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};
const context = {
  waitUntil() {},
  passThroughOnException() {},
};

test("página inicial pública identifica claramente o VÍNKULO", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    env,
    context,
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /VÍNKULO/);
  assert.match(html, /Gestão para igrejas e comunidades/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(
    response.headers.get("x-permitted-cross-domain-policies"),
    "none",
  );
  assert.match(
    response.headers.get("strict-transport-security") ?? "",
    /max-age=31536000/,
  );
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
});

test("mutações externas e corpos excessivos são bloqueados antes da aplicação", async () => {
  const worker = await loadWorker();
  const crossSite = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://site-malicioso.example",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ email: "teste@example.test", senha: "Teste123" }),
    }),
    env,
    context,
  );
  assert.equal(crossSite.status, 403);
  assert.match((await crossSite.json()).error, /origem/i);
  assert.equal(crossSite.headers.get("cache-control"), "no-store");

  const oversized = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(1024 * 1024 + 1),
      },
      body: "{}",
    }),
    env,
    context,
  );
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).error, /limite/i);
});

test("páginas com token não enviam referência de navegação", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/redefinir-senha?token=ficticio", {
      headers: { accept: "text/html" },
    }),
    env,
    context,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("painel continua protegido para visitantes sem sessão", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/painel", {
      headers: { accept: "text/html" },
    }),
    env,
    context,
  );
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/login\?motivo=/);
});
