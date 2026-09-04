import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Conta Google usa OAuth real e cria cadastro neutro sem acesso comunitário", async () => {
  const [start, callback, integration] = await Promise.all([
    read("app/api/auth/google/start/route.ts"),
    read("app/api/auth/google/callback/route.ts"),
    read("app/lib/google-integration.ts"),
  ]);
  assert.match(start, /purpose === "drive"/);
  assert.match(callback, /google_sub = \?/);
  assert.match(callback, /WHERE email = \? LIMIT 1/);
  assert.match(callback, /normalizeEmail\(identity\.email\)/);
  assert.match(callback, /INSERT INTO usuarios/);
  assert.match(callback, /'LEITURA'/);
  assert.match(callback, /membershipCreated: false/);
  assert.match(callback, /roleGranted: false/);
  assert.match(callback, /function mutableRedirect/);
  assert.doesNotMatch(callback, /Response\.redirect/);
  assert.match(integration, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(integration, /oauth2\.googleapis\.com\/tokeninfo/);
  assert.match(integration, /email_verified/);
  assert.match(integration, /AES-GCM/);
});

test("fotos e anexos novos usam Drive sem cópia na plataforma", async () => {
  const [upload, localMedia, serviceWorker, feedback, publicRegistration, legacyProfile, notice, modules] = await Promise.all([
    read("app/api/pilot/uploads/route.ts"),
    read("app/lib/local-media.ts"),
    read("public/sw.js"),
    read("app/api/feedback/route.ts"),
    read("app/api/public/cadastro-membro/[token]/route.ts"),
    read("app/api/perfil/route.ts"),
    read("app/lib/notice-image.ts"),
    read("app/api/modulos/route.ts"),
  ]);
  assert.match(upload, /uploadDriveFile/);
  assert.doesNotMatch(upload, /bucket\.put/);
  assert.match(upload, /storage: "GOOGLE_DRIVE"/);
  assert.match(localMedia, /indexedDB\.open/);
  assert.match(serviceWorker, /\/local-media\//);
  assert.match(feedback, /feedback-evidence/);
  assert.doesNotMatch(feedback, /bucket\.put/);
  assert.doesNotMatch(publicRegistration, /bucket\.put/);
  assert.doesNotMatch(legacyProfile, /startsWith\("data:image\/"\)/);
  assert.doesNotMatch(notice, /base64/);
  assert.match(modules, /Vínkulo não guarda arquivos no banco/);
});

test("chat grava conteúdo criptografado no Drive e preserva o legado validado", async () => {
  const [chat, migration, schema] = await Promise.all([
    read("app/api/pilot/chat/route.ts"),
    read("app/api/storage/migrate/route.ts"),
    read("drizzle/0060_google_drive_privacy.sql"),
  ]);
  assert.match(chat, /encryptDrivePayload/);
  assert.match(chat, /application\/vnd\.vinkulo\.encrypted\+json/);
  assert.doesNotMatch(chat, /INSERT INTO mensagens_privadas/);
  assert.match(migration, /uploadVerifiedDriveFile/);
  assert.doesNotMatch(migration, /DELETE FROM mensagens_privadas|bucket\.delete/);
  assert.match(migration, /status_migracao = 'COMPLETE'/);
  assert.match(migration, /cadastros_membros_temporarios/);
  assert.match(migration, /layouts_interface_historico/);
  assert.match(migration, /feedback_plataforma/);
  assert.match(schema, /google_connections/);
  assert.match(schema, /community_drive_storage/);
});

test("interface explica destino e deixa anexos de publicação sob demanda", async () => {
  const [privacy, storage, image, chat] = await Promise.all([
    read("app/privacidade/page.tsx"),
    read("app/components/StoragePrivacyWorkspace.tsx"),
    read("app/components/ResponsiveFeedImage.tsx"),
    read("app/api/pilot/chat/route.ts"),
  ]);
  assert.match(privacy, /não mantém cópia do conteúdo/i);
  assert.match(storage, /Escolha onde salvar seus conteúdos/);
  assert.match(storage, /originais legados foram preservados/);
  assert.match(storage, /Carregar os mais recentes automaticamente/);
  assert.match(storage, /Permitir baixar arquivos neste aparelho/);
  assert.match(image, /Visualizar imagem/);
  assert.match(image, /Baixar imagem/);
  assert.match(image, /download=1/);
  assert.match(chat, /recentContentLoaded: loadRecent/);
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
