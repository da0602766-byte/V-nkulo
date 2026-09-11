import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("capa fica na lista à direita com degradê sem remover dados do cartão", async () => {
  const [css, workspace] = await Promise.all([
    read("app/secretary.css"),
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
  ]);
  assert.match(workspace, /className="secretary-ministry-tile-media"/);
  assert.match(css, /\.secretary-ministry-tile-media \{[\s\S]*inset: 0 0 0 auto/);
  assert.match(css, /mask-image:\s*linear-gradient\(to right,transparent 0%/);
  assert.match(css, /\.secretary-ministry-tile\.has-banner::before/);
  assert.match(workspace, /CATEGORY_LABELS\[ministry\.categoria\]/);
  assert.match(workspace, /ministry\.descricao \|\| "Ministério da comunidade"/);
  assert.match(workspace, /ministry\.responsavel_nome \|\| "Não definida"/);
  assert.match(workspace, /ministry\.can_manage \? "Gerenciar →" : "Minhas escalas →"/);
  assert.match(css, /\.secretary-hero\.has-banner\{grid-template-columns:1fr;padding:0\}/);
  assert.doesNotMatch(css, /\.secretary-hero\.has-banner\{min-height:520px/);
});

test("notificações usam portal fora de cabeçalhos que recortam conteúdo", async () => {
  const [component, css] = await Promise.all([
    read("app/components/PilotNotificationCenter.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(component, /createPortal\(/);
  assert.match(component, /document\.body/);
  assert.match(css, /\.pilot-notification-backdrop \{[\s\S]*z-index:169/);
  assert.match(css, /\.pilot-notification-panel \{[\s\S]*position:fixed;[\s\S]*z-index:170/);
  assert.match(css, /\.owner-topbar \{ width:100%; max-width:100%; gap:8px; padding:9px 10px; overflow:visible; \}/);
});

test("líder do próprio ministério pode nomear co-líder sem ampliar o escopo", async () => {
  const [route, access, workspace] = await Promise.all([
    read("app/api/pilot/ministerios/[id]/route.ts"),
    read("app/lib/ministry-access.ts"),
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
  ]);
  assert.doesNotMatch(route, /Somente a gestão global pode designar líderes/);
  assert.match(route, /if \(!canManage\)/);
  assert.match(access, /own_leadership\.papel = 'LIDER'/);
  assert.match(workspace, /Líderes do ministério, pastores e proprietários podem nomear outro líder/);
  assert.match(route, /Líderes só podem ser removidos pela gestão global/);
});

test("gestão recebe líderes promovidos mesmo antes do primeiro ministério", async () => {
  const [route, workspace] = await Promise.all([
    read("app/api/pilot/ministerios/route.ts"),
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
  ]);
  assert.match(route, /if \(globalManager \|\| canManageAny\)/);
  assert.match(workspace, /await loadData\(true\)/);
  assert.match(workspace, /Atualizando líderes…/);
  assert.match(workspace, /user\.nome} · \{communityRoleLabel\(user\.papel\)}/);
  assert.match(workspace, /disabled=\{busy \|\| loadingUsers \|\| !users\.length\}/);
});

test("proprietário oferece desativação e exclusão definitiva protegida no backend", async () => {
  const [api, workspace] = await Promise.all([
    read("app/api/proprietario/route.ts"),
    read("app/components/OwnerWorkspace.tsx"),
  ]);
  assert.match(api, /action === "ALTERAR_STATUS_USUARIO"/);
  assert.match(api, /DELETE FROM sessoes WHERE usuario_id = \?/);
  assert.match(api, /action === "EXCLUIR_USUARIO_DEFINITIVO"/);
  assert.match(api, /findUserDependencies/);
  assert.match(api, /PRAGMA foreign_key_list/);
  assert.match(api, /isSystemOwnerAccount/);
  assert.match(api, /motivo: "conta_sem_vinculos_funcionais"/);
  assert.doesNotMatch(api, /CONTA_DE_TESTE_EXCLUIDA_DEFINITIVAMENTE[\s\S]{0,500}target\.email/);
  assert.match(workspace, /Desativar conta/);
  assert.match(workspace, /Excluir definitivamente/);
  assert.match(workspace, /Digite EXCLUIR para confirmar/);
  assert.match(workspace, /Com comunidades/);
  assert.match(workspace, /item\.telefone \|\| item\.email/);
});

test("auditoria aplica retenção de 14 dias e limita a interface a 20 ações", async () => {
  const [audit, api, workspace] = await Promise.all([
    read("app/lib/tenant-audit.ts"),
    read("app/api/proprietario/route.ts"),
    read("app/components/OwnerWorkspace.tsx"),
  ]);
  assert.match(audit, /AUDIT_RETENTION_DAYS = 14/);
  assert.match(audit, /OWNER_AUDIT_VISIBLE_LIMIT = 20/);
  assert.match(audit, /DELETE FROM auditoria_piloto/);
  assert.match(api, /await purgeExpiredAudit\(db\)/);
  assert.match(api, /LIMIT \$\{OWNER_AUDIT_VISIBLE_LIMIT\}/);
  assert.match(workspace, /Retenção automática: registros com mais de/);
});

test("solicitação compacta permite recusar sem descrição e avisa o solicitante", async () => {
  const [api, workspace, css] = await Promise.all([
    read("app/api/proprietario/route.ts"),
    read("app/components/OwnerWorkspace.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(api, /action !== "RECUSAR" && !modules\.length/);
  assert.match(api, /Solicitação de comunidade recusada/);
  assert.match(api, /usuarioId: current\.solicitante_id/);
  assert.match(workspace, /owner-request-card-v98/);
  assert.match(workspace, /Mensagem ao solicitante \/ motivo da decisão/);
  assert.match(workspace, /Recusar e avisar/);
  assert.match(workspace, /owner-community-profile/);
  assert.match(css, /\.owner-request-card-v98 > summary/);
  assert.match(css, /\.owner-area \{ overflow-x:clip; \}/);
  assert.match(css, /\.owner-people-layout \{ display:grid/);
});
