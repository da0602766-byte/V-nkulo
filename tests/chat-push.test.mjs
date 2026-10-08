import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { Miniflare } from "miniflare";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

async function moduleAt(path, dependencies = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, crypto, Response, Date, URL, Math,
  });
  return exports;
}

async function fixture(t) {
  const { database, d1 } = await createPilotD1(); t.after(() => database.close());
  let batchStatements = [];
  const batch = d1.batch.bind(d1);
  d1.batch = statements => { batchStatements = statements.map(s => ({ query: s.query, bindings: s.bindings })); return batch(statements); };
  const ids = [];
  for (const name of ["sender", "recipient", "outsider"]) ids.push(await createPilotUser(database, { nome: name, email: `${name}@chat.test`, senha: "Teste12345" }));
  const [sender, recipient, outsider] = ids;
  for (const [index, id] of ids.entries()) {
    database.prepare("INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES (?,?,datetime('now','+1 day'))").run(id, `session-${id}`);
    database.prepare("INSERT INTO notificacoes_push_dispositivos(usuario_id,endpoint,p256dh,auth,sessao_token_hash,vinculo_id) VALUES (?,?,'key','auth',?,?)")
      .run(id, `https://fcm.googleapis.com/fcm/send/private-${index}`, `session-${id}`, crypto.randomUUID());
  }
  let access = { user: { id: sender }, context: { comunidadeId: 1, communityAccess: "MEMBER" } }, currentUser = recipient, sessionUser = recipient;
  const wakeups = [], sends = [];
  const authorize = await moduleAt("app/lib/chat-push.ts");
  const retention = await moduleAt("app/lib/chat-retention.ts");
  const chat = await moduleAt("app/api/pilot/chat/route.ts", {
    "../../../../db": { getD1: () => d1 }, "../../../lib/tenant": { requireTenantPermission: async () => access },
    "../../../lib/chat-retention": retention, "../../../lib/push-delivery-queue": { scheduleWebPushDelivery: db => wakeups.push(db) },
  });
  const queue = await moduleAt("app/lib/push-delivery-queue.ts", {
    "./chat-push": authorize, "../../db/runtime-env": { getRuntimeEnv: () => ({}) },
    "./firebase-integration": { readFirebaseConfig: async () => ({}), nativeToken: endpoint => endpoint.startsWith("fcm:") ? endpoint.slice(4) : null,
      sendFcm: async (_config, endpoint, payload) => { sends.push({ endpoint, payload, native: true }); return new Response(null, { status: 200 }); } },
    "./web-push": { getVapidConfiguration: () => ({}), isWebPushConfigured: () => true, isTrustedPushEndpoint: () => true,
      sendWebPush: async (subscription, payload, _config, options) => { sends.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), options }); return new Response(null, { status: 201 }); } },
  });
  const resolve = await moduleAt("app/api/push-subscriptions/notification/route.ts", {
    "../../../lib/device-notification-content": await moduleAt("app/lib/device-notification-content.ts"),
    "../../../../db": { getD1: () => d1 }, "../../../lib/chat-push": authorize,
    "../../../lib/local-auth": { getSessionUser: async () => currentUser ? { id: currentUser, ativo: true } : null, getCurrentSessionTokenHash: async () => `session-${sessionUser}` },
    "../../../lib/web-push": { safeDestination: value => value.startsWith("/painel?") ? value : "/painel" },
  });
  const post = (message = "Conteúdo privado de teste", targetUserId = recipient) => chat.POST(new Request("https://test.invalid/api/pilot/chat", { method: "POST", body: JSON.stringify({ targetUserId, message }) }));
  const rows = () => database.prepare("SELECT * FROM notificacoes_push_fila").all();
  const notification = () => database.prepare("SELECT * FROM notificacoes_sistema WHERE area='CHAT' ORDER BY id DESC LIMIT 1").get();
  const request = () => resolve.GET(new Request(`https://test.invalid/api/push-subscriptions/notification?id=${notification().id}&binding=${rows()[0].vinculo_id}`));
  return { database, d1, ids, sender, recipient, outsider, chat, queue, authorize, retention, sends, wakeups, post, rows, notification, request, batchStatements: () => batchStatements,
    as: (user, session = user) => { currentUser = user; sessionUser = session; }, feedOnly: () => { access.context.communityAccess = "FEED_ONLY"; } };
}

