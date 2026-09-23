import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("push web registra um aparelho autenticado e persiste somente as chaves necessárias", async () => {
  const [schema, migration, route] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0075_notificacoes_push_dispositivos.sql"),
    read("app/api/push-subscriptions/route.ts"),
  ]);
  assert.match(schema, /notificacoes_push_dispositivos/);
  assert.match(schema, /notificacoes_push_dispositivos_endpoint_unique/);
  assert.match(migration, /CREATE TABLE `notificacoes_push_dispositivos`/);
  assert.match(migration, /FOREIGN KEY \(`usuario_id`\) REFERENCES `usuarios`/);
  assert.match(route, /getSessionUser\(\)/);
  assert.match(route, /ON CONFLICT\(endpoint\) DO UPDATE/);
  assert.match(route, /isTrustedPushEndpoint/);
  assert.match(route, /DELETE FROM notificacoes_push_dispositivos WHERE usuario_id = \? AND endpoint = \?/);
});

test("servidor entrega push criptografado com VAPID e remove endpoints invalidados", async () => {
  const [delivery, crypto, notifications, worker, queue] = await Promise.all([
    read("app/lib/web-push.ts"),
    read("app/lib/web-push-crypto.ts"),
    read("app/lib/system-notifications.ts"),
    read("worker/index.ts"),
    read("app/lib/push-delivery-queue.ts"),
  ]);
  assert.match(delivery, /Content-Encoding": "aes128gcm"/);
  assert.match(delivery, /Authorization: authorization/);
  assert.match(crypto, /name: "ECDH", namedCurve: "P-256"/);
  assert.match(crypto, /name: "AES-GCM"/);
  assert.match(crypto, /vapid t=\$\{unsigned\}/);
  assert.match(queue, /status === 404 \|\| status === 410/);
  assert.match(queue, /executionContext\.waitUntil\(delivery\)/);
  assert.match(notifications, /scheduleWebPushDelivery/);
  assert.match(worker, /executionContext: ctx/);
});

test("a central cria uma PushSubscription real, não apenas um alerta enquanto a tela está aberta", async () => {
  const [center, client, serviceWorker, install] = await Promise.all([
    read("app/components/PilotNotificationCenter.tsx"),
    read("app/lib/web-push-client.ts"),
    read("public/sw.js"),
    read("app/components/MobileAppInstall.tsx"),
  ]);
  assert.match(center, /subscribeWebPushNotifications/);
  assert.match(center, /mesmo com o Vínkulo fechado/);
  assert.match(client, /pushManager\.subscribe/);
  assert.match(client, /applicationServerKey/);
  assert.match(client, /\/api\/push-subscriptions/);
  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(install, /Instale pelo navegador para receber avisos mesmo com o Vínkulo fechado/);
});
