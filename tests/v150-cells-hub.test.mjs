import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Células possui área própria, agenda, liderança e relatório pastoral", async () => {
  const [managementConsole, listApi, itemApi, pastoral, migration] = await Promise.all([
    read("app/components/cells/CellManagementConsole.tsx"),
    read("app/api/pilot/celulas/route.ts"),
    read("app/api/pilot/celulas/[id]/route.ts"),
    read("app/api/pilot/pastoral-dashboard/route.ts"),
    read("drizzle/0050_cells_hub.sql"),
  ]);
  assert.match(managementConsole, /cgestao-shell/);
  assert.match(managementConsole, /Relatório semanal/);
  assert.match(managementConsole, /MEMBRO_PROMOVER_VICE/);
  assert.match(listApi, /datetime\('now', '-60 days'\)/);
  assert.match(itemApi, /AGENDA_CRIAR/);
  assert.match(itemApi, /escala_designacoes/);
  assert.match(itemApi, /RELATORIO_CRIAR/);
  assert.match(pastoral, /celula_relatorios/);
  assert.match(migration, /CREATE TABLE `celula_solicitacoes`/);
});

test("Gestão e Participação de Células são experiências separadas, com mensagem de destaque editável", async () => {
  const [orchestrator, portal, mensagemApi, configPatch] = await Promise.all([
    read("app/components/CellsWorkspace.tsx"),
    read("app/components/cells/CellMemberPortal.tsx"),
    read("app/api/pilot/celulas/mensagem/route.ts"),
    read("app/api/pilot/celulas/[id]/route.ts"),
  ]);
  // Quem não gerencia nem lidera nenhuma célula só vê Participação.
  assert.match(orchestrator, /hasGestaoAccess/);
  assert.match(orchestrator, /CellMemberPortal/);
  assert.match(orchestrator, /CellManagementConsole/);
  // A caixinha de destaque (Mateus 18:20 por padrão) é editável por quem
  // gerencia células — não é texto fixo.
  assert.match(portal, /cells\.highlight\.podeEditar/);
  assert.match(mensagemApi, /Mateus 18:20/);
  assert.match(mensagemApi, /requireTenantPermission\("cells\.manage"\)/);
  assert.match(mensagemApi, /cell_highlight_message:/);
  // Configurações da célula (rede, horário, temas, foto de capa) é uma ação
  // própria, restrita a quem opera a célula.
  assert.match(configPatch, /CONFIGURACOES_ATUALIZAR/);
});

test("página pública exibe células autorizadas e recebe pedido de entrada", async () => {
  const [page, data, request, styles] = await Promise.all([
    read("app/comunidades/[slug]/page.tsx"),
    read("app/lib/pilot-data.ts"),
    read("app/api/public/celulas/[id]/solicitar/route.ts"),
    read("app/globals.css"),
  ]);
  assert.match(page, /PublicCellRequest/);
  assert.match(data, /getPublicCommunityCells/);
  assert.match(request, /celula_solicitacoes/);
  assert.match(styles, /public-cells-grid-v2/);
  assert.match(styles, /data-sidebar-collapsed="true"/);
  assert.match(styles, /login-v2-top-banner img/);
});
