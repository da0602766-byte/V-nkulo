import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function compile(path, dependencies = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, { exports, Response, Request, URL, Buffer, Error, ...globals, require(name) {
    if (name.endsWith(".css")) return {};
    if (name === "./feed/ReactionSymbol") return { default: compile("app/components/feed/ReactionSymbol.tsx", { "react/jsx-runtime": jsx }).default };
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

async function fixture(t) {
  const { database, d1 } = await createPilotD1();
  t.after(() => database.close());
  const author = await createPilotUser(database, { nome: "Autor", email: "feed.author@example.test", senha: "test", memberships: [{ comunidadeId: 1, papel: "LIDER" }] });
  const member = await createPilotUser(database, { nome: "Membro", email: "feed.member@example.test", senha: "test" });
  const moderator = await createPilotUser(database, { nome: "Admin", email: "feed.admin@example.test", senha: "test", memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  const audit = [];
  let access;
  const cursor = compile("app/lib/feed-cursor.ts");
  const dependencies = {
    "../../../../db": { getD1: () => d1 },
    "../../../../../db": { getD1: () => d1 },
    "../../../../../../db": { getD1: () => d1 },
  };
  for (const prefix of ["../../../lib/", "../../../../lib/", "../../../../../lib/"]) {
    Object.assign(dependencies, {
      [`${prefix}tenant`]: { requireTenantPermission: async (permission) => { assert.equal(permission, "feed.view"); return access; } },
      [`${prefix}tenant-audit`]: { recordTenantAudit: async (...args) => audit.push(args) },
      [`${prefix}feed-validation`]: {},
      [`${prefix}pilot-notifications`]: {},
      [`${prefix}feed-cursor`]: cursor,
      [`${prefix}editorial-scheduler`]: { publishDueEditorialEntries: async () => {} },
      [`${prefix}local-auth`]: { isSystemOwnerAccount: () => false },
    });
  }
  const list = compile("app/api/pilot/publicacoes/route.ts", dependencies);
  const item = compile("app/api/pilot/publicacoes/[id]/route.ts", dependencies);
  const reactions = compile("app/api/pilot/publicacoes/[id]/reacoes/route.ts", dependencies);
  const initial = compile("app/lib/pilot-data.ts", { "../../db": { getD1: () => d1 }, "./community-theme": {} });
  function as(userId, { tenant = 1, moderate = false, owner = false, publish = false } = {}) {
    access = { user: { id: userId, system_owner: owner }, context: { comunidadeId: tenant, permissions: ["feed.view", ...(moderate ? ["feed.moderate"] : []), ...(publish ? ["feed.publish"] : [])] } };
  }
  function post({ tenant = 1, creator = author, feed = 1, sidebar = 0, status = "PUBLICADA" } = {}) {
    return Number(database.prepare(`INSERT INTO publicacoes_piloto
      (comunidade_id, titulo, resumo, conteudo, categoria, visibilidade, status, origem, criado_por, canal_feed, canal_lateral, criado_em)
      VALUES (?, 'Teste feed', '', 'Conteúdo', 'COMUNIDADE', 'COMUNIDADE', ?, 'COMUNIDADE', ?, ?, ?, '2099-01-01 12:00:00')`)
      .run(tenant, status, creator, feed, sidebar).lastInsertRowid);
  }
  return { database, author, member, moderator, audit, as, post,
    react: (id, type, method = "POST") => reactions[method](new Request(`http://localhost/api/pilot/publicacoes/${id}/reacoes`, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: type }),
    }), { params: Promise.resolve({ id: String(id) }) }),
    deny: () => { access = { error: Response.json({ error: "Sessão inválida" }, { status: 401 }) }; },
    get: async (query = "limit=20") => list.GET(new Request(`http://localhost/api/pilot/publicacoes?${query}`)),
    initial: () => initial.getPilotFeed(access.context.comunidadeId, access.user.id, access.context.permissions.includes("feed.moderate"), access.user.system_owner),
    remove: async (id) => item.DELETE(new Request(`http://localhost/api/pilot/publicacoes/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id: String(id) }) }),
  };
}

test("feed: author can delete own post; member/publish permission cannot delete another author's post", async (t) => {
  const f = await fixture(t);
  const id = f.post();
  f.as(f.member, { publish: true });
  const listed = (await (await f.get()).json()).publicacoes.find((post) => post.id === id);
  assert.equal(listed.can_delete, 0);
  assert.equal((await f.remove(id)).status, 403);
  assert.equal(f.audit.length, 0);
  assert.ok(f.database.prepare("SELECT id FROM publicacoes_piloto WHERE id = ?").get(id));
  f.as(f.author);
  assert.equal((await (await f.get()).json()).publicacoes.find((post) => post.id === id).can_delete, 1);
  f.database.prepare("INSERT INTO comentarios_publicacao (publicacao_id, usuario_id, autor_nome_snapshot, texto) VALUES (?, ?, 'Membro', 'Amém')").run(id, f.member);
  f.database.prepare("INSERT INTO reacoes_publicacao (publicacao_id, usuario_id, tipo) VALUES (?, ?, 'AMEM')").run(id, f.member);
  assert.equal((await f.remove(id)).status, 200);
  for (const table of ["comentarios_publicacao", "reacoes_publicacao"]) {
    assert.equal(f.database.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE publicacao_id = ?`).get(id).n, 0);
  }
  assert.equal(f.audit[0][3], "PUBLICACAO_EXCLUIDA_DEFINITIVAMENTE");
  assert.equal(f.audit[0][5].autorId, f.author);
});

test("feed: moderation grants hiding only; global owner may delete within the active tenant", async (t) => {
  const f = await fixture(t);
  const id = f.post();
  f.as(f.moderator, { moderate: true });
  const moderated = (await (await f.get()).json()).publicacoes.find((post) => post.id === id);
  assert.equal(moderated.can_hide, 1);
  assert.equal(moderated.can_delete, 0);
  assert.equal((await f.remove(id)).status, 403);
  f.as(f.moderator, { owner: true });
  assert.equal((await (await f.get()).json()).publicacoes.find((post) => post.id === id).can_delete, 1);
  assert.equal((await f.remove(id)).status, 200);
  const otherTenant = f.post({ tenant: 2 });
  assert.equal((await f.remove(otherTenant)).status, 404);
  f.as(f.author);
  assert.equal((await f.remove(otherTenant)).status, 404, "even authors cannot delete through another tenant");
  assert.ok(f.database.prepare("SELECT id FROM publicacoes_piloto WHERE id = ?").get(otherTenant));
});

test("feed: deletion rechecks revoked permission, missing session, and invalid IDs", async (t) => {
  const f = await fixture(t);
  const id = f.post();
  f.as(f.moderator, { owner: true });
  assert.equal((await (await f.get()).json()).publicacoes.find((post) => post.id === id).can_delete, 1);
  f.as(f.moderator);
  assert.equal((await f.remove(id)).status, 403);
  assert.equal((await f.remove("invalid")).status, 400);
  assert.equal((await f.remove(0)).status, 400);
  f.deny();
  assert.equal((await f.remove(id)).status, 401);
  assert.equal(f.audit.length, 0);
});

test("feed: SSR and GET action flags match for author, member, moderator and platform owner", async (t) => {
  const f = await fixture(t);
  const own = f.post();
  const other = f.post({ creator: f.member });
  for (const [user, grants] of [[f.author, {}], [f.moderator, { moderate: true }], [f.member, {}], [f.moderator, { owner: true }]]) {
    f.as(user, grants);
    const initial = await f.initial();
    const updated = (await (await f.get()).json()).publicacoes;
    for (const id of [own, other]) {
      const ssr = initial.find((post) => post.id === id);
      const api = updated.find((post) => post.id === id);
      for (const flag of ["can_edit", "can_hide", "can_delete"]) assert.equal(ssr[flag], api[flag], `${user} ${id} ${flag}`);
    }
  }
  assert.match(read("app/painel/page.tsx"), /getPilotFeed\([^\n]+session\.user\.system_owner === true\)/);
});

test("feed: initial render restores persisted counts and only the current user's selections", async (t) => {
  const f = await fixture(t);
  const id = f.post();
  const insert = f.database.prepare("INSERT INTO reacoes_publicacao (publicacao_id, usuario_id, tipo) VALUES (?, ?, ?)");
  insert.run(id, f.author, "CORACAO");
  insert.run(id, f.member, "CORACAO");
  insert.run(id, f.member, "AMEM");
  for (const [user, expected] of [[f.author, ["CORACAO"]], [f.member, ["AMEM"]], [f.moderator, []]]) {
    f.as(user);
    const ssr = (await f.initial()).find((post) => post.id === id);
    const api = (await (await f.get()).json()).publicacoes.find((post) => post.id === id);
    assert.deepEqual(JSON.parse(ssr.reacoes_json), { AMEM: 1, CORACAO: 1 });
    assert.deepEqual(JSON.parse(ssr.minhas_reacoes_json).sort(), expected);
    assert.deepEqual(JSON.parse(ssr.reacoes_json), JSON.parse(api.reacoes_json));
    assert.deepEqual(JSON.parse(ssr.minhas_reacoes_json).sort(), JSON.parse(api.minhas_reacoes_json).sort());
  }
});

test("reactions: replacing, retrying and removing retain one choice per user and preserve others", async (t) => {
  const f = await fixture(t);
  const id = f.post();
  f.as(f.author);
  await f.react(id, "AMEM");
  f.as(f.member);
  await f.react(id, "AMEM");
  for (const type of ["CORACAO", "ORACAO", "ALEGRIA", "ALEGRIA"]) {
    const response = await f.react(id, type);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.minhas, [type]);
    assert.equal(Object.values(result.contagens).reduce((sum, n) => sum + n, 0), 2);
    assert.equal(f.database.prepare("SELECT COUNT(*) n FROM reacoes_publicacao WHERE publicacao_id = ? AND usuario_id = ?").get(id, f.member).n, 1);
  }
  await f.react(id, "AMEM", "DELETE"); // stale removal must not erase a newer selection
  assert.deepEqual((await (await f.react(id, "ALEGRIA")).json()).minhas, ["ALEGRIA"]);
  const removed = await (await f.react(id, "ALEGRIA", "DELETE")).json();
  assert.deepEqual(removed.minhas, []);
  assert.equal(removed.contagens.AMEM, 1);
  const foreign = f.post({ tenant: 2 });
  assert.equal((await f.react(foreign, "AMEM")).status, 404);
  assert.equal((await f.react(id, "invalid")).status, 400);
  f.deny();
  assert.equal((await f.react(id, "AMEM")).status, 401);
});

