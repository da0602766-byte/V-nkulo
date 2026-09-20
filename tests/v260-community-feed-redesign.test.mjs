import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("o feed mantém filtros locais sem buscar a comunidade novamente", () => {
  const source = read("app/components/CommunityHome.tsx");
  assert.match(source, /feedFilter/);
  assert.match(source, /const visiblePosts = useMemo/);
  assert.match(source, /Para você/);
  assert.match(source, /Comunicados/);
  assert.match(source, /Eventos/);
  assert.match(source, /Ministérios/);
  assert.match(source, /visiblePosts\.map/);
});

test("o novo compositor aproveita a publicação existente e não duplica a rota", () => {
  const source = read("app/components/CommunityHome.tsx");
  assert.match(source, /community-composer-compact/);
  assert.match(source, /\/api\/pilot\/publicacoes/);
  assert.match(source, /NativeImageUpload/);
  assert.match(source, /audienciaTipo/);
});

test("reações são persistentes, limitadas a tipos aceitos e isoladas por comunidade", () => {
  const route = read("app/api/pilot/publicacoes/[id]/reacoes/route.ts");
  const migration = read("drizzle/0076_feed_reactions.sql");
  assert.match(route, /requireTenantPermission\("feed\.view"\)/);
  assert.match(route, /comunidade_id = \?/);
  assert.match(route, /INSERT OR IGNORE INTO reacoes_publicacao/);
  assert.match(route, /DELETE FROM reacoes_publicacao/);
  assert.match(route, /const TYPES = \["AMEM", "CORACAO", "ORACAO", "ALEGRIA"\]/);
  assert.match(migration, /CREATE UNIQUE INDEX `reacoes_publicacao_unica_idx`/);
  assert.match(migration, /ON DELETE cascade/);
});

test("o feed carrega totais de reações junto das publicações, sem uma requisição por item", () => {
  const route = read("app/api/pilot/publicacoes/route.ts");
  const home = read("app/components/CommunityHome.tsx");
  assert.match(route, /AS reacoes_json/);
  assert.match(route, /AS minhas_reacoes_json/);
  assert.match(home, /CommunityPostReactions/);
  assert.match(home, /initialCounts=\{post\.reacoes_json\}/);
});

test("o estilo do feed é delimitado e adapta a composição para celular", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /\.community-feed-redesign \{/);
  assert.match(styles, /\.community-feed-tabs/);
  assert.match(styles, /\.community-reaction-picker/);
  assert.match(styles, /@media \(max-width: 680px\)/);
});
