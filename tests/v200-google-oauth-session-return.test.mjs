import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("o cookie de sessão sobrevive ao retorno cross-site do Google", async () => {
  const auth = await read("app/lib/local-auth.ts");
  // accounts.google.com -> /api/auth/google/callback -> /painel é uma cadeia de
  // navegação iniciada por outro site. Com SameSite=Strict o navegador não envia
  // o cookie e o painel devolvia o usuário para /login?motivo=cookie_ausente.
  assert.match(auth, /__Host-adote_session/);
  assert.match(auth, /HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(auth, /SameSite=Strict/);
  assert.doesNotMatch(auth, /sameSite: "strict"/);
});

test("a proteção contra CSRF continua no worker, não no SameSite", async () => {
  const worker = await read("worker/index.ts");
  assert.match(worker, /sec-fetch-site/);
  assert.match(worker, /fetchSite === "cross-site"/);
  assert.match(worker, /origin !== url\.origin/);
  assert.match(worker, /UNSAFE_METHODS/);
});

test("conectar o Drive grava a conexão e recusa Conta Google já vinculada", async () => {
  const [callback, integration] = await Promise.all([
    read("app/api/auth/google/callback/route.ts"),
    read("app/lib/google-integration.ts"),
  ]);
  assert.match(callback, /saveGoogleConnection\(userId, identity, tokens, state\.purpose === "drive"\)/);
  assert.match(callback, /INSERT INTO storage_preferences/);
  assert.match(callback, /target\.searchParams\.set\("google", "connected"\)/);
  // google_sub tem índice único e o ON CONFLICT só cobre usuario_id.
  assert.match(integration, /WHERE google_sub = \? AND usuario_id <> \?/);
  assert.match(integration, /já está vinculada a outro cadastro/);
});

test("a tela de conta comprova a permissão concedida ao Drive", async () => {
  const [workspace, api] = await Promise.all([
    read("app/components/StoragePrivacyWorkspace.tsx"),
    read("app/api/storage/preferences/route.ts"),
  ]);
  assert.match(api, /scopes: connection\.scopes/);
  assert.match(api, /connectedAt: connection\.connected_at/);
  assert.match(workspace, /storage-google-evidence/);
  assert.match(workspace, /Permissões concedidas/);
  assert.match(workspace, /drive\.file/);
  assert.match(workspace, /function describeScopes/);
});

test("o cadastro público abre sessão em vez de devolver ao formulário de login", async () => {
  const [route, portal] = await Promise.all([
    read("app/api/auth/cadastro/route.ts"),
    read("app/components/LoginPortal.tsx"),
  ]);
  assert.match(route, /attachSessionCookie\(/);
  assert.match(route, /createSession\(userId\)/);
  assert.match(route, /redirect: "\/sem-comunidade"/);
  // O vínculo comunitário continua dependendo de aprovação.
  assert.match(route, /membershipCreated: false/);
  assert.match(route, /'LEITURA'/);
  assert.doesNotMatch(portal, /setMode\("login"\);\s*\n\s*setMessage\(result\.message/);
  assert.match(portal, /result\.redirect \|\| "\/sem-comunidade"/);
});

test("toda ação com o Google termina em um aviso animado", async () => {
  const [toast, css, portal, storage, appReturn] = await Promise.all([
    read("app/components/GoogleStatusToast.tsx"),
    read("app/globals.css"),
    read("app/components/LoginPortal.tsx"),
    read("app/components/StoragePrivacyWorkspace.tsx"),
    read("app/components/GoogleAppReturn.tsx"),
  ]);

  // Os três estados e o tempo de saída de cada um.
  assert.match(toast, /pending: 0,\s*\n\s*success: 5200,\s*\n\s*error: 0,/);
  assert.match(toast, /role=\{variant === "error" \? "alert" : "status"\}/);

  // As animações precisam existir de fato no CSS publicado.
  for (const frames of [
    "google-toast-in",
    "google-toast-cycle",
    "google-mark-pop",
    "google-badge-pop",
    "google-stroke-draw",
    "google-ring-spin",
    "google-shake",
    "google-timer-drain",
  ]) {
    assert.match(css, new RegExp(`@keyframes ${frames}`), `falta @keyframes ${frames}`);
  }
  assert.match(css, /prefers-reduced-motion: reduce/);

  // Pontos de disparo: login, cadastro e Drive.
  assert.match(portal, /<GoogleStatusToast state=\{googleToast\}/);
  assert.match(portal, /title: "Abrindo a Conta Google"/);
  assert.match(portal, /title: "Conta criada"/);
  assert.match(storage, /<GoogleStatusToast state=\{googleToast\}/);
  assert.match(storage, /title: "Google Drive conectado"/);
  assert.match(storage, /title: "Google Drive desconectado"/);
  assert.match(storage, /title: "Não foi possível conectar o Drive"/);

  // A tela de retorno do Android anima o próprio ícone em vez de repetir o texto.
  assert.doesNotMatch(appReturn, /GoogleStatusToast/);
  assert.match(appReturn, /google-return-mark/);
  assert.match(css, /\.google-return-mark\.success path/);
});
