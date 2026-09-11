const CACHE = "vinkulo-shell-v4";
const RUNTIME_CACHE = "vinkulo-static-v4";
const APP_SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/vinkulo-app-icon-192.png", "/vinkulo-app-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => ![CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))),
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
        return cached || fresh;
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
    payload = { body: event.data?.text() || "Você recebeu um novo aviso." };
  }
  event.waitUntil(self.registration.showNotification(payload.title || "Vínkulo", {
    body: payload.body || "Você recebeu uma nova atualização.",
    icon: "/vinkulo-app-icon-192.png",
    badge: "/vinkulo-app-icon-192.png",
    tag: payload.tag || "vinkulo-update",
    renotify: true,
    data: { url: payload.url || "/painel" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/painel", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      return existing.focus().then((client) => client.navigate(destination));
    }
    return self.clients.openWindow(destination);
  }));
});
