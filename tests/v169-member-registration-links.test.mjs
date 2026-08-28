import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const workerContext = { waitUntil() {}, passThroughOnException() {} };

test("temporary member registration is owner-scoped in schema, queries and UI", async () => {
  const [migration, helper, adminRoute, publicRoute, dashboard, adminUi, publicUi, styles] = await Promise.all([
    source("drizzle/0054_member_registration_links.sql"),
    source("app/lib/member-registration.ts"),
    source("app/api/pilot/cadastros-membros/route.ts"),
    source("app/api/public/cadastro-membro/[token]/route.ts"),
    source("app/components/PilotDashboard.tsx"),
    source("app/components/MemberRegistrationLinkManager.tsx"),
    source("app/components/MemberRegistrationForm.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(migration, /CREATE TABLE `links_cadastro_membros`/);
  assert.match(migration, /CREATE TABLE `cadastros_membros_temporarios`/);
  assert.match(helper, /c\.proprietario_usuario_id = \?/);
  assert.match(helper, /m\.comunidade_id = f\.comunidade_id/);
  assert.match(adminRoute, /tenant\.context\.isCommunityOwner/);
  assert.match(adminRoute, /proprietario_usuario_id = links_cadastro_membros\.criado_por/);
  assert.match(publicRoute, /c\.proprietario_usuario_id = \?/);
  assert.match(publicRoute, /m\.comunidade_id = c\.id/);
  assert.match(dashboard, /canManageRegistrationLinks=\{active\.isCommunityOwner\}/);
  assert.match(adminUi, /Criar link temporário/);
  assert.match(publicUi, /Revisar cadastro/);
  assert.match(publicUi, /Editar informações/);
  assert.match(styles, /\.pilot-mobile-overlay\s*\{[^}]*align-items:flex-end/s);
});

test("public form never exposes or accepts another owner's community data", async () => {
  const { database, d1 } = await createPilotD1();
  const ownerOne = await createPilotUser(database, {
    nome: "Dono Um",
    email: "dono.um.cadastro@example.test",
    senha: "Cadastro123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  const ownerTwo = await createPilotUser(database, {
    nome: "Dono Dois",
    email: "dono.dois.cadastro@example.test",
    senha: "Cadastro123",
    memberships: [{ comunidadeId: 2, papel: "ADMIN_COMUNIDADE" }],
  });
  database.prepare("UPDATE comunidades SET proprietario_usuario_id = CASE id WHEN 1 THEN ? WHEN 2 THEN ? END WHERE id IN (1,2)").run(ownerOne, ownerTwo);
  const ministryOne = Number(database.prepare("INSERT INTO ministerios_comunidade (comunidade_id,nome,status,criado_por) VALUES (1,'Louvor do dono um','ATIVO',?)").run(ownerOne).lastInsertRowid);
  const ministryTwo = Number(database.prepare("INSERT INTO ministerios_comunidade (comunidade_id,nome,status,criado_por) VALUES (2,'Louvor do dono dois','ATIVO',?)").run(ownerTwo).lastInsertRowid);
  const functionOne = Number(database.prepare("INSERT INTO ministerio_funcoes (comunidade_id,ministerio_id,nome,ativa,criado_por) VALUES (1,?,'Voz',1,?)").run(ministryOne, ownerOne).lastInsertRowid);
  database.prepare("INSERT INTO ministerio_funcoes (comunidade_id,ministerio_id,nome,ativa,criado_por) VALUES (2,?,'Teclado secreto',1,?)").run(ministryTwo, ownerTwo);
  const token = "123e4567-e89b-42d3-a456-426614174000";
  database.prepare("INSERT INTO links_cadastro_membros (comunidade_origem_id,criado_por,token,titulo,abre_em,fecha_em) VALUES (1,?,?,?,'2020-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z')").run(ownerOne, token, "Cadastro seguro");

  const worker = await loadWorker();
  const env = {
    DB: d1,
    AUTH_SECRET: "segredo-ficticio-cadastro-membro-test",
    SYSTEM_OWNER_EMAIL: "none@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2000-01-01T00:00:00.000Z",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const getResponse = await worker.fetch(new Request(`http://localhost/api/public/cadastro-membro/${token}`), env, workerContext);
  assert.equal(getResponse.status, 200);
  const form = await getResponse.json();
  assert.deepEqual(form.communities.map((item) => item.id), [1]);
  assert.deepEqual(form.communities[0].ministries.map((item) => item.name), ["Louvor do dono um"]);
  assert.deepEqual(form.communities[0].ministries[0].functions.map((item) => item.name), ["Voz"]);
  assert.doesNotMatch(JSON.stringify(form), /dono dois|Teclado secreto/i);

  const validBody = new FormData();
  validBody.set("fullName", "Pessoa Cadastrada");
  validBody.set("email", "pessoa.cadastrada@example.test");
  validBody.set("cep", "58000000");
  validBody.set("birthDate", "1990-05-20");
  validBody.set("communityId", "1");
  validBody.set("anointing", "MEMBRO");
  validBody.set("ministryId", String(ministryOne));
  validBody.set("functionId", String(functionOne));
  validBody.set("period", "NOITE");
  validBody.append("availableDays", "DOM");
  validBody.set("acceptedTerms", "true");
  const submit = await worker.fetch(new Request(`http://localhost/api/public/cadastro-membro/${token}`, { method: "POST", body: validBody }), env, workerContext);
  assert.equal(submit.status, 201);
  assert.equal(database.prepare("SELECT comunidade_id FROM cadastros_membros_temporarios WHERE email = ?").get("pessoa.cadastrada@example.test").comunidade_id, 1);

  const invalidBody = new FormData();
  invalidBody.set("fullName", "Pessoa Indevida");
  invalidBody.set("email", "indevida@example.test");
  invalidBody.set("cep", "58000000");
  invalidBody.set("birthDate", "1990-05-20");
  invalidBody.set("communityId", "2");
  invalidBody.set("anointing", "MEMBRO");
  invalidBody.set("ministryId", String(ministryTwo));
  const rejected = await worker.fetch(new Request(`http://localhost/api/public/cadastro-membro/${token}`, { method: "POST", body: invalidBody }), env, workerContext);
  assert.equal(rejected.status, 400);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM cadastros_membros_temporarios WHERE email = ?").get("indevida@example.test").total, 0);
  database.close();
});

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("member-registration", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}
