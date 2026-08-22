import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getUploadOwnerSegment,
  isSafeUploadKey,
} from "../app/lib/upload-key-policy.mjs";

const source = (path) => readFileSync(path, "utf8");

test("imagens aceitam originais maiores e são convertidas automaticamente", () => {
  const clientImage = source("app/lib/client-image.ts");
  const upload = source("app/api/pilot/uploads/route.ts");
  const nativeUpload = source("app/components/NativeImageUpload.tsx");
  const loginConfig = source("app/lib/pilot-login-config.ts");
  const loginPortal = source("app/components/LoginPortal.tsx");

  assert.match(clientImage, /50 \* 1024 \* 1024/);
  assert.match(clientImage, /maximum: 4096/);
  assert.match(clientImage, /\[0\.96, 0\.9, 0\.84, 0\.76, 0\.68\]/);
  assert.match(clientImage, /canvas\.toBlob\(resolve, "image\/webp"/);
  assert.match(clientImage, /file\.type === "image\/svg\+xml"/);
  assert.match(upload, /8 \* 1024 \* 1024/);
  assert.match(nativeUpload, /prepareImageForUpload\(file, purpose\)/);
  assert.match(nativeUpload, /accept="image\/\*"/);
  assert.match(loginConfig, /backgroundFit: "SMART" \| "COVER"/);
  assert.match(loginPortal, /className="login-v2-top-banner"/);
  assert.match(loginPortal, /src=\{config\.backgroundImageUrl\}/);
  assert.doesNotMatch(loginPortal, /has-login-background/);
  assert.doesNotMatch(loginPortal, /backgroundImage: `linear-gradient/);
  assert.match(source("app/page.tsx"), /className="landing-top-banner"/);
  assert.match(source("app/page.tsx"), /src=\{branding\.feedBannerUrl\}/);
  assert.doesNotMatch(source("app/page.tsx"), /has-platform-banner/);
  assert.match(source("app/globals.css"), /\.landing-top-banner img,[\s\S]*?object-fit: cover/);
});

test("login mantém banner independente e prioriza o formulário em qualquer tela", () => {
  const loginPortal = source("app/components/LoginPortal.tsx");
  const css = source("app/globals.css");

  assert.match(loginPortal, /className="login-v2-page-brand"/);
  assert.match(loginPortal, /className="login-v2-stage" data-auth-mode=\{mode\}/);
  assert.match(loginPortal, /className="login-v2-intro"/);
  assert.match(loginPortal, /Sua comunidade organizada em um só lugar\./);
  assert.match(css, /V108 — acesso equilibrado/);
  assert.match(css, /grid-template-columns: minmax\(0,1fr\) minmax\(420px,520px\)/);
  assert.match(css, /\.login-shell\.login-shell-v2 \.login-v2-card \{ order: 1/);
  assert.match(css, /\.login-shell\.login-shell-v2 \.login-v2-top-banner \{ height: clamp\(150px,42vw,220px\)/);
});

test("criação de escala compacta etapas e sugere disponibilidade real da equipe", () => {
  const workspace = source("app/components/SecretaryMinisterialWorkspace.tsx");
  const css = source("app/secretary.css");
  const route = source("app/api/pilot/ministerios/recursos/route.ts");
  const migration = source("drizzle/0044_ministry_reusable_links.sql");

  assert.match(workspace, /className="secretary-fold-section" open/);
  assert.match(workspace, /Conflito de horário/);
  assert.match(workspace, /Sugerido para esta data/);
  assert.match(workspace, /Selecionar sugestões disponíveis/);
  assert.match(workspace, /Salvar para próximas escalas/);
  assert.match(workspace, /useState<SecretaryLink\[\]>\(\[blankSecretaryLink\(\)\]\)/);
  assert.match(workspace, /Adicionar Cifra, YouTube ou outro link/);
  assert.match(workspace, /<option value="YOUTUBE">YouTube<\/option><option value="SPOTIFY">Spotify<\/option><option value="CIFRA_CLUB">Cifra Club<\/option><option value="GOOGLE_DRIVE">Google Drive<\/option><option value="PERSONALIZADO">Personalizado<\/option>/);
  assert.match(css, /\.secretary-link-builder>\.secretary-link-actions>button\{width:100%;grid-column:auto;grid-row:auto\}/);
  assert.match(css, /\.secretary-fold-section:not/);
  assert.match(route, /SALVAR_LINKS_REUTILIZAVEIS/);
  assert.match(route, /canManageMinistry/);
  assert.match(migration, /ministerio_links_reutilizaveis_comunidade_idx/);
});

test("painel ministerial mantém indicadores 2x2 no celular e usa ícone de conversa vetorial", () => {
  const secretaryCss = source("app/secretary.css");
  const dashboard = source("app/components/PilotDashboard.tsx");
  const styles = source("app/globals.css");

  assert.equal((secretaryCss.match(/\.secretary-summary-grid\{grid-template-columns:1fr\}/g) || []).length, 0);
  assert.match(secretaryCss, /\.secretary-summary-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:8px\}/);
  assert.match(dashboard, /pilot-message-shortcut[\s\S]*?<svg aria-hidden="true" viewBox="0 0 24 24"/);
  assert.doesNotMatch(dashboard, /<span aria-hidden="true">✉<\/span>/);
  assert.match(styles, /\.pilot-message-shortcut > svg/);
});

test("perfil público da comunidade separa capa, identidade e informações com contraste claro", () => {
  const page = source("app/comunidades/[slug]/page.tsx");
  const css = source("app/globals.css");

  assert.match(page, /className="community-profile-shell"/);
  assert.match(page, /className=\{`community-profile-cover/);
  assert.match(page, /className="community-profile-identity-v120"/);
  assert.match(page, /className="community-institutional-card community-profile-information"/);
  assert.doesNotMatch(page, /className="community-public-hero"/);
  assert.match(css, /V120 — uma única marca/);
  assert.match(css, /\.community-profile-quick-info \{[\s\S]*?display:grid;/);
  assert.match(css, /\.community-profile-quick-info \{ grid-column:1\/-1; grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(page, /className="community-profile-description"/);
  assert.match(css, /html\[data-pilot-theme="claro"\] \.community-profile-shell/);
  assert.match(css, /V121 — alinhamento estrutural/);
});

test("capa ministerial enviada é aceita pela mesma rota que entrega o arquivo", () => {
  const owner = getUploadOwnerSegment("ministry-banner", {
    userId: 7,
    ministryId: 123,
    communityId: 9,
  });
  const key = `images/ministry-banner/${owner}/123e4567-e89b-12d3-a456-426614174000.webp`;
  assert.equal(owner, "ministry-123");
  assert.equal(isSafeUploadKey(key), true);
  assert.equal(
    isSafeUploadKey(
      "images/profile-photo/user-7/123e4567-e89b-12d3-a456-426614174000.webp",
    ),
    true,
  );
  assert.equal(
    isSafeUploadKey(
      "images/ministry-banner/123/123e4567-e89b-12d3-a456-426614174000.webp",
    ),
    false,
  );
  assert.equal(isSafeUploadKey("images/ministry-banner/../../secret.webp"), false);
});
