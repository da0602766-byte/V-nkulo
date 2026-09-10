import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getUploadOwnerSegment,
  isSafeUploadKey,
} from "../app/lib/upload-key-policy.mjs";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("integration", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-ficticio-exclusivo-do-teste-celulas-v239",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

async function login(worker, env, email, senha) {
  const response = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ email, senha }),
    }),
    env,
    context,
  );
  assert.equal(response.status, 303);
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];
  const cookie = setCookies
    .map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(cookie, "cookie de sessão ausente");
  return cookie;
}

const listCells = async (worker, env, cookie) => {
  const response = await worker.fetch(
    new Request("http://localhost/api/pilot/celulas", { headers: { cookie } }),
    env,
    context,
  );
  assert.equal(response.status, 200);
  return (await response.json()).celulas;
};

// O pedido de entrada é da pessoa que o fez: ela vê o próprio na lista, não vê o
// dos outros, e é a única que pode desistir dele. A liderança continua decidindo
// aprovar ou recusar — desistir não é decidir.
test("solicitação de entrada aparece e é cancelada só para quem a enviou", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Pastora Fictícia",
    email: "pastora.celulas@example.test",
    senha: "Celulas239",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  await createPilotUser(database, {
    nome: "Interessada Fictícia",
    email: "interessada.celulas@example.test",
    senha: "Celulas239",
    memberships: [{ comunidadeId: 1, papel: "LIDER" }],
  });
  await createPilotUser(database, {
    nome: "Outro Fictício",
    email: "outro.celulas@example.test",
    senha: "Celulas239",
    memberships: [{ comunidadeId: 1, papel: "LIDER" }],
  });

  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(worker, env, "pastora.celulas@example.test", "Celulas239");
  const pastorId = database
    .prepare("SELECT id FROM usuarios WHERE email = ?")
    .get("pastora.celulas@example.test").id;

  const createResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/celulas", {
      method: "POST",
      headers: { cookie: pastorCookie, "content-type": "application/json" },
      body: JSON.stringify({
        nome: "Célula Esperança",
        liderUsuarioId: pastorId,
        diasReuniao: ["SEG"],
        horarioReuniao: "19h30",
        rede: "Rede Centro",
        tags: ["Famílias", "Oração"],
        descricaoPublica: "Encontros semanais no bairro.",
      }),
    }),
    env,
    context,
  );
  assert.equal(createResponse.status, 201);
  const cellId = (await createResponse.json()).id;

  const interestedCookie = await login(worker, env, "interessada.celulas@example.test", "Celulas239");
  const otherCookie = await login(worker, env, "outro.celulas@example.test", "Celulas239");

  const requestResponse = await worker.fetch(
    new Request(`http://localhost/api/public/celulas/${cellId}/solicitar`, {
      method: "POST",
      headers: { cookie: interestedCookie, "content-type": "application/json" },
      body: JSON.stringify({
        nome: "Interessada Fictícia",
        contato: "interessada.celulas@example.test",
        mensagem: "Gostaria de participar das segundas.",
      }),
    }),
    env,
    context,
  );
  assert.equal(requestResponse.status, 201);

  // Quem pediu vê o próprio pedido, e o perfil público chega inteiro.
  const [mineBefore] = await listCells(worker, env, interestedCookie);
  assert.equal(mineBefore.sou_membro, false);
  assert.ok(mineBefore.minha_solicitacao, "pedido próprio deveria aparecer");
  assert.equal(mineBefore.horario_reuniao, "19h30");
  assert.equal(mineBefore.rede, "Rede Centro");
  assert.deepEqual(mineBefore.tags, ["Famílias", "Oração"]);

  // Quem não pediu não enxerga pedido de terceiro.
  const [seenByOther] = await listCells(worker, env, otherCookie);
  assert.equal(seenByOther.minha_solicitacao, null);
  assert.deepEqual(seenByOther.solicitacoes, []);

  // E não consegue cancelar o pedido alheio.
  const strangerCancel = await worker.fetch(
    new Request(`http://localhost/api/public/celulas/${cellId}/solicitar`, {
      method: "DELETE",
      headers: { cookie: otherCookie },
    }),
    env,
    context,
  );
  assert.equal(strangerCancel.status, 404);
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS total FROM celula_solicitacoes WHERE celula_id = ? AND status = 'PENDENTE'")
      .get(cellId).total,
    1,
  );

  const ownCancel = await worker.fetch(
    new Request(`http://localhost/api/public/celulas/${cellId}/solicitar`, {
      method: "DELETE",
      headers: { cookie: interestedCookie },
    }),
    env,
    context,
  );
  assert.equal(ownCancel.status, 200);
  const [mineAfter] = await listCells(worker, env, interestedCookie);
  assert.equal(mineAfter.minha_solicitacao, null);

  database.close();
});

// A capa da célula é imagem enviada pela própria célula: a chave carrega o id
// dela, e chave sem esse formato não pode ser servida.
test("capa da célula tem chave própria por célula", () => {
  assert.equal(getUploadOwnerSegment("cell-cover", { cellId: 7 }), "cell-7");
  assert.ok(isSafeUploadKey("images/cell-cover/cell-7/3f2a1b4c-0d5e-4a6b-8c9d-0e1f2a3b4c5d.webp"));
  assert.equal(isSafeUploadKey("images/cell-cover/7/3f2a1b4c-0d5e-4a6b-8c9d-0e1f2a3b4c5d.webp"), false);
  assert.equal(isSafeUploadKey("images/cell-cover/cell-7/../../segredo.webp"), false);
});

test("a aba abre em gestão no computador e no essencial no celular", async () => {
  const [workspace, board, migration, schema] = await Promise.all([
    read("app/components/TenantOperations.tsx"),
    read("app/components/CellsMemberBoard.tsx"),
    read("drizzle/0071_celula_perfil_publico.sql"),
    read("db/schema.ts"),
  ]);

  // A escolha entre as duas telas é do papel somado ao aparelho.
  assert.match(workspace, /CellsMemberBoard/);
  assert.match(workspace, /mode \?\? \(isMobile \|\| !canUseManagement \? "membro" : "gestao"\)/);
  assert.match(workspace, /canUseManagement = canManage \|\| cells\.some/);

  // No celular a liderança faz relatório e responde pedidos — e só isso.
  const leaderBlock = board.slice(
    board.indexOf("function leaderHTML") >= 0 ? board.indexOf("function leaderHTML") : board.indexOf("selected.can_operate && isMobile"),
    board.indexOf("cell-member-leader-note-v7"),
  );
  assert.match(leaderBlock, /onSendReport/);
  assert.match(leaderBlock, /onDecideRequest/);
  assert.doesNotMatch(leaderBlock, /MEMBRO_ADICIONAR|ATUALIZAR_DADOS|AGENDA_CRIAR/);
  assert.match(board, /Integrantes, agenda e configurações da célula ficam no computador/);

  // Os campos que a tela do participante mostra existem no banco.
  for (const coluna of ["horario_reuniao", "rede", "tags", "capa_url"]) {
    assert.match(migration, new RegExp(`ADD \`${coluna}\``));
  }
  assert.match(schema, /horarioReuniao: text\("horario_reuniao"\)/);
  assert.match(schema, /capaUrl: text\("capa_url"\)/);
});
