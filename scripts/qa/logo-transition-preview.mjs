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
  for (const role of ["member", "owner"]) await createPilotUser(db, { nome: `Logo QA ${role}`, email: role === "owner" ? env.SYSTEM_OWNER_EMAIL : "member@logo.invalid", senha: "LocalLogo123!", memberships: communities.map(c => ({ comunidadeId: c.id, papel: "ADMIN_COMUNIDADE" })) });

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
  const controller = ts.transpileModule(await fs.readFile("app/lib/logo-transition.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const css = await fs.readFile("app/logo-transition.css", "utf8");

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, base);
      let response;
      if (url.pathname === "/qa-controller.js") response = new Response(controller, { headers: { "content-type": "text/javascript" } });
      else if (url.pathname === "/qa-logo.css") response = new Response(css, { headers: { "content-type": "text/css; charset=utf-8" } });
      else if (url.pathname === "/qa-fixture") response = new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa-logo.css"></head><body style="margin:0;background:#f7f5fb;font-family:system-ui"><div id="main-content" style="padding:24px"><header><img data-vinkulo-logo src="/vinkulo-symbol-v2.png" width="40" height="40" alt=""></header><h1>Teste local de carregamento</h1><button id="focus">Continuar</button><a href="#section" id="hash">Seção</a><a href="/login" id="native">Entrar</a><section id="section">Conteúdo</section>${url.searchParams.has("pending") ? '<div data-vinkulo-loading="Aguardando dados…"></div>' : ""}</div>${overlay}<script type="module">import {mountLogoTransition} from '/qa-controller.js';window.cleanupLogo=mountLogoTransition(document.querySelector('.platform-loading-transition'));</script></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
      else if (/^\/qa-login\/(member|owner)$/.test(url.pathname)) {
        const owner = url.pathname.endsWith("owner");
        const login = await cpfLoginRequest(env, new Request(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: owner ? env.SYSTEM_OWNER_EMAIL : "member@logo.invalid", senha: "LocalLogo123!" }) }));
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
  return { base, close: () => new Promise(resolve => server.close(() => { db.close(); resolve(); })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preview = await startLogoPreview();
  console.log(`Prévia local isolada: ${preview.base}`);
}
