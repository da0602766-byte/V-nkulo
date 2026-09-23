const CACHE = "vinkulo-shell-v6";
const RUNTIME_CACHE = "vinkulo-static-v6";
const IS_LOCAL_PREVIEW = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);
const APP_SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/vinkulo-app-icon-192.png", "/vinkulo-app-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => /^vinkulo-(shell|static)-/.test(key) && ![CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === "GET" && url.origin === self.location.origin && url.pathname.startsWith("/local-media/")) {
    event.respondWith(readLocalMedia(url.pathname.slice("/local-media/".length)));
    return;
  }
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Vite serves changing modules at stable URLs. Never mix a cached stylesheet
  // with a fresh component tree. Local media above still works offline.
  if (IS_LOCAL_PREVIEW) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fresh = fetch(request).then((response) => {
          if (response.ok && response.type === "basic") void cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        // HTML and unversioned code must agree after a deployment. Keep the
        // cached copy only as an offline fallback for scripts and styles.
        return ["script", "style"].includes(request.destination) ? fresh : cached || fresh;
      }),
    );
  }
});

async function readLocalMedia(id) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("vinkulo-private-media", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("files")) request.result.createObjectStore("files", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const record = await new Promise((resolve, reject) => {
    const transaction = database.transaction("files", "readonly");
    const request = transaction.objectStore("files").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  if (!record?.blob) return new Response("Arquivo local não encontrado neste aparelho.", { status: 404 });
  return new Response(record.blob, {
    headers: {
      "Content-Type": record.type || record.blob.type || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Vinkulo-Storage": "local-device",
    },
  });
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    return;
  }
  event.waitUntil(resolvePushNotification(payload).then(async (notification) => {
    if (!notification) return;
    await self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: "/vinkulo-app-icon-192.png",
      badge: "/vinkulo-app-icon-192.png",
      tag: notification.tag,
      renotify: false,
      data: { notificationId: payload.notificationId, bindingId: payload.bindingId },
    });
  }));
});

async function resolvePushNotification(payload) {
  if (!Number.isSafeInteger(payload?.notificationId) || payload.notificationId <= 0 ||
      typeof payload.bindingId !== "string" || !/^[a-f0-9-]{36}$/i.test(payload.bindingId)) return null;
  try {
    const params = new URLSearchParams({ id: String(payload.notificationId), binding: payload.bindingId });
    const response = await fetch(`/api/push-subscriptions/notification?${params}`, {
      credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    // Sem sessão/rede não expõe avisos antigos; a central continua sendo a fonte.
    return null;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(resolvePushNotification(event.notification.data).then(async (notification) => {
    const target = new URL(notification?.url || "/painel", self.location.origin);
    const destination = target.origin === self.location.origin ? target.href : new URL("/painel", self.location.origin).href;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      return existing.focus().then((client) => client.navigate(destination));
    }
    return self.clients.openWindow(destination);
  }));
});
