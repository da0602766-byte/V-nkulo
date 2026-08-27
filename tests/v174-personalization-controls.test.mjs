import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("account menu keeps compact theme and magnifier controls side by side", async () => {
  const [dashboard, styles] = await Promise.all([
    read("app/components/PilotDashboard.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(dashboard, /account-personalization-v4/);
  assert.match(dashboard, /<ThemeControl compact cycle storageId=\{userEmail\}/);
  assert.match(dashboard, /MagnifierIcon operation="minus"/);
  assert.match(dashboard, /MagnifierIcon operation="plus"/);
  assert.match(styles, /\.account-personalization-v4\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) auto auto/s);
  assert.match(styles, /\.account-font-zoom-v4\s*\{[^}]*display:flex/s);
});

test("theme and zoom preferences are isolated by user and restored globally", async () => {
  const [dashboard, theme, layout] = await Promise.all([
    read("app/components/PilotDashboard.tsx"),
    read("app/components/ThemeControl.tsx"),
    read("app/layout.tsx"),
  ]);

  assert.match(dashboard, /`vinkulo:font-scale:\$\{userEmail\.trim\(\)\.toLowerCase\(\)\}`/);
  assert.match(dashboard, /localStorage\.setItem\("vinkulo:font-scale", String\(fontScale\)\)/);
  assert.match(theme, /`vinkulo:theme:\$\{normalized\}`/);
  assert.match(theme, /localStorage\.setItem\(individualKey, next\)/);
  assert.match(layout, /localStorage\.getItem\('vinkulo:font-scale'\)/);
});
