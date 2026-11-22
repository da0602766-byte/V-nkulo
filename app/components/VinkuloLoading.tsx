import AnimatedVinkuloMark from "./AnimatedVinkuloMark";
export default function VinkuloLoading({ label = "Preparando sua experiência" }: { label?: string }) {
  return <div className="vinkulo-loading" data-vinkulo-loading={label} role="status" aria-live="polite" aria-busy="true">
    <div className="vinkulo-loading-mark" aria-hidden="true">
      <AnimatedVinkuloMark size={280}/>
    </div>
    <div className="platform-loading-label">
      <strong aria-hidden="true">V Í N K U L O</strong>
      <p className="platform-loading-message">{label}</p>
    </div>
  </div>;
}