test("reactions: legacy multi-selection is counted once and cleared atomically on next choice", async (t) => {
  const f = await fixture(t);
  const id = f.post();
  f.as(f.member);
  for (const type of ["AMEM", "CORACAO", "ORACAO"]) f.database.prepare("INSERT INTO reacoes_publicacao (publicacao_id,usuario_id,tipo) VALUES (?,?,?)").run(id, f.member, type);
  const removed = await (await f.react(id, "ORACAO", "DELETE")).json();
  assert.deepEqual(removed.minhas, []);
  assert.equal(f.database.prepare("SELECT COUNT(*) n FROM reacoes_publicacao WHERE publicacao_id=?").get(id).n, 0);
  await f.react(id, "CORACAO");
  f.database.exec("CREATE TRIGGER fail_reaction BEFORE INSERT ON reacoes_publicacao WHEN NEW.tipo = 'ALEGRIA' BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
  await assert.rejects(f.react(id, "ALEGRIA"), /test write failure/);
  assert.equal(f.database.prepare("SELECT tipo FROM reacoes_publicacao WHERE publicacao_id=?").get(id).tipo, "CORACAO", "failed replacement rolls back deletion");
});

test("feed: paginated and sidebar listings preserve per-post delete authorization", async (t) => {
  const f = await fixture(t);
  const own = f.post();
  const other = f.post({ creator: f.member });
  const sidebar = f.post({ feed: 0, sidebar: 1 });
  f.as(f.author);
  const first = await (await f.get("limit=1")).json();
  assert.equal(first.publicacoes[0].id, other);
  assert.equal(first.publicacoes[0].can_delete, 0);
  const second = await (await f.get(`limit=1&cursor=${first.nextCursor}`)).json();
  assert.equal(second.publicacoes[0].id, own);
  assert.equal(second.publicacoes[0].can_delete, 1);
  const rail = await (await f.get("placement=sidebar&limit=20")).json();
  assert.equal(rail.publicacoes.find((post) => post.id === sidebar).can_delete, 1);
  assert.ok(!rail.publicacoes.some((post) => post.id === own));
});

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
function harness(path, globals = {}) {
  const slots = [];
  let index = 0;
  const hooks = {
    useState(initial) { const key = index++; if (!(key in slots)) slots[key] = typeof initial === "function" ? initial() : initial; return [slots[key], (value) => { slots[key] = typeof value === "function" ? value(slots[key]) : value; }]; },
    useRef(initial) { const key = index++; return slots[key] ??= { current: initial }; },
    useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect() {}, useId: () => "test-profile",
  };
  const Component = compile(path, { react: hooks, "react/jsx-runtime": jsx, "./VerifiedOwnerName": { default: () => null }, "./feed/FeedPresencePopover": { default: () => null }, "./TransientFeedback": { default: () => null } }, { document: { activeElement: null }, ...globals }).default;
  return { slots, render(props) { index = 0; return Component(props); } };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("reactions: optimistic toggle guards double clicks, rolls back failures and permits retry/removal", async () => {
  const requests = [];
  let respond;
  const f = harness("app/components/CommunityPostReactions.tsx", { fetch: (url, options) => {
    requests.push({ url, ...options });
    return new Promise((resolve) => { respond = resolve; });
  } });
  const props = { postId: 10, initialCounts: '{"AMEM":2}', initialMine: "[]" };
  let tree = f.render(props);
  const find = (predicate) => nodes(tree).find(predicate);
  const amem = () => find((node) => node.props?.["data-reaction"] === "AMEM");
  amem().props.onClick();
  amem().props.onClick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(JSON.parse(requests[0].body).tipo, "AMEM");
  tree = f.render(props);
  assert.equal(amem().props["aria-pressed"], true);
  assert.equal(amem().props["aria-disabled"], true);
  assert.match(find((node) => node.props?.role === "img").props["aria-label"], /3 reações/);
  respond(Response.json({ error: "Sem conexão" }, { status: 503 }));
  await settle();
  tree = f.render(props);
  assert.equal(amem().props["aria-pressed"], false);
  assert.equal(amem().props["aria-disabled"], false);
  assert.equal(find((node) => node.props?.role === "alert").props.children, "Sem conexão");
  assert.equal(typeof find((node) => node.props?.role === "alert").type, "function", "error uses the shared transient feedback component");
  assert.match(find((node) => node.props?.role === "img").props["aria-label"], /2 reações/);
  amem().props.onClick();
  respond(Response.json({ contagens: { AMEM: 3 }, minhas: ["AMEM"] }));
  await settle();
  tree = f.render(props);
  assert.equal(amem().props["aria-pressed"], true);
  assert.match(find((node) => node.props?.role === "status").props.children, /adicionada/);
  amem().props.onClick();
  assert.equal(requests.at(-1).method, "DELETE");
  respond(Response.json({ contagens: { AMEM: 2 }, minhas: [] }));
  await settle();
  tree = f.render(props);
  assert.equal(amem().props["aria-pressed"], false);
  assert.match(find((node) => node.props?.role === "status").props.children, /removida/);
});

test("reactions: optimistic replacement changes only the choice, not the user's total", async () => {
  let respond;
  const f = harness("app/components/CommunityPostReactions.tsx", { fetch: () => new Promise((resolve) => { respond = resolve; }) });
  const props = { postId: 10, initialCounts: '{"AMEM":2,"CORACAO":3}', initialMine: '["AMEM"]' };
  let tree = f.render(props);
  const choice = (type) => nodes(tree).find((node) => node.props?.["data-reaction"] === type);
  choice("CORACAO").props.onClick();
  tree = f.render(props);
  assert.equal(choice("AMEM").props["aria-pressed"], false);
  assert.equal(choice("CORACAO").props["aria-pressed"], true);
  assert.match(nodes(tree).find((node) => node.props?.role === "img").props["aria-label"], /5 reações: Amém: 1, Amei: 4/);
  respond(Response.json({ error: "Falha" }, { status: 503 }));
  await settle();
  tree = f.render(props);
  assert.equal(choice("AMEM").props["aria-pressed"], true);
  assert.equal(choice("CORACAO").props["aria-pressed"], false);
});

test("presence: actions are adjacent to the selected person and use refreshed message permission", () => {
  const f = harness("app/components/CommunityPresencePanel.tsx");
  f.render();
  f.slots[0] = [1, 2, 3].map((id) => ({ userId: id, name: `Pessoa ${id}`, hierarchy: "MEMBRO", online: true, canMessage: true, biography: "Biografia" }));
  f.slots[2] = false;
  let tree = f.render();
  nodes(tree).find((node) => node.props?.["aria-label"] === "Abrir perfil de Pessoa 2").props.onClick({ currentTarget: { focus() {} } });
  tree = f.render();
  const rows = nodes(tree).filter((node) => node.props?.className === "feed-presence-row");
  assert.equal(rows.length, 3);
  assert.equal(nodes(rows[0]).filter((node) => node.props?.anchorRef).length, 0);
  assert.equal(nodes(rows[1]).find((node) => node.props?.anchorRef).props.label, "Perfil de Pessoa 2");
  assert.equal(nodes(rows[2]).filter((node) => node.props?.anchorRef).length, 0);
  f.slots[0] = f.slots[0].map((person) => ({ ...person, canMessage: false }));
  tree = f.render();
  assert.equal(nodes(tree).find((node) => node.type === "button" && node.props.children === "Mensagem").props.disabled, true);
});

test("presence: desktop card prefers the left, clamps vertically, and falls back inline on narrow screens", () => {
  const { presencePopoverPosition: position } = compile("app/components/feed/FeedPresencePopover.tsx", { react: {}, "react-dom": {}, "react/jsx-runtime": jsx });
  const placed = position({ left: 1000, right: 1260, top: 700 }, 260, 1440, 800);
  assert.equal(placed.left, 688);
  assert.equal(placed.top, 528);
  const tall = position({ left: 1000, right: 1260, top: -200 }, 2000, 1440, 800);
  assert.equal(tall.top, 12);
  assert.equal(tall.maxHeight, 776);
  assert.equal(position({ left: 20, right: 300, top: 200 }, 260, 390, 800), null);
  assert.equal(position({ left: 200, right: 950, top: 200 }, 260, 1024, 800), null);
  assert.equal(position({ left: 20, right: 300, top: 200 }, 260, 1100, 800).left, 312);
});

test("presence: first layout positions against the clicked button even before the conditional row ref attaches", () => {
  const effects = [];
  let position;
  const panel = { getBoundingClientRect: () => ({ height: 240 }) };
  const anchorRef = { current: null };
  const triggerRef = { current: { getBoundingClientRect: () => ({ left: 983, right: 1192, top: 253 }) } };
  const listeners = { addEventListener() {}, removeEventListener() {} };
  const Component = compile("app/components/feed/FeedPresencePopover.tsx", {
    "react/jsx-runtime": jsx, "react-dom": { createPortal: (element) => element },
    react: {
      useRef: (value) => ({ current: value === null ? panel : value }),
      useState: () => [null, (update) => { position = update(position ?? null); }],
      useLayoutEffect: (effect) => { effects.push(effect); },
    },
  }, {
    ResizeObserver: class { observe() {} disconnect() {} },
    window: { ...listeners, innerWidth: 1280, innerHeight: 900, visualViewport: { ...listeners, width: 1265, height: 900, offsetTop: 0, offsetLeft: 0 } },
    document: listeners,
  }).default;
  Component({ id: "presence-1", label: "Perfil", anchorRef, triggerRef, onClose() {}, onDismiss() {}, children: null });
  const cleanup = effects[0]();
  assert.ok(position, "must not wait for a subsequent resize or row ref commit");
  assert.equal(position.left, 671);
  assert.equal(position.top, 253);
  cleanup();
});

test("presence: operational errors use transient feedback without dismissing persistent profile context", () => {
  const source = read("app/components/CommunityPresencePanel.tsx");
  assert.match(source, /<TransientFeedback className="presence-error" role="alert">\{error\}<\/TransientFeedback>/);
  assert.match(source, /<small className="presence-message-rule">/);
  assert.match(source, /className="presence-biography" hidden=\{!showBiography\}/);
});

test("composer: three exclusive accessible destinations; feed is the default", () => {
  const Component = compile("app/components/feed/FeedChannelChoices.tsx", { "react/jsx-runtime": jsx }).default;
  const options = nodes(Component()).filter((node) => node.type === "input");
  assert.deepEqual(options.map((node) => node.props.value), ["feed", "sidebar", "both"]);
  assert.equal(options.filter((node) => node.props.defaultChecked).length, 1);
  assert.equal(options.find((node) => node.props.defaultChecked).props.value, "feed");
  assert.ok(options.every((node) => node.props.type === "radio" && node.props.name === "publicationChannel" && node.props.required));
  const home = read("app/components/CommunityHome.tsx");
  assert.match(home, /canalFeed: form.get\("publicationChannel"\) !== "sidebar"/);
  assert.match(home, /canalLateral: form.get\("publicationChannel"\) !== "feed"/);
  assert.doesNotMatch(home, /<p[^>]*className=[^>]*operations-feedback/);
  assert.equal((home.match(/<TransientFeedback /g) || []).length, 3);
});
