import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function assertMissing(path) {
  await assert.rejects(access(new URL(path, root)));
}

test("componentes e helpers aposentados não voltam ao repositório", async () => {
  await Promise.all([
    assertMissing("app/components/DashboardChart.tsx"),
    assertMissing("app/components/LandingFeatureCards.tsx"),
    assertMissing("app/components/PublicFeedCard.tsx"),
    assertMissing("app/components/PublicPostInteractions.tsx"),
    assertMissing("app/lib/display-control.ts"),
    assertMissing("app/lib/display-message-input.ts"),
    assertMissing("app/lib/diaconia-ranking.ts"),
    assertMissing("app/lib/diaconia-teams.ts"),
  ]);
});

test("Diaconia removida não retorna e pastoral usa a view de liderança", async () => {
  const [dashboard, panel] = await Promise.all([
    source("app/components/PilotDashboard.tsx"),
    source("app/painel/page.tsx"),
  ]);

  // Decisão explícita do proprietário em 25/09/2026; não restaurar a aba.
  assert.doesNotMatch(dashboard, /DiaconiaWorkspace|id: "diaconia"|visibleView === "diaconia"/);
  assert.doesNotMatch(panel, /^\s*"diaconia",$/m);
  assert.match(dashboard, /mode=\{active\.permissions\.includes\("pastoral\.panel\.view"\) \? "pastoral" : "leader"\}/);
  assert.doesNotMatch(dashboard, /\| "pastoral"/);
  assert.doesNotMatch(panel, /^\s*"pastoral",$/m);
});

test("estilos exclusivos dos componentes aposentados não permanecem globais", async () => {
  const styles = await source("app/globals.css");

  assert.doesNotMatch(styles, /\.landing-feature-(?:backdrop|dialog|close)/);
  assert.doesNotMatch(styles, /\.(?:social-feed-card|public-post-interactions|public-comments-list|public-comment-form)\b/);
  assert.doesNotMatch(styles, /\.(?:chart-summary|bar-chart|bar-column|period-tabs)\b/);
  assert.doesNotMatch(styles, /\.(?:display-message-banner|display-control-panel)\b/);
  assert.match(styles, /\.community-comments\s*\{/);
  assert.match(styles, /\.shared-publication-copy p\s*\{[^}]*white-space:pre-wrap/s);
});
