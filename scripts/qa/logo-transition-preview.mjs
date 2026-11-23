// Local only: real built application backed exclusively by an in-memory database.
import http from "node:http";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createPilotD1, createPilotUser } from "../../tests/helpers/sqlite-d1.mjs";
import { cpfLoginRequest } from "../../tests/helpers/cpf-login.mjs";
import worker from "../../dist/server/index.js";

export async function startLogoPreview(port = 4186) {
  const { database: db, d1 } = await createPilotD1();
  const base = `http://127.0.0.1:${port}`;
  const publicRoot = path.resolve("dist/client");
  const mime = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".html": "text/html", ".webmanifest": "application/manifest+json" };
  async function asset(request) {
    const file = path.resolve(publicRoot, "." + decodeURIComponent(new URL(request.url).pathname));
    if (!file.startsWith(publicRoot + path.sep)) return new Response("", { status: 404 });
    try { return new Response(await fs.readFile(file), { headers: { "content-type": mime[path.extname(file)] || "application/octet-stream" } }); }
    catch { return new Response("", { status: 404 }); }
  }
  const env = { DB: d1, AUTH_SECRET: "logo-qa-isolated-only", SYSTEM_OWNER_EMAIL: "owner@logo.invalid", SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01", ASSETS: { fetch: asset } };
  const ctx = { waitUntil(p) { p.catch(() => {}); }, passThroughOnException() {} };
  const communities = db.prepare("SELECT id FROM comunidades WHERE status='ATIVA' ORDER BY id LIMIT 2").all();
  if (communities.length !== 2) throw Error("QA requires two synthetic communities");
  for (const [index, community] of communities.entries()) db.prepare("UPDATE comunidades SET nome=? WHERE id=?").run(`Comunidade Logo QA ${index + 1}`, community.id);
  const credentials = {};
  for (const role of ["member", "owner"]) {
    const email = role === "owner" ? env.SYSTEM_OWNER_EMAIL : "member@logo.invalid";
    const senha = "LocalLogo123!";
    await createPilotUser(db, { nome: `Logo QA ${role}`, email, senha, memberships: communities.map(c => ({ comunidadeId: c.id, papel: "ADMIN_COMUNIDADE" })) });
    const request = new Request(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, senha }) });
    const login = await cpfLoginRequest(env, request);
    credentials[role] = { path: new URL(login.url).pathname, body: await login.json() };
  }

  const require = createRequire(import.meta.url);
  const exports = {};
  const component = await fs.readFile("app/components/PlatformLoadingTransition.tsx", "utf8");
  function requirePreview(name) {
      if (name === "react") return { useEffect() {}, useRef() { return { current: null }; } };
      if (name.endsWith("brand-identity")) return { VINKULO_LOGO: "/vinkulo-symbol-v2.png" };
      if (name.endsWith("logo-transition")) return {};
      if (name === "./AnimatedVinkuloMark") {
        const animated = {};
        const source = readFileSync("app/components/AnimatedVinkuloMark.tsx", "utf8");
        runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: animated, require: requirePreview });
        return animated;
      }
      return require(name);
  }
  runInNewContext(ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: requirePreview });
  const overlay = renderToStaticMarkup(exports.default());
  const stateSource = await fs.readFile("app/lib/logo-loading-state.ts", "utf8");
  const stateModule = ts.transpileModule(stateSource, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const stateExports = {};
  runInNewContext(ts.transpileModule(stateSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:stateExports,URLSearchParams});
  const controller = ts.transpileModule(await fs.readFile("app/lib/logo-transition.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace('"./logo-loading-state"','"/qa-loading-state.js"');
  const css = await fs.readFile("app/logo-transition.css", "utf8");
  const previewControls = `<div id="qa-controls">
    <button type="button" data-scenario="standard">Rever animação</button>
    <button type="button" data-scenario="fast">Carregamento rápido</button>
    <button type="button" data-scenario="slow">Carregamento lento</button>
    <button type="button" data-scenario="error">Falha de carregamento</button>
    <label><input type="checkbox" id="qa-flight"> Trajeto até o cabeçalho</label>
    <p><a href="/qa-login/member">Abrir comunidade de teste</a> · <a href="/login">Ver tela de login</a></p>
    <p id="qa-outcome" role="status"></p>
  </div>`;
  const fixtureScript = `<script type="module">
    import {mountLogoTransition} from '/qa-controller.js';
    const main = document.querySelector('#main-content');
    window.cleanupLogo = mountLogoTransition(document.querySelector('.platform-loading-transition'));
    document.querySelector('#qa-flight')?.addEventListener('change', event => {
      document.querySelector('[data-qa-logo]').toggleAttribute('data-vinkulo-logo', event.target.checked);
    });
    document.querySelector('#qa-controls')?.addEventListener('click', event => {
      const scenario = event.target.dataset.scenario;
      if (!scenario) return;
      const marker = document.createElement('div');
      marker.dataset.vinkuloLoading = 'Preparando sua experiência';
      main.append(marker);
      document.querySelector('#qa-outcome').textContent = '';
      setTimeout(() => {
        document.querySelector('#qa-outcome').textContent = scenario === 'error' ? 'A consulta falhou. Você pode tentar novamente.' : 'Conteúdo carregado.';
        marker.remove();
      }, {standard: 620, fast: 60, slow: 3200, error: 1000}[scenario]);
    });
  </script>`;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, base);
      let response;
      if (url.pathname === "/qa-controller.js") response = new Response(controller, { headers: { "content-type": "text/javascript" } });
      else if (url.pathname === "/qa-loading-state.js") response = new Response(stateModule, {headers:{"content-type":"text/javascript"}});
      else if (url.pathname === "/qa-logo.css") response = new Response(css, { headers: { "content-type": "text/css; charset=utf-8" } });
      else if (url.pathname === "/qa-v2") response = new Response(null, { status: 302, headers: { location: "/" } });
      else if (url.pathname === "/qa-fixture") response = new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Vínkulo · Prévia do carregamento</title><link rel="icon" href="/vinkulo-symbol-v2.png"><script>${stateExports.LOGO_LOADING_BOOTSTRAP}</script><link rel="stylesheet" href="/qa-logo.css"><style>
        body{margin:0;background:#f7f5fb;font-family:system-ui}#main-content{padding:24px;max-width:640px;margin:auto}button{min-height:44px;margin:0 8px 8px 0}label{display:block;margin-top:12px}a{margin-right:8px}@media(prefers-color-scheme:dark){body{background:#181022;color:#f7f3ff}}
      </style></head><body><div id="main-content"><header><img data-qa-logo ${url.searchParams.has("preview") ? "" : "data-vinkulo-logo"} src="/vinkulo-symbol-v2.png" width="40" height="40" alt="" ${url.searchParams.has("no-flight") ? "hidden" : ""}></header><h1>Prévia do carregamento</h1>${url.searchParams.has("preview") ? previewControls : '<button id="focus">Continuar</button><a href="#section" id="hash">Seção</a><a href="/login" id="native">Entrar</a><section id="section">Conteúdo</section>'}${url.searchParams.has("pending") ? '<div data-vinkulo-loading="Aguardando dados…"></div>' : ""}</div>${overlay}${fixtureScript}</body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
      else if (/^\/qa-login\/(member|owner)$/.test(url.pathname)) {
        const owner = url.pathname.endsWith("owner");
        const { path, body } = credentials[owner ? "owner" : "member"];
        const login = new Request(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const result = await worker.fetch(login, env, ctx);
        if (!result.ok) throw Error(await result.text());
        response = new Response(null, { status: 302, headers: { location: owner ? "/proprietario" : "/painel?view=inicio" } });
        for (const cookie of result.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
      } else {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const request = new Request(url, { method: req.method, headers: req.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
        response = url.pathname.startsWith("/assets/") ? await asset(request) : await worker.fetch(request, env, ctx);
      }
      res.writeHead(response.status, { ...Object.fromEntries(response.headers), ...(response.headers.getSetCookie().length ? { "set-cookie": response.headers.getSetCookie() } : {}) });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { console.error(error); res.writeHead(500); res.end("Falha na prévia local"); }
  });
  await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));
  return { base, credentials, close: () => new Promise(resolve => server.close(() => { db.close(); resolve(); })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preview = await startLogoPreview();
  console.log(`Prévia local isolada: ${preview.base}/`);
}
