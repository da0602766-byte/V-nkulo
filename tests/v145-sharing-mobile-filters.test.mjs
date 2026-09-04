import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPilotD1 } from "./helpers/sqlite-d1.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("compartilhamento do feed usa página com metadados e imagem para o WhatsApp", async () => {
  const [share, page] = await Promise.all([
    source("app/components/CommunityPostShare.tsx"),
    source("app/compartilhar/publicacao/[id]/page.tsx"),
  ]);
  assert.match(share, /\/compartilhar\/publicacao\/\$\{postId\}/);
  assert.match(share, /message: isPublic \? `📣 \$\{title\}\\n\$\{pageUrl\}/);
  assert.doesNotMatch(share, /Imagem da publicação:/);
  assert.match(page, /generateMetadata/);
  assert.match(page, /openGraph:/);
  assert.match(page, /images: image \?/);
  assert.match(page, /twitter:/);
});

test("página compartilhada entrega og:image público para a prévia", async () => {
  const { database, d1 } = await createPilotD1();
  const post = database.prepare("SELECT id FROM publicacoes_piloto ORDER BY id LIMIT 1").get();
  database.prepare(
    "UPDATE publicacoes_piloto SET status = 'PUBLICADA', visibilidade = 'PLATAFORMA', audiencia_tipo = 'PUBLICO', aprovacao_status = 'APROVADA', titulo = ?, conteudo = ?, imagem_url = ? WHERE id = ?",
  ).run("Publicação com imagem V145", "Conteúdo para compartilhar.", "https://cdn.example.test/post-v145.webp", post.id);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("v145", `${process.pid}-${Date.now()}-${Math.random()}`);
  const worker = (await import(workerUrl.href)).default;
  const response = await worker.fetch(
    new Request(`http://localhost/compartilhar/publicacao/${post.id}`),
    { DB: d1, AUTH_SECRET: "segredo-v145", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /property="og:image"/);
  assert.match(html, /https:\/\/cdn\.example\.test\/post-v145\.webp/);
  database.close();
});

test("categorias compactas filtram a lista e podem ser recolhidas", async () => {
  const [workspace, styles] = await Promise.all([
    source("app/components/TenantOperations.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(workspace, /<details className="visitor-category-dashboards" open>/);
  assert.match(workspace, /filterByCategory\(String\(category\.id\)\)/);
  assert.match(workspace, /document\.getElementById\("visitor-directory"\)/);
  assert.match(styles, /\.visitor-category-filter-cards/);
  assert.match(styles, /\.visitor-category-dashboards\[open\]>summary>i/);
});

test("ações móveis, comentários e inscritos usam painéis fora dos cartões", async () => {
  const [home, interactions, events, styles] = await Promise.all([
    source("app/components/CommunityHome.tsx"),
    source("app/components/CommunityPostInteractions.tsx"),
    source("app/components/EventsWorkspace.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(home, /community-post-actions-overlay/);
  assert.match(home, /createPortal\(/);
  assert.match(interactions, /aria-label=\{sending \? "Enviando comentário" : "Enviar comentário"\}/);
  assert.match(events, /item\.inscritos\.slice\(0, 5\)/);
  assert.match(events, /Pesquisar inscritos/);
  assert.match(events, /event-registrant-search-overlay/);
  // V147 moveu o anel de foco do form para o label que envolve o campo,
  // porque o form passou a ter uma coluna a mais para o avatar do autor.
  assert.match(styles, /\.community-comment-form > label:focus-within/);
  assert.match(styles, /\.event-registrant-search-dialog/);
});
