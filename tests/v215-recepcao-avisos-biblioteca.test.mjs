import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("recepcao", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-ficticio-exclusivo-do-teste-v215",
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
  const sessionCookie = setCookies
    .map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(sessionCookie, "cookie de sessão ausente");
  return sessionCookie;
}

test("recepção pública é escura, interativa por clique e preserva o editor visual", async () => {
  const [page, experience, css] = await Promise.all([
    source("app/page.tsx"),
    source("app/components/ReceptionExperience.tsx"),
    source("app/recepcao.css"),
  ]);

  assert.match(page, /className="vinkulo-reception"/);
  assert.match(page, /data-visual-editor-root/);
  assert.match(page, /data-editor-key="landing-page"/);
  assert.match(page, /data-editor-key="landing-governanca"/);
  assert.match(page, /className="landing-banner-stage"/);
  // As três interações por clique pedidas na reforma da recepção.
  assert.match(experience, /role="tablist" aria-label="Público da plataforma"/);
  assert.match(experience, /role="tablist" aria-label="Etapas da jornada"/);
  assert.match(experience, /role="tablist" aria-label="Depoimentos"/);
  assert.match(experience, /data-rc-reveal/);
  assert.match(experience, /IntersectionObserver/);
  assert.match(experience, /--rc-rx/);
  assert.match(css, /\.vinkulo-reception \{/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@keyframes rc-marquee/);
});

test("avisos de promoção e introdução aparecem uma única vez e podem ser pulados", async () => {
  const [avisos, painel, lib, migration] = await Promise.all([
    source("app/components/RecepcaoAvisos.tsx"),
    source("app/painel/page.tsx"),
    source("app/lib/recepcao.ts"),
    source("drizzle/0069_recepcao_avisos_biblioteca.sql"),
  ]);

  assert.match(painel, /<RecepcaoAvisos/);
  assert.match(painel, /getPendingPromotionNotice/);
  assert.match(painel, /getIntroductionState/);
  assert.match(avisos, /MARCAR_PROMOCAO_VISTA/);
  assert.match(avisos, /MARCAR_INTRODUCAO/);
  assert.match(avisos, /Pular introdução/);
  assert.match(avisos, /promo-confetti/);
  assert.match(lib, /visto_em IS NULL/);
  assert.match(lib, /ON CONFLICT\(usuario_id, tipo, comunidade_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `avisos_promocao`/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `usuario_introducoes`/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `ministerio_biblioteca_itens`/);
  assert.match(migration, /ADD COLUMN `item_id`/);
});

test("biblioteca do ministério mostra nome com ícones e o checklist não repete pessoas", async () => {
  const [workspace, css, route] = await Promise.all([
    source("app/components/SecretaryMinisterialWorkspace.tsx"),
    source("app/secretary.css"),
    source("app/api/pilot/ministerios/recursos/route.ts"),
  ]);

  assert.match(workspace, /Buscar música ou material/);
  assert.match(workspace, /ministry-library-icons/);
  assert.match(workspace, /function PlatformIcon/);
  assert.match(workspace, /RENOMEAR_ITEM_BIBLIOTECA/);
  assert.match(workspace, /EXCLUIR_ITEM_BIBLIOTECA/);
  // Uma pessoa escolhida em uma tarefa some das demais opções do checklist.
  assert.match(workspace, /draft\.voluntarioId === String\(volunteer\.id\)/);
  assert.match(css, /\.ministry-library-row\{/);
  assert.match(css, /\.platform-icon\{/);
  assert.match(route, /bibliotecaItens/);
  assert.match(route, /ensureLibraryItem/);
});

test("promoção registra aviso pendente que some depois de visto", async () => {
  const { database, d1 } = await createPilotD1();
  const worker = await loadWorker();
  const env = createEnv(d1);

  await createPilotUser(database, {
    nome: "Pastora Responsável",
    email: "pastora.recepcao@example.test",
    senha: "Recepcao123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  const memberId = await createPilotUser(database, {
    nome: "Marina Costa",
    email: "marina.recepcao@example.test",
    senha: "Recepcao123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const membership = database
    .prepare(
      "SELECT id FROM usuario_comunidades WHERE usuario_id = ? AND comunidade_id = 1",
    )
    .get(memberId);

  const pastorCookie = await login(
    worker,
    env,
    "pastora.recepcao@example.test",
    "Recepcao123",
  );
  const promotion = await worker.fetch(
    new Request("http://localhost/api/pilot/pessoas", {
      method: "PATCH",
      headers: { cookie: pastorCookie, "content-type": "application/json" },
      body: JSON.stringify({
        membershipId: membership.id,
        papel: "LIDER",
        oficial: true,
        titulo: "LÍDER",
        permissions: [],
      }),
    }),
    env,
    context,
  );
  assert.equal(promotion.status, 200);

  const registered = database
    .prepare(
      `SELECT papel_novo, titulo, visto_em FROM avisos_promocao
       WHERE usuario_id = ? AND comunidade_id = 1`,
    )
    .get(memberId);
  assert.equal(registered.papel_novo, "LIDER");
  assert.equal(registered.visto_em, null);

  const memberCookie = await login(
    worker,
    env,
    "marina.recepcao@example.test",
    "Recepcao123",
  );
  const pending = await worker.fetch(
    new Request("http://localhost/api/pilot/recepcao", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  assert.equal(pending.status, 200);
  const pendingPayload = await pending.json();
  assert.ok(pendingPayload.promocao);
  assert.equal(pendingPayload.promocao.papelNovo, "LIDER");
  assert.equal(pendingPayload.introducao.comunidade, false);

  const seen = await worker.fetch(
    new Request("http://localhost/api/pilot/recepcao", {
      method: "POST",
      headers: { cookie: memberCookie, "content-type": "application/json" },
      body: JSON.stringify({
        acao: "MARCAR_PROMOCAO_VISTA",
        id: pendingPayload.promocao.id,
      }),
    }),
    env,
    context,
  );
  assert.equal(seen.status, 200);

  const introSkipped = await worker.fetch(
    new Request("http://localhost/api/pilot/recepcao", {
      method: "POST",
      headers: { cookie: memberCookie, "content-type": "application/json" },
      body: JSON.stringify({
        acao: "MARCAR_INTRODUCAO",
        tipo: "COMUNIDADE",
        pulada: true,
        etapa: 1,
      }),
    }),
    env,
    context,
  );
  assert.equal(introSkipped.status, 200);

  const after = await worker.fetch(
    new Request("http://localhost/api/pilot/recepcao", {
      headers: { cookie: memberCookie },
    }),
    env,
    context,
  );
  const afterPayload = await after.json();
  assert.equal(afterPayload.promocao, null);
  assert.equal(afterPayload.introducao.comunidade, true);
  assert.equal(
    database
      .prepare(
        "SELECT status FROM usuario_introducoes WHERE usuario_id = ? AND tipo = 'COMUNIDADE'",
      )
      .get(memberId).status,
    "PULADA",
  );

  // Visitar de novo não recria o aviso: ele já foi marcado como visto.
  const anonymous = await worker.fetch(
    new Request("http://localhost/api/pilot/recepcao"),
    env,
    context,
  );
  assert.equal(anonymous.status, 401);
  database.close();
});

test("biblioteca agrupa links por item, renomeia e exclui em bloco", async () => {
  const { database, d1 } = await createPilotD1();
  const worker = await loadWorker();
  const env = createEnv(d1);

  const leaderId = await createPilotUser(database, {
    nome: "Líder do Louvor",
    email: "lider.biblioteca@example.test",
    senha: "Biblioteca123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  database
    .prepare(
      `INSERT INTO ministerios_comunidade
       (comunidade_id, nome, descricao, categoria, status,
        responsavel_usuario_id, criado_por, atualizado_por)
       VALUES (1, 'Louvor', '', 'LOUVOR', 'ATIVO', ?, ?, ?)`,
    )
    .run(leaderId, leaderId, leaderId);
  const ministry = database
    .prepare("SELECT id FROM ministerios_comunidade WHERE nome = 'Louvor'")
    .get();
  database
    .prepare(
      `INSERT INTO ministerio_voluntarios
       (comunidade_id, ministerio_id, usuario_id, funcao, papel,
        dias_disponiveis, periodo_preferido, ativo)
       VALUES (1, ?, ?, 'Líder do ministério', 'LIDER', '[]', 'FLEXIVEL', 1)`,
    )
    .run(ministry.id, leaderId);

  const cookie = await login(
    worker,
    env,
    "lider.biblioteca@example.test",
    "Biblioteca123",
  );

  const saved = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        acao: "SALVAR_LINKS_REUTILIZAVEIS",
        ministerioId: ministry.id,
        item: "Mil Graus",
        links: [
          { tipo: "YOUTUBE", titulo: "Mil Graus", url: "https://youtube.com/watch?v=mil" },
          { tipo: "SPOTIFY", titulo: "Mil Graus", url: "https://open.spotify.com/track/mil" },
        ],
      }),
    }),
    env,
    context,
  );
  assert.equal(saved.status, 200);
  const savedPayload = await saved.json();
  assert.ok(savedPayload.itemId);

  const listed = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      headers: { cookie },
    }),
    env,
    context,
  );
  const listedPayload = await listed.json();
  assert.equal(listedPayload.bibliotecaItens.length, 1);
  assert.equal(listedPayload.bibliotecaItens[0].titulo, "Mil Graus");
  assert.equal(listedPayload.bibliotecaItens[0].links.length, 2);

  const renamed = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        acao: "RENOMEAR_ITEM_BIBLIOTECA",
        id: savedPayload.itemId,
        titulo: "Mil Graus (2026)",
      }),
    }),
    env,
    context,
  );
  assert.equal(renamed.status, 200);
  assert.equal(
    database
      .prepare("SELECT titulo FROM ministerio_biblioteca_itens WHERE id = ?")
      .get(savedPayload.itemId).titulo,
    "Mil Graus (2026)",
  );

  const removed = await worker.fetch(
    new Request("http://localhost/api/pilot/ministerios/recursos", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        acao: "EXCLUIR_ITEM_BIBLIOTECA",
        id: savedPayload.itemId,
      }),
    }),
    env,
    context,
  );
  assert.equal(removed.status, 200);
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS total FROM ministerio_links_reutilizaveis
         WHERE item_id = ? AND ativo = 1`,
      )
      .get(savedPayload.itemId).total,
    0,
  );
  database.close();
});

// QA responsivo de 08/09/2026 (Etapa 13), medido em navegador a 360, 390, 412,
// 768 e 1366px: os pontos do carrossel de depoimentos são botões de 9x9px,
// muito abaixo do alvo de toque mínimo de 44px, e no celular era preciso mirar.
//
// A área clicável foi estendida por ::after, mas a largura ficou limitada aos
// 8px do espaçamento — 4px de cada lado. A primeira tentativa usou 44px de
// largura e o navegador mostrou que os alvos de pontos vizinhos passavam a se
// sobrepor, fazendo o ponto errado receber o clique. Um alvo largo demais aqui
// é pior que um alvo pequeno.
test("os pontos do carrossel têm alvo de toque ampliado sem invadir o vizinho", async () => {
  const css = await readFile(
    new URL("../app/recepcao.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.rc-testimonial-dots button \{[^}]*position: relative/,
    "o botão precisa ser o contexto de posicionamento do alvo estendido",
  );
  assert.match(
    css,
    /\.rc-testimonial-dots button::after \{[^}]*height: 44px/,
    "a altura do alvo deve alcançar os 44px: acima e abaixo não há vizinho",
  );
  assert.match(
    css,
    /\.rc-testimonial-dots button::after \{[^}]*width: calc\(100% \+ 8px\)/,
    "a largura do alvo só pode crescer o espaçamento entre os pontos; mais que isso faz o vizinho roubar o clique",
  );
  assert.doesNotMatch(
    css,
    /\.rc-testimonial-dots button::after \{[^}]*width: 44px/,
    "44px de largura sobre pontos a 17px de distância sobrepõe alvos vizinhos",
  );
});

// Contraste (Etapa 14, QA medido em navegador a 08/09/2026).
//
// Três cores de texto ficavam abaixo dos 4,5:1 que o WCAG AA pede para texto
// normal. A lição registrada aqui é a do vermelho e do verde: escurecer um
// valor único para acertar o tema claro apenas invertia o problema no escuro —
// medido e confirmado —, então cada tema precisa do seu valor. Por isso as duas
// viraram variáveis definidas nos dois blocos de tema.
test("cores de estado têm valor por tema e passam no contraste mínimo", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  const canal = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const razao = (a, b) => {
    const x = lum(hex(a)), y = lum(hex(b));
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  // Cada variável precisa existir nos dois temas, com valores diferentes.
  for (const nome of ["--pilot-danger", "--pilot-success"]) {
    const valores = [...css.matchAll(new RegExp(`${nome}:\\s*(#[0-9a-f]{6})`, "gi"))]
      .map((m) => m[1].toLowerCase());
    assert.ok(
      valores.length >= 2,
      `${nome} precisa estar definida no tema claro e no escuro`,
    );
    assert.ok(
      new Set(valores).size >= 2,
      `${nome} com valor único não serve os dois temas: o que passa num falha no outro`,
    );
  }

  const CLARA = "#fafbfc";
  const ESCURA = "#15181d";
  const casos = [
    ["#c6475e", CLARA, "vermelho do tema claro"],
    ["#dc4f68", ESCURA, "vermelho do tema escuro"],
    ["#238258", CLARA, "verde do tema claro"],
    ["#2a9c6a", ESCURA, "verde do tema escuro"],
    ["#706c65", CLARA, "cinza de estado vazio"],
  ];
  for (const [cor, fundo, rotulo] of casos) {
    assert.ok(
      css.includes(cor),
      `${rotulo}: ${cor} sumiu do CSS`,
    );
    const r = razao(cor, fundo);
    assert.ok(
      r >= 4.5,
      `${rotulo}: ${cor} sobre ${fundo} dá ${r.toFixed(2)}:1, abaixo dos 4,5:1 do WCAG AA`,
    );
  }
});
