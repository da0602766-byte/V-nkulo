import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reordenação móvel exige pressão, permite arraste e persiste uma única ordem", async () => {
  const workspace = await source("app/components/TenantOperations.tsx");

  assert.match(workspace, /window\.setTimeout\(\(\) => \{/);
  assert.match(workspace, /\}, 320\)/);
  assert.match(workspace, /document\s*\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(workspace, /closest<HTMLElement>\("\[data-category-id\]"\)/);
  assert.match(workspace, /void persistCategoryOrder\(reordered, drag\.previousCategories, drag\.categoryName\)/);
  assert.match(workspace, /onPointerCancel=\{\(event\) => finishCategoryDrag\(event, false\)\}/);
});

test("cartão de visitante mantém dados e ações em uma hierarquia compacta", async () => {
  const [workspace, styles] = await Promise.all([
    source("app/components/TenantOperations.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(workspace, /className="visitor-card-topline"/);
  assert.match(workspace, /Entrada em \{formatDate\(visitor\.data_entrada\)\}/);
  assert.match(workspace, /className="visitor-card-identity"/);
  assert.match(workspace, /<b>Categoria<\/b>/);
  assert.match(workspace, /<b>Célula<\/b>/);
  assert.match(workspace, /visitor-card-action visitor-whatsapp-link/);
  assert.match(workspace, /visitor-card-action visitor-card-action-primary/);
  assert.match(workspace, /visitor-card-action visitor-card-action-danger/);
  assert.match(styles, /\.visitor-card-meta/);
  assert.match(styles, /\.visitor-workspace-redesign \.operations-list>details/);
  assert.match(styles, /\.visitor-whatsapp-link \{ flex:1 1 100%/);
});
