import assert from "node:assert/strict";
import test from "node:test";
import {
  createPilotD1,
  createPilotUser,
} from "./helpers/sqlite-d1.mjs";

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("integration", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1, overrides = {}) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-ficticio-exclusivo-do-teste-v4-5",
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
    ...overrides,
  };
}

test("presença comunitária isola tenants, respeita privacidade e prioriza online", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Líder Presente",
    email: "lider.presenca@example.test",
    senha: "Presenca123",
    memberships: [{ comunidadeId: 1, papel: "LIDER" }],
  });
  const memberId = await createPilotUser(database, {
    nome: "Membro Reservado",
    email: "membro.presenca@example.test",
    senha: "Presenca123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  await createPilotUser(database, {
    nome: "Outra Comunidade",
    email: "outra.presenca@example.test",
    senha: "Presenca123",
    memberships: [{ comunidadeId: 2, papel: "MEMBRO" }],
  });

  const worker = await loadWorker();
  const env = createEnv(d1);
  const leaderCookie = await login(
    worker,
    env,
    "lider.presenca@example.test",
    "Presenca123",
  );
  const memberCookie = await login(
    worker,
    env,
    "membro.presenca@example.test",
    "Presenca123",
  );
  const otherCookie = await login(
    worker,
    env,
    "outra.presenca@example.test",
    "Presenca123",
  );

  for (const cookie of [leaderCookie, memberCookie, otherCookie]) {
    const heartbeat = await worker.fetch(
      new Request("http://localhost/api/pilot/presenca", {
        method: "POST",
        headers: { cookie },
      }),
      env,
      context,
    );
    assert.equal(heartbeat.status, 200);
  }

  const leaderPresence = await worker.fetch(
    new Request("http://localhost/api/pilot/presenca", {
      headers: { cookie: leaderCookie },
    }),
    env,
    context,
  );
  assert.equal(leaderPresence.status, 200);
  const leaderData = await leaderPresence.json();
  assert.deepEqual(
    leaderData.people.map((person) => person.name).sort(),
    ["Líder Presente", "Membro Reservado"],
  );
  assert.equal(leaderData.people[0].online, true);
  assert.equal(
    leaderData.people.find((person) => person.name === "Líder Presente")
      .hierarchy,
    "LÍDER",
  );

  const privacy = await worker.fetch(
    new Request("http://localhost/api/pilot/presenca", {
      method: "PATCH",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ shareLastSeen: false }),
    }),
    env,
    context,
  );
  assert.equal(privacy.status, 200);
  database
    .prepare(
      "UPDATE presencas_comunidade SET ultima_atividade = datetime('now', '-10 minutes') WHERE usuario_id = ? AND comunidade_id = 1",
    )
    .run(memberId);

  const afterPrivacy = await worker.fetch(
    new Request("http://localhost/api/pilot/presenca", {
      headers: { cookie: leaderCookie },
    }),
    env,
    context,
  );
  const afterPrivacyData = await afterPrivacy.json();
  const hiddenMember = afterPrivacyData.people.find(
    (person) => person.name === "Membro Reservado",
  );
  assert.equal(hiddenMember.online, false);
  assert.equal(hiddenMember.lastSeen, null);
  assert.equal(hiddenMember.sharesLastSeen, false);

  const otherPresence = await worker.fetch(
    new Request("http://localhost/api/pilot/presenca", {
      headers: { cookie: otherCookie },
    }),
    env,
    context,
  );
  assert.equal(otherPresence.status, 200);
  assert.deepEqual(
    (await otherPresence.json()).people.map((person) => person.name),
    ["Outra Comunidade"],
  );

  const anonymous = await worker.fetch(
    new Request("http://localhost/api/pilot/presenca"),
    env,
    context,
  );
  assert.equal(anonymous.status, 401);
  database.close();
});

test("proprietário tem acesso integral em todas as comunidades", async () => {
  const { database, d1 } = await createPilotD1();
  const ownerId = await createPilotUser(database, {
    nome: "Proprietário",
    email: "owner@example.test",
    senha: "Owner123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  const commonId = await createPilotUser(database, {
    nome: "Conta comum",
    email: "comum@example.test",
    senha: "Comum123",
    memberships: [],
  });
  database
    .prepare(
      "UPDATE comunidades SET proprietario_usuario_id = CASE id WHEN 1 THEN ? WHEN 2 THEN ? END WHERE id IN (1, 2)",
    )
    .run(ownerId, commonId);

  const worker = await loadWorker();
  const ownerEnv = createEnv(d1, {
    SYSTEM_OWNER_EMAIL: "owner@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z",
  });
  const ownerCookie = await login(
    worker,
    ownerEnv,
    "owner@example.test",
    "Owner123",
  );
  const ownerResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidade-ativa", {
      headers: { cookie: ownerCookie },
    }),
    ownerEnv,
    context,
  );
  assert.equal(ownerResponse.status, 200);
  const ownerData = await ownerResponse.json();
  assert.equal(ownerData.context.isOwner, true);
  assert.equal(ownerData.context.isSuperadmin, true);
  assert.equal(ownerData.context.papel, "SUPERADMIN");
  assert.equal(ownerData.context.communityAccess, "OWNER");
  assert.equal(ownerData.memberships.length, 2);
  assert.ok(ownerData.context.permissions.includes("platform.admin.view"));
  assert.ok(ownerData.context.permissions.includes("people.view"));
  const ownerSelfUpdate = await worker.fetch(
    new Request("http://localhost/api/pilot/pessoas", {
      method: "PATCH",
      headers: {
        cookie: ownerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        membershipId: ownerData.context.membershipId,
        oficial: true,
        papel: "ADMIN_COMUNIDADE",
        titulo: "PASTOR",
        permissions: [],
      }),
    }),
    ownerEnv,
    context,
  );
  assert.equal(ownerSelfUpdate.status, 200);

  const switchResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidade-ativa", {
      method: "POST",
      headers: {
        cookie: ownerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ comunidadeId: 2 }),
    }),
    ownerEnv,
    context,
  );
  assert.equal(switchResponse.status, 200);
  const activeCommunityCookie = (
    typeof switchResponse.headers.getSetCookie === "function"
      ? switchResponse.headers.getSetCookie()
      : [switchResponse.headers.get("set-cookie") || ""]
  )
    .map((value) => value.match(/__Host-vinkulo_community=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(activeCommunityCookie, "cookie da comunidade ativa ausente");
  const switchedCookies = `${ownerCookie}; ${activeCommunityCookie}`;
  const globalResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidade-ativa", {
      headers: { cookie: switchedCookies },
    }),
    ownerEnv,
    context,
  );
  assert.equal(globalResponse.status, 200);
  const global = await globalResponse.json();
  assert.equal(global.context.papel, "SUPERADMIN");
  assert.equal(global.context.communityAccess, "OWNER");
  assert.equal(global.context.isOwner, true);
  assert.ok(global.context.permissions.includes("feed.view"));
  assert.ok(global.context.permissions.includes("platform.admin.view"));
  assert.ok(global.context.permissions.includes("people.view"));
  assert.ok(global.context.permissions.includes("events.manage"));

  const feedResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/publicacoes?limit=10", {
      headers: { cookie: switchedCookies },
    }),
    ownerEnv,
    context,
  );
  assert.equal(feedResponse.status, 200);
  const eventAccess = await worker.fetch(
    new Request("http://localhost/api/pilot/eventos", {
      headers: { cookie: switchedCookies },
    }),
    ownerEnv,
    context,
  );
  assert.equal(eventAccess.status, 200);

  const commonEnv = createEnv(d1, {
    SYSTEM_OWNER_EMAIL: "comum@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2000-01-01T00:00:00.000Z",
  });
  const commonCookie = await login(
    worker,
    commonEnv,
    "comum@example.test",
    "Comum123",
  );
  const commonResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidade-ativa", {
      headers: { cookie: commonCookie },
    }),
    commonEnv,
    context,
  );
  assert.equal(commonResponse.status, 200);
  assert.equal((await commonResponse.json()).context, null);
  database.close();
});

test("Editor visual global isola camadas e valida proprietário no backend", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Membro Layout",
    email: "membro.layout@example.test",
    senha: "Layout123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const adminId = await createPilotUser(database, {
    nome: "Admin Layout",
    email: "admin.layout@example.test",
    senha: "Layout123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  database
    .prepare("UPDATE comunidades SET proprietario_usuario_id = ? WHERE id = 1")
    .run(adminId);
  await createPilotUser(database, {
    nome: "Membro Layout Sul",
    email: "sul.layout@example.test",
    senha: "Layout123",
    memberships: [{ comunidadeId: 2, papel: "MEMBRO" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const ownerEnv = createEnv(d1, {
    SYSTEM_OWNER_EMAIL: "admin.layout@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z",
  });
  const memberCookie = await login(worker, env, "membro.layout@example.test", "Layout123");
  const adminCookie = await login(worker, ownerEnv, "admin.layout@example.test", "Layout123");
  const southCookie = await login(worker, env, "sul.layout@example.test", "Layout123");

  const initial = await worker.fetch(
    new Request("http://localhost/api/pilot/editor-visual", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(initial.status, 200);
  const initialData = await initial.json();
  assert.equal(initialData.canEdit, false);
  assert.equal(initialData.canSavePlatform, false);
  const memberSaveDenied = await worker.fetch(
    new Request("http://localhost/api/pilot/editor-visual", {
      method: "PATCH",
      headers: { cookie: memberCookie, "content-type": "application/json" },
      body: JSON.stringify({
        scope: "PERSONAL",
        config: initialData.config,
      }),
    }),
    env,
    context,
  );
  assert.equal(memberSaveDenied.status, 403);

  const ownerInitial = await worker.fetch(
    new Request("http://localhost/api/pilot/editor-visual", {
      headers: { cookie: adminCookie },
    }),
    ownerEnv,
    context,
  );
  assert.equal(ownerInitial.status, 200);
  const ownerInitialData = await ownerInitial.json();
  assert.equal(ownerInitialData.canEdit, true);
  assert.equal(ownerInitialData.canSavePlatform, true);

  const save = (scope, config) =>
    worker.fetch(
      new Request("http://localhost/api/pilot/editor-visual", {
        method: "PATCH",
        headers: { cookie: adminCookie, "content-type": "application/json" },
        body: JSON.stringify({ scope, config }),
      }),
      ownerEnv,
      context,
    );
  const personalSave = await save("PERSONAL", {
    accentColor: "#123456",
    density: "compact",
    rules: {
      cabecalho: {
        text: "Cabeçalho do proprietário",
        fontSize: 22,
        imageUrl: "http://nao-permitido.example.test/imagem.png",
      },
      "chave inválida": { text: "Não persiste" },
    },
  });
  assert.equal(personalSave.status, 200);
  const storedPersonal = JSON.parse(
    database
      .prepare(
        "SELECT configuracao FROM layouts_interface WHERE comunidade_id = 1 AND escopo = ?",
      )
      .get(`visual:user:${adminId}`)
      .configuracao,
  );
  assert.equal(storedPersonal.rules.cabecalho.fontSize, 22);
  assert.equal("imageUrl" in storedPersonal.rules.cabecalho, false);
  assert.equal("chave inválida" in storedPersonal.rules, false);

  assert.equal(
    (
      await save("COMMUNITY", {
        surfaceColor: "#f2f4f8",
        rules: { "menu-lateral": { background: "#101828" } },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await save("PLATFORM", {
        accentColor: "#654df4",
        radius: 20,
        rules: { marca: { color: "#654df4" } },
        textBoxes: [
          {
            id: "text-publico",
            screen: "public:feed",
            text: "Aviso da plataforma",
            x: 12,
            y: 18,
            width: 32,
            fontSize: 18,
            color: "#172033",
            background: "#ffffff",
          },
        ],
      })
    ).status,
    200,
  );
  const publicVisual = await worker.fetch(
    new Request(
      "http://localhost/api/pilot/editor-visual?surface=public",
    ),
    ownerEnv,
    context,
  );
  assert.equal(publicVisual.status, 200);
  const publicVisualData = await publicVisual.json();
  assert.equal(publicVisualData.canEdit, false);
  assert.equal(publicVisualData.config.textBoxes[0].screen, "public:feed");

  const publicOwnerSave = await worker.fetch(
    new Request("http://localhost/api/pilot/editor-visual", {
      method: "PATCH",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({
        scope: "PLATFORM",
        surface: "public",
        config: publicVisualData.config,
      }),
    }),
    ownerEnv,
    context,
  );
  assert.equal(publicOwnerSave.status, 200);

  const south = await worker.fetch(
    new Request("http://localhost/api/pilot/editor-visual", {
      headers: { cookie: southCookie },
    }),
    env,
    context,
  );
  assert.equal(south.status, 200);
  const southData = await south.json();
  assert.equal(southData.config.accentColor, "#654df4");
  assert.equal(southData.config.rules.marca.color, "#654df4");
  assert.equal(southData.config.rules["menu-lateral"], undefined);
  assert.equal(southData.config.rules.cabecalho, undefined);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS total FROM auditoria_piloto WHERE evento = 'EDITOR_VISUAL_GLOBAL_SALVO'",
      )
      .get().total,
    4,
  );
  database.close();
});

test("Bloco 13 isola pessoas e valida oficiais e permissões no backend", async () => {
  const { database, d1 } = await createPilotD1();
  const pastorId = await createPilotUser(database, {
    nome: "Pastor Pessoas",
    email: "pastor.pessoas@example.test",
    senha: "Pastor123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  const memberId = await createPilotUser(database, {
    nome: "Membro Pessoas",
    email: "membro.pessoas@example.test",
    senha: "Membro123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  await createPilotUser(database, {
    nome: "Pessoa Outra Comunidade",
    email: "pessoa.sul@example.test",
    senha: "Pessoa123",
    memberships: [{ comunidadeId: 2, papel: "MEMBRO" }],
  });
  const pastorMembership = database
    .prepare(
      `SELECT id FROM usuario_comunidades
       WHERE usuario_id = ? AND comunidade_id = 1`,
    )
    .get(pastorId).id;
  const memberMembership = database
    .prepare(
      `SELECT id FROM usuario_comunidades
       WHERE usuario_id = ? AND comunidade_id = 1`,
    )
    .get(memberId).id;
  const southMembership = database
    .prepare(
      `SELECT id FROM usuario_comunidades
       WHERE comunidade_id = 2 AND usuario_id <> ? ORDER BY id DESC LIMIT 1`,
    )
    .get(memberId).id;

  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(
    worker,
    env,
    "pastor.pessoas@example.test",
    "Pastor123",
  );
  const listResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/pessoas", {
      headers: { cookie: pastorCookie },
    }),
    env,
    context,
  );
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.canManage, true);
  assert.ok(list.people.some((person) => person.usuario_id === memberId));
  assert.ok(
    list.people.every(
      (person) => person.nome !== "Pessoa Outra Comunidade",
    ),
  );

  const promoteResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/pessoas", {
      method: "PATCH",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        membershipId: memberMembership,
        oficial: true,
        papel: "LIDER",
        titulo: "DIÁCONO",
        permissions: ["visitors.view", "followups.view"],
      }),
    }),
    env,
    context,
  );
  assert.equal(promoteResponse.status, 200);
  const updated = database
    .prepare(
      `SELECT uc.papel,
        CASE WHEN oc.id IS NULL THEN 0 ELSE 1 END AS oficial,
        oc.titulo AS titulo_oficial, oc.permissoes
       FROM usuario_comunidades uc
       LEFT JOIN oficiais_comunidade oc
         ON oc.usuario_comunidade_id = uc.id
       WHERE uc.id = ?`,
    )
    .get(memberMembership);
  assert.equal(updated.papel, "LIDER");
  assert.equal(updated.oficial, 1);
  assert.equal(updated.titulo_oficial, "DIÁCONO");
  assert.match(updated.permissoes, /visitors\.view/);

  const selfPromotion = await worker.fetch(
    new Request("http://localhost/api/pilot/pessoas", {
      method: "PATCH",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        membershipId: pastorMembership,
        oficial: true,
        papel: "LIDER",
        titulo: "LÍDER",
        permissions: [],
      }),
    }),
    env,
    context,
  );
  assert.equal(selfPromotion.status, 409);

  const crossTenant = await worker.fetch(
    new Request("http://localhost/api/pilot/pessoas", {
      method: "PATCH",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        membershipId: southMembership,
        oficial: true,
        papel: "LIDER",
        titulo: "LÍDER",
        permissions: [],
      }),
    }),
    env,
    context,
  );
  assert.equal(crossTenant.status, 404);

  const forbiddenAdmin = await worker.fetch(
    new Request("http://localhost/api/pilot/pessoas", {
      method: "PATCH",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        membershipId: memberMembership,
        oficial: true,
        papel: "ADMIN_COMUNIDADE",
        titulo: "SECRETÁRIO",
        permissions: [],
      }),
    }),
    env,
    context,
  );
  assert.equal(forbiddenAdmin.status, 403);

  const memberCookie = await login(
    worker,
    env,
    "membro.pessoas@example.test",
    "Membro123",
  );
  const profileResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/pessoas/perfil", {
      method: "PATCH",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        telefone: "(47) 99999-0000",
        dataNascimento: "2002-08-29",
        endereco: "Endereço fictício",
        celula: "Célula fictícia",
        ministerio: "Recepção",
      }),
    }),
    env,
    context,
  );
  assert.equal(profileResponse.status, 200);
  assert.equal(
    database.prepare("SELECT telefone FROM usuarios WHERE id = ?").get(memberId)
      .telefone,
    "(47) 99999-0000",
  );
  const unauthorizedManagement = await worker.fetch(
    new Request("http://localhost/api/pilot/pessoas", {
      method: "PATCH",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        membershipId: memberMembership,
        oficial: false,
      }),
    }),
    env,
    context,
  );
  assert.equal(unauthorizedManagement.status, 403);
  assert.equal(
    database
      .prepare(
        `SELECT count(*) AS total FROM auditoria_piloto
         WHERE evento IN (
           'OFICIAL_COMUNIDADE_ATUALIZADO',
           'PERFIL_PROPRIO_ATUALIZADO'
         )`,
      )
      .get().total,
    2,
  );
  database.close();
});