test("chat: prévia específica só após autorização; Web/FCM recebem apenas metadados", async t => {
  const f = await fixture(t);
  f.database.prepare("INSERT INTO notificacoes_push_dispositivos(usuario_id,endpoint,p256dh,auth,sessao_token_hash,vinculo_id) VALUES (?,'fcm:native-recipient','key','auth',?,?)")
    .run(f.recipient, `session-${f.recipient}`, crypto.randomUUID());
  const response = await f.post(); assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.message.mensagem, "Conteúdo privado de teste");
  assert.equal(f.notification().entidade_id, body.message.id); assert.equal(f.rows().length, 2);
  assert.ok(f.rows().every(row => row.usuario_id === f.recipient)); assert.equal(f.wakeups.length, 1);
  assert.doesNotMatch(JSON.stringify(f.notification()), /Conteúdo privado/);
  const display = await f.request(); assert.equal(display.status, 200);
  const notice = await display.json(); assert.equal(notice.title, "Mensagem de sender"); assert.equal(notice.body, "Conteúdo privado de teste"); assert.equal(notice.url, "/painel?view=mensagens");
  assert.equal(display.headers.get("cache-control"), "no-store");
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.sends.length, 2); assert.ok(f.rows().every(row => row.estado === "ACEITO"));
  assert.equal(f.sends.find(item => !item.native).options.urgent, true);
  assert.doesNotMatch(JSON.stringify(f.sends.map(item => item.payload)), /Conteúdo privado|sender|recipient|session-/);
});

test("chat: falha ao enfileirar reverte mensagem e aviso; abrir conversa vazia não notifica", async t => {
  const f = await fixture(t);
  assert.equal((await f.post("")).status, 200); assert.equal(f.rows().length, 0); assert.equal(f.notification(), undefined);
  f.database.exec("CREATE TRIGGER fail_chat_queue BEFORE INSERT ON notificacoes_push_fila BEGIN SELECT RAISE(ABORT,'simulated queue failure'); END;");
  await assert.rejects(f.post(), /simulated queue failure/);
  assert.equal(f.database.prepare("SELECT COUNT(*) n FROM mensagens_privadas").get().n, 0);
  assert.equal(f.notification(), undefined); assert.equal(f.wakeups.length, 0);
});

test("chat: não envia nem exibe depois de leitura, perda de vínculo, mudança de grupo ou preferência desativada", async t => {
  const f = await fixture(t);
  const mutations = [
    ["UPDATE mensagens_privadas SET lida_em=CURRENT_TIMESTAMP", "UPDATE mensagens_privadas SET lida_em=NULL"],
    [`UPDATE usuario_comunidades SET status='INATIVO' WHERE usuario_id=${f.recipient}`, `UPDATE usuario_comunidades SET status='ATIVO' WHERE usuario_id=${f.recipient}`],
    [`UPDATE usuario_comunidades SET papel='LIDER' WHERE usuario_id=${f.recipient}`, `UPDATE usuario_comunidades SET papel='MEMBRO' WHERE usuario_id=${f.recipient}`],
    [`UPDATE usuarios SET ativo=0 WHERE id=${f.sender}`, `UPDATE usuarios SET ativo=1 WHERE id=${f.sender}`],
    ["UPDATE comunidades SET status='ARQUIVADA' WHERE id=1", "UPDATE comunidades SET status='ATIVA' WHERE id=1"],
    [`INSERT INTO configuracoes(chave,valor,atualizado_por) VALUES ('notification_preferences:${f.recipient}','{"mensagens":false}','test')`, `DELETE FROM configuracoes WHERE chave='notification_preferences:${f.recipient}'`],
  ];
  for (const [mutate, restore] of mutations) {
    await f.post(); f.database.exec(mutate);
    assert.equal(await f.authorize.getAuthorizedChatPush(f.d1, f.notification().id, f.recipient), null);
    assert.equal((await f.request()).status, 404);
    await f.queue.drainPushQueue(f.d1);
    assert.equal(f.rows().at(-1).estado, "CANCELADA"); f.database.exec(restore);
  }
  assert.equal(f.sends.length, 0);
});

