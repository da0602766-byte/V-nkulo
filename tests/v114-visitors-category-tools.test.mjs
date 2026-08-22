import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("categorias oferecem busca, arraste por pressão e seletores compactos", async () => {
  const [workspace, styles] = await Promise.all([
    source("app/components/TenantOperations.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(workspace, /const \[categorySearch, setCategorySearch\] = useState\(""\)/);
  assert.match(workspace, /placeholder="Buscar categoria, ministério ou responsável"/);
  assert.match(workspace, /Segure e arraste para reorganizar \$\{category\.nome\}/);
  assert.match(workspace, /onPointerDown=\{\(event\) => startCategoryDrag/);
  assert.match(workspace, /navigator\.vibrate\?\.\(20\)/);
  assert.match(workspace, /event\.key === "ArrowUp" \|\| event\.key === "ArrowDown"/);
  assert.doesNotMatch(workspace, /Mover \$\{category\.nome\} para cima/);
  assert.doesNotMatch(workspace, /Mover \$\{category\.nome\} para baixo/);
  assert.match(workspace, /VISITOR_CATEGORY_ICONS\.map/);
  assert.match(workspace, /VISITOR_CATEGORY_COLORS\.includes/);
  assert.doesNotMatch(workspace, /name="ordem" type="number"/);
  assert.match(styles, /\.visitor-settings-search/);
  assert.match(styles, /\.visitor-category-drag-handle/);
  assert.match(styles, /touch-action:none/);
  assert.match(styles, /\.visitor-category-choice/);
});

test("reordenação é persistida e validada no backend da comunidade ativa", async () => {
  const categoriesApi = await source("app/api/pilot/visitante-categorias/route.ts");

  assert.match(categoriesApi, /export async function PUT\(request: Request\)/);
  assert.match(categoriesApi, /requireVisitorCategoryManagement\(\)/);
  assert.match(categoriesApi, /WHERE comunidade_id = \? AND ativa = 1/);
  assert.match(categoriesApi, /new Set\(ids\)\.size !== ids\.length/);
  assert.match(categoriesApi, /await db\.batch\(ids\.map/);
  assert.match(categoriesApi, /CATEGORIAS_ACOMPANHAMENTO_REORDENADAS/);
});
