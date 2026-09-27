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
  assert.match(source, /FeedComposerBar/);
  assert.match(read("app/components/feed/FeedComposerBar.tsx"), /worship-composer-tools/);
  assert.match(source, /community-composer-inline/);
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

test("o compositor do mural redesenhado não herda a regra legada de tamanho zero", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /\.community-home:not\(\.community-feed-redesign\) \.community-composer\s*\{\s*width: 0;\s*height: 0;/);
  assert.match(styles, /\.community-feed-redesign \.community-composer\s*\{\s*width: 100%;\s*height: auto;/);
});

test("falha na carga inicial não é exibida como feed vazio", () => {
  const source = read("app/components/CommunityHome.tsx");
  assert.match(source, /const \[error, setError\] = useState\(""\)/);
  assert.match(source, /setError\(\(loadError as Error\)\.message\)/);
  assert.match(source, /\(feedback \|\| error\) &&/);
  assert.match(source, /className=\{`operations-feedback \$\{error \? "error" : ""\}`\}/);
  assert.match(source, /feedLoadError &&/);
  assert.match(source, /onClick=\{\(\) => void loadMorePosts\(\)\}>/);
});

test("layout do mural respeita o espaço útil entre desktop, tablet e celular", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /@media \(min-width: 821px\) and \(max-width: 1100px\) \{\s*\.pilot-dashboard\[data-ui-version="v2"\] \.community-feed-redesign \.community-home-grid \{\s*grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(styles, /\.community-feed-redesign \.community-home-command \{\s*display: flex !important;/);
  assert.match(styles, /@media \(max-width: 820px\) \{\s*\.pilot-dashboard\[data-ui-version="v2"\] \.community-feed-redesign \.community-home-command \{ align-items: flex-start !important; \}\s*\.pilot-dashboard\[data-ui-version="v2"\] \.community-feed-redesign \.community-home-intro \{ width: 100%; flex: none; \}/);
});

test("o compositor do mural mantém largura e altura próprias em telas maiores", () => {
  const styles = read("app/globals.css");
  assert.match(
    styles,
    /\.pilot-dashboard\[data-ui-version="v2"\] \.community-feed-redesign > \.community-composer\s*\{[^}]*width:\s*100%\s*!important;[^}]*height:\s*auto\s*!important;/s,
  );
});
