import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function homeFor(user) {
  const exports = {};
  const element = (type, props) => ({ type, props });
  const require = (name) => {
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element, Fragment: "fragment" };
    if (name === "next/navigation") return { redirect: path => { throw new Error(`redirect:${path}`); } };
    if (name.endsWith("local-auth")) return { getSessionUser: async () => user };
    if (name.endsWith("platform-plans")) return { getLandingPlans: async () => [] };
    if (name.endsWith("platform-branding")) return { getPlatformBranding: async () => ({ siteName: "Vínkulo", logoUrl: "" }) };
    return { default: name };
  };
  vm.runInNewContext(compiled, { exports, require });
  return exports.default;
}

test("a entrada comum de um membro continua direcionando às comunidades", async () => {
  await assert.rejects(homeFor({ system_owner: false })(), /redirect:\/comunidades/);
});

test("um membro pode abrir a apresentação sem receber acesso ao editor", async () => {
  const view = await homeFor({ system_owner: false })({ searchParams: Promise.resolve({ apresentacao: "1" }) });
  const landing = view.props.children.find(child => child.type.endsWith?.("LandingPageExperience"));
  const editor = view.props.children.find(child => child.type.endsWith?.("GlobalVisualEditorLazy"));
  assert.equal(landing.props.panelHref, "/painel");
  assert.equal(landing.props.signedIn, true);
  assert.equal(landing.props.canEdit, false);
  assert.equal(editor.props.canEdit, false);
});

test("a apresentação continua pública e direciona visitantes ao login", async () => {
  const view = await homeFor(null)();
  const landing = view.props.children.find(child => child.type.endsWith?.("LandingPageExperience"));
  assert.equal(landing.props.panelHref, "/login");
  assert.equal(landing.props.signedIn, false);
  assert.equal(landing.props.canEdit, false);
});
