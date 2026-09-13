import assert from "node:assert/strict";
import test from "node:test";
import { getVisitorAttention, visitorDaysWithoutContact, visitorToday } from "../app/lib/visitor-attention.ts";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const today = "2026-09-13";
const person = { ativo: 1, categoria_nome: "Teen", telefone: "11999990000", responsavel_email: "responsavel@example.test", acompanhante: null, data_entrada: today, ultimo_contato: null, proximo_contato: null };

test("alertas distinguem atraso, contato hoje, dados incompletos e arquivados", () => {
  assert.deepEqual(getVisitorAttention(person, today), { tone: "none", reasons: [] });
  assert.deepEqual(getVisitorAttention({ ...person, proximo_contato: today }, today), { tone: "attention", reasons: ["Contato hoje"] });
  assert.deepEqual(getVisitorAttention({ ...person, proximo_contato: "2026-09-12" }, today), { tone: "overdue", reasons: ["Retorno atrasado"] });
  assert.deepEqual(getVisitorAttention({ ...person, categoria_nome: null, telefone: " ", responsavel_email: null }, today).reasons, ["Sem categoria", "Sem telefone", "Sem responsável"]);
  assert.deepEqual(getVisitorAttention({ ...person, ativo: 0, telefone: null, proximo_contato: "2026-09-01" }, today), { tone: "none", reasons: [] });
});

test("quinze dias usam a entrada e o dia brasileiro, inclusive depois das 21h", () => {
  assert.equal(visitorToday(new Date("2026-09-14T01:30:00Z")), today);
  const old = { ...person, data_entrada: "2026-08-29" };
  assert.equal(visitorDaysWithoutContact(old, today), 15);
  assert.equal(getVisitorAttention(old, today).tone, "attention");
  assert.equal(getVisitorAttention({ ...old, data_entrada: "2026-08-30" }, today).tone, "none");
  assert.equal(getVisitorAttention({ ...old, ultimo_contato: "2026-09-14 01:00:00" }, today).tone, "none");
  assert.equal(visitorDaysWithoutContact({ ...old, ultimo_contato: "2026-08-30 01:00:00" }, today), 15);
});

test("lista e contagem de pendências descartam agendamento antigo após novo acompanhamento", async () => {
  const { database, d1 } = await createPilotD1();
  try {
    await createPilotUser(database, { nome: "Revisão", email: "attention@example.test", senha: "Attention123", memberships: [{ comunidadeId: 1, papel: "PASTOR" }] });
    const worker = (await import("../dist/server/index.js")).default;
    const env = { DB: d1, AUTH_SECRET: "attention-test-only-secret", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const login = await worker.fetch(new Request("http://localhost/api/auth/login", { method: "POST", body: new URLSearchParams({ email: "attention@example.test", senha: "Attention123" }) }), env, ctx);
    assert.equal(login.status, 303);
    const cookie = login.headers.getSetCookie().map((item) => item.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
    assert.ok(cookie);
    const id = Number(database.prepare("INSERT INTO visitantes (comunidade_id, nome_completo, data_entrada, criado_por, escopo_confirmado, ativo) VALUES (1, 'Pessoa teste pendência', date('now'), 'attention@example.test', 1, 1)").run().lastInsertRowid);
    const insert = database.prepare("INSERT INTO acompanhamentos (comunidade_id, visitante_id, responsavel_email, tipo, resultado, proximo_contato, escopo_confirmado) VALUES (?, ?, 'attention@example.test', 'TELEFONE', 'Contato teste', ?, ?)");
    insert.run(1, id, "2000-01-01", 1);
    const read = async (vision) => {
      const response = await worker.fetch(new Request(`http://localhost/api/pilot/visitantes?visao=${vision}`, { headers: { cookie } }), env, ctx);
      assert.equal(response.status, 200);
      return response.json();
    };
    const before = await read("pendencias");
    assert.ok(before.visitantes.some((item) => item.id === id));
    insert.run(1, id, "2099-01-01", 1);
    // Um registro de outra comunidade ou não confirmado não pode substituir o atual.
    insert.run(2, id, "2000-01-01", 1);
    insert.run(1, id, "2000-01-01", 0);
    const after = await read("pendencias");
    assert.ok(!after.visitantes.some((item) => item.id === id));
    assert.equal(after.contagens.pendencias, before.contagens.pendencias - 1);
    insert.run(1, id, null, 1);
    assert.ok(!(await read("pendencias")).visitantes.some((item) => item.id === id));
    insert.run(1, id, visitorToday(), 1);
    assert.ok((await read("pendencias")).visitantes.some((item) => item.id === id));
  } finally { database.close(); }
});
