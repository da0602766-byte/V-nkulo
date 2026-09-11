"use client";

import { useEffect, useRef } from "react";

export type GoogleToastVariant = "pending" | "success" | "error";

export type GoogleToastState = {
  variant: GoogleToastVariant;
  title: string;
  detail?: string;
} | null;

// Erros ficam na tela até o usuário fechar: quem não conseguiu conectar precisa
// ler o motivo. Sucesso e andamento sozinhos não pedem ação e se retiram.
// Este valor também alimenta a animação de saída em CSS (google-toast-cycle),
// por isso ele é aplicado como animation-duration no próprio elemento.
const AUTO_DISMISS_MS: Record<GoogleToastVariant, number> = {
  pending: 0,
  success: 5200,
  error: 0,
};

export default function GoogleStatusToast({
  state,
  onDismiss,
}: {
  state: GoogleToastState;
  onDismiss: () => void;
}) {
  // O callback costuma ser uma arrow inline, que muda a cada render do pai.
  // Guardá-lo numa ref evita reiniciar o cronômetro a cada render.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!state) return;
    const delay = AUTO_DISMISS_MS[state.variant];
    if (!delay) return;
    const timer = window.setTimeout(() => dismissRef.current(), delay);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (!state) return null;
  const { variant, title, detail } = state;
  const autoDismissMs = AUTO_DISMISS_MS[variant];
  return (
    <div
      className={`google-toast google-toast-${variant}`}
      style={autoDismissMs ? { animationDuration: `${autoDismissMs}ms` } : undefined}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      <span className="google-toast-mark" aria-hidden="true">
        <GoogleMark />
        <span className={`google-toast-badge google-toast-badge-${variant}`}>
          {variant === "pending" ? <PendingRing /> : variant === "success" ? <CheckStroke /> : <ErrorStroke />}
        </span>
      </span>
      <span className="google-toast-text">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <button type="button" className="google-toast-close" onClick={onDismiss} aria-label="Fechar aviso">
        ×
      </button>
      {autoDismissMs > 0 && (
        <span
          className="google-toast-timer"
          style={{ animationDuration: `${autoDismissMs}ms` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="google-toast-logo" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.56-5.15 3.56-8.8Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3a7.2 7.2 0 0 1-10.72-3.78H1.34v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.34 14.31a7.2 7.2 0 0 1 0-4.6V6.62H1.34a12 12 0 0 0 0 10.78l4-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.34 6.62l4 3.09A7.2 7.2 0 0 1 12 4.75Z" />
    </svg>
  );
}

function PendingRing() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function CheckStroke() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.8 10 17.6 19 7.2" />
    </svg>
  );
}

function ErrorStroke() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7 17 17" />
      <path d="M17 7 7 17" />
    </svg>
  );
}