test("chat: sessão, destinatário, comunidade e classe de comunicação impedem acesso indevido", async t => {
  const f = await fixture(t); await f.post();
  f.as(f.outsider); assert.equal((await f.request()).status, 404);
  f.as(f.recipient, f.sender); assert.equal((await f.request()).status, 404);
  f.as(null); assert.equal((await f.request()).status, 401);
  f.as(f.recipient);
  f.database.prepare("UPDATE notificacoes_push_dispositivos SET vinculo_id=? WHERE usuario_id=?").run(crypto.randomUUID(), f.recipient);
  assert.equal((await f.request()).status, 404);
  f.database.prepare("UPDATE usuario_comunidades SET papel='LIDER' WHERE usuario_id=?").run(f.recipient);
  assert.equal((await f.post()).status, 403);
  f.database.prepare("DELETE FROM usuario_comunidades WHERE usuario_id=?").run(f.recipient);
  assert.equal((await f.post()).status, 404);
  f.feedOnly(); assert.equal((await f.post()).status, 403);
  assert.equal(f.database.prepare("SELECT COUNT(*) n FROM mensagens_privadas").get().n, 1);
});

test("chat: retenção semanal apaga também metadados e fila, sem repetir histórico", async t => {
  const f = await fixture(t); await f.post();
  f.database.exec("UPDATE conversas_privadas SET ciclo_semana='2000-01'");
  assert.equal((await f.request()).status, 404);
  await f.retention.purgeExpiredPrivateMessagesIfDue(f.d1);
  assert.equal(f.database.prepare("SELECT COUNT(*) n FROM mensagens_privadas").get().n, 0);
  assert.equal(f.notification(), undefined); assert.equal(f.rows().length, 0);
  await f.queue.drainPushQueue(f.d1); assert.equal(f.sends.length, 0);
});

test("chat no D1 real: batch devolve RETURNING, isola envios concorrentes e reverte falha na fila", async t => {
  const f = await fixture(t);
  const created = await (await f.post()).json(), statements = f.batchStatements();
  const mf = new Miniflare({ modules: true, compatibilityDate: "2026-05-15", cf: false, d1Databases: ["DB"], script: "export default { fetch(){ return new Response('test'); } };" });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  const definitions = [
    "CREATE TABLE usuarios(id INTEGER PRIMARY KEY, ativo INTEGER)",
    "CREATE TABLE conversas_privadas(id INTEGER PRIMARY KEY, atualizado_em TEXT)",
    "CREATE TABLE mensagens_privadas(id INTEGER PRIMARY KEY AUTOINCREMENT, conversa_id INTEGER, remetente_id INTEGER, mensagem TEXT, criado_em TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE notificacoes_sistema(id INTEGER PRIMARY KEY AUTOINCREMENT,tipo TEXT,titulo TEXT,mensagem TEXT,area TEXT,entidade_id INTEGER,usuario_id INTEGER,comunidade_id INTEGER,remetente_usuario_id INTEGER,destino_rota TEXT,criado_por TEXT)",
    "CREATE TABLE notificacoes_push_fila(id INTEGER PRIMARY KEY AUTOINCREMENT,notificacao_id INTEGER,dispositivo_id INTEGER,usuario_id INTEGER,vinculo_id TEXT,UNIQUE(notificacao_id,vinculo_id))",
    "CREATE TABLE notificacoes_push_dispositivos(id INTEGER PRIMARY KEY,usuario_id INTEGER,sessao_token_hash TEXT,vinculo_id TEXT,expiracao_em TEXT)",
    "CREATE TABLE sessoes(usuario_id INTEGER,token_hash TEXT,expira_em TEXT)",
  ];
  await db.batch(definitions.map(sql => db.prepare(sql)));
  await db.batch([
    db.prepare("INSERT INTO usuarios VALUES (?,1)").bind(f.recipient),
    db.prepare("INSERT INTO conversas_privadas VALUES (?,CURRENT_TIMESTAMP)").bind(created.conversationId),
    db.prepare("INSERT INTO sessoes VALUES (?,'test-session',datetime('now','+1 day'))").bind(f.recipient),
    db.prepare("INSERT INTO notificacoes_push_dispositivos VALUES (1,?,'test-session','test-binding',NULL)").bind(f.recipient),
  ]);
  const send = () => db.batch(statements.map(s => db.prepare(s.query).bind(...s.bindings)));
  const results = await Promise.all([send(), send()]);
  assert.deepEqual(results.map(r => r[0].results[0].id).sort(), [1, 2]);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM notificacoes_push_fila").first()).n, 2);
  assert.equal((await db.prepare("SELECT COUNT(DISTINCT entidade_id) n FROM notificacoes_sistema").first()).n, 2);
  await db.prepare("CREATE TRIGGER reject_queue BEFORE INSERT ON notificacoes_push_fila BEGIN SELECT RAISE(ABORT,'simulated-failure'); END").run();
  await assert.rejects(send(), /simulated-failure/);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM mensagens_privadas").first()).n, 2);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM notificacoes_sistema").first()).n, 2);
});
