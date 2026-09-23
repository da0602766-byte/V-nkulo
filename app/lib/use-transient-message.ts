"use client";

import { useEffect, useState } from "react";

/** Keep administrative confirmations readable without leaving a permanent banner. */
export function useTransientMessage(durationMs = 6000) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs]);

  return [message, setMessage] as const;
}
