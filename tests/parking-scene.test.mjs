import test from "node:test";
import assert from "node:assert/strict";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";
import { cpfLoginRequest } from "./helpers/cpf-login.mjs";
import {
  parseParkingScene,
  seedParkingScene,
  newSceneObject,
  sceneIssues,
  SCENE_KINDS,
} from "../app/lib/parking-scene.ts";
const worker = (await import("../dist/server/index.js")).default;
const ctx = {
  waitUntil(p) {
    p.catch(() => {});
  },
  passThroughOnException() {},
};
async function setup(t) {
  const { database: db, d1 } = await createPilotD1();
  t.after(() => db.close());
  const batch = d1.batch.bind(d1);
  let queue = Promise.resolve();
  d1.batch = (statements) => {
    const next = queue.then(() => batch(statements));
    queue = next.catch(() => {});
    return next;
  };
  const env = {
    DB: d1,
    AUTH_SECRET: "parking-scene-isolated-test",
    ASSETS: { fetch: async () => new Response("", { status: 404 }) },
  };
  async function login(name, community, role) {
    const email = name + "@example.invalid";
    await createPilotUser(db, {
      nome: name,
      email,
      senha: "Teste123!",
      memberships: [{ comunidadeId: community, papel: role }],
    });
    const req = await cpfLoginRequest(
      env,
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, senha: "Teste123!" }),
      }),
    );
    const r = await worker.fetch(req, env, ctx);
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie").match(/__Host-adote_session=[^;]+/)[0];
  }
  const admin = await login("GestorCena", 1, "ADMIN_COMUNIDADE"),
    member = await login("MembroCena", 1, "MEMBRO"),
    other = await login("OutraCena", 2, "ADMIN_COMUNIDADE");
  db.exec(
    "DELETE FROM estacionamento_reservas; DELETE FROM estacionamento_movimentacoes; DELETE FROM estacionamento_vagas; DELETE FROM estacionamento_setores;",
  );
  const sector = Number(
    db
      .prepare(
        "INSERT INTO estacionamento_setores(comunidade_id,nome) VALUES(1,'Setor A')",
      )
      .run().lastInsertRowid,
  );
  const slot = Number(
    db
      .prepare(
        "INSERT INTO estacionamento_vagas(comunidade_id,setor_id,codigo,posicao_x,posicao_y) VALUES(1,?,'A01',20,20)",
      )
      .run(sector).lastInsertRowid,
  );
  async function call(
    cookie = admin,
    method = "GET",
    body,
    query = "?editor=1",
  ) {
    const r = await worker.fetch(
      new Request("http://localhost/api/pilot/estacionamento/cenario" + query, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
      ctx,
    );
    const text = await r.text();
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${r.status}: ${text.slice(0, 500)}`);
    }
    return { status: r.status, ...value };
  }
  const initial = await call();
  assert.equal(initial.status, 200, JSON.stringify(initial));
  const save = (d, scene = d.draft, publish = false) =>
    call(
      admin,
      "PUT",
      { scene, revision: d.revision, fingerprint: d.fingerprint, publish },
      "",
    );
  return { db, env, admin, member, other, slot, sector, call, save, initial };
}
test("cena: validação estrutural, códigos, rotação e volume", () => {
  const scene = seedParkingScene([], []);
  scene.sectors = [{ id: "s", name: "A", color: "#123456" }];
  scene.width = 100;
  scene.depth = 100;
  const a = {
    ...newSceneObject("space", "a", 10, 10),
    name: "A01",
    sectorId: "s",
    rotation: 45,
  };
  scene.objects = [a];
  assert.equal(sceneIssues(parseParkingScene(scene)).length, 0);
  assert.throws(() => parseParkingScene({ ...scene, width: NaN }));
  assert.throws(() =>
    parseParkingScene({ ...scene, objects: [a, { ...a, id: "b" }] }),
  );
  assert.ok(
    sceneIssues({
      ...scene,
      objects: [a, { ...a, id: "b", name: "A02", x: 10.1 }],
    }).length,
  );
  assert.ok(sceneIssues({ ...scene, objects: [{ ...a, x: 0 }] }).length);
  scene.width = 300;
  scene.depth = 300;
  scene.objects = Array.from({ length: 500 }, (_, i) => ({
    ...a,
    id: "v" + i,
    name: "V" + i,
    rotation: 0,
    x: 5 + (i % 25) * 5,
    y: 5 + Math.floor(i / 25) * 8,
  }));
  assert.equal(sceneIssues(parseParkingScene(scene)).length, 0);
});
test("rascunho privado, permissão, publicação e persistência com IDs estáveis", async (t) => {
  const f = await setup(t);
  assert.equal((await f.call(f.member)).status, 403);
  assert.equal((await f.call(null)).status, 401);
  const draft = structuredClone(f.initial.draft);
  draft.objects.push(newSceneObject("tree", "tree-1", 3, 3));
  assert.equal((await f.save(f.initial, draft)).status, 200);
  assert.equal((await f.call(f.member, "GET", undefined, "")).published, null);
  let current = await f.call();
  assert.ok(current.draft.objects.some((o) => o.id === "tree-1"));
  const pub = await f.save(current, current.draft, true);
  assert.equal(pub.status, 200, JSON.stringify(pub));
  const visible = await f.call(f.member, "GET", undefined, "");
  assert.equal(
    visible.published.objects.find((o) => o.kind === "space").spaceId,
    f.slot,
  );
  assert.equal(visible.draft, undefined);
  assert.equal(visible.fingerprint, undefined);
  assert.equal((await f.call(f.other, "GET", undefined, "")).published, null);
  current = await f.call();
  assert.equal(current.history.length, 1);
  assert.equal(
    f.db
      .prepare("SELECT ativo FROM estacionamento_vagas WHERE id=?")
      .get(f.slot).ativo,
    1,
  );
});
test("novos setores e vagas só existem operacionalmente após publicar; republicar não duplica", async (t) => {
  const f = await setup(t),
    draft = structuredClone(f.initial.draft);
  draft.sectors.push({ id: "new-sector", name: "Setor B", color: "#567890" });
  draft.objects.push({
    ...newSceneObject("space", "new-space", 20, 20),
    name: "B01",
    sectorId: "new-sector",
  });
  assert.equal((await f.save(f.initial, draft)).status, 200);
  assert.equal(
    f.db
      .prepare("SELECT count(*) n FROM estacionamento_vagas WHERE codigo='B01'")
      .get().n,
    0,
  );
  let current = await f.call();
  const p = await f.save(current, current.draft, true);
  assert.equal(p.status, 200, JSON.stringify(p));
  current = await f.call();
  assert.ok(current.draft.objects.find((o) => o.id === "new-space").spaceId);
  assert.ok(current.draft.sectors.find((s) => s.id === "new-sector").dbId);
  assert.equal((await f.save(current, current.draft, true)).status, 200);
  assert.equal(
    f.db
      .prepare("SELECT count(*) n FROM estacionamento_vagas WHERE codigo='B01'")
      .get().n,
    1,
  );
});
test("ocupação impede remoção ou mudança de tipo, mas permite reorganização visual", async (t) => {
  const f = await setup(t);
  f.db
    .prepare("UPDATE estacionamento_vagas SET status='OCUPADA' WHERE id=?")
    .run(f.slot);
  const empty = { ...f.initial.draft, objects: [] };
  assert.equal((await f.save(f.initial, empty, true)).status, 409);
  assert.equal((await f.call()).revision, 0);
  const moved = structuredClone(f.initial.draft);
  moved.objects[0].x += 4;
  assert.equal((await f.save(f.initial, moved, true)).status, 200);
  const current = await f.call();
  current.draft.objects[0].spaceType = "PCD";
  assert.equal((await f.save(current, current.draft, true)).status, 409);
  assert.equal(
    f.db
      .prepare("SELECT tipo,status,ativo FROM estacionamento_vagas WHERE id=?")
      .get(f.slot).status,
    "OCUPADA",
  );
});
test("reserva criada depois de abrir editor impede arquivamento e preserva versão publicada", async (t) => {
  const f = await setup(t);
  const user = f.db
    .prepare("SELECT id FROM usuarios WHERE email='MembroCena@example.invalid'")
    .get().id;
  f.db
    .prepare(
      `INSERT INTO estacionamento_reservas(comunidade_id,vaga_id,usuario_id,nome_completo,email,telefone,placa_veiculo,tipo_veiculo,documento_hash,documento_mascarado,inicio_em,fim_em,codigo,status) VALUES(1,?,?,'Teste','test@example.invalid','123','ABC1234','CARRO','hash','***',datetime('now'),datetime('now','+1 day'),'CODE','CONFIRMADA')`,
    )
    .run(f.slot, user);
  const result = await f.save(
    f.initial,
    { ...f.initial.draft, objects: [] },
    true,
  );
  assert.equal(result.status, 409, JSON.stringify(result));
  assert.equal(
    f.db
      .prepare("SELECT ativo FROM estacionamento_vagas WHERE id=?")
      .get(f.slot).ativo,
    1,
  );
});
test("concorrência: apenas uma gravação vence; alterações operacionais estruturais rejeitam draft antigo", async (t) => {
  const f = await setup(t);
  const outcomes = await Promise.all([f.save(f.initial), f.save(f.initial)]);
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409]);
  const d = await f.call();
  f.db
    .prepare("UPDATE estacionamento_vagas SET codigo='EDITADO' WHERE id=?")
    .run(f.slot);
  assert.equal((await f.save(d)).status, 409);
});
test("referência de outra comunidade, JSON inválido e publicação com sobreposição são recusados", async (t) => {
  const f = await setup(t);
  const draft = structuredClone(f.initial.draft);
  draft.objects[0].spaceId = 999999;
  assert.equal((await f.save(f.initial, draft, true)).status, 400);
  const overlap = structuredClone(f.initial.draft);
  overlap.objects.push({
    ...overlap.objects[0],
    id: "duplicated",
    spaceId: undefined,
    name: "A02",
  });
  assert.equal((await f.save(f.initial, overlap, false)).status, 200);
  const current = await f.call();
  assert.equal((await f.save(current, current.draft, true)).status, 400);
});
test("arquivamento mantém histórico, restauração reativa a mesma vaga", async (t) => {
  const f = await setup(t);
  assert.equal((await f.save(f.initial, f.initial.draft, true)).status, 200);
  let current = await f.call();
  const history = current.history[0].id;
  assert.equal(
    (await f.save(current, { ...current.draft, objects: [] }, true)).status,
    200,
  );
  assert.equal(
    f.db
      .prepare("SELECT ativo FROM estacionamento_vagas WHERE id=?")
      .get(f.slot).ativo,
    0,
  );
  current = await f.call();
  const restored = await f.call(
    f.admin,
    "GET",
    undefined,
    `?editor=1&history=${history}`,
  );
  assert.equal((await f.save(current, restored.draft, true)).status, 200);
  assert.equal(
    f.db
      .prepare("SELECT ativo FROM estacionamento_vagas WHERE id=?")
      .get(f.slot).ativo,
    1,
  );
});

test("todos os objetos decorativos preservam nome, posição, dimensão, cor, rotação e bloqueio", async (t) => {
  const f = await setup(t),
    draft = structuredClone(f.initial.draft);
  draft.width = 100;
  draft.depth = 100;
  for (const [i, kind] of SCENE_KINDS.filter((k) => k !== "space").entries())
    draft.objects.push({
      ...newSceneObject(kind, "decor-" + i, 20 + i * 6, 30),
      name: "Objeto " + i,
      rotation: 25,
      color: "#abcdef",
      locked: true,
    });
  const result = await f.save(f.initial, draft, true);
  assert.equal(result.status, 200, JSON.stringify(result));
  const current = await f.call();
  for (const original of draft.objects.filter((o) => o.id.startsWith("decor-")))
    assert.deepEqual(
      current.published.objects.find((o) => o.id === original.id),
      original,
    );
});
test("módulo desativado impede salvar e publicar; API antiga não altera um cenário versionado", async (t) => {
  const f = await setup(t);
  assert.equal((await f.save(f.initial)).status, 200);
  const r = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento/mapa", {
      method: "POST",
      headers: { cookie: f.admin, "content-type": "application/json" },
      body: JSON.stringify({
        action: "CRIAR_SETOR",
        nome: "Não criar",
        cor: "#123456",
        ordem: 1,
      }),
    }),
    f.env,
    ctx,
  );
  assert.equal(r.status, 409);
  const current = await f.call();
  f.db.exec(
    "UPDATE estacionamento_configuracoes SET ativo=0 WHERE comunidade_id=1",
  );
  assert.equal((await f.save(current)).status, 423);
});
