import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("rascunho de escala possui publicação explícita, validada e auditada", async () => {
  const [workspace, route] = await Promise.all([
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
    read("app/api/pilot/escalas/[id]/route.ts"),
  ]);

  assert.match(workspace, /schedule\.status === "RASCUNHO"/);
  assert.match(workspace, /acao: "PUBLICAR"/);
  assert.match(workspace, /Escala publicada e integrantes notificados/);
  assert.match(route, /if \(action === "PUBLICAR"\)/);
  assert.match(route, /Defina um responsável antes de publicar a escala/);
  assert.match(route, /Adicione pelo menos um integrante antes de publicar a escala/);
  assert.match(route, /WHERE id = \? AND comunidade_id = \? AND status = 'RASCUNHO'/);
  assert.match(route, /ESCALA_V213_PUBLICADA/);
});

test("PDF de escala usa download compatível com o APK", async () => {
  const workspace = await read("app/components/SecretaryMinisterialWorkspace.tsx");

  assert.match(workspace, /downloadFileForDevice\(/);
  assert.match(workspace, /`\/api\/pilot\/escalas\/\$\{schedule\.id\}\/pdf\?download=1`/);
  assert.doesNotMatch(
    workspace,
    /<a href=\{`\/api\/pilot\/escalas\/\$\{schedule\.id\}\/pdf/,
  );
});

test("calendário da escala abre inclusão autorizada no aparelho", async () => {
  const [workspace, bridge] = await Promise.all([
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
    read("app/lib/androidNativeBridge.ts"),
  ]);

  assert.match(workspace, /addCalendarEventForDevice\(\{/);
  assert.match(workspace, /Adicionar ao calendário/);
  assert.match(bridge, /addCalendarEvent\?: \(eventJson: string\)/);
  assert.match(bridge, /calendar\.google\.com\/calendar\/render/);
  assert.match(bridge, /package=com\.google\.android\.calendar/);
  assert.match(bridge, /action", "TEMPLATE"/);
});
