import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("o acento é o mesmo cobre nos dois temas, na superfície pública e no painel", async () => {
  const styles = await read("app/globals.css");
  const root = styles.slice(0, styles.indexOf('[data-theme="dark"]'));
  assert.match(root, /--violet:\s*#B25A33/i);
  assert.match(styles, /\[data-theme="dark"\][\s\S]{0,400}--violet:\s*#D9784C/i);
  // O painel trocava de matiz entre os temas: dourado no claro, azul no escuro.
  assert.match(styles, /--pilot-purple:\s*#b25a33/i);
  assert.doesNotMatch(styles, /--pilot-purple:\s*#4d9fff/i);
  assert.doesNotMatch(styles, /--pilot-purple:\s*#e0a542/i);
});

test(":root declara cada neutro uma única vez", async () => {
  const styles = await read("app/globals.css");
  const root = styles.slice(styles.indexOf(":root {"), styles.indexOf('[data-theme="dark"]'));
  for (const token of ["--ink", "--muted", "--line"]) {
    const hits = root.match(new RegExp(`^\\s*${token}:`, "gm")) || [];
    assert.equal(hits.length, 1, `${token} declarado ${hits.length}x em :root`);
  }
});

test("a recepção tem tema padrão e o título usa o acento chapado", async () => {
  const styles = await read("app/globals.css");
  assert.match(styles, /\.commercial-landing,\s*\n\.commercial-landing\[data-platform-theme="cobre"\]\s*\{[^}]*--landing-b:#b25a33/i);
  assert.match(
    styles,
    /\.commercial-landing \.landing-hero h1 span \{[^}]*color: var\(--violet\)/,
  );
  assert.doesNotMatch(styles, /landing-hero h1 span \{[^}]*linear-gradient/);
});

test("Cobre é o preset padrão da plataforma e Violeta continua disponível", async () => {
  const branding = await read("app/lib/platform-branding.ts");
  assert.match(branding, /themePreset:\s*"COBRE"/);
  assert.match(branding, /PLATFORM_THEME_PRESETS/);
  for (const preset of ["COBRE", "VIOLETA", "ESMERALDA", "AURORA", "GRAFITE"]) {
    assert.ok(branding.includes(`"${preset}"`), `preset ${preset} sumiu`);
  }
  const workspace = await read("app/components/PlatformBrandingWorkspace.tsx");
  assert.match(workspace, /id: "COBRE", name: "Cobre"/);
});

test("a navegação não usa mais glifos tipográficos como ícone", async () => {
  const dashboard = await read("app/components/PilotDashboard.tsx");
  assert.doesNotMatch(dashboard, /symbol:/);
  assert.match(dashboard, /icon: "visitantes" as MenuIconId/);
  assert.match(dashboard, /<MenuIcon id=\{action\.icon\} \/>/);
});

test("as seções do trilho são Dia, Comunidade e Gestão", async () => {
  const dashboard = await read("app/components/PilotDashboard.tsx");
  const dia = dashboard.indexOf('label: "Dia"');
  const comunidade = dashboard.indexOf('label: "Comunidade"', dia);
  const gestao = dashboard.indexOf('label: "Gestão"', comunidade);
  assert.ok(dia > 0 && comunidade > dia && gestao > comunidade);
  assert.doesNotMatch(dashboard, /label: "Principal"/);
});

test("Mural e Escalas levam a destinos próprios em vez de repetir a view", async () => {
  const dashboard = await read("app/components/PilotDashboard.tsx");
  assert.match(dashboard, /makeItem\("inicio", "Mural", "mural", \{ anchor: "mural" \}\)/);
  assert.match(dashboard, /event: "vinkulo:open-schedules"/);
  assert.match(dashboard, /openView\(item\.id, item\.focus\)/);

  const home = await read("app/components/CommunityHome.tsx");
  assert.match(home, /<header id="mural">/);

  // O ouvinte que só revela a aba depende de poder ver escalas, nunca de ter
  // ministério administrável — isso é requisito de criar.
  const ministries = await read("app/components/MinistriesWorkspace.tsx");
  const reveal = ministries.slice(ministries.indexOf('window.addEventListener("vinkulo:open-schedules"') - 320);
  assert.match(reveal, /if \(!canViewSchedules\) return;/);
  assert.doesNotMatch(
    reveal.slice(0, reveal.indexOf('window.addEventListener("vinkulo:open-schedules"')),
    /manageableMinistries\.length/,
  );
});

test("o Fio do dia tem view, rota e item próprios no trilho", async () => {
  const dashboard = await read("app/components/PilotDashboard.tsx");
  assert.match(dashboard, /\| "fio"/);
  assert.match(dashboard, /\{ id: "fio", label: "Fio do dia", permission: "dashboard\.view" \}/);
  assert.match(dashboard, /makeItem\("fio", "Fio do dia"\)/);
  assert.match(dashboard, /visibleView === "fio" && !accessDeniedView && <DayThreadWorkspace \/>/);
  // É o primeiro item da seção Dia — o fio abre o dia, não o encerra.
  const secaoDia = dashboard.slice(dashboard.indexOf('label: "Dia"'));
  assert.ok(
    secaoDia.indexOf('makeItem("fio"') < secaoDia.indexOf('makeItem("inicio", "Início")'),
  );
});

test("a migração do fio existe e isola por comunidade", async () => {
  const sql = await read("drizzle/0059_fio_registros.sql");
  assert.match(sql, /CREATE TABLE `fio_registros`/);
  assert.match(sql, /`comunidade_id` integer NOT NULL/);
  assert.match(sql, /REFERENCES `comunidades`\(`id`\)[^,]*ON DELETE cascade/);
  assert.match(sql, /CREATE INDEX `fio_registros_dia_idx`/);
});

test("a rota do fio filtra visibilidade no SQL e nunca expõe o corpo do pedido", async () => {
  const route = await read("app/api/pilot/fio/route.ts");
  assert.match(route, /requireTenantPermission\("dashboard\.view"\)/);
  // A filtragem por quem pode ler acontece na consulta, não na interface.
  assert.match(route, /f\.visibilidade IN \(\$\{marcadores\}\)/);
  assert.match(route, /function visibilidadesVisiveis/);
  // Pedidos entram só como contagem: título e descrição nunca são lidos.
  const trechoPedidos = route.slice(route.indexOf("solicitacoes_comunidade") - 400, route.indexOf("solicitacoes_comunidade") + 400);
  assert.doesNotMatch(trechoPedidos, /SELECT[^`]*titulo[^`]*FROM solicitacoes_comunidade/);
  assert.match(trechoPedidos, /COUNT\(\*\) AS total/);
  // Toda janela é de um dia: sem isso a consulta varre a tabela inteira.
  assert.match(route, /function dia\(url: URL\)/);
  assert.match(route, /BETWEEN datetime\(\?\) AND datetime\(\?\)/);
  assert.match(route, /recordTenantAudit/);
});

test("as permissões usadas pelo fio existem no catálogo oficial", async () => {
  const route = await read("app/api/pilot/fio/route.ts");
  const policy = await read("app/lib/tenant-policy.mjs");
  const usadas = [...route.matchAll(/permissions\.includes\("([a-z.]+)"\)/g)].map((m) => m[1]);
  assert.ok(usadas.length >= 3);
  for (const permissao of new Set(usadas)) {
    assert.ok(policy.includes(`"${permissao}"`), `permissão inexistente: ${permissao}`);
  }
});

test("o marcador Agora só aparece no dia de hoje e depois do relógio acertar", async () => {
  const workspace = await read("app/components/DayThreadWorkspace.tsx");
  assert.match(workspace, /dia === hoje && agora\s*\n?\s*\? visiveis\.findIndex/);
  assert.match(workspace, /data-futuro=/);
  const styles = await read("app/globals.css");
  assert.match(styles, /\.day-thread-timeline > li\[data-futuro="1"\][\s\S]{0,120}border-style: dashed/);
});

test("o fio não lê o relógio durante a renderização nem escreve estado direto no efeito", async () => {
  const workspace = await read("app/components/DayThreadWorkspace.tsx");
  // Date.now() no corpo do componente daria valores diferentes no servidor e
  // no cliente, quebrando a hidratação. Só pode aparecer dentro de callback.
  // O corte precisa achar o return do JSX. "return (" sozinho casaria antes,
  // com o "return () => {" que limpa o efeito.
  const corpo = workspace.slice(workspace.indexOf("export default function"));
  const inicioJsx = corpo.indexOf("return (\n    <section");
  assert.ok(inicioJsx > 0, "não encontrei o return do JSX");
  const render = corpo.slice(inicioJsx);
  assert.doesNotMatch(render, /Date\.now\(\)/);
  assert.doesNotMatch(render, /new Date\(\)/);
  // A busca cancela respostas antigas: trocar de dia rápido não pode deixar a
  // resposta anterior sobrescrever a mais nova.
  assert.match(workspace, /let cancelado = false/);
  assert.match(workspace, /if \(cancelado\) return;/);
  assert.match(workspace, /cancelado = true;/);
});
