import { cpfLoginRequest } from './helpers/cpf-login.mjs';
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
  workerUrl.searchParams.set("v229", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-exclusivo-aparencia-v229",
    SYSTEM_OWNER_EMAIL: "owner.aparencia@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-12-31T23:59:59.000Z",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

async function login(worker, env, context, email, senha) {
  const response = await worker.fetch(
    await cpfLoginRequest(env, new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, senha }),
    })),
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

async function aparenciaApi(worker, env, context, cookie, body) {
  const response = await worker.fetch(
    new Request("http://localhost/api/proprietario/aparencia", {
      method: body ? "PATCH" : "GET",
      headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    context,
  );
  return { response, data: await response.json() };
}

test("Central de Aparência é exclusiva do proprietário e permite escolher o alcance", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Proprietária da Plataforma",
    email: "owner.aparencia@example.test",
    senha: "Aparencia123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  await createPilotUser(database, {
    nome: "Pessoa Comum",
    email: "common.aparencia@example.test",
    senha: "Aparencia123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  database.prepare(
    `INSERT INTO configuracoes (chave, valor, atualizado_por)
     VALUES ('community_theme:1', ?, 'seed')
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
  ).run(JSON.stringify({
    paletteId: "CLASSICO",
    logoUrl: "/api/storage/media/logo-comunidade-1",
    bannerUrl: "",
    wallpaperUrl: "",
  }));
  database.prepare(
    `INSERT INTO configuracoes (chave, valor, atualizado_por)
     VALUES ('community_theme:2', ?, 'seed')
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
  ).run(JSON.stringify({
    paletteId: "CORPORATIVO",
    logoUrl: "/api/storage/media/logo-comunidade-2",
    bannerUrl: "",
    wallpaperUrl: "",
  }));

  const worker = await loadWorker();
  const env = createEnv(d1);
  const context = createContext();
  const ownerCookie = await login(worker, env, context, "owner.aparencia@example.test", "Aparencia123");
  await context.drain();
  const commonCookie = await login(worker, env, context, "common.aparencia@example.test", "Aparencia123");
  await context.drain();

  // Uma pessoa comum não pode acessar a Central de Aparência.
  const denied = await aparenciaApi(worker, env, context, commonCookie);
  assert.equal(denied.response.status, 403);
  const deniedWrite = await aparenciaApi(worker, env, context, commonCookie, {
    scope: "TODAS",
    theme: { paletteId: "CELEBRACAO" },
  });
  assert.equal(deniedWrite.response.status, 403);

  // O proprietário enxerga as duas comunidades com o tema atual de cada uma.
  const listing = await aparenciaApi(worker, env, context, ownerCookie);
  assert.equal(listing.response.status, 200);
  assert.equal(listing.data.communities.length, 2);
  const [community1, community2] = listing.data.communities.sort((a, b) => a.id - b.id);
  assert.equal(community1.tema.paletteId, "CLASSICO");
  assert.equal(community2.tema.paletteId, "CORPORATIVO");

  // Alcance "uma comunidade": só a comunidade escolhida muda, o logotipo
  // dela é preservado e a outra comunidade permanece intacta.
  const singleUpdate = await aparenciaApi(worker, env, context, ownerCookie, {
    scope: "UNICA",
    communityId: community1.id,
    theme: {
      paletteId: "NOITE_DOURADA",
      logoUrl: community1.tema.logoUrl,
      bannerUrl: "",
      wallpaperUrl: "",
    },
  });
  assert.equal(singleUpdate.response.status, 200);
  const afterSingle = await aparenciaApi(worker, env, context, ownerCookie);
  const afterSingleById = new Map(afterSingle.data.communities.map((item) => [item.id, item]));
  assert.equal(afterSingleById.get(community1.id).tema.paletteId, "NOITE_DOURADA");
  assert.equal(afterSingleById.get(community1.id).tema.logoUrl, community1.tema.logoUrl);
  assert.equal(afterSingleById.get(community2.id).tema.paletteId, "CORPORATIVO");

  // Alcance "todas as comunidades": a paleta muda em ambas, mas o logotipo
  // de cada uma continua o mesmo — a aplicação em massa nunca sobrescreve
  // identidade visual própria de cada comunidade.
  const bulkUpdate = await aparenciaApi(worker, env, context, ownerCookie, {
    scope: "TODAS",
    theme: { paletteId: "SERENIDADE" },
  });
  assert.equal(bulkUpdate.response.status, 200);
  assert.equal(bulkUpdate.data.comunidades, 2);
  const afterBulk = await aparenciaApi(worker, env, context, ownerCookie);
  for (const community of afterBulk.data.communities) {
    assert.equal(community.tema.paletteId, "SERENIDADE");
  }
  const afterBulkById = new Map(afterBulk.data.communities.map((item) => [item.id, item]));
  assert.equal(afterBulkById.get(community1.id).tema.logoUrl, community1.tema.logoUrl);
  assert.equal(afterBulkById.get(community2.id).tema.logoUrl, community2.tema.logoUrl);

  const auditRows = database.prepare(
    `SELECT evento FROM auditoria_piloto
     WHERE evento IN ('APARENCIA_COMUNIDADE_ATUALIZADA_PELO_PROPRIETARIO', 'APARENCIA_APLICADA_A_TODAS_COMUNIDADES')
     ORDER BY id`,
  ).all();
  assert.deepEqual(auditRows.map((row) => row.evento), [
    "APARENCIA_COMUNIDADE_ATUALIZADA_PELO_PROPRIETARIO",
    "APARENCIA_APLICADA_A_TODAS_COMUNIDADES",
  ]);

  database.close();
});

test("upload de imagem de comunidade só aceita comunidade-alvo vinda do proprietário", async () => {
  const source = await readFile(
    new URL("../app/api/pilot/uploads/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /isCommunityAsset &&\s*\n\s*user\.system_owner === true &&/,
  );
  assert.match(source, /resourceId\s*\n\s*: context\?\.comunidadeId/);
});