test("feed interno pagina por cursor e o feed público agregado permanece desativado", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Membro Feed Paginado",
    email: "membro.paginado@example.test",
    senha: "Membro123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const insert = database.prepare(
    `INSERT INTO publicacoes_piloto
      (comunidade_id, titulo, resumo, conteudo, categoria, visibilidade,
       status, origem, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, 'COMUNIDADE', 'PLATAFORMA', 'PUBLICADA',
       'COMUNIDADE', ?, ?)`,
  );
  for (let index = 0; index < 25; index += 1) {
    const timestamp = new Date(
      Date.UTC(2026, 6, 28, 12, 0, 0) - index * 60_000,
    ).toISOString();
    insert.run(
      1,
      `Publicação paginada ${index}`,
      `Resumo ${index}`,
      `Conteúdo fictício ${index}`,
      timestamp,
      timestamp,
    );
  }
  insert.run(
    2,
    "Publicação exclusiva Sul",
    "Não pode cruzar tenant",
    "Conteúdo Sul",
    "2026-07-28T13:00:00.000Z",
    "2026-07-28T13:00:00.000Z",
  );

  const worker = await loadWorker();
  const env = createEnv(d1);
  const cookie = await login(
    worker,
    env,
    "membro.paginado@example.test",
    "Membro123",
  );
  const firstResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/publicacoes?limit=10", {
      headers: { cookie },
    }),
    env,
    context,
  );
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.publicacoes.length, 10);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);
  assert.ok(
    first.publicacoes.every(
      (post) => post.titulo !== "Publicação exclusiva Sul",
    ),
  );

  const secondResponse = await worker.fetch(
    new Request(
      `http://localhost/api/pilot/publicacoes?limit=10&cursor=${encodeURIComponent(first.nextCursor)}`,
      { headers: { cookie } },
    ),
    env,
    context,
  );
  assert.equal(secondResponse.status, 200);
  const second = await secondResponse.json();
  assert.equal(second.publicacoes.length, 10);
  const firstIds = new Set(first.publicacoes.map((post) => post.id));
  assert.ok(second.publicacoes.every((post) => !firstIds.has(post.id)));

  const publicResponse = await worker.fetch(
    new Request("http://localhost/api/feed/publico?limit=10"),
    env,
    context,
  );
  assert.equal(publicResponse.status, 410);
  assert.match((await publicResponse.json()).error, /encerrado/i);

  const invalidCursor = await worker.fetch(
    new Request("http://localhost/api/feed/publico?cursor=invalido"),
    env,
    context,
  );
  assert.equal(invalidCursor.status, 410);
  database.close();
});

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
  const sessionCookie = setCookies
    .map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(sessionCookie, "cookie de sessão ausente");
  return sessionCookie;
}

test("páginas públicas dinâmicas exibem somente comunidades autorizadas", async () => {
  const { database, d1 } = await createPilotD1();
  const worker = await loadWorker();
  const env = createEnv(d1);
  const listResponse = await worker.fetch(
    new Request("http://localhost/comunidades", {
      headers: { accept: "text/html" },
    }),
    env,
    context,
  );
  assert.equal(listResponse.status, 200);
  const listHtml = await listResponse.text();
  assert.match(listHtml, /Comunidade Piloto Norte/);
  assert.match(listHtml, /Comunidade Piloto Sul/);
  assert.match(listHtml, /VÍNKULO/i);

  const detailResponse = await worker.fetch(
    new Request(
      "http://localhost/comunidades/comunidade-piloto-norte",
      { headers: { accept: "text/html" } },
    ),
    env,
    context,
  );
  assert.equal(detailResponse.status, 200);
  const detailHtml = await detailResponse.text();
  assert.match(detailHtml, /Comunidade Piloto Norte/);
  assert.doesNotMatch(detailHtml, /Comunidade Piloto Sul/);
  database.close();
});

test("redes V4.5 exigem flags, isolam unidades e não processam cobrança", async () => {
  const { database, d1 } = await createPilotD1();
  const superId = await createPilotUser(database, {
    nome: "Superadmin de Redes",
    email: "super.redes@example.test",
    senha: "Redes123",
    perfil: "ADMIN",
    memberships: [
      { comunidadeId: 1, papel: "ADMIN_COMUNIDADE" },
      { comunidadeId: 2, papel: "ADMIN_COMUNIDADE" },
    ],
  });
  const northOnlyId = await createPilotUser(database, {
    nome: "Responsável Norte",
    email: "norte.redes@example.test",
    senha: "Redes123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const southManagerId = await createPilotUser(database, {
    nome: "Gestora Sul",
    email: "sul.redes@example.test",
    senha: "Redes123",
    memberships: [{ comunidadeId: 2, papel: "MEMBRO" }],
  });
  await createPilotUser(database, {
    nome: "Pessoa sem Rede",
    email: "fora.redes@example.test",
    senha: "Redes123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });

  const worker = await loadWorker();
  const env = createEnv(d1);
  const superCookie = await login(
    worker,
    env,
    "super.redes@example.test",
    "Redes123",
  );

  const blocked = await worker.fetch(
    new Request("http://localhost/api/pilot/redes", {
      headers: { cookie: superCookie },
    }),
    env,
    context,
  );
  assert.equal(blocked.status, 404);

  const featureAction = (body) =>
    worker.fetch(
      new Request("http://localhost/api/pilot/feature-flags", {
        method: "PATCH",
        headers: {
          cookie: superCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      env,
      context,
    );
  const wrongPassword = await featureAction({
    enabled: true,
    affiliateCreationEnabled: false,
    scopeType: "GLOBAL",
    scopeId: 0,
    confirmation: "REDES",
    reason: "Início controlado do módulo",
    password: "SenhaErrada123",
  });
  assert.equal(wrongPassword.status, 401);

  const enableNetwork = await featureAction({
    enabled: true,
    affiliateCreationEnabled: false,
    scopeType: "GLOBAL",
    scopeId: 0,
    confirmation: "REDES",
    reason: "Início controlado do módulo",
    password: "Redes123",
  });
  assert.equal(enableNetwork.status, 200);
  assert.equal((await enableNetwork.json()).enabled, true);

  const createNetwork = await worker.fetch(
    new Request("http://localhost/api/pilot/redes", {
      method: "POST",
      headers: {
        cookie: superCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "CRIAR_REDE",
        nome: "Rede Piloto V4.5",
        comunidadeMaeId: 1,
      }),
    }),
    env,
    context,
  );
  assert.equal(createNetwork.status, 201);
  const networkId = Number((await createNetwork.json()).id);
  const headquarters = database
    .prepare(
      `SELECT tipo, status, comunidade_id
       FROM rede_unidades WHERE rede_id = ?`,
    )
    .get(networkId);
  assert.equal(headquarters.tipo, "SEDE");
  assert.equal(headquarters.status, "AGUARDANDO_RESPONSAVEL");
  assert.equal(headquarters.comunidade_id, 1);

  const networkAction = (body) =>
    worker.fetch(
      new Request("http://localhost/api/pilot/redes", {
        method: "POST",
        headers: {
          cookie: superCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      env,
      context,
    );

  const blockedAffiliate = await networkAction({
    action: "VINCULAR_UNIDADE",
    redeId: networkId,
    comunidadeId: 2,
    tipo: "AFILIADA",
    regiao: "Sul",
  });
  assert.equal(blockedAffiliate.status, 423);

  const enableAffiliates = await featureAction({
    enabled: true,
    affiliateCreationEnabled: true,
    scopeType: "GLOBAL",
    scopeId: 0,
    confirmation: "REDES",
    reason: "Homologação da criação de afiliadas",
    password: "Redes123",
  });
  assert.equal(enableAffiliates.status, 200);
  const createAffiliate = await networkAction({
    action: "VINCULAR_UNIDADE",
    redeId: networkId,
    comunidadeId: 2,
    tipo: "AFILIADA",
    regiao: "Sul",
  });
  assert.equal(createAffiliate.status, 201);
  const affiliateId = Number((await createAffiliate.json()).id);

  const wrongUnitOwner = await networkAction({
    action: "DEFINIR_RESPONSAVEL",
    redeId: networkId,
    unidadeId: affiliateId,
    responsavelUsuarioId: northOnlyId,
    status: "ATIVA",
    restricaoNivel: 0,
  });
  assert.equal(wrongUnitOwner.status, 409);

  const assignOwner = await networkAction({
    action: "DEFINIR_RESPONSAVEL",
    redeId: networkId,
    unidadeId: affiliateId,
    responsavelUsuarioId: southManagerId,
    status: "ATIVA",
    restricaoNivel: 0,
  });
  assert.equal(assignOwner.status, 200);

  const addManager = await networkAction({
    action: "ADICIONAR_GESTOR",
    redeId: networkId,
    usuarioId: southManagerId,
    papel: "REGIONAL_SUPERVISOR",
    regiao: "Sul",
  });
  assert.equal(addManager.status, 200);

  const createPlan = await networkAction({
    action: "SALVAR_PLANO",
    nome: "Rede Inicial",
    limiteAfiliadas: 3,
    valorFuturoCentavos: 12990,
  });
  assert.equal(createPlan.status, 201);
  const planBody = await createPlan.json();
  assert.equal(planBody.paymentProcessed, false);

  const commercial = await networkAction({
    action: "ATUALIZAR_COMERCIAL",
    redeId: networkId,
    planoId: planBody.id,
    limiteAfiliadas: 3,
    valorFuturoCentavos: 12990,
    isenta: false,
    statusComercial: "EM_TESTE",
  });
  assert.equal(commercial.status, 200);
  assert.equal((await commercial.json()).paymentProcessed, false);
  const commercialRow = database
    .prepare(
      `SELECT limite_afiliadas, valor_futuro_centavos, status_comercial
       FROM redes_igrejas WHERE id = ?`,
    )
    .get(networkId);
  assert.equal(commercialRow.limite_afiliadas, 3);
  assert.equal(commercialRow.valor_futuro_centavos, 12990);
  assert.equal(commercialRow.status_comercial, "EM_TESTE");
  assert.equal(
    database
      .prepare("SELECT plano_id FROM redes_igrejas WHERE id = ?")
      .get(networkId).plano_id,
    planBody.id,
  );

  const managerCookie = await login(
    worker,
    env,
    "sul.redes@example.test",
    "Redes123",
  );
  const managerResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/redes", {
      headers: { cookie: managerCookie },
    }),
    env,
    context,
  );
  assert.equal(managerResponse.status, 200);
  const managerData = await managerResponse.json();
  assert.equal(managerData.redes.length, 1);
  assert.equal(managerData.redes[0].id, networkId);

  const outsiderCookie = await login(
    worker,
    env,
    "fora.redes@example.test",
    "Redes123",
  );
  const outsiderResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/redes", {
      headers: { cookie: outsiderCookie },
    }),
    env,
    context,
  );
  assert.equal(outsiderResponse.status, 403);

  database
    .prepare(
      `UPDATE feature_flags SET enabled = 0
       WHERE flag_key = 'network_module_enabled'
         AND scope_type = 'GLOBAL' AND scope_id = 0`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO feature_flags
       (flag_key, scope_type, scope_id, enabled, alterado_por)
       VALUES ('network_module_enabled', 'NETWORK', ?, 1, ?)`,
    )
    .run(networkId, superId);
  const networkScopedResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/redes", {
      headers: { cookie: managerCookie },
    }),
    env,
    context,
  );
  assert.equal(networkScopedResponse.status, 200);

  assert.deepEqual(
    database
      .prepare(
        `SELECT evento FROM auditoria_piloto
         WHERE evento LIKE 'REDE_V45_%' ORDER BY id`,
      )
      .all()
      .map((item) => item.evento),
    [
      "REDE_V45_CRIADA",
      "REDE_V45_UNIDADE_VINCULADA",
      "REDE_V45_UNIDADE_ATUALIZADA",
      "REDE_V45_GESTOR_ADICIONADO",
      "REDE_V45_PLANO_CRIADO",
      "REDE_V45_COMERCIAL_PREPARADO",
    ],
  );
  database.close();
});

test("continuidade V4.5 protege solicitações, tenants e decisões críticas", async () => {
  const { database, d1 } = await createPilotD1();
  const northOwnerId = await createPilotUser(database, {
    nome: "Dono Norte",
    email: "dono.norte.continuidade@example.test",
    senha: "Continuidade123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const southOwnerId = await createPilotUser(database, {
    nome: "Dona Sul",
    email: "dona.sul.continuidade@example.test",
    senha: "Continuidade123",
    memberships: [{ comunidadeId: 2, papel: "MEMBRO" }],
  });
  const pastorId = await createPilotUser(database, {
    nome: "Pastor Norte",
    email: "pastor.continuidade@example.test",
    senha: "Continuidade123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  const pastorMembershipId = Number(
    database
      .prepare(
        `SELECT id FROM usuario_comunidades
         WHERE usuario_id = ? AND comunidade_id = 1`,
      )
      .get(pastorId).id,
  );
  database
    .prepare(
      `INSERT INTO oficiais_comunidade
       (usuario_comunidade_id, titulo, permissoes, atualizado_por)
       VALUES (?, 'PASTOR', 'community.lifecycle.request', ?)`,
    )
    .run(pastorMembershipId, pastorId);
  await createPilotUser(database, {
    nome: "Membro Norte",
    email: "membro.continuidade@example.test",
    senha: "Continuidade123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  await createPilotUser(database, {
    nome: "Suporte Vínkulo",
    email: "suporte.continuidade@example.test",
    senha: "Continuidade123",
    perfil: "ADMIN",
    memberships: [
      { comunidadeId: 1, papel: "ADMIN_COMUNIDADE" },
      { comunidadeId: 2, papel: "ADMIN_COMUNIDADE" },
    ],
  });
  database
    .prepare(
      `UPDATE comunidades
       SET proprietario_usuario_id = CASE id WHEN 1 THEN ? WHEN 2 THEN ? END
       WHERE id IN (1, 2)`,
    )
    .run(northOwnerId, southOwnerId);

  const worker = await loadWorker();
  const env = createEnv(d1, {
    SYSTEM_OWNER_EMAIL: "suporte.continuidade@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z",
  });
  const ownerCookie = await login(
    worker,
    env,
    "dono.norte.continuidade@example.test",
    "Continuidade123",
  );
  const pastorCookie = await login(
    worker,
    env,
    "pastor.continuidade@example.test",
    "Continuidade123",
  );
  const southCookie = await login(
    worker,
    env,
    "dona.sul.continuidade@example.test",
    "Continuidade123",
  );
  const memberCookie = await login(
    worker,
    env,
    "membro.continuidade@example.test",
    "Continuidade123",
  );
  const supportCookie = await login(
    worker,
    env,
    "suporte.continuidade@example.test",
    "Continuidade123",
  );

  const endpoint = "http://localhost/api/pilot/continuidade";
  const action = (cookie, body) =>
    worker.fetch(
      new Request(endpoint, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      env,
      context,
    );

  const memberDenied = await worker.fetch(
    new Request(endpoint, { headers: { cookie: memberCookie } }),
    env,
    context,
  );
  assert.equal(memberDenied.status, 403);

  const pastorDenied = await worker.fetch(
    new Request(endpoint, { headers: { cookie: pastorCookie } }),
    env,
    context,
  );
  assert.equal(pastorDenied.status, 403);

  const evidenceDenied = await action(ownerCookie, {
    action: "CRIAR_SOLICITACAO",
    type: "CANCELAMENTO",
    category: "SEGURANCA",
    reason: "Solicitação de teste",
    description:
      "Descrição fictícia suficientemente longa para validar o fluxo protegido.",
    confirmation: "SOLICITAR",
    password: "Continuidade123",
  });
  assert.equal(evidenceDenied.status, 400);

  const wrongPassword = await action(ownerCookie, {
    action: "CRIAR_SOLICITACAO",
    type: "CANCELAMENTO",
    category: "SEM_USO",
    reason: "Comunidade sem uso",
    description:
      "Descrição fictícia suficientemente longa para validar o fluxo protegido.",
    confirmation: "SOLICITAR",
    password: "SenhaIncorreta123",
  });
  assert.equal(wrongPassword.status, 401);

  const created = await action(ownerCookie, {
    action: "CRIAR_SOLICITACAO",
    type: "CANCELAMENTO",
    category: "SEM_USO",
    reason: "Comunidade sem uso",
    description:
      "Descrição fictícia suficientemente longa para validar o fluxo protegido.",
    confirmation: "SOLICITAR",
    password: "Continuidade123",
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.status, "CANCELAMENTO_SOLICITADO");
  const requestId = Number(createdBody.id);

  const duplicate = await action(ownerCookie, {
    action: "CRIAR_SOLICITACAO",
    type: "DESATIVACAO",
    category: "SEM_USO",
    reason: "Segunda solicitação",
    description:
      "Descrição fictícia suficientemente longa para validar o fluxo protegido.",
    confirmation: "SOLICITAR",
    password: "Continuidade123",
  });
  assert.equal(duplicate.status, 409);

  const northList = await worker.fetch(
    new Request(endpoint, { headers: { cookie: ownerCookie } }),
    env,
    context,
  );
  assert.equal(northList.status, 200);
  const northBody = await northList.json();
  assert.equal(northBody.requests.length, 1);
  assert.equal(northBody.requests[0].communityId, 1);
  assert.equal(northBody.permanentDeletionAvailable, false);
  assert.equal(northBody.mfa.available, false);

  const southList = await worker.fetch(
    new Request(endpoint, { headers: { cookie: southCookie } }),
    env,
    context,
  );
  assert.equal(southList.status, 200);
  assert.equal((await southList.json()).requests.length, 0);

  const analysis = await action(supportCookie, {
    action: "INICIAR_ANALISE",
    requestId,
    reviewReason: "Conferência inicial feita pelo suporte responsável.",
  });
  assert.equal(analysis.status, 200);
  assert.equal((await analysis.json()).status, "EM_ANALISE");

  const approvalBlocked = await action(supportCookie, {
    action: "APROVAR",
    requestId,
    reviewReason: "Aprovação crítica aguardando o segundo fator.",
  });
  assert.equal(approvalBlocked.status, 423);
  assert.equal((await approvalBlocked.json()).externalDependency, true);

  const deleteBlocked = await worker.fetch(
    new Request(endpoint, {
      method: "DELETE",
      headers: { cookie: ownerCookie },
    }),
    env,
    context,
  );
  assert.equal(deleteBlocked.status, 405);
  assert.equal((await deleteBlocked.json()).permanentDeletionAvailable, false);

  const requestRow = database
    .prepare(
      `SELECT status, decisao, senha_reconfirmada, mfa_status
       FROM solicitacoes_ciclo_comunidade WHERE id = ?`,
    )
    .get(requestId);
  assert.equal(requestRow.status, "EM_ANALISE");
  assert.equal(requestRow.decisao, "PENDENTE");
  assert.equal(requestRow.senha_reconfirmada, 1);
  assert.equal(requestRow.mfa_status, "PENDENTE_EXTERNO");
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS total FROM auditoria_piloto
         WHERE comunidade_id = 1 AND evento LIKE 'CONTINUIDADE_%'`,
      )
      .get().total >= 3,
    true,
  );
  database.close();
});

