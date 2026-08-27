import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createPilotD1,
  createPilotUser,
} from "./helpers/sqlite-d1.mjs";

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

function createEnv(d1) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-ficticio-exclusivo-do-teste-v151",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("parking-qr", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

async function login(worker, env, email, senha) {
  const response = await worker.fetch(new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ email, senha }),
  }), env, context);
  assert.equal(response.status, 303);
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  const session = setCookies.map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
  assert.ok(session);
  return session;
}

const qrComponent = await readFile(
  new URL("../app/components/ParkingReservationQr.tsx", import.meta.url),
  "utf8",
);
const parkingWorkspace = await readFile(
  new URL("../app/components/ParkingWorkspace.tsx", import.meta.url),
  "utf8",
);
const reservationRoute = await readFile(
  new URL("../app/api/pilot/estacionamento/reservas/route.ts", import.meta.url),
  "utf8",
);

test("reserva confirmada gera QR sem incluir dados pessoais", () => {
  assert.match(qrComponent, /VINKULO:PARKING:/);
  assert.match(qrComponent, /QRCode\.toDataURL/);
  assert.match(parkingWorkspace, /reservation\.status === "CONFIRMADA"/);
  assert.match(parkingWorkspace, /ParkingReservationQr code=\{reservation\.codigo\}/);
  assert.doesNotMatch(qrComponent, /documento_mascarado|nome_completo|telefone/);
});

test("responsável pode ler pela câmera ou código manual", () => {
  assert.match(qrComponent, /getUserMedia/);
  assert.match(qrComponent, /jsqr/);
  assert.match(qrComponent, /Ou digite o código/);
  assert.doesNotMatch(qrComponent, /createImageBitmap|Usar imagem do QR/);
  assert.match(parkingWorkspace, /ParkingQrCheckin/);
});

test("backend valida horário, vaga e permissão antes do check-in", () => {
  assert.match(reservationRoute, /action === "CHECKIN" \? "parking\.entry" : "parking\.edit"/);
  assert.match(reservationRoute, /currentStatus !== "CONFIRMADA"/);
  assert.match(reservationRoute, /startsAt - \(2 \* 60 \* 60 \* 1000\) > now/);
  assert.match(reservationRoute, /vaga_status\) !== "LIVRE"/);
  assert.match(reservationRoute, /ESTACIONAMENTO_CHECKIN_QR/);
  assert.match(reservationRoute, /INSERT INTO estacionamento_movimentacoes/);
  assert.match(reservationRoute, /slice\(0, 24\)/);
});

test("QR confirmado é lido pelo responsável e ocupa a vaga uma única vez", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Usuário da Reserva QR",
    email: "reserva.qr@example.test",
    senha: "ReservaQR123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  await createPilotUser(database, {
    nome: "Responsável Estacionamento QR",
    email: "responsavel.qr@example.test",
    senha: "ResponsavelQR123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  const vaga = database.prepare("SELECT id FROM estacionamento_vagas WHERE comunidade_id = 1 AND status = 'LIVRE' AND ativo = 1 LIMIT 1").get();
  assert.ok(vaga?.id);
  const worker = await loadWorker();
  const env = createEnv(d1);
  const memberCookie = await login(worker, env, "reserva.qr@example.test", "ReservaQR123");
  const managerCookie = await login(worker, env, "responsavel.qr@example.test", "ResponsavelQR123");
  const startsAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const endsAt = new Date(Date.now() + 65 * 60_000).toISOString();
  database.prepare(`INSERT INTO eventos_comunidade
    (comunidade_id,titulo,inicia_em,termina_em,status,publico)
    VALUES (1,'Culto com estacionamento',?,?, 'PUBLICADO',1)`).run(startsAt,endsAt);
  const createResponse = await worker.fetch(new Request("http://localhost/api/pilot/estacionamento/reservas", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({
      vagaId: Number(vaga.id),
      nomeCompleto: "Usuário da Reserva QR",
      email: "reserva.qr@example.test",
      telefone: "47999998888",
      placaVeiculo: "ABC1D23",
      tipoVeiculo: "CARRO",
      modeloVeiculo: "Honda Civic",
      corVeiculo: "Prata",
      inicioEm: startsAt,
      fimEm: endsAt,
    }),
  }), env, context);
  const createPayload = await createResponse.clone().json();
  assert.equal(createResponse.status, 201, JSON.stringify(createPayload));
  const created = await createResponse.json();
  assert.match(created.codigo, /^VK-[A-F0-9]{24}$/);

  const pendingRead = await worker.fetch(new Request("http://localhost/api/pilot/estacionamento/reservas", {
    method: "PATCH",
    headers: { cookie: managerCookie, "content-type": "application/json" },
    body: JSON.stringify({ codigo: `VINKULO:PARKING:${created.codigo}`, acao: "CHECKIN" }),
  }), env, context);
  assert.equal(pendingRead.status, 409);

  const confirmResponse = await worker.fetch(new Request("http://localhost/api/pilot/estacionamento/reservas", {
    method: "PATCH",
    headers: { cookie: managerCookie, "content-type": "application/json" },
    body: JSON.stringify({ id: created.id, acao: "CONFIRMAR" }),
  }), env, context);
  assert.equal(confirmResponse.status, 200);

  const checkinResponse = await worker.fetch(new Request("http://localhost/api/pilot/estacionamento/reservas", {
    method: "PATCH",
    headers: { cookie: managerCookie, "content-type": "application/json" },
    body: JSON.stringify({ codigo: `VINKULO:PARKING:${created.codigo}`, acao: "CHECKIN" }),
  }), env, context);
  assert.equal(checkinResponse.status, 200);
  const checked = await checkinResponse.json();
  assert.equal(checked.status, "CHECKIN");
  assert.equal(checked.reserva.codigo, undefined);
  assert.equal(database.prepare("SELECT status FROM estacionamento_vagas WHERE id = ?").get(vaga.id).status, "OCUPADA");
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM estacionamento_movimentacoes WHERE vaga_id = ? AND status = 'NO_LOCAL'").get(vaga.id).total,
    1,
  );

  const managerListResponse = await worker.fetch(new Request("http://localhost/api/pilot/estacionamento/reservas", {
    headers: { cookie: managerCookie },
  }), env, context);
  assert.equal(managerListResponse.status, 200);
  const managerList = await managerListResponse.json();
  assert.equal(managerList.reservas.find((item) => item.id === created.id)?.codigo, "");

  const repeatedRead = await worker.fetch(new Request("http://localhost/api/pilot/estacionamento/reservas", {
    method: "PATCH",
    headers: { cookie: managerCookie, "content-type": "application/json" },
    body: JSON.stringify({ codigo: created.codigo, acao: "CHECKIN" }),
  }), env, context);
  assert.equal(repeatedRead.status, 409);
  database.close();
});
