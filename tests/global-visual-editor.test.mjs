import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Run the actual TypeScript handlers against a small D1 boundary, not source regexes.
function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}
const model = loadModule("../app/lib/global-visual-editor.ts");
const { parseGlobalVisualConfig: parse, resolveVisualConfig: resolve, setVisualRules, mergeVisualConfigs: merge, safeVisualHref } = model;
const owner = { user: { id: 7, email: "owner@example.test" }, context: { comunidadeId: 10, isOwner: true, isSuperadmin: false, communityAccess: "OWNER" } };

function harness(access = owner) {
  const state = { platform: null, rows: new Map(), writes: [], audit: [] };
  const db = { prepare(sql) { return { bind(...args) { return {
    async first() {
      if (sql.includes("FROM configuracoes")) return state.platform ? { valor: JSON.stringify(state.platform) } : null;
      const config = state.rows.get(`${args[0]}:${args[1]}`);
      return config ? { configuracao: JSON.stringify(config) } : null;
    },
    async run() {
      state.writes.push({ sql, args });
      if (sql.includes("INSERT INTO configuracoes")) state.platform = JSON.parse(args[1]);
      else state.rows.set(`${args[0]}:${args[2]}`, JSON.parse(args[5]));
      return { success: true };
    },
  }; } }; } };
  const api = loadModule("../app/api/pilot/editor-visual/route.ts", {
    "../../../../db": { getD1: () => db },
    "../../../lib/global-visual-editor": model,
    "../../../lib/local-auth": { getSessionUser: async () => ({ system_owner: access.context?.isSuperadmin }) },
    "../../../lib/tenant": { requireTenantPermission: async (permission) => { assert.equal(permission, "dashboard.view"); return access; } },
    "../../../lib/tenant-audit": { recordTenantAudit: async (...args) => state.audit.push(args) },
  });
  const patch = (body) => api.PATCH(new Request("https://example.test/api/pilot/editor-visual", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const get = (query = "") => api.GET(new Request(`https://example.test/api/pilot/editor-visual${query}`));
  return { ...state, state, patch, get };
}

test("screen edits survive storage without altering global rules, appearance, other screens or blocks", async () => {
  const h = harness();
  const initial = parse({ accentColor: "#123456", rules: { heading: { color: "#112233" } }, screens: { "panel:agenda": { appearance: { radius: 8 }, rules: { heading: { text: "Agenda" } } } }, textBoxes: [{ id: "agenda-block", screen: "panel:agenda", text: "Agenda note" }] });
  await h.patch({ scope: "PERSONAL", config: initial });
  const loaded = (await (await h.get()).json()).config;
  const edited = setVisualRules(loaded, "panel:inicio", { heading: { text: "Local only", color: "#abcdef" } });
  edited.screens["panel:inicio"].appearance = { textScale: 1.2 };
  assert.equal((await h.patch({ scope: "PERSONAL", config: edited })).status, 200);
  const saved = (await (await h.get()).json()).config;
  assert.equal(saved.accentColor, initial.accentColor);
  assert.equal(saved.textScale, initial.textScale);
  assert.deepEqual(saved.rules, initial.rules);
  assert.deepEqual(saved.screens["panel:agenda"], initial.screens["panel:agenda"]);
  assert.deepEqual(saved.textBoxes, initial.textBoxes);
  assert.equal(resolve(saved, "panel:inicio").rules.heading.text, "Local only");
  assert.equal(resolve(saved, "panel:inicio").textScale, 1.2);
  assert.equal(resolve(saved, "panel:agenda").rules.heading.text, "Agenda");
  assert.equal(resolve(saved, "panel:other").rules.heading.color, "#112233");
  assert.equal(h.writes[1].args[0], 10);
  assert.equal(h.writes[1].args[1], 7);
  assert.equal(h.writes[1].args[2], "visual:user:7");
});

test("effective audience excludes personal data from community and platform editing", async () => {
  const h = harness();
  h.state.platform = parse({ rules: { base: { text: "Platform" } }, screens: { "panel:inicio": { rules: { base: { color: "#112233" } } } } });
  h.rows.set("10:visual:community", parse({ rules: { community: { text: "Community" } } }));
  h.rows.set("10:visual:user:7", parse({ rules: { private: { text: "Personal" } } }));
  h.rows.set("11:visual:community", parse({ rules: { otherTenant: { text: "Never here" } } }));
  const community = (await (await h.get("?audience=COMMUNITY")).json()).config;
  const platform = (await (await h.get("?audience=PLATFORM")).json()).config;
  const personal = (await (await h.get()).json()).config;
  assert.deepEqual(Object.keys(community.rules).sort(), ["base", "community"]);
  assert.deepEqual(Object.keys(platform.rules), ["base"]);
  assert.deepEqual(Object.keys(personal.rules).sort(), ["base", "community", "private"]);
  assert.equal((await h.patch({ scope: "COMMUNITY", config: community })).status, 200);
  assert.equal(h.rows.get("10:visual:community").rules.private, undefined);
  assert.equal(h.writes[0].args[1], null);
  assert.equal((await h.get("?audience=unknown")).status, 400);
});

test("permissions reject missing session, members, tenant mismatch and unauthorized platform/public saves before writing", async () => {
  const cases = [
    [{ error: new Response(null, { status: 401 }) }, "PERSONAL", "panel", 401],
    [{ ...owner, context: { ...owner.context, isOwner: false } }, "PERSONAL", "panel", 403],
    [{ ...owner, context: { ...owner.context, communityAccess: "MEMBER" } }, "COMMUNITY", "panel", 403],
    [owner, "PLATFORM", "panel", 403],
    [owner, "PLATFORM", "public", 403],
    [{ ...owner, context: { ...owner.context, isSuperadmin: true, isOwner: false } }, "PLATFORM", "public", 403],
  ];
  for (const [access, scope, surface, status] of cases) {
    const h = harness(access);
    assert.equal((await h.patch({ scope, surface, config: parse({}) })).status, status);
    assert.equal(h.writes.length, 0);
    assert.equal(h.audit.length, 0);
  }
});

test("platform owner can save public platform only; malformed payloads do not wipe storage", async () => {
  const h = harness({ ...owner, context: { ...owner.context, isSuperadmin: true } });
  assert.equal((await h.patch({ scope: "PERSONAL", surface: "public", config: parse({}) })).status, 400);
  for (const body of [null, {}, { scope: "PERSONAL", config: [] }, { scope: "OTHER", config: {} }]) assert.equal((await h.patch(body)).status, 400);
  assert.equal(h.writes.length, 0);
  const config = parse({ screens: { "/public": { appearance: { radius: 12 }, rules: { title: { text: "Public" } } } } });
  assert.equal((await h.patch({ scope: "PLATFORM", surface: "public", config })).status, 200);
  assert.equal(h.writes.length, 1);
  assert.equal(h.audit.length, 1);
  assert.deepEqual((await (await h.get("?surface=public")).json()).config, config);
});

test("safe templates persist; script links, CSS injection and prototype keys are rejected", async () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "http://insecure.test", "//evil.test", "/\\evil.test", "https://user:password@example.test", "https://example.test\n.evil", "https://"]) assert.equal(safeVisualHref(url), undefined, url);
  assert.equal(safeVisualHref("/agenda?tab=hoje"), "/agenda?tab=hoje");
  assert.equal(safeVisualHref("https://example.test/path"), "https://example.test/path");
  const hostile = JSON.parse(String.raw`{"rules":{"__proto__":{"text":"bad"},"x\"]{body{display:none}}":{"color":"red"}},"screens":{"__proto__":{"rules":{}},"panel:inicio":{"appearance":{"accentColor":"red;display:none","textScale":999},"rules":{"title":{"background":"url(javascript:bad)","fontSize":999}}}}}`);
  const cleaned = parse(hostile);
  assert.equal(Object.hasOwn(cleaned.rules, "__proto__"), false);
  assert.equal(Object.hasOwn(cleaned.screens, "__proto__"), false);
  assert.deepEqual(cleaned.rules, {});
  assert.equal(cleaned.screens["panel:inicio"].rules.title.background, undefined);
  assert.equal(cleaned.screens["panel:inicio"].rules.title.fontSize, 48);
  const config = parse({ textBoxes: [
    { id: "link", screen: "panel:inicio", kind: "link", href: "https://example.test", text: "Read" },
    { id: "callout", screen: "panel:inicio", kind: "callout", text: "Notice" },
    { id: "bad", screen: "panel:inicio", kind: "link", href: "javascript:alert(1)", text: "" },
  ] });
  const h = harness();
  await h.patch({ scope: "PERSONAL", config });
  const saved = (await (await h.get()).json()).config;
  assert.equal(saved.textBoxes[0].href, "https://example.test/");
  assert.equal(saved.textBoxes[1].kind, "callout");
  assert.equal(saved.textBoxes[2].href, undefined);
  assert.equal(saved.textBoxes[2].text, "");
});

