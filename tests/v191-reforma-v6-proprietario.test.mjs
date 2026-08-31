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
  // A invariante é "toda aba tem grupo", não um número fixo: travar a contagem
  // só faria o teste reprovar a cada aba nova, sem proteger nada.
  const bloco = owner.slice(owner.indexOf("const TABS"), owner.indexOf("const OWNER_METRICS"));
  const declaradas = [...bloco.matchAll(/\{ id: "(\w+)",/g)].map((m) => m[1]);
  const agrupadas = [...bloco.matchAll(/grupo: "([^"]+)" \}/g)].map((m) => m[1]);
  assert.ok(declaradas.length >= 10, `esperava ao menos 10 abas, achei ${declaradas.length}`);
  assert.equal(
    agrupadas.length,
    declaradas.length,
    `${declaradas.length - agrupadas.length} aba(s) sem grupo`,
  );
  for (const grupo of agrupadas) {
    assert.ok(
      ["Operação", "Plataforma", "Evidência"].includes(grupo),
      `grupo desconhecido: ${grupo}`,
    );
  }

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

// --------------------------------------------------------------------------
// 5.2 — Ambiente de ensaio: rascunho, alvo, publicação e reversão
// --------------------------------------------------------------------------

test("a migração do ensaio guarda o retrato do que existia antes", async () => {
  const sql = await read("drizzle/0061_plataforma_ensaios.sql");
  assert.match(sql, /CREATE TABLE `plataforma_ensaios`/);
  // Sem o "antes", reverter seria adivinhação.
  assert.match(sql, /`anterior_json` text DEFAULT '\{\}' NOT NULL/);
  assert.match(sql, /`alvo_tipo` text DEFAULT 'TODAS' NOT NULL/);
  assert.match(sql, /`alvo_json` text DEFAULT '\[\]' NOT NULL/);
  assert.match(sql, /`estado` text DEFAULT 'RASCUNHO' NOT NULL/);
  assert.match(sql, /CREATE INDEX `plataforma_ensaios_estado_idx`/);
});

test("publicar e reverter exigem proprietário, não só a permissão", async () => {
  const rota = await read("app/api/pilot/plataforma-ensaios/route.ts");
  assert.match(rota, /requireTenantPermission\("platform\.admin\.view"\)/);
  // A permissão sozinha é de leitura; escrever atinge a plataforma inteira.
  assert.match(rota, /async function exigirProprietario\(\)/);
  assert.match(rota, /if \(!access\.user\.system_owner\)/);
  for (const metodo of ["POST", "PATCH", "DELETE"]) {
    const trecho = rota.slice(rota.indexOf(`export async function ${metodo}(`));
    assert.match(
      trecho.slice(0, 200),
      /await exigirProprietario\(\)/,
      `${metodo} não exige proprietário`,
    );
  }
});

test("a reversão é checada no servidor, não só na interface", async () => {
  const rota = await read("app/api/pilot/plataforma-ensaios/route.ts");
  // A lista da interface pode estar trinta segundos atrasada.
  const reverter = rota.slice(rota.indexOf("async function reverter("));
  assert.match(reverter, /WHERE assunto = \? AND estado = 'PUBLICADO'/);
  assert.match(reverter, /Reverta o mais recente primeiro/);
  // Uma chave que não existia antes é apagada, não gravada como "null".
  assert.match(reverter, /valor === null\s*\n?\s*\? db\.prepare\("DELETE FROM configuracoes WHERE chave = \?"\)/);

  const lib = await read("app/lib/platform-rehearsal.ts");
  assert.match(lib, /export function podeReverter/);
});

test("publicar guarda o antes e a mudança no mesmo lote", async () => {
  const rota = await read("app/api/pilot/plataforma-ensaios/route.ts");
  const publicar = rota.slice(rota.indexOf("async function publicar("), rota.indexOf("async function reverter("));
  // Se a escrita falhar, não pode ficar um ensaio publicado sem como voltar.
  assert.match(publicar, /await db\.batch\(comandos\)/);
  assert.match(publicar, /anterior\[chave\] = atual \? atual\.valor : null/);
  assert.match(publicar, /estado = 'PUBLICADO', anterior_json = \?/);
  // Só rascunho publica; publicar duas vezes perderia o retrato do original.
  assert.match(publicar, /if \(ensaio\.estado !== "RASCUNHO"\)/);
});

test("um alvo específico vazio é recusado antes de virar rascunho", async () => {
  const rota = await read("app/api/pilot/plataforma-ensaios/route.ts");
  assert.match(rota, /Escolha ao menos uma comunidade ou publique para todas/);

  const lib = await read("app/lib/platform-rehearsal.ts");
  // Ids repetidos, negativos ou não inteiros não podem virar alvo.
  assert.match(lib, /\[\.\.\.new Set\(/);
  assert.match(lib, /Number\.isInteger\(valor\) && valor > 0/);
});

test("o ensaio é uma aba própria do grupo Plataforma", async () => {
  const owner = await read("app/components/OwnerWorkspace.tsx");
  assert.match(owner, /id: "rehearsal", label: "Ensaio e publicação", icon: "ensaio", grupo: "Plataforma"/);
  assert.match(owner, /\{tab === "rehearsal" && <PlatformRehearsalWorkspace \/>\}/);

  const workspace = await read("app/components/PlatformRehearsalWorkspace.tsx");
  // O rodapé diz a consequência, como manda a regra 1 da V5.
  assert.match(workspace, /form-consequence-v5/);
  assert.match(workspace, /Nada é aplicado agora/);
  // Publicar pede confirmação; reverter fica à vista, não escondido.
  assert.match(workspace, /confirmando === item\.id/);
  assert.match(workspace, /rehearsal-revert-v6/);
});
