import SafeImage from "./SafeImage";
export default function VinkuloMark({ light = false, size = 32, logoUrl = "" }: { light?: boolean; size?: number; logoUrl?: string }) {
  if (logoUrl) return <SafeImage className="vinkulo-platform-mark" width={size} height={size} src={logoUrl} alt="" aria-hidden="true" />;
  return <svg className="lp-mark vinkulo-platform-mark" width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect width="28" height="28" rx="8" fill={light ? "#fff" : "currentColor"} /><g stroke={light ? "#2563eb" : "#fff"} strokeWidth="1.7" strokeLinecap="round"><path d="M14 5v7" /><path d="M14 16v7" strokeDasharray="2 2" /><path d="M7 14h4M17 14h4" /></g><circle cx="14" cy="14" r="2.6" fill="#f97316" /><circle cx="6" cy="14" r="1.4" fill={light ? "#2563eb" : "#fff"} /><circle cx="22" cy="14" r="1.4" fill={light ? "#2563eb" : "#fff"} /></svg>;
}