test("cadastro público cria conta sem vínculo e login encaminha para comunidades", async () => {
  const { database, d1 } = await createPilotD1();
  const worker = await loadWorker();
  const env = createEnv(d1);
  const signupResponse = await worker.fetch(
    new Request("http://localhost/api/auth/cadastro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "Visitante Público Fictício",
        email: "visitante.publico@example.test",
        cadastro_telefone: "(00) 90000-0000",
        cadastro_cep: "00000-000",
        cadastro_numero: "42",
        senha: "Visitante123",
        confirmarSenha: "Visitante123",
        aceiteTermos: true,
      }),
    }),
    env,
    context,
  );
  assert.equal(signupResponse.status, 201);
  const signupBody = await signupResponse.json();
  assert.equal(signupBody.membershipCreated, false);
  const user = database
    .prepare(
      `SELECT u.id, u.perfil, u.telefone, u.cadastro_dados,
        (SELECT count(*) FROM usuario_comunidades uc WHERE uc.usuario_id = u.id) AS memberships
      FROM usuarios u WHERE u.email = ?`,
    )
    .get("visitante.publico@example.test");
  assert.equal(user.perfil, "LEITURA");
  assert.equal(user.memberships, 0);
  assert.equal(user.telefone, "(00) 90000-0000");
  assert.deepEqual(JSON.parse(user.cadastro_dados), {
    telefone: {
      label: "Telefone ou WhatsApp",
      value: "(00) 90000-0000",
    },
    cep: { label: "CEP", value: "00000-000" },
    numero: { label: "Número", value: "42" },
  });

  const loginResponse = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "visitante.publico@example.test",
        senha: "Visitante123",
      }),
    }),
    env,
    context,
  );
  assert.equal(loginResponse.status, 303);
  assert.equal(
    new URL(loginResponse.headers.get("location")).pathname,
    "/comunidades",
  );
  assert.equal(
    new URL(loginResponse.headers.get("location")).searchParams.get("conta"),
    "ativa",
  );
  database.close();
});

test("dados de cadastro são consultáveis somente pelo SuperAdmin e nunca expõem credenciais", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Superadmin Fictício",
    email: "superadmin.cadastro@example.test",
    senha: "Piloto123",
    perfil: "ADMIN",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  await createPilotUser(database, {
    nome: "Membro Fictício",
    email: "membro.cadastro@example.test",
    senha: "Piloto123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  database
    .prepare(
      `UPDATE usuarios SET cadastro_dados = ?, telefone = ?
       WHERE email = ?`,
    )
    .run(
      JSON.stringify({
        cep: { label: "CEP", value: "00000-000" },
      }),
      "(00) 90000-0000",
      "membro.cadastro@example.test",
    );
  const worker = await loadWorker();
  const env = createEnv(d1);
  const adminCookie = await login(
    worker,
    env,
    "superadmin.cadastro@example.test",
    "Piloto123",
  );
  const adminResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/usuarios-cadastro", {
      headers: { cookie: adminCookie },
    }),
    env,
    context,
  );
  assert.equal(adminResponse.status, 200);
  const adminBody = await adminResponse.json();
  assert.equal(adminBody.accounts.length, 2);
  assert.equal(
    JSON.stringify(adminBody).includes("senha_hash"),
    false,
  );
  assert.equal(
    JSON.stringify(adminBody).includes("senha_salt"),
    false,
  );

  const memberCookie = await login(
    worker,
    env,
    "membro.cadastro@example.test",
    "Piloto123",
  );
  const memberResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/usuarios-cadastro", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(memberResponse.status, 403);
  database.close();
});

test("sessão, tenant e gates críticos são validados no backend", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Administrador Fictício",
    email: "admin.piloto@example.test",
    senha: "Piloto123",
    perfil: "ADMIN",
    memberships: [
      { comunidadeId: 1, papel: "ADMIN_COMUNIDADE" },
      { comunidadeId: 2, papel: "ADMIN_COMUNIDADE" },
    ],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const sessionCookie = await login(
    worker,
    env,
    "admin.piloto@example.test",
    "Piloto123",
  );

  const northResponse = await worker.fetch(
    new Request("http://localhost/painel", {
      headers: { accept: "text/html", cookie: sessionCookie },
    }),
    env,
    context,
  );
  assert.equal(northResponse.status, 200);
  const northHtml = await northResponse.text();
  assert.match(northHtml, /Bem-vindo ao ambiente Norte/);
  assert.doesNotMatch(northHtml, /Bem-vindo ao ambiente Sul/);

  const legacyResponse = await worker.fetch(
    new Request("http://localhost/api/visitantes", {
      headers: { cookie: sessionCookie },
    }),
    env,
    context,
  );
  assert.equal(legacyResponse.status, 423);

  const flagsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/feature-flags", {
      headers: { cookie: sessionCookie },
    }),
    env,
    context,
  );
  assert.equal(flagsResponse.status, 200);
  const flags = await flagsResponse.json();
  assert.equal(flags.networkModuleEnabled, false);
  assert.equal(flags.affiliateCreationEnabled, false);
  assert.equal(flags.paymentsEnabled, false);
  assert.equal(flags.aiAutoPublishEnabled, false);
  assert.equal(flags.aiEditorialMode, "COM_REVISAO");

  const networkResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/redes", {
      headers: { cookie: sessionCookie },
    }),
    env,
    context,
  );
  assert.equal(networkResponse.status, 404);

  const editorialResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial", {
      headers: { cookie: sessionCookie },
    }),
    env,
    context,
  );
  assert.equal(editorialResponse.status, 200);
  const editorial = await editorialResponse.json();
  assert.equal(editorial.config.mode, "COM_REVISAO");
  assert.equal(editorial.safeguards.autoPublish, false);

  const switchResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidade-ativa", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ comunidadeId: 2 }),
    }),
    env,
    context,
  );
  assert.equal(switchResponse.status, 200);
  const activeCommunityCookie = (
    typeof switchResponse.headers.getSetCookie === "function"
      ? switchResponse.headers.getSetCookie()
      : [switchResponse.headers.get("set-cookie") || ""]
  )
    .map((value) => value.match(/__Host-vinkulo_community=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(activeCommunityCookie, "cookie da comunidade ativa ausente");
  const switchedCookies = `${sessionCookie}; ${activeCommunityCookie}`;

  const southResponse = await worker.fetch(
    new Request("http://localhost/painel", {
      headers: { accept: "text/html", cookie: switchedCookies },
    }),
    env,
    context,
  );
  assert.equal(southResponse.status, 200);
  const southHtml = await southResponse.text();
  assert.match(southHtml, /Bem-vindo ao ambiente Sul/);
  assert.doesNotMatch(southHtml, /Bem-vindo ao ambiente Norte/);

  const forbiddenSwitch = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidade-ativa", {
      method: "POST",
      headers: {
        cookie: switchedCookies,
        "content-type": "application/json",
      },
      body: JSON.stringify({ comunidadeId: 999 }),
    }),
    env,
    context,
  );
  assert.equal(forbiddenSwitch.status, 403);

  const logoutResponse = await worker.fetch(
    new Request("http://localhost/api/auth/logout", {
      headers: { cookie: switchedCookies },
    }),
    env,
    context,
  );
  assert.equal(logoutResponse.status, 307);
  const revokedResponse = await worker.fetch(
    new Request("http://localhost/painel", {
      headers: { accept: "text/html", cookie: switchedCookies },
    }),
    env,
    context,
  );
  assert.equal(revokedResponse.status, 307);
  assert.match(
    revokedResponse.headers.get("location") || "",
    /motivo=sessao_invalida/,
  );
  database.close();
});

test("convite de membro é persistente, individual e de uso único", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Administrador de Convites",
    email: "convites.admin@example.test",
    senha: "Convites123",
    perfil: "ADMIN",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const adminCookie = await login(
    worker,
    env,
    "convites.admin@example.test",
    "Convites123",
  );
  const inviteResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/convites", {
      method: "POST",
      headers: {
        cookie: adminCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "pessoa.convidada@example.test",
        papel: "MEMBRO",
      }),
    }),
    env,
    context,
  );
  assert.equal(inviteResponse.status, 201);
  const invite = await inviteResponse.json();
  const inviteUrl = new URL(invite.inviteUrl);
  const token = inviteUrl.pathname.split("/").pop();
  assert.ok(token && token.length >= 64);

  const invitePageResponse = await worker.fetch(
    new Request(`http://localhost/convite/${token}`, {
      headers: { accept: "text/html" },
    }),
    env,
    context,
  );
  assert.equal(invitePageResponse.status, 200);
  const inviteHtml = await invitePageResponse.text();
  assert.match(inviteHtml, /Comunidade Piloto Norte/);
  assert.doesNotMatch(inviteHtml, /pessoa\.convidada@example\.test/);

  const acceptanceResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/convites/aceitar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        nome: "Pessoa Convidada",
        email: "pessoa.convidada@example.test",
        senha: "Convite123",
      }),
    }),
    env,
    context,
  );
  assert.equal(acceptanceResponse.status, 200);
  const acceptedCookies =
    typeof acceptanceResponse.headers.getSetCookie === "function"
      ? acceptanceResponse.headers.getSetCookie()
      : [acceptanceResponse.headers.get("set-cookie") || ""];
  const memberCookie = acceptedCookies
    .map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(memberCookie, "sessão do membro convidado ausente");
  const membership = database
    .prepare(
      `SELECT uc.comunidade_id, uc.papel, uc.status
      FROM usuario_comunidades uc
      JOIN usuarios u ON u.id = uc.usuario_id
      WHERE u.email = ?`,
    )
    .get("pessoa.convidada@example.test");
  assert.deepEqual(
    [membership.comunidade_id, membership.papel, membership.status],
    [1, "MEMBRO", "ATIVO"],
  );

  const memberPanel = await worker.fetch(
    new Request("http://localhost/painel", {
      headers: { accept: "text/html", cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(memberPanel.status, 200);
  assert.match(await memberPanel.text(), /Bem-vindo ao ambiente Norte/);

  const replayResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/convites/aceitar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        nome: "Pessoa Convidada",
        email: "pessoa.convidada@example.test",
        senha: "Convite123",
      }),
    }),
    env,
    context,
  );
  assert.equal(replayResponse.status, 404);
  database.close();
});

