"use client";

import { useEffect, useSyncExternalStore } from "react";
import { applyTheme, getThemeSnapshot, readThemePreference, saveThemePreference, subscribeThemePreference, type ThemePreference } from "./theme-preference";

const serverSnapshot = () => "AUTO:light";

export function useThemePreference(storageId = "", fallback: ThemePreference = "AUTO") {
  const snapshot = useSyncExternalStore(subscribeThemePreference, getThemeSnapshot, serverSnapshot);
  useEffect(() => {
    applyTheme(readThemePreference(storageId, fallback));
  }, [storageId, fallback]);
  const [preference, resolved] = snapshot.split(":");
  return {
    theme: preference as ThemePreference,
    resolvedDark: resolved === "dark",
    updateTheme: (next: ThemePreference) => saveThemePreference(next, storageId),
  };
}
