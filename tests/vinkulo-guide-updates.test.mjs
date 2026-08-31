import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("guia VÍNKULO persiste categorias, equipes e públicos por comunidade", async () => {
  const [schema, categories, teams, teamMembers, requests, schedules] = await Promise.all([
    source("../db/schema.ts"),
    source("../app/api/pilot/visitante-categorias/route.ts"),
    source("../app/api/pilot/ministerios/equipes/route.ts"),
    source("../app/api/pilot/ministerios/equipes/[id]/route.ts"),
    source("../app/api/pilot/solicitacoes/route.ts"),
    source("../app/api/pilot/escalas/route.ts"),
  ]);

  assert.match(schema, /visitante_categorias/);
  assert.match(schema, /ministerio_equipes/);
  assert.match(schema, /solicitacao_publicos/);
  assert.match(schema, /solicitacao_destinatarios/);
  assert.match(categories, /requireTenantPermission/);
  assert.match(categories, /comunidade_id/);
  assert.match(teams, /requireTenantPermission/);
  assert.match(teams, /comunidade_id/);
  assert.match(teamMembers, />= 3/);
  assert.match(requests, /resolveAudience/);
  assert.match(requests, /TODOS_MEMBROS/);
  assert.match(schedules, /equipe_id/);
  assert.match(schedules, /equipe selecionada não pertence a este ministério/i);
});

test("interface VÍNKULO oferece chat, públicos e gestão responsiva", async () => {
  const [dashboard, chat, requests, visitors, secretary, styles] = await Promise.all([
    source("../app/components/PilotDashboard.tsx"),
    source("../app/components/PrivateChatWorkspace.tsx"),
    source("../app/components/RequestsWorkspace.tsx"),
    source("../app/components/TenantOperations.tsx"),
    source("../app/components/SecretaryMinisterialWorkspace.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(dashboard, /mensagens/);
  assert.match(dashboard, /pilot-message-shortcut/);
  assert.match(chat, /Visualizada/);
  assert.match(chat, /Online/);
  assert.match(requests, /visibilidade\s+escolhida/);
  assert.match(requests, /Todos os membros ativos/);
  assert.match(visitors, /Acompanhamento por categoria/);
  assert.match(secretary, /Criar equipe/);
  assert.match(secretary, /Máximo de 3 equipes por integrante/);
  assert.match(styles, /@media\s*\(max-width:\s*680px\)/);
});

test("navegação pública usa links estáveis compatíveis com a hospedagem", async () => {
  const [stableLink, publicHeader, publicHome, communities] = await Promise.all([
    source("../app/components/StableLink.tsx"),
    source("../app/components/PublicHeader.tsx"),
    source("../app/page.tsx"),
    source("../app/comunidades/page.tsx"),
  ]);

  assert.match(stableLink, /<a href=\{href\}/);
  assert.match(publicHeader, /from "\.\/StableLink"/);
  assert.match(publicHome, /from "\.\/components\/StableLink"/);
  assert.match(communities, /from "\.\.\/components\/StableLink"/);
});

test("proprietário controla identidade global, comunidades e organização dos cartões", async () => {
  const [branding, brandingPanel, ownerPanel, ownerApi, uploads] = await Promise.all([
    source("../app/lib/platform-branding.ts"),
    source("../app/components/PlatformBrandingWorkspace.tsx"),
    source("../app/components/OwnerWorkspace.tsx"),
    source("../app/api/proprietario/route.ts"),
    source("../app/api/pilot/uploads/route.ts"),
  ]);

  assert.match(branding, /siteName:\s*string/);
  assert.match(branding, /logoUrl:\s*string/);
  assert.match(brandingPanel, /Logo global da plataforma/);
  assert.match(uploads, /platform-logo/);
  assert.match(ownerPanel, /metricOrder/);
  assert.match(ownerPanel, /draggable/);
  assert.match(ownerApi, /ALTERAR_STATUS_COMUNIDADE/);
  assert.match(ownerApi, /normalizeMetricOrder/);
});

test("portal de acesso oferece tema moderno, redes oficiais e Conta Google real", async () => {
  const [config, portal, customization] = await Promise.all([
    source("../app/lib/pilot-login-config.ts"),
    source("../app/components/LoginPortal.tsx"),
    source("../app/components/LoginCustomizationWorkspace.tsx"),
  ]);

  assert.match(config, /cleanHttpsUrl/);
  assert.match(config, /instagramUrl/);
  assert.match(portal, /login-v2-social/);
  assert.match(portal, /data-login-theme/);
  assert.match(customization, /Redes sociais oficiais/);
  assert.match(portal, /Entrar com Google/);
  assert.match(portal, /api\/auth\/google\/start/);
});

test("ajustes operacionais V4.7.4 conectam estacionamento, escalas, pessoas e eventos", async () => {
  const [
    parkingApi,
    parkingUi,
    scheduleCreateApi,
    scheduleApi,
    scheduleUi,
    sharedSchedule,
    peopleApi,
    peopleUi,
    requestsUi,
    eventsApi,
    eventsUi,
    notifications,
    ownerUi,
  ] = await Promise.all([
    source("../app/api/pilot/estacionamento/mapa/route.ts"),
    source("../app/components/ParkingWorkspace.tsx"),
    source("../app/api/pilot/escalas/route.ts"),
    source("../app/api/pilot/escalas/[id]/route.ts"),
    source("../app/components/SecretaryMinisterialWorkspace.tsx"),
    source("../app/escala/[token]/page.tsx"),
    source("../app/api/pilot/pessoas/route.ts"),
    source("../app/components/PeopleWorkspace.tsx"),
    source("../app/components/RequestsWorkspace.tsx"),
    source("../app/api/pilot/eventos/route.ts"),
    source("../app/components/EventsWorkspace.tsx"),
    source("../app/components/PilotNotificationCenter.tsx"),
    source("../app/components/OwnerWorkspace.tsx"),
  ]);

  assert.match(parkingApi, /ATUALIZAR_SETOR/);
  assert.match(parkingApi, /parking\.configure/);
  assert.match(parkingUi, /parking-sector-editor/);
  assert.match(scheduleApi, /DEFINIR_STATUS_DESIGNACAO/);
  assert.match(scheduleCreateApi, /ministerio_equipes[\s\S]*ativa = 1/);
  assert.match(scheduleApi, /schedule_share_access/);
  assert.match(scheduleApi, /Substituição necessária na escala/);
  assert.match(scheduleUi, /Pessoa autorizada/);
  assert.match(scheduleUi, /Aba ou recurso permitido/);
  assert.match(scheduleUi, /Marcar ausente/);
  assert.match(scheduleUi, /Etapa 2 — a equipe selecionada ainda não possui integrantes/);
  assert.match(sharedSchedule, /Acesso temporário encerrado/);
  assert.match(peopleApi, /json_each\(c\.membros\)/);
  assert.match(peopleUi, /Você ainda não está em uma célula/);
  assert.match(requestsUi, /personSearch/);
  assert.match(eventsApi, /can_view_registrants/);
  assert.match(eventsUi, /Ver inscritos/);
  assert.match(notifications, /window\.location\.assign/);
  assert.match(ownerUi, /owner-metric-touch-actions/);
});