test("perfil de membro não acessa controles da plataforma", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Membro Fictício",
    email: "membro.piloto@example.test",
    senha: "Membro123",
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const sessionCookie = await login(
    worker,
    env,
    "membro.piloto@example.test",
    "Membro123",
  );
  const flagsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/feature-flags", {
      headers: { cookie: sessionCookie },
    }),
    env,
    context,
  );
  assert.equal(flagsResponse.status, 403);
  const invitesResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/convites", {
      headers: { cookie: sessionCookie },
    }),
    env,
    context,
  );
  assert.equal(invitesResponse.status, 403);
  database.close();
});

test("visitantes, acompanhamentos e células ficam isolados por comunidade", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Pastor Fictício",
    email: "pastor.operacoes@example.test",
    senha: "Operacoes123",
    perfil: "ACOMPANHANTE",
    memberships: [
      { comunidadeId: 1, papel: "PASTOR" },
      { comunidadeId: 2, papel: "PASTOR" },
    ],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const sessionCookie = await login(
    worker,
    env,
    "pastor.operacoes@example.test",
    "Operacoes123",
  );

  const northCellResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/celulas", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        nome: "Célula Horizonte",
        responsavel: "Líder Fictício Norte",
      }),
    }),
    env,
    context,
  );
  assert.equal(northCellResponse.status, 201);
  const northCell = await northCellResponse.json();

  const northVisitorResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/visitantes", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        nomeCompleto: "Visitante Fictício Norte",
        dataNascimento: "2000-05-10",
        telefone: "(00) 90000-0001",
        email: "visitante.norte@example.test",
        endereco: "Endereço fictício, 100",
        acompanhante: "Recepcionista Fictício",
        encontroComDeus: true,
        cursoMembros: false,
        ministerio: "Recepção",
        batizado: "NAO_INFORMADO",
        status: "NOVO",
        dataEntrada: "2026-07-25",
        celulaId: northCell.id,
      }),
    }),
    env,
    context,
  );
  assert.equal(northVisitorResponse.status, 201);
  const northVisitor = await northVisitorResponse.json();
  const storedVisitor = database
    .prepare(
      `SELECT data_nascimento, endereco, acompanhante, encontro_com_deus,
        curso_membros, ministerio
      FROM visitantes WHERE id = ? AND comunidade_id = 1`,
    )
    .get(northVisitor.id);
  assert.deepEqual({ ...storedVisitor }, {
    data_nascimento: "2000-05-10",
    endereco: "Endereço fictício, 100",
    acompanhante: "Recepcionista Fictício",
    encontro_com_deus: 1,
    curso_membros: 0,
    ministerio: "Recepção",
  });

  const followupResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/acompanhamentos", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        visitanteId: northVisitor.id,
        tipo: "TELEFONE",
        resultado: "Contato fictício concluído",
      }),
    }),
    env,
    context,
  );
  assert.equal(followupResponse.status, 201);

  const switchResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidade-ativa", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ comunidadeId: 2 }),
    }),
    env,
    context,
  );
  assert.equal(switchResponse.status, 200);
  const communityCookie = (
    typeof switchResponse.headers.getSetCookie === "function"
      ? switchResponse.headers.getSetCookie()
      : [switchResponse.headers.get("set-cookie") || ""]
  )
    .map((value) => value.match(/__Host-vinkulo_community=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(communityCookie);
  const southCookies = `${sessionCookie}; ${communityCookie}`;

  const southVisitorsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/visitantes", {
      headers: { cookie: southCookies },
    }),
    env,
    context,
  );
  assert.equal(southVisitorsResponse.status, 200);
  assert.deepEqual((await southVisitorsResponse.json()).visitantes, []);

  const southCellsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/celulas", {
      headers: { cookie: southCookies },
    }),
    env,
    context,
  );
  assert.equal(southCellsResponse.status, 200);
  assert.deepEqual((await southCellsResponse.json()).celulas, []);

  const crossTenantEdit = await worker.fetch(
    new Request(
      `http://localhost/api/pilot/visitantes/${northVisitor.id}`,
      {
        method: "PATCH",
        headers: {
          cookie: southCookies,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          nomeCompleto: "Tentativa Cruzada",
          telefone: "",
          email: "",
          batizado: "NAO_INFORMADO",
          status: "INTEGRADO",
          dataEntrada: "2026-07-25",
          celulaId: null,
        }),
      },
    ),
    env,
    context,
  );
  assert.equal(crossTenantEdit.status, 404);

  const crossTenantFollowup = await worker.fetch(
    new Request("http://localhost/api/pilot/acompanhamentos", {
      method: "POST",
      headers: {
        cookie: southCookies,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        visitanteId: northVisitor.id,
        tipo: "TELEFONE",
        resultado: "Tentativa cruzada",
      }),
    }),
    env,
    context,
  );
  assert.equal(crossTenantFollowup.status, 404);

  const southCellResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/celulas", {
      method: "POST",
      headers: {
        cookie: southCookies,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        nome: "Célula Horizonte",
        responsavel: "Líder Fictício Sul",
      }),
    }),
    env,
    context,
  );
  assert.equal(southCellResponse.status, 201);

  const auditRows = database
    .prepare(
      `SELECT comunidade_id, evento
      FROM auditoria_piloto
      WHERE evento IN (
        'CELULA_V45_CRIADA',
        'VISITANTE_V45_CRIADO',
        'ACOMPANHAMENTO_V45_CRIADO'
      )
      ORDER BY id`,
    )
    .all();
  assert.deepEqual(
    auditRows.map((row) => [row.comunidade_id, row.evento]),
    [
      [1, "CELULA_V45_CRIADA"],
      [1, "VISITANTE_V45_CRIADO"],
      [1, "ACOMPANHAMENTO_V45_CRIADO"],
      [2, "CELULA_V45_CRIADA"],
    ],
  );
  database.close();
});

test("perfis limitam operações no backend, não apenas no menu", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Líder Fictício",
    email: "lider.operacoes@example.test",
    senha: "Lider123",
    memberships: [{ comunidadeId: 1, papel: "LIDER" }],
  });
  await createPilotUser(database, {
    nome: "Membro Fictício Operacional",
    email: "membro.operacoes@example.test",
    senha: "Membro123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const leaderCookie = await login(
    worker,
    env,
    "lider.operacoes@example.test",
    "Lider123",
  );
  const memberCookie = await login(
    worker,
    env,
    "membro.operacoes@example.test",
    "Membro123",
  );

  const leaderRead = await worker.fetch(
    new Request("http://localhost/api/pilot/visitantes", {
      headers: { cookie: leaderCookie },
    }),
    env,
    context,
  );
  assert.equal(leaderRead.status, 200);
  const leaderCreateVisitor = await worker.fetch(
    new Request("http://localhost/api/pilot/visitantes", {
      method: "POST",
      headers: {
        cookie: leaderCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        nomeCompleto: "Não deve ser criado",
        dataEntrada: "2026-07-25",
      }),
    }),
    env,
    context,
  );
  assert.equal(leaderCreateVisitor.status, 403);
  const leaderCreateCell = await worker.fetch(
    new Request("http://localhost/api/pilot/celulas", {
      method: "POST",
      headers: {
        cookie: leaderCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        nome: "Não deve ser criada",
        responsavel: "Sem permissão",
      }),
    }),
    env,
    context,
  );
  assert.equal(leaderCreateCell.status, 403);
  const memberRead = await worker.fetch(
    new Request("http://localhost/api/pilot/visitantes", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(memberRead.status, 403);
  database.close();
});

test("eventos persistem, respeitam permissões e ficam isolados por comunidade", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Pastor de Agenda Fictício",
    email: "pastor.agenda@example.test",
    senha: "Agenda123",
    memberships: [
      { comunidadeId: 1, papel: "PASTOR" },
      { comunidadeId: 2, papel: "PASTOR" },
    ],
  });
  await createPilotUser(database, {
    nome: "Membro de Agenda Fictício",
    email: "membro.agenda@example.test",
    senha: "Agenda123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(
    worker,
    env,
    "pastor.agenda@example.test",
    "Agenda123",
  );
  const memberCookie = await login(
    worker,
    env,
    "membro.agenda@example.test",
    "Agenda123",
  );

  const createResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/eventos", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        titulo: "Encontro Piloto Horizonte",
        descricao: "Evento inteiramente fictício para validação.",
        categoria: "TREINAMENTO",
        iniciaEm: "2036-08-10T22:00:00.000Z",
        terminaEm: "2036-08-11T00:00:00.000Z",
        local: "Auditório fictício",
        capacidade: 20,
        publico: true,
        status: "PUBLICADO",
      }),
    }),
    env,
    context,
  );
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const draftResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/eventos", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        titulo: "Rascunho Interno Fictício",
        categoria: "OUTRO",
        iniciaEm: "2036-08-15T22:00:00.000Z",
        publico: true,
        status: "RASCUNHO",
      }),
    }),
    env,
    context,
  );
  assert.equal(draftResponse.status, 201);

  const northEventsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/eventos", {
      headers: { cookie: pastorCookie },
    }),
    env,
    context,
  );
  assert.equal(northEventsResponse.status, 200);
  const northEvents = await northEventsResponse.json();
  assert.equal(northEvents.eventos.length, 2);
  assert.equal(northEvents.canManage, true);

  const publicNorthResponse = await worker.fetch(
    new Request(
      "http://localhost/comunidades/comunidade-piloto-norte",
      { headers: { accept: "text/html" } },
    ),
    env,
    context,
  );
  assert.equal(publicNorthResponse.status, 200);
  const publicNorthHtml = await publicNorthResponse.text();
  assert.match(publicNorthHtml, /Encontro Piloto Horizonte/);
  assert.doesNotMatch(publicNorthHtml, /Rascunho Interno Fictício/);

  const memberEventsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/eventos", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(memberEventsResponse.status, 200);
  const memberEvents = await memberEventsResponse.json();
  assert.equal(memberEvents.eventos.length, 1);
  assert.equal(memberEvents.canManage, false);
  assert.equal(memberEvents.eventos[0].status, "PUBLICADO");

  const memberCreateResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/eventos", {
      method: "POST",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        titulo: "Tentativa sem permissão",
        iniciaEm: "2036-08-20T22:00:00.000Z",
      }),
    }),
    env,
    context,
  );
  assert.equal(memberCreateResponse.status, 403);

  const confirmationResponse = await worker.fetch(
    new Request(
      `http://localhost/api/pilot/eventos/${created.id}/confirmacao`,
      {
        method: "POST",
        headers: {
          cookie: memberCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "CONFIRMADO" }),
      },
    ),
    env,
    context,
  );
  assert.equal(confirmationResponse.status, 200);
  const confirmedEventsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/eventos", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  const confirmedEvents = await confirmedEventsResponse.json();
  assert.equal(confirmedEvents.eventos[0].confirmacoes, 1);
  assert.equal(
    confirmedEvents.eventos[0].minha_confirmacao,
    "CONFIRMADO",
  );

  const switchResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidade-ativa", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ comunidadeId: 2 }),
    }),
    env,
    context,
  );
  assert.equal(switchResponse.status, 200);
  const communityCookie = (
    typeof switchResponse.headers.getSetCookie === "function"
      ? switchResponse.headers.getSetCookie()
      : [switchResponse.headers.get("set-cookie") || ""]
  )
    .map((value) => value.match(/__Host-vinkulo_community=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(communityCookie);
  const southCookies = `${pastorCookie}; ${communityCookie}`;

  const southEventsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/eventos", {
      headers: { cookie: southCookies },
    }),
    env,
    context,
  );
  assert.equal(southEventsResponse.status, 200);
  assert.deepEqual((await southEventsResponse.json()).eventos, []);

  const crossTenantCancel = await worker.fetch(
    new Request(`http://localhost/api/pilot/eventos/${created.id}`, {
      method: "PATCH",
      headers: {
        cookie: southCookies,
        "content-type": "application/json",
      },
      body: JSON.stringify({ acao: "CANCELAR" }),
    }),
    env,
    context,
  );
  assert.equal(crossTenantCancel.status, 404);

  const publicSouthResponse = await worker.fetch(
    new Request(
      "http://localhost/comunidades/comunidade-piloto-sul",
      { headers: { accept: "text/html" } },
    ),
    env,
    context,
  );
  assert.equal(publicSouthResponse.status, 200);
  assert.doesNotMatch(
    await publicSouthResponse.text(),
    /Encontro Piloto Horizonte/,
  );

  const cancelResponse = await worker.fetch(
    new Request(`http://localhost/api/pilot/eventos/${created.id}`, {
      method: "PATCH",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ acao: "CANCELAR" }),
    }),
    env,
    context,
  );
  assert.equal(cancelResponse.status, 200);
  const persistedEvent = database
    .prepare(
      "SELECT comunidade_id, status FROM eventos_comunidade WHERE id = ?",
    )
    .get(created.id);
  assert.deepEqual(
    [persistedEvent.comunidade_id, persistedEvent.status],
    [1, "CANCELADO"],
  );

  const publicAfterCancelResponse = await worker.fetch(
    new Request(
      "http://localhost/comunidades/comunidade-piloto-norte",
      { headers: { accept: "text/html" } },
    ),
    env,
    context,
  );
  assert.doesNotMatch(
    await publicAfterCancelResponse.text(),
    /Encontro Piloto Horizonte/,
  );

  const auditRows = database
    .prepare(
      `SELECT comunidade_id, evento
      FROM auditoria_piloto
      WHERE evento LIKE '%EVENTO_V45%'
      ORDER BY id`,
    )
    .all();
  assert.deepEqual(
    auditRows.map((row) => [row.comunidade_id, row.evento]),
    [
      [1, "EVENTO_V45_CRIADO"],
      [1, "EVENTO_V45_CRIADO"],
      [1, "CONFIRMACAO_EVENTO_V45_ALTERADA"],
      [1, "EVENTO_V45_CANCELADO"],
    ],
  );
  database.close();
});

