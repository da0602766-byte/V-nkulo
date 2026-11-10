import AnimatedVinkuloMark from "./AnimatedVinkuloMark";
export default function VinkuloLoading({ label = "Carregando o Vínkulo…" }: { label?: string }) {
  return <div className="vinkulo-loading" data-vinkulo-loading={label} role="status" aria-live="polite" aria-busy="true">
    <div className="vinkulo-loading-mark" aria-hidden="true">
      <AnimatedVinkuloMark size={280}/>
    </div>
    <strong>{label}</strong>
  </div>;
}
