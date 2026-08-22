import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("publicações persistem até cinco links seguros e exibem compartilhamento com foto", async () => {
  const [schema, migration, validation, route, home, share, styles] = await Promise.all([
    source("db/schema.ts"),
    source("drizzle/0048_milky_may_parker.sql"),
    source("app/lib/feed-validation.ts"),
    source("app/api/pilot/publicacoes/route.ts"),
    source("app/components/CommunityHome.tsx"),
    source("app/components/CommunityPostShare.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(schema, /linksJson: text\("links_json"\)/);
  assert.match(migration, /ADD `links_json` text DEFAULT '\[\]' NOT NULL/);
  assert.match(validation, /if \(!\['http:', 'https:'\]\.includes\(url\.protocol\)\) continue/);
  assert.match(validation, /if \(unique\.size >= 5\) break/);
  assert.match(route, /p\.links_json/);
  assert.match(route, /parsed\.linksJson/);
  assert.match(home, /Links para divulgação \(opcional\)/);
  assert.match(home, /community-post-links/);
  assert.match(home, /community-post-actions-overlay/);
  assert.match(home, /createPortal/);
  assert.match(home, /document\.body/);
  assert.match(home, /aria-haspopup="dialog"/);
  assert.match(share, /navigator\.canShare/);
  assert.match(share, /payload\.files = files/);
  assert.match(share, /\/compartilhar\/publicacao\/\$\{postId\}/);
  assert.doesNotMatch(share, /Imagem da publicação:/);
  assert.match(share, /https:\/\/wa\.me/);
  assert.match(share, /facebook\.com\/sharer/);
  assert.match(styles, /\.community-post-share-grid/);
  assert.match(styles, /\.community-post-actions-overlay/);
  assert.match(styles, /\.community-post-actions-dialog/);
  assert.match(styles, /height: 100dvh/);
});

test("migração preserva publicações antigas e cria lista de links vazia", async () => {
  const { database } = await createPilotD1();
  const row = database.prepare("SELECT links_json FROM publicacoes_piloto ORDER BY id LIMIT 1").get();
  assert.equal(row.links_json, "[]");
  database.close();
});

test("eventos e checklists possuem exclusão confirmada, auditada e isolada", async () => {
  const [eventsUi, eventsRoute, diaconiaUi, diaconiaRoute] = await Promise.all([
    source("app/components/EventsWorkspace.tsx"),
    source("app/api/pilot/eventos/[id]/route.ts"),
    source("app/components/DiaconiaWorkspace.tsx"),
    source("app/api/pilot/diaconia/route.ts"),
  ]);
  assert.match(eventsUi, /Excluir definitivamente o evento/);
  assert.match(eventsUi, /method: "DELETE"/);
  assert.match(eventsRoute, /requireTenantPermission\("events\.manage"\)/);
  assert.match(eventsRoute, /WHERE id = \? AND comunidade_id = \?/);
  assert.match(eventsRoute, /EVENTO_EXCLUIDO_DEFINITIVAMENTE/);
  assert.match(eventsRoute, /DELETE FROM eventos_comunidade WHERE id = \? AND comunidade_id = \?/);
  assert.match(diaconiaUi, /Excluir checklist/);
  assert.match(diaconiaRoute, /DIACONIA_CHECKLIST_EXCLUIDO/);
  assert.match(diaconiaRoute, /permissions\.includes\("diaconia\.manage"\)/);
  assert.match(diaconiaRoute, /DELETE FROM ministerio_checklist_itens[\s\S]*comunidade_id = \?/);
});

test("papel de parede usa alta resolução e perde intensidade de cima para baixo", async () => {
  const [images, styles] = await Promise.all([
    source("app/lib/client-image.ts"),
    source("app/globals.css"),
  ]);
  assert.match(images, /maximum: 4096/);
  assert.match(images, /targetBytes: 7\.8 \* 1024 \* 1024/);
  assert.match(styles, /transparent 26%/);
  assert.match(styles, /var\(--pilot-bg\) 82%/);
  assert.match(styles, /var\(--community-wallpaper-image\) center top/);
});

test("backend salva links, impede exclusão por membro e exclui evento apenas no tenant ativo", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Gestor V124",
    email: "gestor.v124@example.test",
    senha: "Gestor124",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  await createPilotUser(database, {
    nome: "Membro V124",
    email: "membro.v124@example.test",
    senha: "Membro124",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("v124", `${process.pid}-${Date.now()}`);
  const worker = (await import(workerUrl.href)).default;
  const env = {
    DB: d1,
    AUTH_SECRET: "segredo-v124",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const gestor = await login(worker, env, context, "gestor.v124@example.test", "Gestor124");
  const membro = await login(worker, env, context, "membro.v124@example.test", "Membro124");

  const postResponse = await worker.fetch(new Request("http://localhost/api/pilot/publicacoes", {
    method: "POST",
    headers: { cookie: gestor, "content-type": "application/json" },
    body: JSON.stringify({
      titulo: "Encontro da comunidade",
      conteudo: "Participe do nosso encontro.",
      categoria: "EVENTO",
      status: "PUBLICADA",
      links: ["https://example.com/inscricao", "javascript:alert(1)"],
    }),
  }), env, context);
  assert.equal(postResponse.status, 201);
  const postId = Number((await postResponse.json()).id);
  assert.deepEqual(
    JSON.parse(database.prepare("SELECT links_json FROM publicacoes_piloto WHERE id = ?").get(postId).links_json),
    ["https://example.com/inscricao"],
  );

  const eventResponse = await worker.fetch(new Request("http://localhost/api/pilot/eventos", {
    method: "POST",
    headers: { cookie: gestor, "content-type": "application/json" },
    body: JSON.stringify({ titulo: "Evento removível", iniciaEm: "2037-08-13T20:00:00.000Z", status: "PUBLICADO" }),
  }), env, context);
  assert.equal(eventResponse.status, 201);
  const eventId = Number((await eventResponse.json()).id);
  const denied = await worker.fetch(new Request(`http://localhost/api/pilot/eventos/${eventId}`, {
    method: "DELETE", headers: { cookie: membro },
  }), env, context);
  assert.equal(denied.status, 403);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM eventos_comunidade WHERE id = ?").get(eventId).total, 1);

  const deleted = await worker.fetch(new Request(`http://localhost/api/pilot/eventos/${eventId}`, {
    method: "DELETE", headers: { cookie: gestor },
  }), env, context);
  assert.equal(deleted.status, 200);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM eventos_comunidade WHERE id = ?").get(eventId).total, 0);
  assert.equal(
    database.prepare("SELECT evento FROM auditoria_piloto WHERE evento = 'EVENTO_EXCLUIDO_DEFINITIVAMENTE' ORDER BY id DESC LIMIT 1").get().evento,
    "EVENTO_EXCLUIDO_DEFINITIVAMENTE",
  );
  database.close();
});

async function login(worker, env, context, email, senha) {
  const response = await worker.fetch(new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, senha }),
  }), env, context);
  assert.equal(response.status, 303);
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  const cookie = cookies.map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
  assert.ok(cookie);
  return cookie;
}