test("ministérios e escalas respeitam liderança, tenant e conflitos de horário", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Pastor de Equipes Fictício",
    email: "pastor.equipes@example.test",
    senha: "Equipes123",
    memberships: [
      { comunidadeId: 1, papel: "PASTOR" },
      { comunidadeId: 2, papel: "PASTOR" },
    ],
  });
  const leaderId = await createPilotUser(database, {
    nome: "Líder de Louvor Fictício",
    email: "lider.louvor@example.test",
    senha: "Equipes123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const unassignedLeaderId = await createPilotUser(database, {
    nome: "Líder Sem Escopo Fictício",
    email: "lider.sem.escopo@example.test",
    senha: "Equipes123",
    memberships: [{ comunidadeId: 1, papel: "LIDER" }],
  });
  const volunteerId = await createPilotUser(database, {
    nome: "Voluntário Fictício",
    email: "voluntario.equipes@example.test",
    senha: "Equipes123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(
    worker,
    env,
    "pastor.equipes@example.test",
    "Equipes123",
  );
  const leaderCookie = await login(
    worker,
    env,
    "lider.louvor@example.test",
    "Equipes123",
  );
  const unassignedLeaderCookie = await login(
    worker,
    env,
    "lider.sem.escopo@example.test",
    "Equipes123",
  );
  const volunteerCookie = await login(
    worker,
    env,
    "voluntario.equipes@example.test",
    "Equipes123",
  );

  const leaderMembership = database
    .prepare(
      `SELECT id FROM usuario_comunidades
       WHERE comunidade_id = 1 AND usuario_id = ?`,
    )
    .get(leaderId).id;
  const promoteLeaderResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/pessoas", {
      method: "PATCH",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        membershipId: leaderMembership,
        oficial: true,
        papel: "LIDER",
        titulo: "LÍDER",
        permissions: [],
      }),
    }),
    env,
    context,
  );
  assert.equal(promoteLeaderResponse.status, 200);

  const candidatesResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios", {
      headers: { cookie: pastorCookie },
    }),
    env,
    context,
  );
  assert.equal(candidatesResponse.status, 200);
  const candidates = await candidatesResponse.json();
  assert.equal(candidates.canCreate, true);
  assert.ok(
    candidates.availableUsers.some(
      (person) => person.id === leaderId && person.papel === "LIDER",
    ),
    JSON.stringify(candidates.availableUsers),
  );

  const createMinistryResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        nome: "Louvor Horizonte Fictício",
        descricao: "Equipe demonstrativa sem dados reais.",
        categoria: "LOUVOR",
        status: "ATIVO",
        responsavelUsuarioId: leaderId,
      }),
    }),
    env,
    context,
  );
  assert.equal(createMinistryResponse.status, 201);
  const ministry = await createMinistryResponse.json();
  const automaticLeader = database
    .prepare(
      `SELECT usuario_id, papel FROM ministerio_voluntarios
       WHERE ministerio_id = ? AND usuario_id = ?`,
    )
    .get(ministry.id, leaderId);
  assert.equal(automaticLeader.usuario_id, leaderId);
  assert.equal(automaticLeader.papel, "LIDER");

  const addLeaderResponse = await worker.fetch(
    new Request(
      `http://localhost/api/pilot/ministerios/${ministry.id}`,
      {
        method: "PATCH",
        headers: {
          cookie: pastorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          acao: "ADICIONAR_VOLUNTARIO",
          usuarioId: leaderId,
          funcao: "Liderança musical",
          papel: "LIDER",
          diasDisponiveis: ["QUA", "DOM"],
          periodoPreferido: "NOITE",
        }),
      },
    ),
    env,
    context,
  );
  assert.equal(addLeaderResponse.status, 200);

  const addVolunteerResponse = await worker.fetch(
    new Request(
      `http://localhost/api/pilot/ministerios/${ministry.id}`,
      {
        method: "PATCH",
        headers: {
          cookie: leaderCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          acao: "ADICIONAR_VOLUNTARIO",
          usuarioId: volunteerId,
          funcao: "Voz",
          papel: "VOLUNTARIO",
          diasDisponiveis: ["DOM"],
          periodoPreferido: "MANHA",
        }),
      },
    ),
    env,
    context,
  );
  assert.equal(addVolunteerResponse.status, 200);

  const leaderListResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios", {
      headers: { cookie: leaderCookie },
    }),
    env,
    context,
  );
  assert.equal(leaderListResponse.status, 200);
  const leaderList = await leaderListResponse.json();
  assert.equal(leaderList.canCreate, false);
  assert.equal(leaderList.ministerios.length, 1);
  assert.equal(leaderList.ministerios[0].can_manage, 1);
  assert.equal(leaderList.ministerios[0].voluntarios.length, 2);

  const memberMinistriesResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios", {
      headers: { cookie: volunteerCookie },
    }),
    env,
    context,
  );
  assert.equal(memberMinistriesResponse.status, 200);
  const memberMinistries = await memberMinistriesResponse.json();
  assert.equal(memberMinistries.ministerios.length, 1);
  assert.equal(memberMinistries.ministerios[0].can_manage, 0);
  assert.equal(memberMinistries.ministerios[0].voluntarios.length, 0);

  const unassignedMinistriesResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios", {
      headers: { cookie: unassignedLeaderCookie },
    }),
    env,
    context,
  );
  assert.equal(unassignedMinistriesResponse.status, 200);
  assert.deepEqual(
    (await unassignedMinistriesResponse.json()).ministerios,
    [],
  );

  const leaderCreateMinistryResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios", {
      method: "POST",
      headers: {
        cookie: leaderCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        nome: "Tentativa fora do escopo",
        categoria: "OUTRO",
      }),
    }),
    env,
    context,
  );
  assert.equal(leaderCreateMinistryResponse.status, 403);

  const unassignedUpdateResponse = await worker.fetch(
    new Request(
      `http://localhost/api/pilot/ministerios/${ministry.id}`,
      {
        method: "PATCH",
        headers: {
          cookie: unassignedLeaderCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          acao: "ATUALIZAR",
          nome: "Alteração indevida",
          categoria: "LOUVOR",
          status: "ATIVO",
        }),
      },
    ),
    env,
    context,
  );
  assert.equal(unassignedUpdateResponse.status, 403);
  assert.ok(unassignedLeaderId > 0);

  const createScheduleResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/escalas", {
      method: "POST",
      headers: {
        cookie: leaderCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ministerioId: ministry.id,
        titulo: "Escala Domingo Fictícia",
        iniciaEm: "2026-08-09T11:00:00.000Z",
        terminaEm: "2026-08-09T14:00:00.000Z",
        local: "Auditório fictício",
        status: "PUBLICADA",
      }),
    }),
    env,
    context,
  );
  assert.equal(createScheduleResponse.status, 201);
  const schedule = await createScheduleResponse.json();
  const volunteerRow = database
    .prepare(
      `SELECT id FROM ministerio_voluntarios
      WHERE ministerio_id = ? AND usuario_id = ?`,
    )
    .get(ministry.id, volunteerId);

  const teamId = Number(
    database
      .prepare(
        `INSERT INTO ministerio_equipes
         (comunidade_id, ministerio_id, nome, descricao, cor, ordem, criado_por)
         VALUES (1, ?, 'Equipe A1 Fictícia', 'Equipe usada no teste de escala.', '#7357e8', 1, ?)`,
      )
      .run(ministry.id, leaderId).lastInsertRowid,
  );
  database
    .prepare(
      `INSERT INTO ministerio_equipe_membros
       (comunidade_id, ministerio_id, equipe_id, voluntario_id)
       VALUES (1, ?, ?, ?)`,
    )
    .run(ministry.id, teamId, volunteerRow.id);
  const createTeamScheduleResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/escalas", {
      method: "POST",
      headers: {
        cookie: leaderCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ministerioId: ministry.id,
        equipeId: teamId,
        titulo: "Escala da Equipe A1 Fictícia",
        iniciaEm: "2026-08-23T11:00:00.000Z",
        terminaEm: "2026-08-23T14:00:00.000Z",
        local: "Auditório fictício",
        status: "RASCUNHO",
      }),
    }),
    env,
    context,
  );
  assert.equal(createTeamScheduleResponse.status, 201);
  const teamSchedule = await createTeamScheduleResponse.json();
  assert.equal(
    database
      .prepare("SELECT equipe_id FROM escalas_ministerio WHERE id = ?")
      .get(teamSchedule.id).equipe_id,
    teamId,
  );

  const assignResponse = await worker.fetch(
    new Request(`http://localhost/api/pilot/escalas/${schedule.id}`, {
      method: "PATCH",
      headers: {
        cookie: leaderCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "ADICIONAR_DESIGNACAO",
        voluntarioId: volunteerRow.id,
        funcao: "Voz principal",
      }),
    }),
    env,
    context,
  );
  assert.equal(assignResponse.status, 200);
  database
    .prepare(
      `INSERT INTO escalas_ministerio
      (comunidade_id, ministerio_id, titulo, inicia_em, termina_em,
       local, status, observacoes, criado_por, atualizado_por)
      VALUES (1, ?, 'Escala não atribuída', '2026-08-16T11:00:00.000Z',
        '2026-08-16T14:00:00.000Z', '', 'PUBLICADA', '', ?, ?)`,
    )
    .run(ministry.id, leaderId, leaderId);

  const memberSchedulesResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/escalas", {
      headers: { cookie: volunteerCookie },
    }),
    env,
    context,
  );
  assert.equal(memberSchedulesResponse.status, 200);
  const memberSchedules = await memberSchedulesResponse.json();
  assert.equal(memberSchedules.escalas.length, 1);
  assert.equal(memberSchedules.escalas[0].designacoes[0].is_mine, 1);
  assert.equal(memberSchedules.escalas[0].titulo, "Escala Domingo Fictícia");

  const confirmResponse = await worker.fetch(
    new Request(`http://localhost/api/pilot/escalas/${schedule.id}`, {
      method: "PATCH",
      headers: {
        cookie: volunteerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "RESPONDER",
        status: "CONFIRMADA",
      }),
    }),
    env,
    context,
  );
  assert.equal(confirmResponse.status, 200);

  const createOverlapResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/escalas", {
      method: "POST",
      headers: {
        cookie: leaderCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ministerioId: ministry.id,
        titulo: "Escala Sobreposta Fictícia",
        iniciaEm: "2026-08-09T12:00:00.000Z",
        terminaEm: "2026-08-09T15:00:00.000Z",
        status: "RASCUNHO",
      }),
    }),
    env,
    context,
  );
  assert.equal(createOverlapResponse.status, 201);
  const overlap = await createOverlapResponse.json();
  const conflictResponse = await worker.fetch(
    new Request(`http://localhost/api/pilot/escalas/${overlap.id}`, {
      method: "PATCH",
      headers: {
        cookie: leaderCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "ADICIONAR_DESIGNACAO",
        voluntarioId: volunteerRow.id,
        funcao: "Voz",
      }),
    }),
    env,
    context,
  );
  assert.equal(conflictResponse.status, 409);

  database
    .prepare(
      `UPDATE ministerio_voluntarios SET ativo = 0
      WHERE ministerio_id = ? AND usuario_id = ?`,
    )
    .run(ministry.id, leaderId);
  const creatorEditResponse = await worker.fetch(
    new Request(`http://localhost/api/pilot/escalas/${schedule.id}`, {
      method: "PATCH",
      headers: {
        cookie: leaderCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "ATUALIZAR",
        ministerioId: ministry.id,
        titulo: "Escala atualizada pelo criador",
        iniciaEm: "2026-08-09T11:00:00.000Z",
        terminaEm: "2026-08-09T14:00:00.000Z",
        local: "Auditório fictício",
        status: "PUBLICADA",
      }),
    }),
    env,
    context,
  );
  assert.equal(creatorEditResponse.status, 200);

  const memberAfterDraftResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/escalas", {
      headers: { cookie: volunteerCookie },
    }),
    env,
    context,
  );
  assert.equal(memberAfterDraftResponse.status, 200);
  assert.equal((await memberAfterDraftResponse.json()).escalas.length, 1);

  const switchResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidade-ativa", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ comunidadeId: 2 }),
    }),
    env,
    context,
  );
  assert.equal(switchResponse.status, 200);
  const communityCookie = (
    typeof switchResponse.headers.getSetCookie === "function"
      ? switchResponse.headers.getSetCookie()
      : [switchResponse.headers.get("set-cookie") || ""]
  )
    .map((value) => value.match(/__Host-vinkulo_community=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(communityCookie);
  const southCookies = `${pastorCookie}; ${communityCookie}`;

  const southMinistriesResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios", {
      headers: { cookie: southCookies },
    }),
    env,
    context,
  );
  assert.equal(southMinistriesResponse.status, 200);
  assert.deepEqual((await southMinistriesResponse.json()).ministerios, []);

  const southSchedulesResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/escalas", {
      headers: { cookie: southCookies },
    }),
    env,
    context,
  );
  assert.equal(southSchedulesResponse.status, 200);
  assert.deepEqual((await southSchedulesResponse.json()).escalas, []);

  const crossTenantMinistryResponse = await worker.fetch(
    new Request(
      `http://localhost/api/pilot/ministerios/${ministry.id}`,
      {
        method: "PATCH",
        headers: {
          cookie: southCookies,
          "content-type": "application/json",
        },
        body: JSON.stringify({ acao: "DESATIVAR" }),
      },
    ),
    env,
    context,
  );
  assert.equal(crossTenantMinistryResponse.status, 404);

  const crossTenantScheduleResponse = await worker.fetch(
    new Request(`http://localhost/api/pilot/escalas/${schedule.id}`, {
      method: "PATCH",
      headers: {
        cookie: southCookies,
        "content-type": "application/json",
      },
      body: JSON.stringify({ acao: "CANCELAR" }),
    }),
    env,
    context,
  );
  assert.equal(crossTenantScheduleResponse.status, 404);

  const auditRows = database
    .prepare(
      `SELECT comunidade_id, evento
      FROM auditoria_piloto
      WHERE evento LIKE '%V45_%'
        AND evento IN (
          'MINISTERIO_V45_CRIADO',
          'VOLUNTARIO_V45_ADICIONADO',
          'ESCALA_V45_CRIADA',
          'DESIGNACAO_V45_ADICIONADA',
          'DESIGNACAO_V45_RESPONDIDA'
        )
      ORDER BY id`,
    )
    .all();
  assert.deepEqual(
    auditRows.map((row) => row.comunidade_id),
    [1, 1, 1, 1, 1, 1, 1, 1],
  );
  assert.equal(
    database
      .prepare(
        `SELECT status FROM escala_designacoes
        WHERE escala_id = ? AND usuario_id = ?`,
      )
      .get(schedule.id, volunteerId).status,
    "CONFIRMADA",
  );
  database.close();
});

