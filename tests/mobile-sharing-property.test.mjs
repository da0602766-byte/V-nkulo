import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("link temporário atualiza sozinho quando chega o horário autorizado", () => {
  const page = source("app/escala/[token]/page.tsx");
  const pending = source("app/components/SharedSchedulePendingState.tsx");
  const schedulesApi = source("app/api/pilot/escalas/route.ts");

  assert.match(page, /SharedSchedulePendingState/);
  assert.match(page, /revalidate = 0/);
  assert.match(pending, /window\.location\.reload\(\)/);
  assert.match(pending, /serverNow - Date\.now\(\)/);
  assert.match(pending, /setInterval\(refreshWhenAvailable, 1_000\)/);
  assert.match(pending, /Verificar acesso agora/);
  assert.match(schedulesApi, /share_access_window/);
  assert.match(schedulesApi, /share_opens_at/);
  assert.match(schedulesApi, /share_expires_at/);
});

test("compartilhamento e cartões do proprietário respeitam a largura do celular", () => {
  const secretaryCss = source("app/secretary.css");
  const globalCss = source("app/globals.css");
  const workspace = source("app/components/SecretaryMinisterialWorkspace.tsx");
  const schedulesApi = source("app/api/pilot/escalas/route.ts");

  assert.match(secretaryCss, /height:\s*100dvh/);
  assert.match(secretaryCss, /overflow-x:\s*hidden/);
  assert.match(secretaryCss, /grid-template-columns:\s*1fr 1fr/);
  assert.match(secretaryCss, /\.secretary-share-actions\s*\{\s*position:\s*static/);
  assert.match(secretaryCss, /\.secretary-share-dialog > header \{ position: static/);
  assert.match(secretaryCss, /\.secretary-share-dialog-v2 > header \{ position: static !important/);
  assert.match(secretaryCss, /\.secretary-share-person-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(secretaryCss, /\.secretary-whatsapp-avatar img \{[^}]*object-fit: cover/);
  assert.match(secretaryCss, /\.secretary-whatsapp-recipient-name > span:first-child/);
  assert.doesNotMatch(secretaryCss, /\.secretary-whatsapp-recipients a > span\s*\{/);
  assert.match(workspace, /assignment\.foto_perfil[\s\S]{0,180}<img src=\{assignment\.foto_perfil\}/);
  assert.match(workspace, /Selecionar várias pessoas para enviar em um grupo/);
  assert.match(workspace, /designacaoIds: selectedDesignationIds/);
  assert.match(workspace, /aria-pressed=\{selected\}/);
  assert.match(workspace, /navigator\.share\(\{/);
  assert.doesNotMatch(workspace, /https:\/\/wa\.me\/\?text=/);
  assert.match(workspace, /Cada pessoa deve abrir somente o link ao lado do próprio nome/);
  assert.doesNotMatch(workspace, /function ShareDialog\(/);
  assert.match(schedulesApi, /u\.nome, u\.telefone, u\.foto_perfil/);
  assert.doesNotMatch(secretaryCss, /renascer/i);
  assert.match(secretaryCss, /contain:\s*inline-size/);
  assert.match(secretaryCss, /\.secretary-generated-links article/);
  assert.match(globalCss, /data-grid-preset="2x2"[\s\S]{0,180}repeat\(2,minmax\(0,1fr\)\) !important/);
  assert.match(globalCss, /data-grid-preset="4x2"[\s\S]{0,180}repeat\(4,minmax\(0,1fr\)\) !important/);
  assert.match(globalCss, /data-grid-preset="4x4"[\s\S]{0,700}\) p \{ display: none; \}/);
});
