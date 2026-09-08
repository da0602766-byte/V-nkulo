import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

function createContext() {
  const pending = [];
  return {
    waitUntil(promise) { pending.push(promise); },
    passThroughOnException() {},
    async drain() {
      await Promise.allSettled(pending.splice(0));
    },
  };
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("v230", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-exclusivo-otimizador-v230",
    SYSTEM_OWNER_EMAIL: "owner.optimizerfail@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-12-31T23:59:59.000Z",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

async function login(worker, env, context, email, senha) {
  const response = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, senha }),
    }),
    env,
    context,
  );
  assert.equal(response.status, 303);
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  const cookie = values.map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
  assert.ok(cookie);
  return cookie;
}

async function optimizerApi(worker, env, context, cookie, body) {
  const response = await worker.fetch(
    new Request("http://localhost/api/proprietario/otimizacao", {
      method: body ? "PATCH" : "GET",
      headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    context,
  );
  return { response, data: await response.json() };
}

test("uma falha na manutenção automática fica registrada até a próxima execução bem-sucedida", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Proprietária",
    email: "owner.optimizerfail@example.test",
    senha: "Optimizer123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const context = createContext();
  const ownerCookie = await login(worker, env, context, "owner.optimizerfail@example.test", "Optimizer123");
  await context.drain();

  // Antes de qualquer execução, não há erro registrado.
  const initial = await optimizerApi(worker, env, context, ownerCookie);
  assert.equal(initial.data.config.lastErrorAt, null);

  // Simula uma falha real dentro da manutenção, sem tocar em sessão/login:
  // a tabela usada só pela tarefa de redefinições de senha fica indisponível
  // apenas durante a chamada que deve falhar.
  database.exec("ALTER TABLE redefinicoes_senha RENAME TO redefinicoes_senha_indisponivel_v230");
  const failed = await optimizerApi(worker, env, context, ownerCookie, { action: "EXECUTAR_AGORA" });
  assert.equal(failed.response.status, 500);
  database.exec("ALTER TABLE redefinicoes_senha_indisponivel_v230 RENAME TO redefinicoes_senha");

  const afterFailure = await optimizerApi(worker, env, context, ownerCookie);
  assert.equal(afterFailure.response.status, 200);
  assert.ok(afterFailure.data.config.lastErrorAt, "lastErrorAt deveria ficar registrado após a falha");
  // A verificação oportunista já pode ter concluído uma execução bem-sucedida
  // antes deste teste (ela roda a cada requisição comum, como o próprio
  // login). O que importa é que o erro seja mais recente que qualquer
  // sucesso anterior — é essa comparação que a tela usa para acender o
  // alerta.
  assert.ok(
    !afterFailure.data.config.lastRunAt ||
      new Date(afterFailure.data.config.lastErrorAt).getTime() >
        new Date(afterFailure.data.config.lastRunAt).getTime(),
    "o erro precisa ser mais recente que a última execução bem-sucedida",
  );

  // Com a tabela de volta, a manutenção deve concluir e a execução
  // bem-sucedida deve ficar mais recente que o erro anterior — é exatamente
  // essa comparação que faz o alerta da tela desaparecer.
  const recovered = await optimizerApi(worker, env, context, ownerCookie, { action: "EXECUTAR_AGORA" });
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.data.execution.executed, true);

  const afterRecovery = await optimizerApi(worker, env, context, ownerCookie);
  assert.ok(afterRecovery.data.config.lastRunAt);
  assert.ok(
    new Date(afterRecovery.data.config.lastRunAt).getTime() >=
      new Date(afterFailure.data.config.lastErrorAt).getTime(),
    "a execução bem-sucedida precisa ser mais recente que o erro registrado",
  );

  database.close();
});

test("painel do otimizador mostra um alerta visível quando a última tentativa falhou", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/components/PlatformOptimizerWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /function lastRunFailed/);
  assert.match(component, /platform-optimizer-alert/);
  assert.match(component, /A manutenção automática falhou em/);
  assert.match(css, /\.platform-optimizer-alert \{/);
});
