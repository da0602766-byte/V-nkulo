import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Conta Google preserva OAuth para contas existentes sem abrir cadastro público", async () => {
  const [start, callback, integration] = await Promise.all([
    read("app/api/auth/google/start/route.ts"),
    read("app/api/auth/google/callback/route.ts"),
    read("app/lib/google-integration.ts"),
  ]);
  assert.match(start, /purpose === "drive"/);
  assert.match(callback, /google_sub = \?/);
  assert.match(callback, /WHERE email = \? LIMIT 1/);
  assert.match(callback, /normalizeEmail\(identity\.email\)/);
  assert.doesNotMatch(callback, /INSERT INTO usuarios|INSERT INTO usuario_comunidades/);
  assert.match(callback, /LOG1/);
  assert.match(callback, /function mutableRedirect/);
  assert.doesNotMatch(callback, /Response\.redirect/);
  assert.match(integration, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(integration, /oauth2\.googleapis\.com\/tokeninfo/);
  assert.match(integration, /email_verified/);
  assert.match(integration, /AES-GCM/);
});

test("fotos pessoais ficam no Drive e anexos de publicação usam o bucket compartilhado", async () => {
  const [upload, localMedia, serviceWorker, feedback, publicRegistration, notice] = await Promise.all([
    read("app/api/pilot/uploads/route.ts"),
    read("app/lib/local-media.ts"),
    read("public/sw.js"),
    read("app/api/feedback/route.ts"),
    read("app/api/public/cadastro-membro/[token]/route.ts"),
    read("app/lib/notice-image.ts"),
  ]);
  assert.match(upload, /uploadDriveFile/);
  assert.match(upload, /purpose === "post-image"[\s\S]*bucket\.put/);
  assert.match(upload, /images\/post-image\/\$\{context\.comunidadeId\}/);
  assert.match(upload, /storage: "PUBLICATION"/);
  assert.match(localMedia, /indexedDB\.open/);
  assert.match(serviceWorker, /\/local-media\//);
  assert.match(feedback, /feedback-evidence/);
  assert.doesNotMatch(feedback, /bucket\.put/);
  assert.doesNotMatch(publicRegistration, /bucket\.put/);
  assert.doesNotMatch(notice, /base64/);
  // A recusa de imagem em base64 era conferida também em `/api/modulos`, rota
  // legada removida em 08/09/2026. A garantia de que nada é gravado no banco
  // continua coberta pelas asserções acima, sobre o caminho vivo de upload.
});

// Mensagens privadas foram deliberadamente tiradas do Drive em 09/09/2026:
// o histórico permanente que o Drive garantia para fotos e publicações é
// exatamente o que uma conversa privada não deveria ter. Em troca, o chat
// vive só no banco do sistema e é apagado por completo toda semana (ver
// app/lib/chat-retention.ts) — a migração para o Drive não se aplica mais a
// mensagens, só a mídia e conteúdo publicado.
test("chat grava direto no banco do sistema e nunca mais no Drive", async () => {
  const [chat, migration, retention, schema] = await Promise.all([
    read("app/api/pilot/chat/route.ts"),
    read("app/api/storage/migrate/route.ts"),
    read("app/lib/chat-retention.ts"),
    read("drizzle/0060_google_drive_privacy.sql"),
  ]);
  assert.doesNotMatch(chat, /encryptDrivePayload/);
  assert.doesNotMatch(chat, /google-integration/);
  assert.match(chat, /INSERT INTO mensagens_privadas/);
  assert.match(chat, /ciclo_semana = strftime\('%Y-%W','now'\)/);
  assert.doesNotMatch(migration, /mensagens_privadas/);
  assert.match(migration, /status_migracao = 'COMPLETE'/);
  assert.match(migration, /cadastros_membros_temporarios/);
  assert.match(migration, /layouts_interface_historico/);
  assert.match(migration, /feedback_plataforma/);
  assert.match(retention, /DELETE FROM conversas_privadas WHERE ciclo_semana <> strftime/);
  assert.match(schema, /google_connections/);
  assert.match(schema, /community_drive_storage/);
});

test("interface explica destino e deixa anexos de publicação sob demanda", async () => {
  const [privacy, storage, image] = await Promise.all([
    read("app/privacidade/page.tsx"),
    read("app/components/StoragePrivacyWorkspace.tsx"),
    read("app/components/ResponsiveFeedImage.tsx"),
  ]);
  assert.match(privacy, /não mantém cópia do conteúdo/i);
  assert.match(storage, /O conteúdo compartilhado segue disponível na comunidade/);
  assert.match(storage, /Carregar os mais recentes automaticamente/);
  assert.match(storage, /O download manual está sempre disponível/);
  // As opções foram extraídas para o componente compartilhado do feed.
  assert.match(image, /<FeedImageActions source=\{src\}/);
  assert.match(image, /setRequestedLoad/);
  const imageActions = await read("app/components/feed/FeedImageActions.tsx");
  assert.match(imageActions, /"Visualizar imagem"/);
  assert.match(imageActions, /<FileSaveActions source=\{source\}/);
  const actions = await read("app/components/FileSaveActions.tsx");
  assert.match(actions, /run\("download"\)/);
  assert.match(actions, /Baixar no aparelho/);
  assert.match(await read("app/lib/device-files.ts"), /anchor\.download = file\.name/);
});

test("login Google entrega a sessão de volta ao APK sem compartilhar cookies com o Chrome", async () => {
  const [start, callback, completion, login, migration, returnPage] = await Promise.all([
    read("app/api/auth/google/start/route.ts"),
    read("app/api/auth/google/callback/route.ts"),
    read("app/api/auth/google/native/complete/route.ts"),
    read("app/components/LoginPortal.tsx"),
    read("drizzle/0061_google_android_handoff.sql"),
    read("app/components/GoogleAppReturn.tsx"),
  ]);
  assert.match(start, /channel.*android/);
  assert.match(start, /authorizationUrl/);
  assert.match(callback, /finishGoogleNativeHandoff/);
  assert.match(completion, /attachSessionCookie/);
  assert.match(completion, /consumeGoogleNativeHandoff/);
  assert.match(login, /window\.VinkuloAndroid/);
  assert.match(login, /display-mode/);
  assert.match(login, /android-app:\/\//);
  assert.match(login, /vinkulo-google-pairing/);
  assert.match(migration, /google_native_handoffs/);
  assert.match(returnPage, /package=com\.vinkulo\.app/);
  assert.match(returnPage, /Voltar ao aplicativo/);
});
