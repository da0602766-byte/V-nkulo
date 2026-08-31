import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("os ícones do trilho vivem num componente só", async () => {
  // Viviam dentro de PilotDashboard.tsx sem export, então a área do
  // proprietário seguiu com glifos mesmo depois de a V5 removê-los do painel.
  const icone = await read("app/components/MenuIcon.tsx");
  assert.match(icone, /export default function MenuIcon/);
  assert.match(icone, /export type MenuIconId/);

  const dashboard = await read("app/components/PilotDashboard.tsx");
  assert.match(dashboard, /import MenuIcon, \{ type MenuIconId \} from "\.\/MenuIcon"/);
  // Não pode sobrar uma segunda definição: duas verdades sobre o mesmo ícone.
  assert.doesNotMatch(dashboard, /function MenuIcon\(/);
});

test("a área do proprietário não usa mais glifo tipográfico no trilho", async () => {
  const owner = await read("app/components/OwnerWorkspace.tsx");
  // Só o trilho e os atalhos do cabeçalho. Os marcadores de tipo de feedback
  // (✦ ↗ ⚑ !) continuam glifos e estão registrados como dívida aberta: são
  // classificação de conteúdo, não navegação, e trocá-los é outro recorte.
  const trilho = owner.slice(owner.indexOf("const TABS"), owner.indexOf("</aside>"));
  for (const glifo of ["▦", "◫", "▥", "↻", "⚙", "✦", "◇", "◎", "✓"]) {
    assert.ok(!trilho.includes(glifo), `glifo ${glifo} ainda no trilho`);
  }
  assert.match(owner, /import MenuIcon, \{ type MenuIconId \} from "\.\/MenuIcon"/);
  assert.match(owner, /<MenuIcon id=\{item\.icon\} \/>/);
  // Os três atalhos do cabeçalho também trocaram glifo por SVG.
  assert.match(owner, /setTab\("requests"\)\}><span aria-hidden="true"><MenuIcon id="solicitacoes" \/><\/span>/);
});

test("as dez abas do proprietário estão agrupadas por intenção", async () => {
  const owner = await read("app/components/OwnerWorkspace.tsx");
  assert.match(owner, /type OwnerGroup = "Operação" \| "Plataforma" \| "Evidência"/);
  // Fila de trabalho em Operação; o que muda para todos em Plataforma;
  // o que se consulta para decidir em Evidência.
  assert.match(owner, /id: "requests",[^}]*grupo: "Operação"/);
  assert.match(owner, /id: "controls",[^}]*grupo: "Plataforma"/);
  assert.match(owner, /id: "audit",[^}]*grupo: "Evidência"/);
  const abas = [...owner.matchAll(/\{ id: "(\w+)", label: "[^"]+", icon: "[\w-]+", grupo: "(\w+[^"]*)" \}/g)];
  assert.equal(abas.length, 10, `esperava 10 abas, achei ${abas.length}`);

  const styles = await read("app/globals.css");
  assert.match(styles, /\.owner-nav-group-v6 > h2/);
  // No trilho horizontal o rótulo do grupo empurraria os itens para fora.
  assert.match(styles, /\.owner-nav-group-v6 \{ display: contents; \}/);
});

test("a prévia local elege a conta de maior privilégio", async () => {
  const rota = await read("app/api/auth/preview/route.ts");
  // 'PROPRIETARIO' e 'ADMIN' não existem no catálogo de papéis, então
  // SUPERADMIN caía no ELSE e a prévia elegia um pastor — deixando a área do
  // proprietário inacessível justamente onde se confere.
  assert.doesNotMatch(rota, /WHEN 'PROPRIETARIO' THEN/);
  assert.doesNotMatch(rota, /WHEN 'ADMIN' THEN/);
  assert.match(rota, /WHEN 'SUPERADMIN' THEN 0/);
  assert.match(rota, /WHEN 'ADMIN_COMUNIDADE' THEN 1/);

  const policy = await read("app/lib/tenant-policy.mjs");
  for (const papel of ["SUPERADMIN", "ADMIN_COMUNIDADE", "PASTOR", "LIDER"]) {
    assert.ok(policy.includes(`"${papel}"`), `papel inexistente no catálogo: ${papel}`);
  }
});

test("o acento da área do proprietário é o mesmo do resto", async () => {
  const styles = await read("app/globals.css");
  // O roxo pré-reforma sobrevivia aqui porque a V5 não chegou nesta área.
  for (const hex of ["#694af1", "#7157e8", "#6544df", "#6749df", "#6546df", "#6648de"]) {
    assert.ok(!styles.includes(hex), `roxo ${hex} ainda na folha`);
  }
  // O preset "violeta" da recepção continua roxo: ali é escolha de tema.
  assert.match(styles, /data-platform-theme="violeta"[^}]*--landing-b:#7551f4/);
});