test("escala ativa de estacionamento libera acesso operacional temporário", async () => {
  const { database, d1 } = await createPilotD1();
  const pastorId = await createPilotUser(database, {
    nome: "Pastor de Estacionamento Fictício",
    email: "pastor.escala.estacionamento@example.test",
    senha: "Escala123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  const memberId = await createPilotUser(database, {
    nome: "Auxiliar de Estacionamento Fictício",
    email: "auxiliar.estacionamento@example.test",
    senha: "Escala123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const helperId = await createPilotUser(database, {
    nome: "Apoio Convidado Fictício",
    email: "apoio.convidado.estacionamento@example.test",
    senha: "Escala123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const outsiderId = await createPilotUser(database, {
    nome: "Pessoa de Outra Comunidade",
    email: "outra.comunidade.estacionamento@example.test",
    senha: "Escala123",
    memberships: [{ comunidadeId: 2, papel: "MEMBRO" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const memberCookie = await login(
    worker,
    env,
    "auxiliar.estacionamento@example.test",
    "Escala123",
  );

  const deniedBeforeAssignment = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(deniedBeforeAssignment.status, 403);

  const ministryId = Number(
    database
      .prepare(
        `INSERT INTO ministerios_comunidade
        (comunidade_id, nome, descricao, categoria, status, criado_por, atualizado_por)
        VALUES (1, 'Estacionamento Fictício', '', 'ESTACIONAMENTO',
          'ATIVO', ?, ?)`,
      )
      .run(pastorId, pastorId).lastInsertRowid,
  );
  const volunteerId = Number(
    database
      .prepare(
        `INSERT INTO ministerio_voluntarios
        (comunidade_id, ministerio_id, usuario_id, funcao, papel,
         dias_disponiveis, periodo_preferido, ativo)
        VALUES (1, ?, ?, 'Apoio de entrada', 'VOLUNTARIO', '[]', 'FLEXIVEL', 1)`,
      )
      .run(ministryId, memberId).lastInsertRowid,
  );
  const startsAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const scheduleId = Number(
    database
      .prepare(
        `INSERT INTO escalas_ministerio
        (comunidade_id, ministerio_id, titulo, inicia_em, termina_em,
         local, status, observacoes, criado_por, atualizado_por)
        VALUES (1, ?, 'Plantão atual', ?, ?, '', 'PUBLICADA', '', ?, ?)`,
      )
      .run(ministryId, startsAt, endsAt, pastorId, pastorId).lastInsertRowid,
  );
  database
    .prepare(
      `INSERT INTO escala_designacoes
      (comunidade_id, escala_id, voluntario_id, usuario_id, funcao, status, ativo)
      VALUES (1, ?, ?, ?, 'Apoio de entrada', 'CONFIRMADA', 1)`,
    )
    .run(scheduleId, volunteerId, memberId);

  const allowedBySchedule = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(allowedBySchedule.status, 200);
  const parkingData = await allowedBySchedule.json();
  assert.ok(parkingData.config);
  assert.equal(parkingData.operator.origemAcesso, "ESCALA_ATIVA");
  assert.ok(parkingData.permissions.includes("parking.helpers.manage"));

  const crossTenantHelper = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento/auxiliares", {
      method: "POST",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ usuarioId: outsiderId, escalaId: scheduleId }),
    }),
    env,
    context,
  );
  assert.equal(crossTenantHelper.status, 404);

  const inviteHelper = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento/auxiliares", {
      method: "POST",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ usuarioId: helperId, escalaId: scheduleId }),
    }),
    env,
    context,
  );
  assert.equal(inviteHelper.status, 201);
  const helperAssignment = database
    .prepare(
      `SELECT id, status FROM escala_designacoes
       WHERE comunidade_id = 1 AND escala_id = ? AND usuario_id = ?`,
    )
    .get(scheduleId, helperId);
  assert.equal(helperAssignment.status, "PENDENTE");
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS total FROM notificacoes_sistema
         WHERE usuario_id = ? AND area = 'DIACONIA'`,
      )
      .get(helperId).total,
    1,
  );

  const helperCookie = await login(
    worker,
    env,
    "apoio.convidado.estacionamento@example.test",
    "Escala123",
  );
  const deniedUntilConfirmation = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento", {
      headers: { cookie: helperCookie },
    }),
    env,
    context,
  );
  assert.equal(deniedUntilConfirmation.status, 403);
  database
    .prepare(
      `UPDATE escala_designacoes SET status = 'CONFIRMADA'
       WHERE id = ?`,
    )
    .run(helperAssignment.id);
  const helperAllowed = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento", {
      headers: { cookie: helperCookie },
    }),
    env,
    context,
  );
  assert.equal(helperAllowed.status, 200);
  database.close();
});

test("feed interno, solicitação de entrada, retenção e estatísticas usam regras reais do backend", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Pastor Norte Fictício",
    email: "pastor.feed@example.test",
    senha: "Pastor123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  await createPilotUser(database, {
    nome: "Admin Sul Fictício",
    email: "admin.sul.feed@example.test",
    senha: "AdminSul123",
    memberships: [{ comunidadeId: 2, papel: "ADMIN_COMUNIDADE" }],
  });
  const applicantId = await createPilotUser(database, {
    nome: "Pessoa Solicitante Fictícia",
    email: "solicitante.feed@example.test",
    senha: "Solicita123",
    memberships: [],
  });
  await createPilotUser(database, {
    nome: "Superadmin Fictício",
    email: "super.feed@example.test",
    senha: "Super1234",
    perfil: "ADMIN",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(
    worker,
    env,
    "pastor.feed@example.test",
    "Pastor123",
  );
  const southCookie = await login(
    worker,
    env,
    "admin.sul.feed@example.test",
    "AdminSul123",
  );
  const applicantCookie = await login(
    worker,
    env,
    "solicitante.feed@example.test",
    "Solicita123",
  );
  const superCookie = await login(
    worker,
    env,
    "super.feed@example.test",
    "Super1234",
  );

  const privatePostResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/publicacoes", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        titulo: "Informação interna fictícia",
        conteudo: "Somente membros da comunidade Norte podem ler.",
        categoria: "AVISO",
        visibilidade: "COMUNIDADE",
        status: "PUBLICADA",
      }),
    }),
    env,
    context,
  );
  assert.equal(privatePostResponse.status, 201);

  const attemptedPublicPostResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/publicacoes", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        titulo: "Publicação convertida para interna",
        conteudo: "Mesmo que o cliente peça plataforma, o servidor mantém o conteúdo na comunidade.",
        categoria: "COMUNIDADE",
        visibilidade: "PLATAFORMA",
        status: "PUBLICADA",
      }),
    }),
    env,
    context,
  );
  assert.equal(attemptedPublicPostResponse.status, 201);
  const forcedInternal = database
    .prepare(
      `SELECT visibilidade FROM publicacoes_piloto
       WHERE titulo = 'Publicação convertida para interna' LIMIT 1`,
    )
    .get();
  assert.equal(forcedInternal.visibilidade, "COMUNIDADE");

  const publicHomeResponse = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    env,
    context,
  );
  const publicHomeHtml = await publicHomeResponse.text();
  assert.match(publicHomeHtml, /A plataforma completa/i);
  assert.doesNotMatch(publicHomeHtml, /Informação interna fictícia/);
  assert.doesNotMatch(publicHomeHtml, /Publicação convertida para interna/);
  const retiredPublicFeed = await worker.fetch(
    new Request("http://localhost/api/feed/publico"),
    env,
    context,
  );
  assert.equal(retiredPublicFeed.status, 410);

  const joinResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidades/1/solicitacao", {
      method: "POST",
      headers: {
        cookie: applicantCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ mensagem: "Solicitação fictícia de teste." }),
    }),
    env,
    context,
  );
  assert.equal(joinResponse.status, 201);

  const pastorNotificationsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/notificacoes", {
      headers: { cookie: pastorCookie },
    }),
    env,
    context,
  );
  assert.equal(pastorNotificationsResponse.status, 200);
  const pastorNotifications = await pastorNotificationsResponse.json();
  assert.equal(pastorNotifications.unread, 1);
  assert.match(
    pastorNotifications.notifications[0].message,
    /Pessoa Solicitante Fictícia/,
  );

  const southNotificationsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/notificacoes", {
      headers: { cookie: southCookie },
    }),
    env,
    context,
  );
  assert.equal(southNotificationsResponse.status, 200);
  assert.deepEqual(
    (await southNotificationsResponse.json()).notifications,
    [],
  );

  const southRequestsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/solicitacoes-entrada", {
      headers: { cookie: southCookie },
    }),
    env,
    context,
  );
  assert.equal(southRequestsResponse.status, 200);
  assert.deepEqual(
    (await southRequestsResponse.json()).solicitacoes,
    [],
  );

  const northRequestsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/solicitacoes-entrada", {
      headers: { cookie: pastorCookie },
    }),
    env,
    context,
  );
  assert.equal(northRequestsResponse.status, 200);
  const northRequests = await northRequestsResponse.json();
  assert.equal(northRequests.solicitacoes.length, 1);
  const requestId = northRequests.solicitacoes[0].id;

  const approveResponse = await worker.fetch(
    new Request(
      `http://localhost/api/pilot/solicitacoes-entrada/${requestId}`,
      {
        method: "PATCH",
        headers: {
          cookie: pastorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ acao: "APROVAR" }),
      },
    ),
    env,
    context,
  );
  assert.equal(approveResponse.status, 200);
  const approvedMembership = database
    .prepare(
      `SELECT comunidade_id, papel, status
      FROM usuario_comunidades WHERE usuario_id = ?`,
    )
    .get(applicantId);
  assert.equal(approvedMembership.comunidade_id, 1);
  assert.equal(approvedMembership.papel, "MEMBRO");
  assert.equal(approvedMembership.status, "ATIVO");

  const applicantNotificationsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/notificacoes", {
      headers: { cookie: applicantCookie },
    }),
    env,
    context,
  );
  assert.equal(applicantNotificationsResponse.status, 200);
  const applicantNotifications = await applicantNotificationsResponse.json();
  assert.equal(applicantNotifications.unread, 1);
  assert.match(applicantNotifications.notifications[0].title, /aprovada/i);
  const readResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/notificacoes", {
      method: "PATCH",
      headers: {
        cookie: applicantCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: applicantNotifications.notifications[0].id }),
    }),
    env,
    context,
  );
  assert.equal(readResponse.status, 200);

  const memberFeedResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/publicacoes", {
      headers: { cookie: applicantCookie },
    }),
    env,
    context,
  );
  assert.equal(memberFeedResponse.status, 200);
  const memberFeed = await memberFeedResponse.json();
  const memberFeedPosts = [...memberFeed.publicacoes];
  let memberFeedCursor = memberFeed.nextCursor;
  while (
    memberFeed.hasMore &&
    memberFeedCursor &&
    !memberFeedPosts.some(
      (post) => post.titulo === "Informação interna fictícia",
    )
  ) {
    const nextResponse = await worker.fetch(
      new Request(
        `http://localhost/api/pilot/publicacoes?cursor=${encodeURIComponent(memberFeedCursor)}`,
        { headers: { cookie: applicantCookie } },
      ),
      env,
      context,
    );
    assert.equal(nextResponse.status, 200);
    const nextPage = await nextResponse.json();
    memberFeedPosts.push(...nextPage.publicacoes);
    memberFeedCursor = nextPage.nextCursor;
    memberFeed.hasMore = nextPage.hasMore;
  }
  assert.ok(
    memberFeedPosts.some(
      (post) => post.titulo === "Informação interna fictícia",
    ),
  );
  assert.ok(
    memberFeedPosts.every((post) => Number(post.id) > 0),
  );

  const memberPublishResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/publicacoes", {
      method: "POST",
      headers: {
        cookie: applicantCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        titulo: "Não autorizado",
        conteudo: "Esta ação deve ser bloqueada.",
      }),
    }),
    env,
    context,
  );
  assert.equal(memberPublishResponse.status, 403);

  const memberStatsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/estatisticas", {
      headers: { cookie: applicantCookie },
    }),
    env,
    context,
  );
  assert.equal(memberStatsResponse.status, 403);
  const superStatsResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/estatisticas", {
      headers: { cookie: superCookie },
    }),
    env,
    context,
  );
  assert.equal(superStatsResponse.status, 200);
  const statistics = await superStatsResponse.json();
  assert.ok(statistics.totals.users >= 4);
  assert.equal(statistics.totals.communities, 2);

  const audit = database
    .prepare(
      `SELECT evento, comunidade_id
      FROM auditoria_piloto
      WHERE evento IN (
        'PUBLICACAO_V45_CRIADA',
        'SOLICITACAO_ENTRADA_V45_CRIADA',
        'SOLICITACAO_ENTRADA_V45_APROVADA'
      )
      ORDER BY id`,
    )
    .all();
  assert.ok(audit.length >= 4);
  assert.ok(audit.every((row) => row.comunidade_id === 1));

  database
    .prepare(
      `UPDATE solicitacoes_entrada_comunidade
      SET analisado_em = datetime('now', '-8 days')
      WHERE id = ?`,
    )
    .run(requestId);
  const retentionResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/solicitacoes-entrada", {
      headers: { cookie: pastorCookie },
    }),
    env,
    context,
  );
  assert.equal(retentionResponse.status, 200);
  const retentionBody = await retentionResponse.json();
  assert.equal(retentionBody.retention.days, 7);
  assert.deepEqual(retentionBody.retention.appliesTo, ["APROVADA", "RECUSADA"]);
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS total
        FROM solicitacoes_entrada_comunidade WHERE id = ?`,
      )
      .get(requestId).total,
    0,
  );
  database
    .prepare(
      `INSERT INTO solicitacoes_entrada_comunidade
      (comunidade_id, usuario_id, mensagem, status, solicitado_em)
      VALUES (1, ?, 'Pendente antiga preservada', 'PENDENTE', datetime('now', '-8 days'))`,
    )
    .run(applicantId);
  const pendingRetentionResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/solicitacoes-entrada", {
      headers: { cookie: pastorCookie },
    }),
    env,
    context,
  );
  assert.equal(pendingRetentionResponse.status, 200);
  const pendingRetentionBody = await pendingRetentionResponse.json();
  assert.ok(
    pendingRetentionBody.solicitacoes.some(
      (request) => request.mensagem === "Pendente antiga preservada",
    ),
  );
  database.close();
});

test("comentários públicos exigem login, respeitam privacidade e podem ser desativados pelo autor", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Superadmin Autor",
    email: "super.autor@example.test",
    senha: "SuperAutor123",
    perfil: "ADMIN",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  await createPilotUser(database, {
    nome: "Superadmin Moderador",
    email: "super.moderador@example.test",
    senha: "SuperModerador123",
    perfil: "ADMIN",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  await createPilotUser(database, {
    nome: "Pastor Autor",
    email: "pastor.autor@example.test",
    senha: "PastorAutor123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  await createPilotUser(database, {
    nome: "Gestor Moderador",
    email: "gestor.moderador@example.test",
    senha: "Gestor123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  await createPilotUser(database, {
    nome: "Membro Comentarista",
    email: "membro.comentario@example.test",
    senha: "Comenta123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const superAuthorCookie = await login(
    worker,
    env,
    "super.autor@example.test",
    "SuperAutor123",
  );
  const superModeratorCookie = await login(
    worker,
    env,
    "super.moderador@example.test",
    "SuperModerador123",
  );
  const pastorCookie = await login(
    worker,
    env,
    "pastor.autor@example.test",
    "PastorAutor123",
  );
  const managerCookie = await login(
    worker,
    env,
    "gestor.moderador@example.test",
    "Gestor123",
  );
  const memberCookie = await login(
    worker,
    env,
    "membro.comentario@example.test",
    "Comenta123",
  );

  const deniedPlatformPost = await worker.fetch(
    new Request("http://localhost/api/pilot/publicacoes-plataforma", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        titulo: "Sem permissão",
        conteudo: "Pastoral não publica em nome da plataforma.",
        categoria: "NOTICIA",
        status: "PUBLICADA",
      }),
    }),
    env,
    context,
  );
  assert.equal(deniedPlatformPost.status, 410);

  const platformPostResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/publicacoes-plataforma", {
      method: "POST",
      headers: {
        cookie: superAuthorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        titulo: "Atualização oficial fictícia",
        conteudo: "Informação demonstrativa publicada pela plataforma.",
        categoria: "ATUALIZACAO",
        status: "PUBLICADA",
        comentariosHabilitados: true,
      }),
    }),
    env,
    context,
  );
  assert.equal(platformPostResponse.status, 410);
  const platformPostId = Number(
    database
      .prepare(
        `INSERT INTO publicacoes_piloto
        (comunidade_id, titulo, resumo, conteudo, categoria, visibilidade,
          status, origem, comentarios_habilitados, criado_por)
        VALUES (NULL, ?, ?, ?, 'ATUALIZACAO', 'PLATAFORMA',
          'PUBLICADA', 'PLATAFORMA', 1,
          (SELECT id FROM usuarios WHERE email = ?))`,
      )
      .run(
        "Atualização oficial fictícia",
        "Informação demonstrativa publicada pela plataforma.",
        "Informação demonstrativa publicada pela plataforma.",
        "super.autor@example.test",
      ).lastInsertRowid,
  );

  const otherSuperEdit = await worker.fetch(
    new Request(
      `http://localhost/api/pilot/publicacoes-plataforma/${platformPostId}`,
      {
        method: "PATCH",
        headers: {
          cookie: superModeratorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          titulo: "Tentativa de edição",
          conteudo: "Outro superadministrador não é o autor.",
          categoria: "ATUALIZACAO",
          status: "PUBLICADA",
        }),
      },
    ),
    env,
    context,
  );
  assert.equal(otherSuperEdit.status, 410);

  const communityPostResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/publicacoes", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        titulo: "Post do autor",
        conteudo: "Somente o autor pode editar este conteúdo.",
        categoria: "COMUNIDADE",
        visibilidade: "PLATAFORMA",
        status: "PUBLICADA",
      }),
    }),
    env,
    context,
  );
  assert.equal(communityPostResponse.status, 201);
  const communityPostId = (await communityPostResponse.json()).id;

  const managerEdit = await worker.fetch(
    new Request(`http://localhost/api/pilot/publicacoes/${communityPostId}`, {
      method: "PATCH",
      headers: {
        cookie: managerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        titulo: "Gestor não pode editar",
        conteudo: "A edição deve ser rejeitada.",
        categoria: "COMUNIDADE",
        visibilidade: "PLATAFORMA",
        status: "PUBLICADA",
      }),
    }),
    env,
    context,
  );
  assert.equal(managerEdit.status, 403);

  const managerHide = await worker.fetch(
    new Request(`http://localhost/api/pilot/publicacoes/${communityPostId}`, {
      method: "PATCH",
      headers: {
        cookie: managerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ acao: "ARQUIVAR" }),
    }),
    env,
    context,
  );
  assert.equal(managerHide.status, 200);

  const anonymousComment = await worker.fetch(
    new Request(
      `http://localhost/api/publicacoes/${platformPostId}/comentarios`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto: "Comentário sem login." }),
      },
    ),
    env,
    context,
  );
  assert.equal(anonymousComment.status, 401);

  const privateProfileComment = await worker.fetch(
    new Request(
      `http://localhost/api/publicacoes/${platformPostId}/comentarios`,
      {
        method: "POST",
        headers: {
          cookie: memberCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          texto: "Comentário com perfil oculto.",
          perfilVisivel: false,
        }),
      },
    ),
    env,
    context,
  );
  assert.equal(privateProfileComment.status, 201);

  const publicComments = await worker.fetch(
    new Request(
      `http://localhost/api/publicacoes/${platformPostId}/comentarios`,
    ),
    env,
    context,
  );
  assert.equal(publicComments.status, 200);
  const publicCommentsJson = await publicComments.json();
  assert.equal(
    publicCommentsJson.comentarios[0].autor,
    "Usuário da plataforma",
  );
  assert.equal(publicCommentsJson.comentarios[0].email, null);

  const superComments = await worker.fetch(
    new Request(
      `http://localhost/api/publicacoes/${platformPostId}/comentarios`,
      { headers: { cookie: superAuthorCookie } },
    ),
    env,
    context,
  );
  const superCommentsJson = await superComments.json();
  assert.equal(
    superCommentsJson.comentarios[0].autor,
    "Membro Comentarista",
  );
  assert.equal(
    superCommentsJson.comentarios[0].email,
    "membro.comentario@example.test",
  );

  database
    .prepare(
      "UPDATE usuarios SET ativo = 0 WHERE email = 'super.autor@example.test'",
    )
    .run();
  const inactiveSuperComments = await worker.fetch(
    new Request(
      `http://localhost/api/publicacoes/${platformPostId}/comentarios`,
      { headers: { cookie: superAuthorCookie } },
    ),
    env,
    context,
  );
  assert.equal(inactiveSuperComments.status, 200);
  const inactiveSuperJson = await inactiveSuperComments.json();
  assert.equal(
    inactiveSuperJson.comentarios[0].autor,
    "Usuário da plataforma",
  );
  assert.equal(inactiveSuperJson.comentarios[0].email, null);
  database
    .prepare(
      "UPDATE usuarios SET ativo = 1 WHERE email = 'super.autor@example.test'",
    )
    .run();

  database
    .prepare(
      "UPDATE publicacoes_piloto SET comentarios_habilitados = 0 WHERE id = ?",
    )
    .run(platformPostId);

  const blockedComment = await worker.fetch(
    new Request(
      `http://localhost/api/publicacoes/${platformPostId}/comentarios`,
      {
        method: "POST",
        headers: {
          cookie: memberCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ texto: "Não deve ser salvo." }),
      },
    ),
    env,
    context,
  );
  assert.equal(blockedComment.status, 409);

  database.close();
});

