import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const exports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/event-directory.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { filterEventDirectory } = exports;
const now = Date.parse('2026-10-08T18:00:00Z');
const event = (id, start, end = null, status = 'PUBLICADO') => ({ id, titulo: 'Reunião de oração', descricao: '', local: 'Salão principal', status, inicia_em: start, termina_em: end });
const events = [event(1, '2026-10-01T17:00:00Z'), event(2, '2026-10-08T17:00:00Z', '2026-10-08T19:00:00Z'), event(3, '2026-10-09T17:00:00Z'), event(4, '2026-10-07T17:00:00Z')];
const ids = value => Array.from(value, item => item.id);
test('Agenda mostra eventos em andamento e próximos em ordem cronológica', () => {
  assert.deepEqual(ids(filterEventDirectory(events, '', 'TODOS', 'PROXIMOS', now)), [2, 3]);
  assert.deepEqual(events.map(item => item.id), [1, 2, 3, 4], 'não altera a lista original');
});
test('Agenda permite recuperar os anteriores, mais recentes primeiro, e todos os períodos', () => {
  assert.deepEqual(ids(filterEventDirectory(events, '', 'TODOS', 'ANTERIORES', now)), [4, 1]);
  assert.equal(filterEventDirectory(events, '', 'TODOS', 'TODOS', now).length, 4);
});
test('Agenda combina período, situação e busca sem exigir acentos', () => {
  const data = [...events, event(5, '2026-10-10T17:00:00Z', null, 'RASCUNHO')];
  assert.deepEqual(ids(filterEventDirectory(data, ' oracao ', 'RASCUNHO', 'PROXIMOS', now)), [5]);
  assert.equal(filterEventDirectory(data, 'salao', 'TODOS', 'TODOS', now).length, 5);
  assert.equal(filterEventDirectory(data, 'inexistente', 'TODOS', 'TODOS', now).length, 0);
});
