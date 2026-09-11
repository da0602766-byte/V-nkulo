import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("acesso temporário identifica a pessoa e exige resposta da escala no backend", () => {
  const page = source("app/components/TemporaryAccessFlow.tsx");
  const api = source("app/api/acesso-temporario/[token]/route.ts");
  const login = source("app/components/LoginPortal.tsx");

  assert.match(page, /ACESSO PESSOAL PARA/);
  assert.match(page, /beneficiaryName/);
  assert.match(page, /Entrar como \{beneficiaryName\}/);
  assert.match(page, /RESPONDER_ESCALA/);
  assert.match(page, /CONFIRMADA/);
  assert.match(page, /INDISPONIVEL/);
  assert.match(page, /SUBSTITUICAO_SOLICITADA/);
  assert.match(api, /grant\.designacao_status !== "CONFIRMADA"/);
  assert.match(api, /requiresConfirmation: true/);
  assert.match(api, /hasScheduleConflict/);
  assert.match(login, /login-temporary-access-context/);
  assert.match(login, /returnTo\.startsWith\("\/acesso\/"\)/);
});

test("compartilhamento fica curto e histórico cancelável fica na aba do ministério", () => {
  const workspace = source("app/components/SecretaryMinisterialWorkspace.tsx");
  const css = source("app/secretary.css");
  const shareStart = workspace.indexOf("function ShareDialogV2(");
  const shareSource = workspace.slice(shareStart);

  assert.ok(shareStart > 0);
  assert.match(workspace, /\["historico", "Histórico"\]/);
  assert.match(workspace, /function MinistryAccessHistory/);
  assert.match(workspace, /Cancelar acesso/);
  assert.match(workspace, /secretary-settings-danger-zone/);
  assert.doesNotMatch(shareSource, /Status das autorizações/);
  assert.doesNotMatch(shareSource, /loadAccesses/);
  assert.match(css, /\.secretary-access-history-text/);
  assert.match(css, /\.secretary-settings-danger-zone/);
});

test("cadastro e aprovação preservam seleção de módulos com dependências e bloqueio real", () => {
  const catalog = source("app/lib/community-modules.ts");
  const create = source("app/components/CreateCommunityShortcut.tsx");
  const owner = source("app/components/OwnerWorkspace.tsx");
  const ownerApi = source("app/api/proprietario/route.ts");
  const tenant = source("app/lib/tenant.ts");
  const dashboard = source("app/components/PilotDashboard.tsx");

  assert.match(catalog, /dependencies: \["ministries"\]/);
  assert.match(catalog, /dependencies: \["cells"\]/);
  assert.match(catalog, /toggleCommunityModule/);
  assert.match(catalog, /filterPermissionsForCommunityModules/);
  assert.match(create, /Abas da comunidade/);
  assert.match(create, /modules: selectedModules/);
  assert.match(owner, /form\.getAll\("modules"\)/);
  assert.match(ownerApi, /community_modules:/);
  assert.match(tenant, /filterPermissionsForCommunityModules\(permissions, modules\)/);
  assert.match(dashboard, /VIEW_MODULE/);
});

test("central do proprietário e categorias possuem layout responsivo padronizado", () => {
  const owner = source("app/components/OwnerWorkspace.tsx");
  const dashboard = source("app/components/PilotDashboard.tsx");
  const panelPage = source("app/painel/page.tsx");
  const css = source("app/globals.css");

  assert.match(owner, /owner-command-hero/);
  assert.match(owner, /OwnerInsights/);
  assert.match(owner, /DISTRIBUIÇÃO ATUAL/);
  assert.match(owner, /Governança por função/);
  assert.match(owner, /tab === "editorial"/);
  assert.match(owner, /tab === "statistics"/);
  assert.match(owner, /EditorialAutomationWorkspace/);
  assert.match(owner, /StatisticsWorkspace/);
  assert.doesNotMatch(owner, /\/painel\?view=editorial/);
  assert.doesNotMatch(owner, /\/painel\?view=estatisticas/);
  assert.doesNotMatch(dashboard, /PLATFORM_TOOL_VIEWS/);
  assert.doesNotMatch(panelPage, /"editorial"|"estatisticas"|"plataforma"/);
  assert.match(css, /\.owner-insights-grid/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.visitor-category-grid \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
});
