import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Gestão da comunidade centraliza painéis sem retirar as permissões individuais", async () => {
  const [dashboard, workspace, tenant] = await Promise.all([
    source("app/components/PilotDashboard.tsx"),
    source("app/components/CommunityAdminWorkspace.tsx"),
    source("app/lib/tenant.ts"),
  ]);

  assert.match(dashboard, /COMMUNITY_MANAGEMENT_VIEWS/);
  assert.match(dashboard, /"membro",\s*"lider",\s*"pessoas",\s*"continuidade"/);
  assert.match(dashboard, /const primaryMenu/);
  assert.match(dashboard, /managementItems=\{communityManagementItems\}/);
  assert.match(workspace, /CENTRAL DA COMUNIDADE/);
  assert.match(workspace, /managementItems\.map/);
  assert.match(workspace, /canManageRequests/);
  assert.match(tenant, /isCommunityOwner/);
  assert.match(tenant, /continuityPermissions/);
  assert.match(tenant, /isCommunityOwner \|\| user\.system_owner/);
});

test("menu principal do computador fica recolhido e mantém nomes acessíveis", async () => {
  const [dashboard, styles] = await Promise.all([
    source("app/components/PilotDashboard.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(dashboard, /pilot-sidebar-label/);
  assert.match(dashboard, /aria-label=\{item\.label\}/);
  assert.match(styles, /@media \(min-width:821px\)/);
  assert.match(styles, /grid-template-columns:84px minmax\(0,1fr\)/);
  assert.match(styles, /\.pilot-sidebar-label/);
});

test("backend aplica retenção de sete dias somente a solicitações concluídas", async () => {
  const [route, retention] = await Promise.all([
    source("app/api/pilot/solicitacoes-entrada/route.ts"),
    source("app/lib/join-request-retention.ts"),
  ]);

  assert.match(route, /cleanupResolvedJoinRequests/);
  assert.match(route, /JOIN_REQUEST_RETENTION_DAYS/);
  assert.match(retention, /JOIN_REQUEST_RETENTION_DAYS = 7/);
  assert.match(retention, /status IN \('APROVADA', 'RECUSADA'\)/);
  assert.match(retention, /comunidade_id = \?/);
  assert.doesNotMatch(retention, /status = 'PENDENTE'/);
});

test("notificações e mensagens suspendem polling quando a página não está visível", async () => {
  const [notifications, dashboard] = await Promise.all([
    source("app/components/PilotNotificationCenter.tsx"),
    source("app/components/PilotDashboard.tsx"),
  ]);

  assert.match(notifications, /AbortController/);
  assert.match(notifications, /document\.visibilityState === "visible"/);
  assert.match(notifications, /visibilitychange/);
  assert.match(notifications, /requestRef\.current\?\.abort\(\)/);
  assert.match(dashboard, /document\.visibilityState === "visible"/);
  assert.match(dashboard, /document\.addEventListener\("visibilitychange"/);
});
