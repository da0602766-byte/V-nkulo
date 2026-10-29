"use client";
import { useSyncExternalStore } from "react";

type OfflinePolicyState = { enabled: boolean | null; status: "checking" | "confirmed" | "unavailable" };
const initial: OfflinePolicyState = { enabled: null, status: "checking" };
let state = initial;
const listeners = new Set<() => void>();
let controller: AbortController | null = null;
let generation = 0;
let stop: (() => void) | null = null;
function publish(next: OfflinePolicyState) { state = next; listeners.forEach(listener => listener()); }

// Shared global policy only: never a local grant, session or queue.
function check() {
  if (!listeners.size || document.visibilityState === "hidden") return;
  controller?.abort();
  const current = ++generation;
  const request = new AbortController();
  controller = request;
  if (!navigator.onLine) { publish({ ...state, status: "unavailable" }); return; }
  const timeout = window.setTimeout(() => {
    if (generation !== current) return;
    ++generation; request.abort(); publish({ ...state, status: "unavailable" });
  }, 12000);
  void (async () => {
    try {
      const response = await fetch("/api/mobile/policy", { cache: "no-store", signal: request.signal });
      if (!response.ok) throw new Error("Policy unavailable");
      const data = await response.json();
      if (typeof data.offlineEnabled !== "boolean") throw new Error("Invalid policy");
      if (current === generation) publish({ enabled: data.offlineEnabled, status: "confirmed" });
    } catch {
      if (current === generation) publish({ ...state, status: "unavailable" });
    } finally { window.clearTimeout(timeout); }
  })();
}
function visibility() {
  if (document.visibilityState !== "hidden") { check(); return; }
  ++generation; controller?.abort();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const timer = window.setInterval(check, 30000);
    const events = ["online", "offline", "pageshow", "vinkulo:offline-policy-changed"];
    events.forEach(event => window.addEventListener(event, check));
    document.addEventListener("visibilitychange", visibility);
    stop = () => {
      ++generation; controller?.abort(); window.clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, check));
      document.removeEventListener("visibilitychange", visibility);
    };
    check();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { stop?.(); stop = null; controller = null; state = initial; }
  };
}
const snapshot = () => state;
const serverSnapshot = () => initial;
export function useAndroidOfflinePolicy() { return { ...useSyncExternalStore(subscribe, snapshot, serverSnapshot), refresh: check }; }
export function useAndroidOfflineEnabled() { return useAndroidOfflinePolicy().enabled === true; }
