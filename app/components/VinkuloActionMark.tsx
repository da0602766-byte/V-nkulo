import type { ReactNode } from "react";
import AnimatedVinkuloMark from "./AnimatedVinkuloMark";

export type VinkuloActionState = "idle" | "pending" | "success" | "error";

/** A local action signature. Never registers a foreground page loader. */
export default function VinkuloActionMark({ state = "idle", size = 30, animate = true }: { state?: VinkuloActionState; size?: number; animate?: boolean }) {
  return <span className="vinkulo-action-mark" data-state={state} data-motion={animate ? "on" : "off"} aria-hidden="true">
    <AnimatedVinkuloMark size={size} />
    {(state === "success" || state === "error") && <span className="vinkulo-action-badge">{state === "success" ? "✓" : "!"}</span>}
  </span>;
}

export function VinkuloActionStatus({ state, children }: { state: VinkuloActionState; children: ReactNode }) {
  return <span className="vinkulo-action-status" role={state === "error" ? "alert" : "status"}>
    <VinkuloActionMark state={state} size={30} /><span>{children}</span>
  </span>;
}
