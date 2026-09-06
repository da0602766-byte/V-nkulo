import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("o Android registra o retorno do Google e reutiliza a Activity aberta", async () => {
  const manifest = await read("Vinkulo-Android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:launchMode="singleTask"/);
  assert.match(manifest, /android\.intent\.action\.VIEW/);
  assert.match(manifest, /android\.intent\.category\.BROWSABLE/);
  assert.match(manifest, /android:scheme="vinkulo"/);
  assert.match(manifest, /android:host="google-login-complete"/);
});

test("o app abre o consentimento em aba segura e avisa a WebView ao voltar", async () => {
  const activity = await read("Vinkulo-Android/app/src/main/java/com/vinkulo/app/MainActivity.java");
  assert.match(activity, /CustomTabsIntent/);
  assert.match(activity, /public void openGoogleAuth\(String authorizationUrl\)/);
  assert.match(activity, /GOOGLE_AUTH_HOST\.equalsIgnoreCase\(target\.getHost\(\)\)/);
  assert.match(activity, /protected void onNewIntent\(Intent intent\)/);
  assert.match(activity, /vinkulo:google-return/);
  assert.match(activity, /isTrustedWebPage\(\)/);
});

test("login nativo usa pareamento, ponte Android e não confunde PWA com APK", async () => {
  const [portal, bridge] = await Promise.all([
    read("app/components/LoginPortal.tsx"),
    read("app/lib/androidNativeBridge.ts"),
  ]);
  assert.match(portal, /channel: "android"/);
  assert.match(portal, /openGoogleAuthorizationInApp\(body\.authorizationUrl\)/);
  assert.match(portal, /vinkulo:google-return/);
  assert.doesNotMatch(portal, /display-mode:/);
  assert.match(bridge, /openGoogleAuth\?: \(authorizationUrl: string\)/);
  assert.match(bridge, /target\.hostname !== "accounts\.google\.com"/);
});

test("Google Drive usa o mesmo retorno nativo e conclui dentro da conta", async () => {
  const storage = await read("app/components/StoragePrivacyWorkspace.tsx");
  assert.match(storage, /vinkulo-google-drive-pairing/);
  assert.match(storage, /purpose: "drive"/);
  assert.match(storage, /channel: "android"/);
  assert.match(storage, /\/api\/auth\/google\/native\/complete/);
  assert.match(storage, /A autorização foi concluída e você voltou ao aplicativo/);
  assert.doesNotMatch(storage, /href="\/api\/auth\/google\/start\?purpose=drive/);
});

test("callback nativo volta direto ao app e preserva a conferência do e-mail", async () => {
  const callback = await read("app/api/auth/google/callback/route.ts");
  assert.match(callback, /intent:\/\/google-login-complete/);
  assert.match(callback, /scheme=vinkulo/);
  assert.match(callback, /package=com\.vinkulo\.app/);
  assert.match(callback, /SELECT email FROM usuarios WHERE id = \? AND ativo = 1/);
  assert.match(callback, /mesma Conta Google usada no e-mail do seu cadastro/);
});

test("APK de teste avança para a versão 1.5.0", async () => {
  const [gradle, workflow] = await Promise.all([
    read("Vinkulo-Android/app/build.gradle.kts"),
    read(".github/workflows/build-vinkulo-apk.yml"),
  ]);
  assert.match(gradle, /versionCode = 6/);
  assert.match(gradle, /versionName = "1\.5\.0"/);
  assert.match(gradle, /androidx\.browser:browser:1\.8\.0/);
  assert.match(workflow, /gradle assembleDebug/);
  assert.match(workflow, /Vinkulo-Android-1\.5\.0-teste/);
});
