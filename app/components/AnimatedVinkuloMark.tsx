import type { CSSProperties } from "react";
import { VINKULO_LOGO } from "../lib/brand-identity";

/** Animate the owner's actual artwork; the alpha mask keeps every effect on the V. */
export default function AnimatedVinkuloMark({ size = 320 }: { size?: number }) {
  return <span className="vinkulo-animated-mark" aria-hidden="true" style={{ "--vinkulo-mark-size": `${size}px` } as CSSProperties}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="vinkulo-mark-guide" src={VINKULO_LOGO} width={size} height={size} alt="" decoding="sync" fetchPriority="high" />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="vinkulo-mark-draw" src={VINKULO_LOGO} width={size} height={size} alt="" decoding="sync" />
    <span className="vinkulo-mark-shine" style={{ maskImage: `url("${VINKULO_LOGO}")`, WebkitMaskImage: `url("${VINKULO_LOGO}")` }} />
  </span>;
}
