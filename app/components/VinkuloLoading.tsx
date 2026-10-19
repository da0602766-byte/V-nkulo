import VinkuloMark from "./VinkuloMark";
export default function VinkuloLoading({ label = "Carregando o Vínkulo…" }: { label?: string }) {
  return <div className="vinkulo-loading" role="status" aria-live="polite" aria-busy="true">
    <div className="vinkulo-loading-mark" aria-hidden="true">
      <VinkuloMark size={96}/>
    </div>
    <span className="vinkulo-loading-wordmark">vínkulo</span>
    <strong>{label}</strong>
    <p>Conectando você à sua comunidade.</p>
    <span className="vinkulo-loading-progress" aria-hidden="true"><i /></span>
  </div>;
}
