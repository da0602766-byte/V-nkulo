import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("orações e visitas seguem direto aos repositórios", async () => {
  const [component, requestApi, repositoryLib] = await Promise.all([
    read("app/components/RequestsWorkspace.tsx"),
    read("app/api/pilot/solicitacoes/route.ts"),
    read("app/lib/request-repositories.ts"),
  ]);
  assert.match(component, /Envio direto ao repositório/);
  assert.match(component, /item\.tipo !== "ORACAO" && item\.tipo !== "VISITA"/);
  assert.match(requestApi, /routeRequestToRepository/);
  assert.match(repositoryLib, /INSERT OR IGNORE INTO solicitacao_repositorio_itens/);
});

test("cartão flutuante registra responsável, mensagem, estados e consentimento", async () => {
  const [component, centralApi, migration] = await Promise.all([
    read("app/components/RequestsWorkspace.tsx"),
    read("app/api/pilot/solicitacoes/central/route.ts"),
    read("drizzle/0056_request_repository_workflows.sql"),
  ]);
  for (const label of ["Em oração", "Finalizado", "Oração atendida", "Em processo", "Visita concluída", "Solicita nova visita"]) assert.match(component, new RegExp(label));
  assert.match(component, /Responsável pelo atendimento/);
  assert.match(component, /Mensagem entregue/);
  assert.match(component, /Consentimento da pessoa atendida para compartilhar o testemunho/);
  assert.match(centralApi, /Somente quem realizou o atendimento pode publicar o testemunho/);
  assert.match(centralApi, /TESTEMUNHO_PEDIDO_PUBLICADO/);
  assert.match(migration, /responsavel_usuario_id/);
  assert.match(migration, /testemunho_compartilhavel/);
});

test("registros finalizados têm retenção de trinta dias", async () => {
  const [requestApi, centralApi] = await Promise.all([
    read("app/api/pilot/solicitacoes/route.ts"),
    read("app/api/pilot/solicitacoes/central/route.ts"),
  ]);
  assert.match(requestApi, /datetime\('now', '-30 days'\)/);
  assert.match(centralApi, /datetime\('now', '-30 days'\)/);
});
