export default function VisitorLoading() {
  return <div className="vp-loading" data-page-loading="true" role="status" aria-live="polite" aria-busy="true">
    <div className="vp-loading-label"><span className="vp-spinner" aria-hidden="true"/><div><strong>Carregando Visitantes…</strong><p>Preparando os cadastros e os próximos cuidados.</p></div></div>
    <div className="vp-skeleton-stats" aria-hidden="true">{[1,2,3,4].map(n=><span key={n}/>)}</div>
    <div className="vp-skeleton-list" aria-hidden="true">{[1,2,3].map(n=><span key={n}/>)}</div>
  </div>;
}
