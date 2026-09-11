import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("app/components/PilotDashboard.tsx", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const globalCss = readFileSync("app/globals.css", "utf8");
const secretaryCss = readFileSync("app/secretary.css", "utf8");

test("a lupa publica escala e inverso para painéis fixos", () => {
  assert.match(dashboard, /--vinkulo-ui-scale-inverse/);
  assert.match(dashboard, /dataset\.vinkuloScale/);
  assert.match(layout, /--vinkulo-ui-scale-inverse/);
  assert.match(globalCss, /data-vinkulo-scale="ampliado"/);
});

test("modais ampliados preservam a área útil e rolagem", () => {
  assert.match(globalCss, /community-composer-overlay[\s\S]*vinkulo-ui-scale-inverse/);
  assert.match(globalCss, /pilot-notification-panel[\s\S]*vinkulo-ui-scale-inverse/);
  assert.match(globalCss, /global-editor-panel:not\(\.is-minimized\)/);
  assert.match(globalCss, /cell-detail-content-v4[\s\S]*overflow-y:auto/);
  assert.match(secretaryCss, /secretary-dialog-backdrop[\s\S]*vinkulo-ui-scale-inverse/);
});

test("integrantes ficam compactos e abas da célula não criam uma sexta lacuna", () => {
  assert.match(secretaryCss, /grid-template-areas:[\s\S]*"avatar activity capacity"/);
  assert.match(secretaryCss, /secretary-capacity-form\{width:auto;display:flex/);
  assert.match(globalCss, /cell-detail-v4 \.cell-tabs-v2 \{[\s\S]*flex-direction:row!important/);
});
