import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("perfil comunitário alinha avatar, identidade e descrição sem sobrepor a capa", async () => {
  const [page, styles] = await Promise.all([
    source("app/comunidades/[slug]/page.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(page, /className="community-profile-description"/);
  assert.doesNotMatch(page, /<h1>\{community\.nome\}<\/h1>\s*<p>\{community\.descricao\}<\/p>/);
  assert.match(styles, /"avatar copy info" auto\s*"avatar description info" auto/);
  assert.match(styles, /\.community-profile-identity-v120 \.community-public-avatar \{[\s\S]*?margin:0;/);
  assert.match(styles, /"description description" auto\s*"info info" auto/);
});

test("perfil comunitário reduz títulos e cartões de acesso no celular", async () => {
  const styles = await source("app/globals.css");

  assert.match(styles, /font-size:clamp\(1\.45rem,6\.4vw,1\.78rem\)/);
  assert.match(styles, /\.social-public-community \.join-community-card \{[\s\S]*?padding:16px;/);
  assert.match(styles, /\.community-profile-quick-info>div \{ grid-template-columns:100px minmax\(0,1fr\)/);
});
