import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/community-theme.ts", import.meta.url), "utf8");
const exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });

function contrast(a, b) {
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((part) => {
      const v = parseInt(part,16) / 255;
      return v <= .04045 ? v / 12.92 : ((v+.055)/1.055)**2.4;
    });
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  const [low,high] = [luminance(a),luminance(b)].sort((x,y)=>x-y);
  return (high+.05)/(low+.05);
}

test("botões e links da comunidade têm contraste AA em todas as paletas e modos", () => {
  for (const palette of exports.COMMUNITY_PALETTES) {
    const style = exports.communityThemeStyle(palette.id);
    for (const mode of ["light", "dark"]) {
      assert.ok(contrast(style[`--community-${mode}-on-primary`], palette[mode].primary) >= 4.5, `${palette.id}/${mode} botão`);
      assert.ok(contrast(style[`--community-${mode}-link`], palette[mode].surface) >= 4.5, `${palette.id}/${mode} link`);
    }
  }
});

test("troca de comunidade resolve uma paleta completa sem reutilizar cores anteriores", () => {
  const violet = exports.communityThemeStyle("MODERNO");
  const gold = exports.communityThemeStyle("NOITE_DOURADA");
  assert.equal(gold["--community-dark-primary"], "#f1bd4f");
  assert.notEqual(violet["--community-dark-primary"], gold["--community-dark-primary"]);
  assert.deepEqual(Object.keys(violet).sort(), Object.keys(gold).sort());
});
