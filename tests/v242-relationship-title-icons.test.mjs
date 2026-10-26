import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("título oficial usa categorias, contraste legível e remoção explícita", async () => {
  const [people, styles] = await Promise.all([
    read("app/components/PeopleWorkspace.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(people, /const TITLE_CATEGORIES/);
  assert.match(people, /<optgroup key=\{category\.label\} label=\{category\.label\}>/);
  assert.match(people, /Remover título e permissões extras/);
  assert.match(people, /oficial: isOfficial/);
  assert.match(styles, /\.people-role-form select \{ color-scheme:dark; \}/);
  assert.match(styles, /\.people-role-form select option,/);
});

test("recepção usa ícones vetoriais nos pontos que antes exibiam emojis", async () => {
  const [experience, styles] = await Promise.all([
    read("app/components/LandingPageExperience.tsx"),
    read("app/landing-vinkulo.css"),
  ]);
  assert.match(experience, /function FeatureIcon/);
  assert.match(experience, /<FeatureIcon/);
  assert.match(experience, /<svg viewBox="0 0 24 24" aria-hidden="true"/);
  assert.doesNotMatch(experience, /[👥🎚️💬📅✨🙋🧭🎉]/u);
  assert.match(styles, /\.lp-module/);
});
