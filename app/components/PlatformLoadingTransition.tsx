"use client";

import { useEffect, useRef } from "react";
import AnimatedVinkuloMark from "./AnimatedVinkuloMark";
import { mountLogoTransition } from "../lib/logo-transition";

/** Dormant until an existing full-page loader or Visitantes requests it. */
export default function PlatformLoadingTransition() {
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (overlay.current) return mountLogoTransition(overlay.current);
  }, []);

  return <div ref={overlay} className="platform-loading-transition" data-phase="idle">
    <div className="platform-loading-backdrop" />
    <div className="platform-loading-symbol" aria-hidden="true">
      <AnimatedVinkuloMark />
    </div>
    <div className="platform-loading-label">
      <strong aria-hidden="true">V Í N K U L O</strong>
      <p className="platform-loading-message" role="status" aria-live="polite">Preparando sua experiência</p>
    </div>
    <div className="platform-loading-recovery" hidden>
      <p>Está demorando mais que o esperado.</p>
      <button type="button" data-loading-retry>Tentar novamente</button>
      <button type="button" data-loading-dismiss>Voltar à tela</button>
    </div>
  </div>;
}
