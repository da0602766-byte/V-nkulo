"use client";
import { useEffect, useState } from "react";
export function useAndroidOfflineEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/mobile/policy", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active) setEnabled(data.offlineEnabled === true);
      } catch { /* Preserve the last confirmed policy when disconnected. */ }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30000);
    window.addEventListener("online", check);
    window.addEventListener("vinkulo:offline-policy-changed", check);
    document.addEventListener("visibilitychange", check);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("online", check); window.removeEventListener("vinkulo:offline-policy-changed", check); document.removeEventListener("visibilitychange", check); };
  }, []);
  return enabled;
}
