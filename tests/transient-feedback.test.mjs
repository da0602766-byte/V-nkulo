import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/transient-feedback-store.ts", import.meta.url), "utf8");
const exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
const notice = (id, text = "Falha ao carregar", actions = 0, content = text) => ({ id, fingerprint: `error:${text}`, content, tone: "error", actions });

test("aviso visualizado ou excluído desaparece e não volta por rerender ou duplicata", () => {
  const store = exports.createFeedbackStore();
  let calls = 0;
  store.publish({ ...notice("screen"), onDismiss: () => calls++ });
  store.acknowledge("error:Falha ao carregar");
  store.publish(notice("screen"));
  store.publish(notice("duplicate"));
  assert.equal(store.getSnapshot().length, 0);
  assert.equal(calls, 1);
  store.publish(notice("screen", "Novo aviso"));
  assert.equal(store.getSnapshot().length, 1);
  store.acknowledge();
  assert.equal(store.getSnapshot().length, 0);
});

test("avisos iguais são agrupados, preservando a ação de recuperação", () => {
  const store = exports.createFeedbackStore();
  const retry = () => "retry";
  store.publish(notice("calendar"));
  store.publish(notice("events", undefined, 1, retry));
  assert.equal(store.getSnapshot().length, 1);
  assert.equal(store.getSnapshot()[0].content(), "retry");
  store.dismiss("error:Falha ao carregar");
  assert.equal(store.getSnapshot()[0].dismissed, true);
  store.remove("events");
  assert.equal(store.getSnapshot()[0].dismissed, true);
});

test("re-render não reinicia aviso dispensado; nova mensagem abre um novo ciclo", () => {
  const store = exports.createFeedbackStore();
  store.publish(notice("screen"));
  const originalRevision = store.getSnapshot()[0].revision;
  store.dismiss("error:Falha ao carregar");
  store.publish(notice("screen", undefined, 1, "callback atualizado"));
  assert.equal(store.getSnapshot()[0].revision, originalRevision);
  assert.equal(store.getSnapshot()[0].dismissed, true);
  assert.equal(store.getSnapshot()[0].content, "callback atualizado");
  store.publish(notice("screen", "Mensagem diferente"));
  assert.equal(store.getSnapshot()[0].dismissed, false);
  assert.ok(store.getSnapshot()[0].revision > originalRevision);
});

test("trocar de tela remove avisos e callbacks, sem histórico persistente de outra sessão", () => {
  const store = exports.createFeedbackStore();
  let notifications = 0;
  const stop = store.subscribe(() => notifications++);
  store.publish(notice("private-screen"));
  store.remove("private-screen");
  assert.equal(store.getSnapshot().length, 0);
  assert.equal(notifications, 2);
  stop();
  store.publish(notice("other-screen"));
  assert.equal(notifications, 2);
});

test("dispensar um toast chama cada callback uma única vez e preserva outros avisos", () => {
  const store = exports.createFeedbackStore();
  let dismissed = 0;
  const onDismiss = () => dismissed++;
  store.publish({ ...notice("google"), onDismiss, durationMs: 9000 });
  store.publish({ ...notice("duplicate"), onDismiss });
  store.publish(notice("calendar", "Evento salvo"));
  store.dismiss("error:Falha ao carregar");
  store.dismiss("error:Falha ao carregar");
  assert.equal(dismissed, 1);
  assert.equal(store.getSnapshot().find(entry => entry.id === "calendar").dismissed, false);
});