test("estacionamento persiste entradas e saídas sem misturar comunidades", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Superadmin do Estacionamento",
    email: "parking.admin@example.test",
    senha: "Parking123",
    perfil: "ADMIN",
    memberships: [
      { comunidadeId: 1, papel: "ADMIN_COMUNIDADE" },
      { comunidadeId: 2, papel: "ADMIN_COMUNIDADE" },
    ],
  });
  await createPilotUser(database, {
    nome: "Membro sem Acesso",
    email: "parking.member@example.test",
    senha: "Parking123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const adminCookie = await login(
    worker,
    env,
    "parking.admin@example.test",
    "Parking123",
  );
  const memberCookie = await login(
    worker,
    env,
    "parking.member@example.test",
    "Parking123",
  );

  const memberDenied = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(memberDenied.status, 403);

  const northBefore = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento", {
      headers: { cookie: adminCookie },
    }),
    env,
    context,
  );
  assert.equal(northBefore.status, 200);
  const northData = await northBefore.json();
  const freeSpace = northData.vagas.find((item) => item.status === "LIVRE");
  assert.ok(freeSpace);

  const entryResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento", {
      method: "POST",
      headers: {
        cookie: adminCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        placa: "TESTE02",
        responsavel: "Pessoa fictícia",
        tipoVeiculo: "CARRO",
        vinculo: "VISITANTE",
        vagaId: freeSpace.id,
      }),
    }),
    env,
    context,
  );
  assert.equal(entryResponse.status, 201);
  const movementId = Number((await entryResponse.json()).id);
  assert.ok(movementId > 0);

  const switchResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/comunidade-ativa", {
      method: "POST",
      headers: {
        cookie: adminCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ comunidadeId: 2 }),
    }),
    env,
    context,
  );
  assert.equal(switchResponse.status, 200);
  const activeCookie = (
    typeof switchResponse.headers.getSetCookie === "function"
      ? switchResponse.headers.getSetCookie()
      : [switchResponse.headers.get("set-cookie") || ""]
  )
    .map((value) => value.match(/__Host-vinkulo_community=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(activeCookie);
  const southCookies = `${adminCookie}; ${activeCookie}`;

  const southResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/estacionamento", {
      headers: { cookie: southCookies },
    }),
    env,
    context,
  );
  assert.equal(southResponse.status, 200);
  const southData = await southResponse.json();
  assert.ok(
    southData.movimentacoes.every((item) => item.placa !== "TESTE02"),
  );

  const crossTenantExit = await worker.fetch(
    new Request(`http://localhost/api/pilot/estacionamento/${movementId}`, {
      method: "PATCH",
      headers: { cookie: southCookies },
    }),
    env,
    context,
  );
  assert.equal(crossTenantExit.status, 404);

  const exitResponse = await worker.fetch(
    new Request(`http://localhost/api/pilot/estacionamento/${movementId}`, {
      method: "PATCH",
      headers: { cookie: adminCookie },
    }),
    env,
    context,
  );
  assert.equal(exitResponse.status, 200);
  const closed = database
    .prepare(
      `SELECT comunidade_id, status, saida_em
       FROM estacionamento_movimentacoes WHERE id = ?`,
    )
    .get(movementId);
  assert.equal(closed.comunidade_id, 1);
  assert.equal(closed.status, "ENCERRADA");
  assert.ok(closed.saida_em);

  const auditEvents = database
    .prepare(
      `SELECT evento FROM auditoria_piloto
       WHERE comunidade_id = 1 AND evento LIKE 'ESTACIONAMENTO_%'
       ORDER BY id`,
    )
    .all()
    .map((item) => item.evento);
  assert.deepEqual(auditEvents, [
    "ESTACIONAMENTO_ENTRADA_REGISTRADA",
    "ESTACIONAMENTO_SAIDA_REGISTRADA",
  ]);
  database.close();
});

test("editorial mantém IA em revisão e agenda somente conteúdo autorizado", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Superadmin Editorial",
    email: "editorial.admin@example.test",
    senha: "Editorial123",
    perfil: "ADMIN",
    memberships: [
      { comunidadeId: 1, papel: "ADMIN_COMUNIDADE" },
      { comunidadeId: 2, papel: "ADMIN_COMUNIDADE" },
    ],
  });
  await createPilotUser(database, {
    nome: "Membro Editorial",
    email: "editorial.membro@example.test",
    senha: "Editorial123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const adminCookie = await login(
    worker,
    env,
    "editorial.admin@example.test",
    "Editorial123",
  );
  const memberCookie = await login(
    worker,
    env,
    "editorial.membro@example.test",
    "Editorial123",
  );

  const memberResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(memberResponse.status, 403);

  const automaticResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial", {
      method: "PUT",
      headers: {
        cookie: adminCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mode: "AUTOMATICO",
        enabled: true,
        frequency: "DIARIA",
        schedules: ["09:00"],
        dailyQuantity: 1,
        maxLength: 1200,
        useImages: true,
        categories: ["TUTORIAIS", "SEGURANCA"],
        blockedTopics: [
          "ACONSELHAMENTO_PESSOAL",
          "DADOS_PRIVADOS",
          "ACUSACOES",
          "POLITICA_DIRECIONADA",
          "DIAGNOSTICO",
          "CONTEUDO_DISCRIMINATORIO",
          "DOUTRINA_CONTROVERSA",
          "PROPAGANDA_NAO_AUTORIZADA",
        ],
        communityIds: [1, 2],
        sources: ["Central de ajuda Vínkulo"],
        password: "Editorial123",
      }),
    }),
    env,
    context,
  );
  assert.equal(automaticResponse.status, 200);
  assert.equal((await automaticResponse.json()).autoPublish, true);

  const configResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial", {
      method: "PUT",
      headers: {
        cookie: adminCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mode: "COM_REVISAO",
        enabled: true,
        frequency: "DIARIA",
        schedules: ["08:30", "18:00"],
        dailyQuantity: 2,
        maxLength: 1400,
        useImages: true,
        categories: ["TUTORIAIS", "SEGURANCA"],
        blockedTopics: [
          "ACONSELHAMENTO_PESSOAL",
          "DADOS_PRIVADOS",
          "ACUSACOES",
          "POLITICA_DIRECIONADA",
          "DIAGNOSTICO",
          "CONTEUDO_DISCRIMINATORIO",
          "DOUTRINA_CONTROVERSA",
          "PROPAGANDA_NAO_AUTORIZADA",
        ],
        communityIds: [1, 2],
        sources: ["Central de ajuda Vínkulo"],
        password: "Editorial123",
      }),
    }),
    env,
    context,
  );
  assert.equal(configResponse.status, 200);
  assert.equal((await configResponse.json()).autoPublish, false);

  const savedPolicy = database
    .prepare(
      `SELECT modo, publicacao_automatica, frequencia, quantidade_diaria,
        tamanho_maximo, usar_imagens, comunidades_destino
       FROM politicas_editoriais_ia
       WHERE scope_type = 'GLOBAL' AND scope_id = 0`,
    )
    .get();
  assert.equal(savedPolicy.modo, "COM_REVISAO");
  assert.equal(savedPolicy.publicacao_automatica, 0);
  assert.equal(savedPolicy.frequencia, "DIARIA");
  assert.equal(savedPolicy.quantidade_diaria, 2);
  assert.equal(savedPolicy.tamanho_maximo, 1400);
  assert.equal(savedPolicy.usar_imagens, 1);
  assert.deepEqual(JSON.parse(savedPolicy.comunidades_destino), [1, 2]);

  const reviewResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial", {
      method: "PATCH",
      headers: {
        cookie: adminCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ draftId: 1, action: "APROVAR" }),
    }),
    env,
    context,
  );
  assert.equal(reviewResponse.status, 200);
  const review = await reviewResponse.json();
  assert.equal(review.status, "APROVADO");
  assert.equal(review.published, false);
  assert.equal(
    database
      .prepare("SELECT status FROM rascunhos_editoriais_ia WHERE id = 1")
      .get().status,
    "APROVADO",
  );
  assert.equal(
    database
      .prepare(
        `SELECT count(*) AS total FROM publicacoes_piloto
         WHERE origem = 'IA'`,
      )
      .get().total,
    0,
  );

  const generationResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial", {
      method: "POST",
      headers: { cookie: adminCookie },
    }),
    env,
    context,
  );
  assert.equal(generationResponse.status, 424);
  assert.equal(
    (await generationResponse.json()).dependency,
    "EXTERNAL_AI_BACKEND",
  );

  const memberScheduleResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial/programacoes", {
      method: "POST",
      headers: { cookie: memberCookie, "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    env,
    context,
  );
  assert.equal(memberScheduleResponse.status, 403);

  const scheduledFor = new Date(Date.now() + 3_600_000).toISOString();
  const createScheduleResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial/programacoes", {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({
        comunidadeId: 1,
        titulo: "Orientação segura da plataforma",
        mensagem: "Conteúdo previamente revisado e autorizado pelo proprietário da plataforma.",
        categoria: "SEGURANCA",
        publicarEm: scheduledFor,
        visibilidade: "PLATAFORMA",
        comentariosHabilitados: true,
      }),
    }),
    env,
    context,
  );
  assert.equal(createScheduleResponse.status, 201);
  const scheduledId = (await createScheduleResponse.json()).id;

  const wrongAuthorization = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial/programacoes", {
      method: "PATCH",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ id: scheduledId, action: "AUTORIZAR", password: "incorreta" }),
    }),
    env,
    context,
  );
  assert.equal(wrongAuthorization.status, 401);

  const authorization = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial/programacoes", {
      method: "PATCH",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ id: scheduledId, action: "AUTORIZAR", password: "Editorial123" }),
    }),
    env,
    context,
  );
  assert.equal(authorization.status, 200);
  assert.equal((await authorization.json()).status, "AGENDADA");

  database
    .prepare(
      `UPDATE programacoes_editoriais SET publicar_em = datetime('now', '-1 minute')
       WHERE id = ?`,
    )
    .run(scheduledId);
  const dispatchResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial/programacoes", {
      headers: { cookie: adminCookie },
    }),
    env,
    context,
  );
  assert.equal(dispatchResponse.status, 200);
  assert.equal(
    database.prepare("SELECT status FROM programacoes_editoriais WHERE id = ?").get(scheduledId).status,
    "PUBLICADA",
  );
  assert.equal(
    database.prepare("SELECT count(*) AS total FROM publicacoes_piloto WHERE origem = 'IA_AGENDADA'").get().total,
    1,
  );
  assert.equal(
    database.prepare("SELECT visibilidade FROM publicacoes_piloto WHERE origem = 'IA_AGENDADA' LIMIT 1").get().visibilidade,
    "COMUNIDADE",
  );

  const cancellableResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial/programacoes", {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({
        comunidadeId: 1,
        titulo: "Publicação cancelável",
        mensagem: "Esta mensagem permanece cancelável até ser autorizada e enviada.",
        categoria: "TUTORIAIS",
        publicarEm: scheduledFor,
        visibilidade: "COMUNIDADE",
      }),
    }),
    env,
    context,
  );
  assert.equal(cancellableResponse.status, 201);
  const cancellableId = (await cancellableResponse.json()).id;
  const cancelResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/editorial/programacoes", {
      method: "PATCH",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ id: cancellableId, action: "CANCELAR" }),
    }),
    env,
    context,
  );
  assert.equal(cancelResponse.status, 200);
  assert.equal((await cancelResponse.json()).status, "CANCELADA");

  const auditEvents = database
    .prepare(
      `SELECT evento FROM auditoria_piloto
       WHERE evento LIKE 'EDITORIAL_%' ORDER BY id`,
    )
    .all()
    .map((item) => item.evento);
  for (const event of [
    "EDITORIAL_CONFIG_ATUALIZADA",
    "EDITORIAL_RASCUNHO_REVISADO",
    "EDITORIAL_PROGRAMACAO_CRIADA",
    "EDITORIAL_PROGRAMACAO_AUTORIZACAO",
    "EDITORIAL_PROGRAMACAO_AUTORIZADA",
    "EDITORIAL_PROGRAMACAO_PUBLICADA",
    "EDITORIAL_PROGRAMACAO_CANCELADA",
  ]) assert.ok(auditEvents.includes(event), `auditoria ausente: ${event}`);
  database.close();
});

