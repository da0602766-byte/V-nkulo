"use client";

import TransientFeedback from "./TransientFeedback";

export type GoogleToastVariant = "pending" | "success" | "error";
export type GoogleToastState = { variant: GoogleToastVariant; title: string; detail?: string } | null;

/** Google operations use the same queue, timing and animation as every tab. */
export default function GoogleStatusToast({ state, onDismiss }: { state: GoogleToastState; onDismiss: () => void }) {
  if (!state) return null;
  return <TransientFeedback tone={state.variant === "pending" ? "info" : state.variant}
    onDismiss={onDismiss} durationMs={state.variant === "success" ? 5500 : 9000}>
    <strong>{state.title}</strong>
    {state.detail && <p>{state.detail}</p>}
  </TransientFeedback>;
}
