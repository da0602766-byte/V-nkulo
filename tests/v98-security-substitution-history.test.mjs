import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("acesso temporário bloqueia qualquer botão até a revalidação atual do servidor", async () => {
  const [flow, page, helper] = await Promise.all([
    read("app/components/TemporaryAccessFlow.tsx"),
    read("app/acesso/[token]/page.tsx"),
    read("app/lib/temporary-access.ts"),
  ]);
  assert.match(flow, /useState<[^>]*"checking" \| "verified" \| "failed"/s);
  assert.match(flow, /verificationState === "verified" &&\s*snapshot\.status === "ATIVO"/s);
  assert.match(flow, /O acesso só será liberado após a confirmação do servidor/);
  assert.match(flow, /setVerificationState\("failed"\)/);
  assert.match(page, /grant\.designacao_status !== "CONFIRMADA"/);
  assert.match(helper, /row\.designacao_status !== "CONFIRMADA"/);
});

test("não posso exige e valida substituto real do mesmo ministério", async () => {
  const [substitution, temporaryRoute, scheduleRoute, home, secretary] =
    await Promise.all([
      read("app/lib/schedule-substitution.ts"),
      read("app/api/acesso-temporario/[token]/route.ts"),
      read("app/api/pilot/escalas/[id]/route.ts"),
      read("app/components/CommunityHome.tsx"),
      read("app/components/SecretaryMinisterialWorkspace.tsx"),
    ]);
  assert.match(substitution, /JOIN ministerio_voluntarios mv[\s\S]*mv\.ministerio_id = s\.ministerio_id/);
  assert.match(substitution, /hasScheduleConflict/);
  assert.match(substitution, /status = 'PENDENTE'/);
  assert.match(temporaryRoute, /Escolha quem poderá ficar no seu lugar antes de continuar/);
  assert.match(scheduleRoute, /substitutoVoluntarioId/);
  assert.match(home, /Quem pode ficar no seu lugar\?/);
  assert.match(home, /substitutoVoluntarioId/);
  assert.match(secretary, /Confirmar substituição/);
});

test("histórico temporário só é excluído após autorização real do gestor", async () => {
  const [route, workspace] = await Promise.all([
    read("app/api/pilot/escalas/[id]/acessos/[accessId]/route.ts"),
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
  ]);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /canManageSchedule/);
  assert.match(route, /ACESSO_TEMPORARIO_HISTORICO_EXCLUIDO/);
  assert.match(route, /DELETE FROM acessos_temporarios/);
  assert.match(workspace, /Excluir histórico/);
  assert.match(workspace, /será revogado imediatamente/);
});

test("dono da comunidade pode trocar a capa e o seletor móvel permite repetir o arquivo", async () => {
  const [access, upload, settings] = await Promise.all([
    read("app/lib/ministry-access.ts"),
    read("app/components/NativeImageUpload.tsx"),
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
  ]);
  assert.match(access, /context\.communityAccess === "OWNER"/);
  assert.match(upload, /inputRef\.current\?\.click\(\)/);
  assert.match(upload, /event\.target\.value = ""/);
  assert.match(upload, /Trocar imagem/);
  assert.match(settings, /key={`\$\{selectedMinistry\.id\}:\$\{selectedMinistry\.banner_url/);
});

test("capa ministerial mostra a imagem inteira sem apagar título e responsável", async () => {
  const [workspace, secretaryCss, globalCss, upload] = await Promise.all([
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
    read("app/secretary.css"),
    read("app/globals.css"),
    read("app/components/NativeImageUpload.tsx"),
  ]);
  assert.match(workspace, /className="secretary-hero-media"/);
  assert.match(workspace, /alt={`Capa do ministério \$\{selectedMinistry\.nome\}`}/);
  assert.doesNotMatch(workspace, /backgroundImage: `linear-gradient/);
  assert.match(secretaryCss, /\.secretary-hero-media img[\s\S]*object-fit:contain/);
  assert.match(secretaryCss, /\.secretary-hero\.has-banner h1\{color:var\(--pilot-text\)\}/);
  assert.doesNotMatch(secretaryCss, /\.secretary-hero\.has-banner small,/);
  assert.match(workspace, /previewMode="banner"/);
  assert.match(upload, /previewMode\?: "square" \| "banner"/);
  assert.match(globalCss, /\.native-image-upload\.banner[\s\S]*object-fit:contain/);
});
