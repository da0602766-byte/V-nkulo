import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('desktop collapse is scoped to the sidebar, not the mobile dialog', () => {
  const css = read('app/owner-console.css');
  assert.match(css, /\.is-collapsed \.oc-sidebar :is\(/);
  assert.match(css, /\.is-collapsed \.oc-sidebar \.oc-nav button/);
  assert.doesNotMatch(css, /\.is-collapsed :is\(/);
});

test('owner dialogs use native modal focus and searchable real directories', () => {
  const shell = read('app/components/OwnerConsoleShell.tsx');
  assert.match(shell, /\.showModal\(\)/);
  assert.match(shell, /onCancel=\{\(\) => setModal\(null\)\}/);
  assert.match(shell, /index < 0 \? \(event.key === "ArrowDown" \? 0 : buttons.length - 1\)/);
  assert.match(shell, /AbortController/);
  assert.match(shell, /PilotNotificationCenter/);
});

test('owner console stylesheet loads after legacy owner styles', () => {
  const layout = read('app/layout.tsx');
  assert.ok(layout.indexOf('./owner-console.css') > layout.indexOf('./owner-workspace.css'));
});
