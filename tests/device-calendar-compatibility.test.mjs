import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/lib/androidNativeBridge.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const event = { title: 'Culto & louvor', startsAt: '2026-11-01T18:00:00-03:00', endsAt: '2026-11-01T19:30:00-03:00', location: 'Salão principal', description: 'Equipe A' };
function load(bridge, userAgent = 'Android') {
  const navigations = [], exports = {};
  const location = { assign: url => navigations.push(url), set href(url) { navigations.push(url); } };
  runInNewContext(code, { exports, URL, window: { VinkuloAndroid: bridge, navigator: { userAgent }, location, open: () => { throw Error('Popup must not be used'); } } });
  return { ...exports, navigations };
}
test('APKs distribuídos abrem Agenda por HTTPS, preservando título, local e fuso', () => {
  const api = load({ version: '1.23.0' });
  api.addCalendarEventForDevice(event);
  assert.equal(api.navigations.length, 1);
  const url = new URL(api.navigations[0]);
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.searchParams.get('text'), event.title);
  assert.equal(url.searchParams.get('location'), event.location);
  assert.equal(url.searchParams.get('dates'), '20261101T210000Z/20261101T223000Z');
});
test('bridge nativo tem prioridade; falha usa HTTPS sem popup ou intent', () => {
  let received;
  const native = load({ addCalendarEvent: value => { received = JSON.parse(value); } });
  native.addCalendarEventForDevice(event);
  assert.equal(received.title, event.title);
  assert.equal(native.navigations.length, 0);
  const broken = load({ addCalendarEvent: () => { throw Error('old APK'); } });
  broken.addCalendarEventForDevice(event);
  assert.match(broken.navigations[0], /^https:/);
});
test('navegador desktop navega uma vez e datas inválidas não abrem aplicativos', () => {
  const api = load(undefined, 'Desktop');
  api.addCalendarEventForDevice(event);
  assert.equal(api.navigations.length, 1);
  assert.throws(() => api.addCalendarEventForDevice({ ...event, endsAt: event.startsAt }), /inválido/);
  assert.equal(api.navigations.length, 1);
});
test('WhatsApp em APK antigo usa HTTPS se a integração estiver ausente ou falhar', () => {
  for (const bridge of [{}, { shareToWhatsApp: () => { throw Error('unavailable'); } }]) {
    const api = load(bridge);
    api.shareToWhatsAppApp('Olá & bem-vindo');
    assert.equal(new URL(api.navigations[0]).searchParams.get('text'), 'Olá & bem-vindo');
    assert.match(api.navigations[0], /^https:/);
  }
});
