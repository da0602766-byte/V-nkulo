export default function VinkuloLoading({ label = "Carregando o Vínkulo…" }: { label?: string }) {
  return <div className="vinkulo-loading" role="status" aria-live="polite" aria-busy="true">
    <div className="vinkulo-loading-mark" aria-hidden="true">
      <svg viewBox="0 0 120 120" fill="none"><path className="vinkulo-v-track" d="M28 28L60 94L94 26"/><path className="vinkulo-v-stroke" d="M28 28L60 94L94 26"/></svg>
    </div>
    <span className="vinkulo-loading-wordmark">vínkulo</span>
    <strong>{label}</strong>
    <p>Conectando você à sua comunidade.</p>
    <span className="vinkulo-loading-progress" aria-hidden="true"><i /></span>
  </div>;
}
