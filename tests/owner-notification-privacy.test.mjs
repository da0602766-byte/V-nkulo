import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';

async function moduleAt(path, dependencies = {}, globals = {}) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, Response, Request, URL, URLSearchParams, Buffer, Date, AbortSignal, ...globals });
  return exports;
}
const privacy = await moduleAt('app/lib/owner-notifications.ts');

test('avisos operacionais exigem sessão Proprietário na lista, contagem, leitura, limpeza e push', async t => {
  const { database, d1 } = await createPilotD1(); t.after(() => database.close());
  const id = await createPilotUser(database, { nome: 'Proprietário', email: 'private@example.test', senha: 'Teste12345' });
  const other = await createPilotUser(database, { nome: 'Membro', email: 'member@example.test', senha: 'Teste12345' });
  let user = { id, ativo: true, system_owner: false };
  const insert = (title, destination, uid = id) => Number(database.prepare(`INSERT INTO notificacoes_sistema
    (tipo,titulo,mensagem,area,usuario_id,destino_rota,criado_por) VALUES ('IMPORTANTE',?,'Detalhe técnico','MENU',?,?,'sistema')`)
    .run(title, uid, destination).lastInsertRowid);
  const normal = insert('Escala confirmada', '/painel?view=escalas');
  const technical = insert('Falha na sincronização Supabase', '/proprietario');
  insert('Outro aviso técnico', '/proprietario?tab=publicacao');
  insert('Falha na sincronização Supabase', '', other); // legacy/misdirected data
  const route = await moduleAt('app/api/pilot/notificacoes/route.ts', {
    '../../../../db': { getD1: () => d1 }, '../../../lib/local-auth': { getSessionUser: async () => user },
    '../../../lib/owner-notifications': privacy, '../../../lib/care-note-reminders': { deliverCareNoteReminders: async () => {} },
  });
  const request = (method = 'GET', body) => new Request('https://test.invalid/api/pilot/notificacoes?limite=1', { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  let result = await (await route.GET(request())).json();
  assert.deepEqual(result.notifications.map(n => n.id), [normal]);
  assert.equal(result.unread, 1); assert.equal(result.nextCursor, null);
  assert.equal((await route.PATCH(request('PATCH', { id: technical }))).status, 404);
  await route.PATCH(request('PATCH', { todas: true }));
  assert.equal(database.prepare('SELECT count(*) AS n FROM notificacoes_lidas WHERE notificacao_id=?').get(technical).n, 0);
  user = { ...user, system_owner: true };
  result = await (await route.GET(request())).json();
  assert.equal(result.unread, 2); assert.ok(result.nextCursor);
  assert.equal((await route.PATCH(request('PATCH', { id: technical }))).status, 200);
  user = { ...user, system_owner: false };
  await route.DELETE(request('DELETE', { lidas: true }));
  assert.ok(database.prepare('SELECT id FROM notificacoes_sistema WHERE id=?').get(technical));
  user = { id: other, ativo: true, system_owner: false };
  result = await (await route.GET(request())).json();
  assert.equal(result.notifications.length, 0); assert.equal(result.unread, 0);

  user = { id, ativo: true, system_owner: false };
  database.prepare('DELETE FROM notificacoes_lidas WHERE notificacao_id=?').run(technical);
  const binding = crypto.randomUUID();
  database.prepare("INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES (?,'owner-notice-session',datetime('now','+1 hour'))").run(id);
  database.prepare("INSERT INTO notificacoes_push_dispositivos(usuario_id,endpoint,p256dh,auth,sessao_token_hash,vinculo_id) VALUES (?,'https://fcm.googleapis.com/fcm/send/owner','key','auth','owner-notice-session',?)").run(id, binding);
  const push = await moduleAt('app/api/push-subscriptions/notification/route.ts', {
    '../../../../db': { getD1: () => d1 }, '../../../lib/local-auth': { getSessionUser: async () => user, getCurrentSessionTokenHash: async () => 'owner-notice-session' },
    '../../../lib/owner-notifications': privacy, '../../../lib/chat-push': { getAuthorizedChatPush: async () => null },
    '../../../lib/web-push': { safeDestination: value => value },
    '../../../lib/device-notification-content': await moduleAt('app/lib/device-notification-content.ts'),
  });
  const pushRequest = () => new Request(`https://test.invalid/api/push-subscriptions/notification?id=${technical}&binding=${binding}`);
  assert.equal((await push.GET(pushRequest())).status, 404);
  user.system_owner = true;
  assert.equal((await push.GET(pushRequest())).status, 200);
});

test('conciliação remove apenas IDs excluídos com auditoria e protege contas Auth e recriadas', async t => {
  const { database, d1 } = await createPilotD1(); t.after(() => database.close());
  const existing = await createPilotUser(database, { nome: 'Existente', email: 'existing@example.test', senha: 'Teste12345' });
  for (const id of [existing, 999]) database.prepare("INSERT INTO auditoria_piloto(evento,resultado,metadados) VALUES ('CONTA_EXCLUIDA_DEFINITIVAMENTE','SUCESSO',?)").run(JSON.stringify({ usuarioId: id }));
  const requests = [];
  const cleanup = await moduleAt('app/lib/supabase-deleted-profiles.ts', {
    './supabase-integration': { readIntegration: async () => ({ config: { ativa: true, url: 'https://test.supabase.co', schema: 'public', serviceRoleKey: 'encrypted' } }), reveal: async () => 'secret' },
  }, { fetch: async (url, options) => { requests.push({ url: new URL(url), options }); return Response.json([]); } });
  await cleanup.reconcileDeletedProfiles(d1, [existing, 888, 999, 0, NaN]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get('legacy_d1_id'), 'eq.999');
  assert.equal(requests[0].url.searchParams.get('auth_user_id'), 'is.null');
  assert.match(requests[0].url.searchParams.get('created_at'), /^lte\./);
  assert.equal(requests[0].options.method, 'DELETE');
  assert.equal(requests[0].options.redirect, 'manual');
});
