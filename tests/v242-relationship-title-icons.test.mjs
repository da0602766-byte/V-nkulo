import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Central de Relacionamento atualiza somente quando a aba está visível", async () => {
  const source = await read("app/components/RelacionamentoTools.tsx");
  assert.match(source, /window\.setInterval\(refreshWhenVisible, 5_000\)/);
  assert.match(source, /document\.visibilityState === "visible"/);
  assert.match(source, /window\.addEventListener\("focus", refreshWhenVisible\)/);
  assert.match(source, /refreshInFlight/);
  assert.match(source, /\[visitanteHistoricoId, refreshTick\]/);
});

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
    read("app/components/ReceptionExperience.tsx"),
    read("app/recepcao.css"),
  ]);
  assert.match(experience, /function ReceptionIcon/);
  assert.match(experience, /<ReceptionIcon name=\{item\.icon\}/);
  assert.match(experience, /<ReceptionIcon name=\{feature\.icone\}/);
  assert.doesNotMatch(experience, /[👥🎚️💬📅✨🙋🧭🎉]/u);
  assert.match(styles, /\.rc-icon/);
});
