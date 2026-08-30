import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("barra móvel mantém cinco posições e restaura o cadastro central", () => {
  const dashboard = read("app/components/PilotDashboard.tsx");
  const mobileNav = dashboard.match(/<nav className="pilot-mobile-nav"[\s\S]*?<\/nav>/)?.[0] || "";

  assert.equal((mobileNav.match(/<button/g) || []).length, 5);
  assert.match(mobileNav, /pilot-mobile-create-button/);
  assert.match(mobileNav, /aria-label="Adicionar ou cadastrar"/);
  assert.doesNotMatch(mobileNav, /aria-label="Comunidade"/);
  assert.match(mobileNav, />Agenda</);
  assert.match(mobileNav, />Pedidos</);
  assert.match(mobileNav, />Menu</);
});

test("perfil e configurações ficam dentro do Menu", () => {
  const dashboard = read("app/components/PilotDashboard.tsx");

  assert.match(dashboard, /pilot-mobile-profile-shortcut/);
  assert.match(dashboard, /Abrir perfil e configurações/);
  assert.match(dashboard, />\s*Perfil e configurações\s*</);
  assert.match(dashboard, /setMobileMenu\("perfil"\)/);
});

test("contadores móveis usam mensagens e notificações reais", () => {
  const dashboard = read("app/components/PilotDashboard.tsx");
  const notifications = read("app/components/PilotNotificationCenter.tsx");

  assert.match(dashboard, /onUnreadChange=\{setUnreadNotifications\}/);
  assert.match(dashboard, /const menuAlerts = unreadNotifications\.total \+ unreadMessages/);
  assert.match(dashboard, /className="pilot-mobile-badge"/);
  assert.match(dashboard, /pilot-mobile-task-summary/);
  assert.match(notifications, /NotificationUnreadSummary/);
  assert.match(notifications, /vinkulo:open-notifications/);
});

test("movimento da referência e cabeçalho público amplo têm contrato final", () => {
  const styles = read("app/globals.css");

  assert.match(styles, /@keyframes pilot-mobile-sheet-in/);
  assert.match(styles, /pilot-mobile-create-button\.active \.pilot-mobile-create-icon/);
  assert.match(styles, /translateY\(-19px\) rotate\(45deg\)/);
  assert.match(styles, /button:not\(\.pilot-mobile-create-button\)\.active::before/);
  assert.match(styles, /width: min\(1440px, calc\(100% - 32px\)\)/);
});
