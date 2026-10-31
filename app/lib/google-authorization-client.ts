import "./androidNativeBridge";
import { safeRelativeReturnPath } from "./safe-return-path";

const pendingKey = "vinkulo:google-handoff:v1";
const changedEvent = "vinkulo:google-pending";
type Pending = { pairing: string; expiresAt: number; returnTo: string };
let starting = false;

export function hasGoogleAppBridge() {
  return typeof window !== "undefined" && typeof window.VinkuloAndroid?.openGoogleAuth === "function";
}

export async function authorizeGoogle(endpoint: string, body?: Record<string, unknown>) {
  if (starting) return;
  starting = true;
  let pending: Pending | null = null;
  try {
    const native = hasGoogleAppBridge();
    const url = new URL(endpoint, window.location.origin);
    if (url.origin !== window.location.origin) throw new Error("Endereço de autorização inválido.");
    if (!native && !body) { window.location.assign(url.href); return; }
    if (native) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      pending = {
        pairing: Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""),
        expiresAt: Date.now() + 10 * 60_000,
        returnTo: safeRelativeReturnPath(url.searchParams.get("returnTo"), window.location.pathname + window.location.search),
      };
      // Keep the secret in the app only, including across a document reload.
      sessionStorage.setItem(pendingKey, JSON.stringify(pending));
      if (body) body = { ...body, channel: "android", pairing: pending.pairing };
      else {
        url.searchParams.set("channel", "android");
        url.searchParams.set("pairing", pending.pairing);
        url.searchParams.set("format", "json");
      }
    }
    const response = await fetch(url.href, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível iniciar a autorização do Google.");
    const authorization = new URL(result.authorizationUrl || result.url);
    if (authorization.protocol !== "https:" || authorization.hostname !== "accounts.google.com") throw new Error("Endereço de autorização inválido.");
    if (native) {
      window.VinkuloAndroid!.openGoogleAuth!(authorization.href);
      window.dispatchEvent(new Event(changedEvent));
    } else window.location.assign(authorization.href);
  } catch (error) {
    if (pending) sessionStorage.removeItem(pendingKey);
    throw error;
  } finally { starting = false; }
}

export function watchGoogleAppReturn(onError: (message: string) => void) {
  let checking = false;
  let stopped = false;
  const controller = new AbortController();
  const readPending = (): Pending | null => {
    try { return JSON.parse(sessionStorage.getItem(pendingKey) || "null"); } catch { return null; }
  };
  const check = async () => {
    const pending = readPending();
    if (checking || stopped || !pending || !hasGoogleAppBridge()) return;
    checking = true;
    try {
      if (pending.expiresAt <= Date.now()) {
        sessionStorage.removeItem(pendingKey);
        onError("A autorização do Google expirou. Toque em conectar novamente.");
        return;
      }
      const response = await fetch("/api/auth/google/native/complete", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairing: pending.pairing }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });
      const result = await response.json();
      if (stopped || readPending()?.pairing !== pending.pairing) return;
      if (response.status === 202) return;
      // A temporary server/network failure must not discard a completed handoff.
      if (response.status >= 500) return;
      sessionStorage.removeItem(pendingKey);
      if (!response.ok || result.status !== "complete") {
        onError(result.error || "Não foi possível concluir a autorização. Tente novamente.");
        return;
      }
      const target = new URL(safeRelativeReturnPath(result.returnTo, pending.returnTo), window.location.origin);
      target.searchParams.set("google", "connected");
      window.location.assign(target.href);
    } catch { /* Retry on resume or the next tick, up to the handoff expiry. */ }
    finally { checking = false; }
  };
  const resume = () => { void check(); };
  for (const event of [changedEvent, "vinkulo:google-return", "focus", "pageshow"]) window.addEventListener(event, resume);
  document.addEventListener("visibilitychange", resume);
  const timer = window.setInterval(() => { if (!document.hidden) resume(); }, 2000);
  resume();
  return () => {
    stopped = true; controller.abort(); window.clearInterval(timer);
    for (const event of [changedEvent, "vinkulo:google-return", "focus", "pageshow"]) window.removeEventListener(event, resume);
    document.removeEventListener("visibilitychange", resume);
  };
}
