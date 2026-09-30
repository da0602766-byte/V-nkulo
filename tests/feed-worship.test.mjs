import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPilotD1 } from "./helpers/sqlite-d1.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("a carga inicial não expõe posts de outra comunidade, outro ministério ou canal lateral", async () => {
  const { database } = await createPilotD1();
  try {
    const source = await read("app/lib/pilot-data.ts");
    const fn = source.slice(source.indexOf("export async function getPilotFeed("), source.indexOf("export async function getPilotFeatureState("));
    const sql = fn.match(/`(SELECT[\s\S]*?)`/)[1];
    const insert = database.prepare(`INSERT INTO publicacoes_piloto (comunidade_id,titulo,resumo,conteudo,categoria,visibilidade,status,origem,audiencia_tipo,ministerios_json,canal_feed) VALUES (?,?,'','','COMUNIDADE','COMUNIDADE','PUBLICADA','COMUNIDADE',?,?,?)`);
    insert.run(1, "qa-public", "PUBLICO", "[]", 1);
    insert.run(1, "qa-private", "MINISTERIOS", "[]", 1);
    insert.run(1, "qa-sidebar", "PUBLICO", "[]", 0);
    insert.run(2, "qa-other-tenant", "PUBLICO", "[]", 1);
    // SSR now carries the same author/global-owner action flags as the GET route.
    const member = database.prepare(sql).all(0, 0, 0, 0, 0, 0, 1, 0, 0).map((row) => row.titulo);
    assert.ok(member.includes("qa-public"));
    for (const title of ["qa-private", "qa-sidebar", "qa-other-tenant"]) assert.ok(!member.includes(title), title);
    const moderator = database.prepare(sql).all(0, 0, 1, 0, 0, 0, 1, 1, 0).map((row) => row.titulo);
    assert.ok(moderator.includes("qa-private"));
    assert.ok(!moderator.includes("qa-other-tenant"));
  } finally { database.close(); }
});

test("destaques reutilizam publicações autorizadas e não carregam exemplos do protótipo", async () => {
  const home = await read("app/components/CommunityHome.tsx");
  const highlights = await read("app/components/feed/FeedHighlights.tsx");
  assert.match(home, /posts\.filter\(\(post\) => post\.status === "PUBLICADA" && !seenHighlights\.includes\(post\.id\)\)\.slice\(0, 8\)/);
  assert.match(highlights, /if \(!items.length\) return null/);
  assert.doesNotMatch(highlights, /avatar-ana|story-cultos|124 participantes|Juliana/);
  assert.match(home, /setFeedSearch\(""\);\s*setFeedFilter\("TODOS"\)/);
});

test("nova ação móvel abre o compositor existente respeitando permissão e somente leitura", async () => {
  const home = await read("app/components/CommunityHome.tsx");
  const dashboard = await read("app/components/PilotDashboard.tsx");
  assert.match(home, /!readOnlyFeed && permissions.includes\("feed.publish"\)/);
  assert.match(home, /if \(!canPublish\) return;[\s\S]*addEventListener\("vinkulo:new-publication"/);
  assert.match(dashboard, /active.permissions.includes\("feed.publish"\)[\s\S]{0,280}vinkulo:new-publication/);
  assert.match(dashboard, /key=\{active.comunidadeId\}/);
});

test("mídia fotográfica respeita economia de dados e mantém carregamento gradual e download", async () => {
  const image = await read("app/components/ResponsiveFeedImage.tsx");
  assert.match(image, /presentation === "photo" && preferenceReady && !dataSaver/);
  assert.match(image, /loading="lazy"/);
  assert.match(image, /decoding="async"/);
  assert.match(image, /href=\{downloadUrl\} download/);
});
