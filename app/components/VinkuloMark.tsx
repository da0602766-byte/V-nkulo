import { VINKULO_LOGO } from "../lib/brand-identity";
export default function VinkuloMark({ size = 32 }: { size?: number; light?: boolean; logoUrl?: string }) {
  // A local, preloaded brand asset should paint on the server, before hydration.
  // eslint-disable-next-line @next/next/no-img-element
  return <img data-vinkulo-logo loading="eager" decoding="async" className="vinkulo-platform-mark" width={size} height={size} src={VINKULO_LOGO} alt="" aria-hidden="true" style={{ objectFit: "contain", flexShrink: 0 }} />;
}
