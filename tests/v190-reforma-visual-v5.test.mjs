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
  assert.match(dashboard, /<DayThreadWorkspace permissions=\{active\.permissions\} \/>/);
  // É o primeiro item da seção Dia — o fio abre o dia, não o encerra.
  const secaoDia = dashboard.slice(dashboard.indexOf('label: "Dia"'));
  assert.ok(
    secaoDia.indexOf('makeItem("fio"') < secaoDia.indexOf('makeItem("inicio", "Início")'),
  );
});

test("a migração do fio existe e isola por comunidade", async () => {
  const sql = await read("drizzle/0060_fio_registros.sql");
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

test("só a liderança registra no fio e a visibilidade pastoral é validada no servidor", async () => {
  const route = await read("app/api/pilot/fio/route.ts");
  const workspace = await read("app/components/DayThreadWorkspace.tsx");
  const post = route.slice(route.indexOf("export async function POST"));
  assert.match(post, /requireTenantPermission\("leadership\.panel\.view"\)/);
  assert.match(post, /visibilidadesVisiveis\(permissions\)\.includes\(visibilidade\)/);
  assert.match(workspace, /permissions\.includes\("leadership\.panel\.view"\)/);
  assert.match(workspace, /item\.id !== "PASTORAL"/);
  assert.match(workspace, /podeRegistrar && formAberto/);
});

test("a janela do fio usa o dia civil de São Paulo sem depender do fuso do servidor", async () => {
  const route = await read("app/api/pilot/fio/route.ts");
  assert.match(route, /const FUSO_COMUNIDADE = "America\/Sao_Paulo"/);
  assert.match(route, /function meiaNoiteUtc/);
  assert.match(route, /getUTCFullYear\(\)/);
  assert.doesNotMatch(route, /base\.getFullYear\(\)/);
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
  const inicioJsx = corpo.search(/return \(\r?\n\s*<section/);
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

test("células ganham mapa de saúde calculado dos relatórios já carregados", async () => {
  const operations = await read("app/components/TenantOperations.tsx");
  assert.match(operations, /function cellHealth\(cell: Cell, agora: number\): CellHealth/);
  for (const estado of ["SEM_RELATORIO", "ATENCAO", "MULTIPLICAR", "SAUDAVEL"]) {
    assert.ok(operations.includes(`"${estado}"`), `estado ${estado} ausente`);
  }
  // Nenhuma consulta nova: a saúde sai dos relatórios que a rota já devolve.
  assert.match(operations, /cell\.relatorios\.slice\(0, CELL_HEALTH_WEEKS\)/);
  assert.match(operations, /cellHealthFilter/);
  const styles = await read("app/globals.css");
  assert.match(styles, /\.cell-health-pill-v5\[data-saude="SEM_RELATORIO"\]/);
  assert.match(styles, /\.cell-health-weeks-v5/);
});

test("a saúde da célula não julga atraso antes do relógio acertar", async () => {
  const operations = await read("app/components/TenantOperations.tsx");
  const inicio = operations.indexOf("function cellHealth");
  const corpo = operations.slice(inicio, inicio + 900);
  // Sem isso, uma célula em dia apareceria vermelha no primeiro quadro.
  assert.match(corpo, /if \(!agora\) \{/);
  assert.match(corpo, /id: "AGUARDANDO"/);
});

test("visitantes mostram o funil antes da tabela", async () => {
  const operations = await read("app/components/TenantOperations.tsx");
  assert.match(operations, /const funnelStages = /);
  for (const etapa of ["NOVO", "EM_CONTATO", "EM_ACOMPANHAMENTO", "INTEGRADO"]) {
    assert.ok(operations.includes(`["${etapa}"`) || operations.includes(`"${etapa}",`), etapa);
  }
  // O funil precisa vir antes da tabela na ordem do documento.
  const funil = operations.indexOf('className="visitor-funnel-v5"');
  const tabela = operations.indexOf("visitor-bulkbar-v2");
  assert.ok(funil > 0 && funil < tabela, "o funil não está antes da tabela");
  const styles = await read("app/globals.css");
  assert.match(styles, /\.visitor-funnel-v5 article\[data-etapa="INTEGRADO"\]/);
});

test("notificações agrupam por dia e separam o que precisa de resposta", async () => {
  const center = await read("app/components/PilotNotificationCenter.tsx");
  assert.match(center, /function needsYou\(item: Notification\)/);
  assert.match(center, /function dayLabel\(value: string, agora: number\)/);
  assert.match(center, /scope === "precisa" \? items\.filter\(needsYou\) : items/);
  assert.match(center, /notification-day-v5/);
  // Já lida nunca conta como pendência.
  const corpo = center.slice(center.indexOf("function needsYou"), center.indexOf("function needsYou") + 500);
  assert.match(corpo, /if \(item\.read\) return false;/);
});

test("os ícones das notificações deixaram de ser caracteres de texto", async () => {
  const center = await read("app/components/PilotNotificationCenter.tsx");
  assert.match(center, /const NOTIFICATION_ICONS: Record<string, string>/);
  assert.match(center, /<NotificationIcon id=\{notificationVisual\(item\)\.key\} \/>/);
  for (const glifo of ["▣", "♡", "✦"]) {
    assert.ok(!center.includes(`icon: "${glifo}"`), `glifo ${glifo} ainda presente`);
  }
});

test("o rótulo Hoje/Ontem não é calculado durante a renderização", async () => {
  const center = await read("app/components/PilotNotificationCenter.tsx");
  // Sem relógio em estado, servidor e cliente discordariam do dia na hidratação.
  assert.match(center, /const \[agora, setAgora\] = useState\(0\)/);
  const corpo = center.slice(center.indexOf("function dayLabel"), center.indexOf("function dayLabel") + 400);
  assert.match(corpo, /if \(!agora\) return "";/);
});

test("a área do proprietário mostra o escopo global sem exigir clique", async () => {
  const owner = await read("app/components/OwnerWorkspace.tsx");
  assert.match(owner, /owner-scope-banner-v5/);
  assert.match(owner, /Tudo aqui alcança a plataforma inteira/);
  // A versão antiga ficava dentro de um <details> fechado.
  assert.doesNotMatch(owner, /owner-scope-note/);
  const styles = await read("app/globals.css");
  assert.match(styles, /\.owner-scope-banner-v5/);
  // A regra órfã saiu junto, com o verde que estava fora da paleta.
  assert.doesNotMatch(styles, /owner-scope-note/);
});

test("a lista branca do servidor cobre todas as views do painel", async () => {
  const page = await read("app/painel/page.tsx");
  const dashboard = await read("app/components/PilotDashboard.tsx");
  const bloco = page.slice(page.indexOf("const VALID_VIEWS"), page.indexOf("]);", page.indexOf("const VALID_VIEWS")));
  const aceitas = new Set([...bloco.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
  const tipo = dashboard.slice(dashboard.indexOf("type View ="), dashboard.indexOf(";", dashboard.indexOf("type View =")));
  const declaradas = [...tipo.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(declaradas.length > 10, "não li o tipo View");
  for (const view of declaradas) {
    // Sem isso a view abre no clique e some ao recarregar: openView grava
    // ?view= na URL e a validação do servidor devolve para "inicio".
    if (view === "visual-editor") continue;
    assert.ok(aceitas.has(view), `view "${view}" não está em VALID_VIEWS`);
  }
});

test("o badge da célula não vaza estilo para a linha de saúde", async () => {
  const styles = await read("app/globals.css");
  // Como descendente solto, a regra do badge "Ativa" pintava de verde e dava
  // forma de pílula a qualquer <i> da coluna, inclusive as barras de
  // frequência e a pílula de saúde.
  assert.doesNotMatch(styles, /^\.cell-row-copy-v4 i \{/m);
  assert.match(styles, /\.cell-row-copy-v4 > span:not\(\.cell-row-health-v5\) > i \{/);
  assert.doesNotMatch(styles, /^\.cell-row-copy-v4 small \{/m);
});

test("configurações têm navegação por assunto em vez de uma página só", async () => {
  const admin = await read("app/components/CommunityAdminWorkspace.tsx");
  assert.match(admin, /community-settings-nav-v5/);
  for (const secao of ["atalhos", "aparencia", "acessos", "modulos", "privacidade", "solicitacoes"]) {
    assert.ok(admin.includes(`"${secao}" as const`), `seção ${secao} ausente`);
  }
  // Cada bloco só aparece na sua seção.
  assert.match(admin, /secaoAtiva === "aparencia" && canManageCommunity && <CommunityThemeEditor \/>/);
  assert.match(admin, /secaoAtiva === "solicitacoes" && canManageRequests/);
  const styles = await read("app/globals.css");
  assert.match(styles, /\.community-settings-nav-v5 button\.active/);
});

test("o convite mora na seção Acessos, não flutuando acima das abas", async () => {
  const dashboard = await read("app/components/PilotDashboard.tsx");
  const admin = await read("app/components/CommunityAdminWorkspace.tsx");
  // O formulário é passado para dentro do componente em vez de renderizado antes.
  assert.match(dashboard, /accessSlot=\{/);
  assert.doesNotMatch(
    dashboard.slice(dashboard.indexOf('visibleView === "comunidade"'), dashboard.indexOf("<CommunityAdminWorkspace")),
    /invite-generator/,
  );
  assert.match(admin, /accessSlot\?: React\.ReactNode;/);
  assert.match(admin, /secaoAtiva === "acessos" && \(/);
  // Acessos precisa existir quando só há convite, sem link de cadastro.
  assert.match(admin, /canManageRegistrationLinks \|\| Boolean\(accessSlot\)/);
});

test("o fio devolve o resumo do dia e a página o exibe", async () => {
  const route = await read("app/api/pilot/fio/route.ts");
  assert.match(route, /const resumo = \{/);
  assert.match(route, /visitantesPorCategoria/);
  // O resumo respeita a mesma janela de um dia das demais consultas.
  const trecho = route.slice(route.indexOf("const resumo = {") - 1800);
  assert.match(trecho, /BETWEEN datetime\(\?\) AND datetime\(\?\)/);
  // Visitantes só entram no resumo de quem pode vê-los.
  assert.match(route, /visitantes: permissions\.includes\("visitors\.view"\)/);

  const workspace = await read("app/components/DayThreadWorkspace.tsx");
  assert.match(workspace, /day-thread-stats-v5/);
  assert.match(workspace, /day-thread-aside-v5/);
  assert.match(workspace, /setResumo\(resultado\.resumo \|\| null\)/);
  // Escala incompleta é a única marcada: é a única que pede ação.
  assert.match(workspace, /resumo\.escalas\.confirmadas < resumo\.escalas\.total/);
  const styles = await read("app/globals.css");
  assert.match(styles, /\.day-thread-stats-v5 article\[data-alerta="1"\]/);
});

test("o diálogo de célula separa o que vai para a internet do que é interno", async () => {
  const operations = await read("app/components/TenantOperations.tsx");
  const dialogo = operations.slice(operations.indexOf("cell-create-dialog-v2"));
  // Endereço e descrição públicos ficam num bloco avisado, não soltos na lista.
  assert.match(dialogo, /form-public-block-v5/);
  assert.match(dialogo, /aparece na internet/);
  const bloco = dialogo.slice(dialogo.indexOf("form-public-block-v5"), dialogo.indexOf("</fieldset>", dialogo.indexOf("form-public-block-v5")));
  assert.match(bloco, /name="enderecoPublico"/);
  assert.match(bloco, /name="descricaoPublica"/);
  // Observações internas ficam de fora do bloco público.
  assert.doesNotMatch(bloco, /name="observacoes"/);
});

test("os diálogos dizem a consequência no rodapé", async () => {
  const operations = await read("app/components/TenantOperations.tsx");
  const rodapes = operations.match(/form-consequence-v5/g) || [];
  assert.ok(rodapes.length >= 2, `esperava ao menos 2 rodapés, achei ${rodapes.length}`);
  assert.match(operations, /Só o nome é obrigatório/);
  const styles = await read("app/globals.css");
  assert.match(styles, /\.form-consequence-v5/);
});

test("a data de entrada do visitante usa o fuso local, não UTC", async () => {
  const operations = await read("app/components/TenantOperations.tsx");
  // toISOString devolve UTC: no Brasil, das 21h em diante a data já virou e um
  // visitante do culto de domingo à noite era gravado como segunda.
  assert.match(operations, /function hojeLocal\(\)/);
  assert.doesNotMatch(operations, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(operations, /defaultValue=\{hojeLocal\(\)\}/);
});

test("o diálogo portalizado carrega os tokens que perde ao sair do escopo", async () => {
  const styles = await read("app/globals.css");
  // createPortal monta o diálogo no body, fora de .cells-workspace-v2, onde os
  // --v2-* são declarados. Sem eles o botão de confirmar ficava branco no branco.
  assert.match(styles, /\.cell-create-overlay-v2 \{[^}]*--v2-accent:/);
  assert.match(styles, /\.cell-create-dialog-v2 footer button:not\(:last-child\)/);
});

// --------------------------------------------------------------------------
// Bloco 6 — superfície pública (recepção, login e perfil da comunidade)
// --------------------------------------------------------------------------

test("a camada v2 não mantém uma segunda marca competindo com o acento", async () => {
  const styles = await read("app/globals.css");
  // A camada v2 declarava azul #2554b8 e verde #168778 e os impunha com
  // !important sobre --pilot-primary/--pilot-accent/--pilot-gradient. Era por
  // isso que o cobre não chegava ao painel, ao login nem ao perfil público:
  // havia duas marcas, e a de baixo vencia.
  assert.doesNotMatch(styles, /--v2-blue:\s*#2554b8/);
  assert.doesNotMatch(styles, /--v2-teal:\s*#168778/);
  assert.doesNotMatch(styles, /--v2-blue:\s*#4d9fff/);
  assert.doesNotMatch(styles, /--v2-teal:\s*#3fc9b0/);
  assert.match(styles, /--v2-blue:var\(--violet\)/);
  assert.match(styles, /--v2-teal:var\(--violet\)/);
  // Estado continua com cor própria: erro e aviso não viram cobre.
  assert.match(styles, /--v2-danger:#c63e56/);
  assert.match(styles, /--v2-warning:#a66a13/);
});

test("cada página pública tem o próprio título na aba", async () => {
  // As quatro abriam como "VÍNKULO | Gestão para igrejas e comunidades": com
  // duas abas abertas não dava para saber qual pedia a senha.
  const login = await read("app/login/page.tsx");
  assert.match(login, /export const metadata = \{\s*\n\s*title: "Entrar \| VÍNKULO"/);

  const diretorio = await read("app/comunidades/page.tsx");
  assert.match(diretorio, /title: "Comunidades \| VÍNKULO"/);

  const perfil = await read("app/comunidades/[slug]/page.tsx");
  assert.match(perfil, /export async function generateMetadata/);
  assert.match(perfil, /\$\{community\.nome\} \| VÍNKULO/);
});

test("o acento do login é configurável e o degradê respeita a cor escolhida", async () => {
  const config = await read("app/lib/pilot-login-config.ts");
  assert.match(config, /accentColor: "#b25a33"/);
  const portal = await read("app/components/LoginPortal.tsx");
  assert.match(portal, /"--login-accent": config\.accentColor \|\| "#b25a33"/);

  const styles = await read("app/globals.css");
  // A segunda parada era ciano fixo: quem escolhesse outro acento via um
  // degradê que terminava sempre em ciano.
  assert.doesNotMatch(styles, /linear-gradient\(145deg,var\(--login-accent\),#3fc9d0\)/);
  assert.match(styles, /linear-gradient\(145deg,var\(--login-accent\),color-mix\(in srgb,var\(--login-accent\)/);
});

test("a coluna do login diz o que a conta faz, não elogios", async () => {
  const portal = await read("app/components/LoginPortal.tsx");
  // Procura no texto renderizado, não no comentário que cita a versão antiga.
  assert.doesNotMatch(portal, /<strong>Seguro por contexto<\/strong>/);
  assert.doesNotMatch(portal, /<strong>Rotina conectada<\/strong>/);
  assert.match(portal, /Ainda não tem acesso\?/);
  assert.match(portal, /a liderança da comunidade aprova/);

  const styles = await read("app/globals.css");
  // Em três colunas de ~150px qualquer frase quebrava em cinco linhas.
  assert.match(styles, /\.login-shell\[data-ui-version="v2"\] \.login-v2-benefits \{ grid-template-columns:1fr;/);
});

test("os pontos decorativos da recepção deixaram de imitar estado", async () => {
  const styles = await read("app/globals.css");
  // O ponto ao lado de "Gestão, conexão e cuidado em um só lugar" era
  // verde-menta e lia como "no ar", sem indicar nada.
  assert.doesNotMatch(styles, /\.landing-status-badge > span \{[^}]*background: #44d6b4/);
  assert.doesNotMatch(styles, /\.landing-preview-label span \{[^}]*background: #34c99f/);
  assert.match(styles, /\.landing-status-badge > span \{[^}]*var\(--landing-c,#d9784c\)/);
  // "Escala confirmada" continua verde: ali a cor é informação.
  assert.match(styles, /\.landing-preview-notice > span \{[^}]*color: #4bd6b2/);
});

test("a capa de comunidade sem foto usa o mesmo par da capa do perfil", async () => {
  const styles = await read("app/globals.css");
  assert.doesNotMatch(styles, /linear-gradient\(145deg,#111c3a,#4b3da2\)/);
  assert.match(styles, /\.directory-profile-visual \{[^}]*linear-gradient\(145deg,#161c2e,#2b2233\)/);
  // O botão de ajuda flutua fora de .vinkulo-site, então não pode depender
  // de var(--pilot-gradient): ali o token não existe.
  assert.doesNotMatch(styles, /linear-gradient\(135deg,#7255ef,#2cbfbd\)/);
  assert.match(styles, /\.global-feedback-trigger>span \{[^}]*linear-gradient\(135deg,#b25a33,#d9784c\)/);
});

test("a saudação do painel não cola o nome da comunidade na frase seguinte", async () => {
  const home = await read("app/components/CommunityHome.tsx");
  // A quebra de linha depois da expressão não vira espaço no JSX: lia
  // "…em Comunidade Nova Aliançae resolva…".
  assert.match(home, /\{communityName\}\{" "\}/);
});
