const base=process.env.PARKING_QA_BASE_URL || 'http://localhost:4178';
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {
  seedParkingScene,
  newSceneObject,
} from "../../app/lib/parking-scene.ts";
const { chromium } = await import(
  process.env.PARKING_QA_PLAYWRIGHT_MODULE || "playwright"
);
const asset = (await fs.readdir("dist/client/assets")).find(
  (f) => f.startsWith("parking-three-") && f.endsWith(".js"),
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];
try {
  await page.goto(base+"/qa-login/manager");
  for (const count of [40, 150, 500]) {
    const scene = seedParkingScene([], []);
    scene.sectors = [{ id: "s", name: "A", color: "#5b2fc4" }];
    scene.width = 110;
    scene.depth = Math.max(30, Math.ceil(count / 25) * 8 + 10);
    scene.objects = Array.from({ length: count }, (_, i) => ({
      ...newSceneObject(
        "space",
        "v" + i,
        5 + (i % 25) * 4,
        5 + Math.floor(i / 25) * 8,
      ),
      name: "V" + i,
      sectorId: "s",
    }));
    for (let i = 0; i < 20; i++)
      scene.objects.push(
        newSceneObject("tree", "t" + i, 2, 3 + (i * scene.depth) / 22),
      );
    const result = await page.evaluate(
      async ({ scene, asset }) => {
        const { mountParkingRenderer } = await import("/assets/" + asset);
        const host = document.createElement("div");
        host.style.cssText =
          "position:fixed;inset:0;z-index:999999;width:100vw;height:100vh";
        document.body.append(host);
        const proto = WebGL2RenderingContext.prototype;
        let calls = 0;
        const original = proto.drawElementsInstanced;
        proto.drawElementsInstanced = function (...args) {
          calls++;
          return original.apply(this, args);
        };
        const started = performance.now();
        const renderer = mountParkingRenderer(host, {
          scene,
          selected: [],
          states: Object.fromEntries(
            scene.objects
              .filter((o) => o.kind === "space")
              .map((o, i) => [o.id, i % 3 === 0 ? "occupied" : "available"]),
          ),
          editing: false,
          top: false,
          move: false,
          snap: true,
          onSelect() {},
          onMove() {},
          onError() {
            throw new Error("WebGL failed");
          },
        });
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const startup = performance.now() - started;
        await new Promise((r) => setTimeout(r, 300));
        const before = calls;
        await new Promise((r) => setTimeout(r, 300));
        const idleDraws = calls - before;
        const intervals = [];
        let last = performance.now();
        for (let i = 0; i < 90; i++) {
          renderer.zoom(i % 2 ? 1.003 : 1 / 1.003);
          await new Promise(requestAnimationFrame);
          const now = performance.now();
          intervals.push(now - last);
          last = now;
        }
        renderer.dispose();
        host.remove();
        proto.drawElementsInstanced = original;
        intervals.sort((a, b) => a - b);
        return {
          startupMs: Math.round(startup),
          idleDraws,
          medianFrameMs: Math.round(intervals[45] * 10) / 10,
          p95FrameMs: Math.round(intervals[85] * 10) / 10,
          canvasRemaining: host.querySelectorAll("canvas").length,
        };
      },
      { scene, asset },
    );
    assert.equal(result.idleDraws, 0);
    assert.equal(result.canvasRemaining, 0);
    results.push({ spaces: count, ...result });
  }
  await page
    .getByText("Manter no celular", { exact: true })
    .click({ timeout: 2000 })
    .catch(() => {});
  for (let i = 0; i < 2; i++)
    await page
      .getByText("Pular introdução", { exact: true })
      .click({ timeout: 1000 })
      .catch(() => {});
  const gestureScene = seedParkingScene([], []);
  gestureScene.width = 20;
  gestureScene.depth = 20;
  gestureScene.objects = [
    {
      ...newSceneObject("space", "center", 10, 10),
      name: "QA01",
      sectorId: "s",
    },
  ];
  await page.evaluate(
    async ({ scene, asset }) => {
      const { mountParkingRenderer } = await import("/assets/" + asset);
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;inset:0;z-index:999999";
      document.body.append(host);
      const qa = { selections: [], moves: [], host };
      qa.options = {
        scene,
        selected: [],
        states: { center: "available" },
        editing: true,
        top: false,
        move: false,
        snap: true,
        onSelect(id) {
          qa.selections.push(id);
          qa.options.selected = [id];
          qa.engine.update(qa.options);
        },
        onMove(id, x, y) {
          qa.moves.push({ id, x, y });
        },
        onError() {},
      };
      qa.engine = mountParkingRenderer(host, qa.options);
      window.__parkingQA = qa;
    },
    { scene: gestureScene, asset },
  );
  await page.waitForTimeout(200);
  await page.mouse.click(720, 450);
  assert.deepEqual(await page.evaluate(() => window.__parkingQA.selections), [
    "center",
  ]);
  await page.evaluate(() => {
    const q = window.__parkingQA;
    q.options.move = true;
    q.engine.update(q.options);
  });
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(770, 460, { steps: 8 });
  await page.mouse.up();
  const moves = await page.evaluate(() => window.__parkingQA.moves);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].id, "center");
  assert.notEqual(moves[0].x, 10);
  await page.evaluate(() => {
    window.__parkingQA.engine.dispose();
    window.__parkingQA.host.remove();
    delete window.__parkingQA;
  });
  results.push({ case: "3d-pick-and-drag", passed: true });
  await fs.writeFile(
    "outputs/parking-scene/performance.json",
    JSON.stringify(
      {
        environment:
          "Edge headless, desktop local; not a physical mobile benchmark",
        assetBytes: (await fs.stat("dist/client/assets/" + asset)).size,
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
