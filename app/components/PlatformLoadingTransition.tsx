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
    <p className="platform-loading-label" role="status" aria-live="polite">Carregando o Vínkulo…</p>
    <div className="platform-loading-recovery" hidden>
      <p>Está demorando mais que o esperado.</p>
      <button type="button" data-loading-retry>Tentar novamente</button>
      <button type="button" data-loading-dismiss>Voltar à tela</button>
    </div>
  </div>;
}
