const CACHE = "vinkulo-shell-v11";
const RUNTIME_CACHE = "vinkulo-static-v10";
const IS_LOCAL_PREVIEW = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);
// Cache only public, static resources. An unavailable home page must not block
// installation of the recovery page, and authenticated HTML is never cached.
const APP_SHELL = ["/offline.html", "/manifest.webmanifest", "/vinkulo-symbol-v2.png"];
const NAVIGATION_TIMEOUT_MS = 12_000;
const TEMPORARY_ERRORS = new Set([502, 503, 504]);
const RECOVERY_HTML = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vínkulo — Tente novamente</title><style>html{color-scheme:light dark;font:17px/1.6 system-ui;background:#10151e;color:#edf1f5}body{margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:440px;margin:24px;padding:28px;border:1px solid #394354;border-radius:20px}h1{font-size:1.7rem;line-height:1.2}button{padding:14px 22px;background:#a893ff;color:#171221;border:0;border-radius:12px;font:inherit;font-weight:700;cursor:pointer}button:focus-visible{outline:3px solid white;outline-offset:4px}</style><main><strong>VÍNKULO</strong><h1>Não foi possível carregar agora</h1><p>A conexão ou o serviço está temporariamente indisponível. Tente novamente para voltar à mesma tela.</p><p>Os cadastros já salvos continuam no sistema. Alterações sem confirmação precisam ser verificadas ao retornar.</p><button type="button" onclick="location.reload()">Tentar novamente</button></main></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(APP_SHELL.map((path) => cache.add(path)));
    } catch {
      // The embedded recovery page works even when storage is unavailable.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys.filter((key) => /^vinkulo-(shell|static)-/.test(key) && ![CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)));
    } catch {
      // Cache cleanup must not prevent the corrected worker from taking over.
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Android serves this reserved prefix from its signed APK. Do not cache it
  // or replace it with the web offline fallback, even on first offline boot.
  if (url.origin === self.location.origin && url.pathname.startsWith("/mobile-app/")) return;
  if (request.method === "GET" && url.origin === self.location.origin && url.pathname.startsWith("/local-media/")) {
    event.respondWith(readLocalMedia(url.pathname.slice("/local-media/".length)));
    return;
  }
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Vite serves changing modules at stable URLs. Never mix a cached stylesheet
  // with a fresh component tree. Local media above still works offline.
  if (IS_LOCAL_PREVIEW) return;

  if (request.mode === "navigate") {
    event.respondWith(loadNavigation(request));
    return;
  }

  if (["script", "style", "font", "image"].includes(request.destination)) {
    // Start the network independently: a cache error must never break a healthy
    // network response. waitUntil retains background refreshes for images/fonts.
    event.respondWith(loadStaticResource(request, event));
  }
});

async function navigationAttempt(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function loadNavigation(request) {
  // Only GET navigations reach this handler. Retry once for a brief transport
  // failure or gateway outage; never replay API writes or replace login/403/404.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await navigationAttempt(request);
      if (!TEMPORARY_ERRORS.has(response.status)) return response;
      void response.body?.cancel().catch(() => undefined);
    } catch {
      // Retry is bounded, including connections that never finish.
    }
  }
  try {
    const cache = await caches.open(CACHE);
    const cached = await cache.match("/offline.html");
    if (cached?.ok && cached.headers.get("Content-Type")?.includes("text/html")) {
      return recoveryResponse(cached.body);
    }
  } catch {
    // Eviction, private browsing and storage failures still get a valid page.
  }
  return recoveryResponse(RECOVERY_HTML);
}

function recoveryResponse(body) {
  return new Response(body, { status: 503, headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "X-Vinkulo-Recovery": "navigation",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  } });
}

async function loadStaticResource(request, event) {
  const cache = Promise.resolve().then(() => caches.open(RUNTIME_CACHE)).catch(() => undefined);
  const cached = cache.then((store) => store?.match(request)).catch(() => undefined);
  const network = Promise.resolve().then(() => fetch(request));
  event.waitUntil(network.then(async (response) => {
    if (response.ok && response.type === "basic") {
      try { await (await cache)?.put(request, response.clone()); } catch { /* Cache is optional. */ }
    }
  }).catch(() => undefined));
  const fresh = network.catch(async () => (await cached) || new Response("Recurso temporariamente indisponível.", { status: 503, headers: { "Cache-Control": "no-store" } }));
  // Prefer current code after deployments. Images/fonts may use an exact cached
  // URL, while the refresh still completes before the event's lifetime ends.
  if (["script", "style"].includes(request.destination)) return fresh;
  return (await cached) || fresh;
}

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
      icon: "/vinkulo-symbol-v2.png",
      badge: "/vinkulo-symbol-v2.png",
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
