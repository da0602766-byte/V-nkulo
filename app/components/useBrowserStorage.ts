"use client";

import { useCallback, useMemo, useSyncExternalStore, type SetStateAction } from "react";

const changeEvent = "vinkulo:browser-preference";
const memory = new Map<string, string | null>();
const serverSnapshot = () => null;
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changeEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changeEvent, notify);
  };
}
function read(key: string) {
  if (memory.has(key)) return memory.get(key) ?? null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

// String snapshots stay stable between reads; arrays are parsed only when the
// stored value changes. The server snapshot also keeps hydration deterministic.
export function useBrowserStorage<T>(key: string, parse: (raw: string | null) => T) {
  const getSnapshot = useCallback(() => read(key), [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const value = useMemo(() => parse(raw), [raw, parse]);
  const setValue = useCallback((next: SetStateAction<T>) => {
    const resolved = typeof next === "function" ? (next as (value: T) => T)(parse(read(key))) : next;
    const serialized = resolved === null ? null : JSON.stringify(resolved);
    try {
      if (serialized === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, serialized);
      memory.delete(key);
    } catch { memory.set(key, serialized); }
    window.dispatchEvent(new Event(changeEvent));
  }, [key, parse]);
  return [value, setValue] as const;
}
