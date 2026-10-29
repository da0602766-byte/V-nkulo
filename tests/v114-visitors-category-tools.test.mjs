import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reordenação é persistida e validada no backend da comunidade ativa", async () => {
  const categoriesApi = await source("app/api/pilot/visitante-categorias/route.ts");

  assert.match(categoriesApi, /export async function PUT\(request: Request\)/);
  assert.match(categoriesApi, /requireVisitorCategoryManagement\(\)/);
  assert.match(categoriesApi, /WHERE comunidade_id = \? AND ativa = 1/);
  assert.match(categoriesApi, /new Set\(ids\)\.size !== ids\.length/);
  assert.match(categoriesApi, /await db\.batch\(ids\.map/);
  assert.match(categoriesApi, /CATEGORIAS_ACOMPANHAMENTO_REORDENADAS/);
});