test("central de Diaconia recebe escalas de todas as categorias, isola comunidade e gera relatório", async () => {
  const { database, d1 } = await createPilotD1();
  const pastorId = await createPilotUser(database, {
    nome: "Pastor Diaconia",
    email: "pastor.diaconia@example.test",
    senha: "Diaconia123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  const memberId = await createPilotUser(database, {
    nome: "Voluntário Diaconia",
    email: "voluntario.diaconia@example.test",
    senha: "Diaconia123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const southId = await createPilotUser(database, {
    nome: "Pessoa Comunidade Sul",
    email: "diaconia.sul@example.test",
    senha: "Diaconia123",
    memberships: [{ comunidadeId: 2, papel: "MEMBRO" }],
  });
  const ministryId = Number(
    database
      .prepare(
        `INSERT INTO ministerios_comunidade
         (comunidade_id, nome, descricao, categoria, status, criado_por)
         VALUES (1, 'Comunicação de teste', 'Equipe fictícia', 'MIDIA',
           'ATIVO', ?)`,
      )
      .run(pastorId).lastInsertRowid,
  );
  const volunteerId = Number(
    database
      .prepare(
        `INSERT INTO ministerio_voluntarios
         (comunidade_id, ministerio_id, usuario_id, funcao, papel, ativo)
         VALUES (1, ?, ?, 'Recepção', 'VOLUNTARIO', 1)`,
      )
      .run(ministryId, memberId).lastInsertRowid,
  );
  const scheduleId = Number(
    database
      .prepare(
        `INSERT INTO escalas_ministerio
         (comunidade_id, ministerio_id, titulo, inicia_em, termina_em,
          local, status, criado_por)
         VALUES (1, ?, 'Culto de teste', '2025-01-01T18:00:00.000Z',
          '2025-01-01T20:00:00.000Z', 'Templo piloto', 'PUBLICADA', ?)`,
      )
      .run(ministryId, pastorId).lastInsertRowid,
  );
  const assignmentId = Number(
    database
      .prepare(
        `INSERT INTO escala_designacoes
         (comunidade_id, escala_id, voluntario_id, usuario_id, funcao,
          status, ativo)
         VALUES (1, ?, ?, ?, 'Recepção', 'CONFIRMADO', 1)`,
      )
      .run(scheduleId, volunteerId, memberId).lastInsertRowid,
  );

  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(
    worker,
    env,
    "pastor.diaconia@example.test",
    "Diaconia123",
  );
  const memberCookie = await login(
    worker,
    env,
    "voluntario.diaconia@example.test",
    "Diaconia123",
  );
  const southCookie = await login(
    worker,
    env,
    "diaconia.sul@example.test",
    "Diaconia123",
  );

  const memberListResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/diaconia", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(memberListResponse.status, 200);
  const memberList = await memberListResponse.json();
  assert.equal(memberList.schedules.length, 1);
  assert.equal(memberList.schedules[0].status, "AGUARDANDO_CHECKLIST");
  assert.equal(
    database
      .prepare("SELECT status FROM escalas_ministerio WHERE id = ?")
      .get(scheduleId).status,
    "AGUARDANDO_CHECKLIST",
  );

  const southListResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/diaconia", {
      headers: { cookie: southCookie },
    }),
    env,
    context,
  );
  assert.equal(southListResponse.status, 403);

  const createItemResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/diaconia", {
      method: "PATCH",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "CRIAR_ITEM",
        scheduleId,
        assignmentId,
        tarefa: "Conferir recepção",
      }),
    }),
    env,
    context,
  );
  assert.equal(createItemResponse.status, 201);
  const itemId = Number((await createItemResponse.json()).id);

  const crossTenantSubstitute = await worker.fetch(
    new Request("http://localhost/api/pilot/diaconia", {
      method: "PATCH",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "ATUALIZAR_ITEM",
        itemId,
        status: "SUBSTITUIDO",
        substitutoUsuarioId: southId,
      }),
    }),
    env,
    context,
  );
  assert.equal(crossTenantSubstitute.status, 404);

  const updateItemResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/diaconia", {
      method: "PATCH",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "ATUALIZAR_ITEM",
        itemId,
        status: "FEITO",
        observacao: "Conferência concluída com dados fictícios.",
      }),
    }),
    env,
    context,
  );
  assert.equal(updateItemResponse.status, 200);

  const memberFinalizeResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/diaconia", {
      method: "PATCH",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "FINALIZAR_RELATORIO",
        scheduleId,
        resumo: "Resumo fictício da execução da escala.",
      }),
    }),
    env,
    context,
  );
  assert.equal(memberFinalizeResponse.status, 403);

  const finalizeResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/diaconia", {
      method: "PATCH",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "FINALIZAR_RELATORIO",
        scheduleId,
        resumo: "Resumo fictício da execução da escala.",
      }),
    }),
    env,
    context,
  );
  assert.equal(finalizeResponse.status, 200);
  assert.equal((await finalizeResponse.json()).externalDelivery, false);
  assert.equal(
    database
      .prepare("SELECT status FROM escalas_ministerio WHERE id = ?")
      .get(scheduleId).status,
    "ENCERRADA",
  );
  assert.equal(
    database
      .prepare(
        "SELECT count(*) AS total FROM diaconia_relatorios WHERE escala_id = ?",
      )
      .get(scheduleId).total,
    1,
  );
  assert.ok(
    database
      .prepare(
        `SELECT id FROM notificacoes_sistema
         WHERE usuario_id = ? AND area = 'CHECKLISTS'
           AND titulo = 'Relatório de escala finalizado'`,
      )
      .get(pastorId),
  );
  assert.ok(
    database
      .prepare(
        `SELECT id FROM auditoria_piloto
         WHERE comunidade_id = 1
           AND evento = 'DIACONIA_RELATORIO_FINALIZADO'`,
      )
      .get(),
  );

  const pdfResponse = await worker.fetch(
    new Request(
      `http://localhost/api/pilot/diaconia/${scheduleId}/pdf`,
      { headers: { cookie: pastorCookie } },
    ),
    env,
    context,
  );
  assert.equal(pdfResponse.status, 200);
  assert.match(
    pdfResponse.headers.get("content-type") || "",
    /application\/pdf/,
  );
  database.close();
});

test("Bloco 15 salva recursos do Ministério V4.6 com isolamento e checklist", async () => {
  const { database, d1 } = await createPilotD1();
  const pastorId = await createPilotUser(database, {
    nome: "Pastor Ministério V4.6",
    email: "pastor.ministerio.v46@example.test",
    senha: "Ministerio123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  await createPilotUser(database, {
    nome: "Membro Ministério V4.6",
    email: "membro.ministerio.v46@example.test",
    senha: "Ministerio123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(
    worker,
    env,
    "pastor.ministerio.v46@example.test",
    "Ministerio123",
  );
  const memberCookie = await login(
    worker,
    env,
    "membro.ministerio.v46@example.test",
    "Ministerio123",
  );

  const ministryResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        nome: "Comunicação V4.6",
        descricao: "Equipe fictícia para teste.",
        categoria: "MIDIA",
        status: "ATIVO",
        responsavelUsuarioId: pastorId,
        youtubeUrl: "https://www.youtube.com/@vinkulo-teste",
        spotifyUrl: "https://open.spotify.com/show/teste",
      }),
    }),
    env,
    context,
  );
  assert.equal(ministryResponse.status, 201);
  const ministry = await ministryResponse.json();

  const functionResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "CRIAR_FUNCAO",
        ministerioId: ministry.id,
        nome: "Operador de transmissão",
        descricao: "Função fictícia reutilizável.",
      }),
    }),
    env,
    context,
  );
  assert.equal(functionResponse.status, 201);

  const templateResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "CRIAR_MODELO",
        ministerioId: ministry.id,
        nome: "Modelo de transmissão",
        titulo: "Transmissão demonstrativa",
        duracaoMinutos: 120,
        local: "Auditório fictício",
        checklist: ["Testar áudio", "Revisar transmissão"],
        camposPersonalizados: [
          {
            id: "numero-cameras",
            label: "Quantidade de câmeras",
            type: "NUMERO",
            required: true,
            options: [],
          },
          {
            id: "plataforma",
            label: "Plataforma",
            type: "SELECAO",
            required: true,
            options: ["YouTube", "Site"],
          },
        ],
      }),
    }),
    env,
    context,
  );
  assert.equal(templateResponse.status, 201);
  const template = await templateResponse.json();

  const reusableLinkResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "SALVAR_LINKS_REUTILIZAVEIS",
        ministerioId: ministry.id,
        links: [{
          id: "biblioteca-1",
          tipo: "YOUTUBE",
          titulo: "Transmissão padrão",
          url: "https://www.youtube.com/watch?v=teste-vinkulo",
        }],
      }),
    }),
    env,
    context,
  );
  assert.equal(reusableLinkResponse.status, 200);

  const unauthorizedLinkResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      method: "POST",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "SALVAR_LINKS_REUTILIZAVEIS",
        ministerioId: ministry.id,
        links: [{
          id: "bloqueado",
          tipo: "PERSONALIZADO",
          titulo: "Não autorizado",
          url: "https://example.test/bloqueado",
        }],
      }),
    }),
    env,
    context,
  );
  assert.equal(unauthorizedLinkResponse.status, 403);

  const scheduleResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/escalas", {
      method: "POST",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ministerioId: ministry.id,
        modeloId: template.id,
        titulo: "Transmissão demonstrativa",
        iniciaEm: "2026-09-06T12:00:00.000Z",
        terminaEm: "2026-09-06T14:00:00.000Z",
        local: "Auditório fictício",
        status: "RASCUNHO",
        camposRespostas: {
          "numero-cameras": 3,
          plataforma: "YouTube",
        },
      }),
    }),
    env,
    context,
  );
  assert.equal(scheduleResponse.status, 201);
  const schedule = await scheduleResponse.json();
  const checklistRows = database
    .prepare(
      `SELECT id, tarefa, status
       FROM ministerio_checklist_itens
       WHERE comunidade_id = 1 AND escala_id = ?
       ORDER BY id ASC`,
    )
    .all(schedule.id);
  assert.equal(checklistRows.length, 2);
  assert.equal(checklistRows[0].status, "PENDENTE");
  const persistedSchedule = database
    .prepare(
      `SELECT modelo_snapshot, campos_respostas
       FROM escalas_ministerio WHERE id = ?`,
    )
    .get(schedule.id);
  assert.equal(JSON.parse(persistedSchedule.campos_respostas)["numero-cameras"], 3);
  assert.equal(
    JSON.parse(persistedSchedule.modelo_snapshot).camposPersonalizados.length,
    2,
  );

  const memberUpdate = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      method: "PATCH",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "ATUALIZAR_CHECKLIST",
        itemId: checklistRows[0].id,
        status: "FEITO",
      }),
    }),
    env,
    context,
  );
  assert.equal(memberUpdate.status, 403);

  const pastorUpdate = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      method: "PATCH",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        acao: "ATUALIZAR_CHECKLIST",
        itemId: checklistRows[0].id,
        status: "FEITO",
      }),
    }),
    env,
    context,
  );
  assert.equal(pastorUpdate.status, 200);
  assert.equal(
    database
      .prepare(
        "SELECT status FROM ministerio_checklist_itens WHERE id = ?",
      )
      .get(checklistRows[0].id).status,
    "FEITO",
  );

  const resourcesResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      headers: { cookie: pastorCookie },
    }),
    env,
    context,
  );
  assert.equal(resourcesResponse.status, 200);
  const resources = await resourcesResponse.json();
  assert.equal(resources.funcoes.length, 1);
  assert.equal(resources.modelos.length, 1);
  assert.equal(resources.modelos[0].checklist_modelo.length, 2);
  assert.equal(resources.modelos[0].campos_personalizados.length, 2);
  assert.equal(resources.linksReutilizaveis.length, 1);
  assert.equal(resources.linksReutilizaveis[0].titulo, "Transmissão padrão");
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS total FROM ministerio_links_reutilizaveis
         WHERE comunidade_id = 1 AND ministerio_id = ? AND ativo = 1`,
      )
      .get(ministry.id).total,
    1,
  );
  assert.ok(
    database
      .prepare(
        `SELECT id FROM auditoria_piloto
         WHERE comunidade_id = 1
           AND evento = 'MINISTERIO_V46_CHECKLIST_ATUALIZADO'`,
      )
      .get(),
  );
  database.close();
});

test("oração e solicitações persistem, notificam gestores e respeitam a comunidade ativa", async () => {
  const { database, d1 } = await createPilotD1();
  const pastorId = await createPilotUser(database, {
    nome: "Pastor Solicitações",
    email: "pastor.solicitacoes@example.test",
    senha: "Solicitacao123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  const memberId = await createPilotUser(database, {
    nome: "Membro Solicitações",
    email: "membro.solicitacoes@example.test",
    senha: "Solicitacao123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  await createPilotUser(database, {
    nome: "Pessoa Sul Solicitações",
    email: "sul.solicitacoes@example.test",
    senha: "Solicitacao123",
    memberships: [{ comunidadeId: 2, papel: "MEMBRO" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(
    worker,
    env,
    "pastor.solicitacoes@example.test",
    "Solicitacao123",
  );
  const memberCookie = await login(
    worker,
    env,
    "membro.solicitacoes@example.test",
    "Solicitacao123",
  );
  const southCookie = await login(
    worker,
    env,
    "sul.solicitacoes@example.test",
    "Solicitacao123",
  );

  const createResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/solicitacoes", {
      method: "POST",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        tipo: "ORACAO",
        titulo: "Pedido demonstrativo",
        descricao: "Descrição fictícia para validar o fluxo persistente.",
        visibilidade: "PASTORAL",
      }),
    }),
    env,
    context,
  );
  assert.equal(createResponse.status, 201);
  const requestId = Number((await createResponse.json()).id);
  assert.ok(requestId > 0);

  const pastorListResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/solicitacoes", {
      headers: { cookie: pastorCookie },
    }),
    env,
    context,
  );
  assert.equal(pastorListResponse.status, 200);
  const pastorList = await pastorListResponse.json();
  assert.equal(pastorList.canManage, true);
  assert.equal(pastorList.solicitacoes.length, 1);

  const southListResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/solicitacoes", {
      headers: { cookie: southCookie },
    }),
    env,
    context,
  );
  assert.equal(southListResponse.status, 200);
  assert.equal((await southListResponse.json()).solicitacoes.length, 0);

  const updateResponse = await worker.fetch(
    new Request("http://localhost/api/pilot/solicitacoes", {
      method: "PATCH",
      headers: {
        cookie: pastorCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: requestId, status: "CONCLUIDA" }),
    }),
    env,
    context,
  );
  assert.equal(updateResponse.status, 200);
  assert.equal(
    database
      .prepare(
        "SELECT status FROM solicitacoes_comunidade WHERE id = ? AND comunidade_id = 1",
      )
      .get(requestId).status,
    "CONCLUIDA",
  );
  assert.ok(
    database
      .prepare(
        `SELECT id FROM notificacoes_sistema
         WHERE usuario_id = ? AND area = 'SOLICITACOES'`,
      )
      .get(pastorId),
  );
  assert.ok(
    database
      .prepare(
        `SELECT id FROM notificacoes_sistema
         WHERE usuario_id = ? AND area = 'SOLICITACOES'
           AND titulo = 'Sua solicitação foi atualizada'`,
      )
      .get(memberId),
  );
  database.close();
});
