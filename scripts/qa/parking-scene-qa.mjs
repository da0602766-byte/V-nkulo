const base=process.env.PARKING_QA_BASE_URL || 'http://localhost:4178';
// Run against scripts/qa/parking-preview.mjs (isolated in-memory fixtures only).
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PARKING_QA_PLAYWRIGHT_MODULE || "playwright"
);
await fs.mkdir("outputs/parking-scene", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [],
  errors = [];
async function open(role, width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(base+"/qa-login/" + role);
  await page.locator(".parking-redesign").waitFor();
  await page
    .getByText("Manter no celular", { exact: true })
    .click({ timeout: 10000 })
    .catch(() => {});
  for (let i = 0; i < 2; i++)
    await page
      .getByText("Pular introdução", { exact: true })
      .click({ timeout: 1000 })
      .catch(() => {});
  return { page, context };
}
try {
  const { page } = await open("manager", 1864);
  await page.getByRole("button", { name: "Mapa e vagas", exact: true }).click();
  const editor = page.locator(".parking-scene-editor");
  await editor.getByRole("button", { name: "Publicar", exact: true }).waitFor();
  await editor.locator("canvas").waitFor();
  await editor.locator(".parking-scene-tools select").selectOption("tree");
  await editor
    .getByRole("button", { name: "+ Adicionar", exact: true })
    .click();
  await editor.getByLabel("Nome / código").fill("Árvore QA");
  await editor.getByLabel("Posição X", { exact: true }).fill("25");
  await editor.getByLabel("Posição Y", { exact: true }).fill("3");
  await editor
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await editor
    .getByText(
      "Rascunho salvo. Os usuários continuam vendo a versão publicada.",
    )
    .waitFor();
  const draft = await page.request
    .get(base+"/api/pilot/estacionamento/cenario?editor=1")
    .then((r) => r.json());
  assert.ok(draft.draft.objects.some((o) => o.name === "Árvore QA"));
  assert.equal(draft.published, null);
  results.push({ case: "draft-saved-not-published", passed: true });
  await editor.getByRole("button", { name: "2D", exact: true }).click();
  const tree = draft.draft.objects.find((o) => o.name === "Árvore QA");
  const shape = editor.locator(`[data-object="${tree.id}"]`);
  await shape.click();
  await editor
    .getByRole("button", { name: "Selecionar objetos", exact: true })
    .click();
  const rect = await shape.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + 45,
    rect.y + rect.height / 2 + 15,
    { steps: 8 },
  );
  await page.mouse.up();
  assert.notEqual(
    await editor.getByLabel("Posição X", { exact: true }).inputValue(),
    "25",
  );
  await editor.getByRole("button", { name: "Desfazer", exact: true }).click();
  assert.equal(
    await editor.getByLabel("Posição X", { exact: true }).inputValue(),
    "25",
  );
  await editor.getByRole("button", { name: "Refazer", exact: true }).click();
  assert.notEqual(
    await editor.getByLabel("Posição X", { exact: true }).inputValue(),
    "25",
  );
  results.push({ case: "drag-undo-redo", passed: true });
  // Fix the test tree safely inside the terrain after the gesture.
  await editor.getByLabel("Posição X", { exact: true }).fill("25");
  await editor.getByLabel("Posição Y", { exact: true }).fill("3");
  await editor.getByRole("button", { name: "Duplicar", exact: true }).click();
  await editor.getByRole("button", { name: "Excluir", exact: true }).click();
  results.push({ case: "duplicate-delete", passed: true });
  await shape.click();
  const autosaved=page.waitForResponse(r=>r.url().includes('/estacionamento/cenario')&&r.request().method()==='PUT'&&!r.request().postDataJSON().publish);
  await editor.getByLabel('Nome / código').fill('Árvore QA automática');
  assert.equal((await autosaved).status(),200);
  await editor.getByText('Rascunho salvo. Os usuários continuam vendo a versão publicada.').waitFor();
  await editor.getByLabel('Nome / código').fill('Árvore QA');
  results.push({case:'automatic-draft-save',passed:true});
  await editor.getByRole("button", { name: "Publicar", exact: true }).click();
  await editor
    .getByText("Cenário publicado. As vagas foram sincronizadas.")
    .waitFor();
  const published = await page.request
    .get(base+"/api/pilot/estacionamento/cenario?editor=1")
    .then((r) => r.json());
  assert.ok(published.published.objects.some((o) => o.name === "Árvore QA"));
  results.push({ case: "publish-synchronizes", passed: true });
  await editor.getByRole("button", { name: "3D", exact: true }).click();
  await editor.locator("canvas").waitFor();
  await page.waitForTimeout(300);
  await editor.screenshot({ path: "outputs/parking-scene/editor-desktop.png" });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await editor.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false, `overflow at ${width}`);
    await editor.screenshot({
      path: `outputs/parking-scene/editor-${width}.png`,
    });
    results.push({ case: "responsive-editor", width, passed: true });
  }
  const { page: member } = await open("member", 390);
  await member
    .locator(".parking-v2-context-bar select")
    .selectOption({ index: 1 });
  await member.locator(".parking-scene").waitFor();
  await member
    .locator(".parking-scene")
    .getByRole("button", { name: "Lista", exact: true })
    .click();
  const free = member
    .locator(".parking-scene-object-list button")
    .filter({ hasText: "Disponível" })
    .first();
  await free.focus();
  await member.keyboard.press("Enter");
  assert.equal(await free.getAttribute("aria-pressed"), "true");
  await member
    .locator(".parking-scene")
    .screenshot({ path: "outputs/parking-scene/member-mobile.png" });
  results.push({
    case: "member-published-scene-keyboard-selection",
    passed: true,
  });
  await member.context().setOffline(true);
  await member
    .getByText("Você está sem conexão", { exact: false })
    .first()
    .waitFor();
  assert.equal(await free.isDisabled(), true);
  await member.context().setOffline(false);
  results.push({ case: "offline-blocks-selection", passed: true });
  // Actual context loss exercises the fallback without losing the surrounding form.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await editor
    .locator("canvas")
    .evaluate((canvas) =>
      canvas
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        ?.loseContext(),
    );
  await editor
    .getByText(
      "Visualização 2D ativada. O 3D não está disponível neste aparelho.",
    )
    .waitFor();
  await editor.locator("svg").waitFor();
  results.push({ case: "webgl-loss-falls-back-to-2d", passed: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await fs.writeFile(
    "outputs/parking-scene/qa-results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
}