test("removing an inherited block and resetting a selected rule survive reload without changing other items", async () => {
  const h = harness();
  h.state.platform = parse({ textBoxes: [{ id: "inherited", screen: "panel:inicio" }, { id: "keep", screen: "panel:agenda" }], screens: { "panel:inicio": { rules: { title: { color: "#123456" } } } } });
  const loaded = (await (await h.get()).json()).config;
  const draft = setVisualRules(loaded, "panel:inicio", { title: {} });
  draft.textBoxes = draft.textBoxes.filter((box) => box.id !== "inherited");
  draft.removedTextBoxIds = ["inherited"];
  await h.patch({ scope: "PERSONAL", config: draft });
  const reloaded = (await (await h.get()).json()).config;
  assert.deepEqual(reloaded.textBoxes.map((box) => box.id), ["keep"]);
  assert.deepEqual(resolve(reloaded, "panel:inicio").rules.title, {});
  assert.equal((await (await h.get("?audience=PLATFORM")).json()).config.textBoxes.length, 2);
});

test("legacy layouts remain compatible and screen maps merge independently", () => {
  assert.deepEqual(parse({}).screens, {});
  const merged = merge(parse({ screens: { a: { appearance: { radius: 4 }, rules: { title: { text: "A" } } } } }), parse({ screens: { b: { appearance: { textScale: 1.1 }, rules: {} } } }));
  assert.equal(resolve(merged, "a").radius, 4);
  assert.equal(resolve(merged, "b").textScale, 1.1);
  assert.equal(resolve(merged, "a").rules.title.text, "A");
});
