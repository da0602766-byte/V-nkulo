import { VINKULO_LOGO } from "../lib/brand-identity";
export default function VinkuloMark({ size = 32 }: { size?: number; light?: boolean; logoUrl?: string }) {
  return <img className="vinkulo-platform-mark" width={size} height={size} src={VINKULO_LOGO} alt="" aria-hidden="true" style={{ objectFit: "contain", flexShrink: 0, borderRadius: 8 }} />;
}
