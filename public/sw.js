const CACHE = "vinkulo-shell-v2";
const APP_SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/vinkulo-app-icon-192.png", "/vinkulo-app-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
  }
});

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
