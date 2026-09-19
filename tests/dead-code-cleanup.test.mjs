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

test("Diaconia permanece alcançável e pastoral usa a view de liderança", async () => {
  const [dashboard, panel] = await Promise.all([
    source("app/components/PilotDashboard.tsx"),
    source("app/painel/page.tsx"),
  ]);

  assert.match(dashboard, /dynamic\(\(\) => import\("\.\/DiaconiaWorkspace"\)/);
  assert.match(dashboard, /id: "diaconia"[\s\S]*permission: "diaconia\.view"/);
  assert.match(dashboard, /visibleView === "diaconia"[\s\S]*<DiaconiaWorkspace/);
  assert.match(dashboard, /mode=\{active\.permissions\.includes\("pastoral\.panel\.view"\) \? "pastoral" : "leader"\}/);
  assert.doesNotMatch(dashboard, /\| "pastoral"/);
  assert.doesNotMatch(panel, /^\s*"pastoral",$/m);
});
