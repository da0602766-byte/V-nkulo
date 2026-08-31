import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("publicação escolhe canal e ministérios e passa por aprovação", () => {
  const home = read("app/components/CommunityHome.tsx");
  const route = read("app/api/pilot/publicacoes/route.ts");
  const migration = read("drizzle/0059_publication_governance.sql");
  assert.match(home, /name="canalFeed"/);
  assert.match(home, /name="canalLateral"/);
  assert.match(home, /Ministérios específicos/);
  assert.match(route, /status = wantsPublish && !canModerate \? "EM_ANALISE"/);
  assert.match(route, /Publicação aguardando aprovação/);
  assert.match(migration, /ministerios_json/);
  assert.match(migration, /aprovacao_status/);
});

test("denúncia fica nos três pontos e abre a publicação no contexto correto", () => {
  const home = read("app/components/CommunityHome.tsx");
  const interactions = read("app/components/CommunityPostInteractions.tsx");
  const owner = read("app/components/OwnerWorkspace.tsx");
  assert.match(home, />Denunciar publicação</);
  assert.doesNotMatch(interactions, /post-report-button/);
  assert.match(owner, /onOpenPost/);
  assert.match(owner, /#publicacao-/);
});

test("agenda pública exige aprovação e votação reconcilia em tempo real", () => {
  const agenda = read("app/api/pilot/agenda/route.ts");
  const calendar = read("app/components/AgendaCalendar.tsx");
  const events = read("app/components/EventsWorkspace.tsx");
  assert.match(agenda, /approvalStatus = publico && !canApprove \? "PENDENTE"/);
  assert.match(calendar, /Aprovar publicação/);
  assert.match(events, /setEvents\(\(current\) => current\.map/);
  assert.match(events, /3_000/);
});

test("gestão, visitantes, notificações e mensagens seguem o novo layout", () => {
  const styles = read("app/globals.css");
  const visitors = read("app/components/TenantOperations.tsx");
  const dashboard = read("app/components/PilotDashboard.tsx");
  const people = read("app/components/PeopleWorkspace.tsx");
  assert.match(styles, /scrollbar-width:none/);
  assert.match(styles, /community-central-workspace/);
  assert.match(visitors, /Revisar e exportar/);
  assert.match(visitors, /Categorias sugeridas/);
  assert.match(dashboard, /pilot-message-popover/);
  assert.match(people, /HIERARCHY_PERMISSION_PRESETS/);
});
