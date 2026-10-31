"use client";

import { useEffect, useState } from "react";
import { authorizeGoogle, hasGoogleAppBridge, watchGoogleAppReturn } from "../lib/google-authorization-client";
import TransientFeedback from "./TransientFeedback";

export default function GoogleNativeAuth() {
  const [error, setError] = useState("");
  useEffect(() => {
    const stop = watchGoogleAppReturn(setError);
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !hasGoogleAppBridge()) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor) return;
      const url = new URL(anchor.getAttribute("href")!, location.origin);
      if (url.origin !== location.origin || url.pathname !== "/api/auth/google/start") return;
      event.preventDefault();
      setError("");
      void authorizeGoogle(url.href).catch(error => setError(error.message));
    };
    document.addEventListener("click", click);
    return () => { stop(); document.removeEventListener("click", click); };
  }, []);
  return error ? <TransientFeedback tone="error"><p role="alert">{error}</p></TransientFeedback> : null;
}
