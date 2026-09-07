import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("falhas de notificação não invalidam uma escala já publicada", () => {
  const createRoute = read("app/api/pilot/escalas/route.ts");
  const updateRoute = read("app/api/pilot/escalas/[id]/route.ts");
  assert.match(createRoute, /Promise\.allSettled/);
  assert.match(createRoute, /DELETE FROM escalas_ministerio/);
  assert.match(updateRoute, /Promise\.allSettled/);
  assert.match(updateRoute, /publicada, mas uma ou mais notificações falharam/);
});

test("selecionar uma música mantém um item de repertório com seus sublinks", () => {
  const workspace = read("app/components/SecretaryMinisterialWorkspace.tsx");
  const resources = read("app/lib/schedule-resources.ts");
  assert.match(workspace, /selectedLibraryItemIds/);
  assert.match(workspace, /“\$\{item\.titulo\}” selecionada para o repertório/);
  assert.match(workspace, /titulo: item\.titulo/);
  assert.match(workspace, /<ScheduleRepertoire schedule=\{schedule\}/);
  assert.match(resources, /groupScheduleResources/);
  assert.match(resources, /mergeScheduleResourceLinks/);
});

test("link compartilhado exibe os links compactos dentro de cada música", () => {
  const sharedPage = read("app/escala/[token]/page.tsx");
  assert.match(sharedPage, /groupScheduleResources/);
  assert.match(sharedPage, /shared-secretary-sublinks/);
  assert.match(sharedPage, /target="_blank"/);
});

test("troca de tema curta bloqueia animações simultâneas", () => {
  const control = read("app/components/ThemeControl.tsx");
  assert.match(control, /transitionInProgress/);
  assert.match(control, /disabled=\{isTransitioning\}/);
  assert.match(control, /duration: 380/);
});

test("menu público usa superfície opaca e ícones vetoriais", () => {
  const globalCss = `${read("app/globals.css")}\n${read("app/interface-fixes.css")}`;
  const workspace = read("app/components/SecretaryMinisterialWorkspace.tsx");
  assert.match(globalCss, /background-color:var\(--reception-surface,#fff\)!important/);
  assert.match(globalCss, /backdrop-filter:none/);
  assert.match(workspace, /function LibraryActionIcon/);
  assert.match(workspace, /name="edit"/);
  assert.match(workspace, /name="remove"/);
});
