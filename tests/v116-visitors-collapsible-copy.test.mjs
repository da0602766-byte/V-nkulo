import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("interface de produção não exibe linguagem fictícia", async () => {
  const [workspace, communityPage] = await Promise.all([
    source("app/components/visitors/PersonForms.tsx"),
    source("app/comunidades/[slug]/page.tsx"),
  ]);

  assert.doesNotMatch(`${workspace}\n${communityPage}`, /fict[ií]ci[oa]/i);
});
