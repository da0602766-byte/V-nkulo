import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("visão geral privada integra perfil, logout e resposta persistente de escalas", async () => {
  const [home, dashboard, styles] = await Promise.all([
    source("app/components/CommunityHome.tsx"),
    source("app/components/PilotDashboard.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(home, /fetch\("\/api\/pilot\/escalas"/);
  assert.match(home, /acao: "RESPONDER"/);
  assert.match(home, /assignment\.status === "PENDENTE"/);
  assert.match(home, /Presença confirmada/);
  assert.match(dashboard, /href="\/api\/auth\/logout"/);
  assert.match(home, /Confirme sua participação/);
  assert.match(dashboard, /pilot-user-popover/);
  assert.match(styles, /community-home-command/);
  assert.match(styles, /community-schedule-list/);
});

test("proprietário verificado aparece nas superfícies pessoais e de conteúdo", async () => {
  const [badge, dashboard, home, people, presence, comments, owner] = await Promise.all([
    source("app/components/VerifiedOwnerName.tsx"),
    source("app/components/PilotDashboard.tsx"),
    source("app/components/CommunityHome.tsx"),
    source("app/components/PeopleWorkspace.tsx"),
    source("app/components/CommunityPresencePanel.tsx"),
    source("app/components/CommunityPostInteractions.tsx"),
    source("app/components/OwnerWorkspace.tsx"),
  ]);
  assert.match(badge, /Proprietário verificado/);
  for (const file of [dashboard, home, people, presence, comments, owner]) {
    assert.match(file, /VerifiedOwnerName/);
  }
});

test("confirmação avisa responsáveis e compartilhamento permanece compacto e autorizado", async () => {
  const [api, secretary, gate, publicHeader, dashboard, secretaryStyles] = await Promise.all([
    source("app/api/pilot/escalas/[id]/route.ts"),
    source("app/components/SecretaryMinisterialWorkspace.tsx"),
    source("app/components/SharedScheduleAccessGate.tsx"),
    source("app/components/PublicHeader.tsx"),
    source("app/components/PilotDashboard.tsx"),
    source("app/secretary.css"),
  ]);
  assert.match(api, /Participação confirmada na escala/);
  assert.match(api, /ministerio_checklist_itens/);
  assert.match(api, /SELECT responsavel_usuario_id AS usuario_id/);
  assert.match(secretary, /maxLength=\{1200\}/);
  assert.match(secretary, /Autorize uma pessoa escalada/);
  assert.match(secretary, /Aba ou recurso permitido/);
  assert.match(secretary, /\/api\/pilot\/escalas\/\$\{schedule\.id\}\/acessos/);
  assert.match(secretary, /assignment\.status === "PENDENTE"/);
  assert.match(gate, /Acessar esta escala/);
  assert.match(secretaryStyles, /max-height: calc\(100dvh - 36px\)/);
  assert.doesNotMatch(publicHeader, /VÍNKULO · CONECTA · EDIFICA · TRANSFORMA/);
  assert.doesNotMatch(dashboard, /VÍNKULO · CONECTA · EDIFICA · TRANSFORMA/);
});
