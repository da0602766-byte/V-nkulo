"use client";

// Seções que dependem de infraestrutura externa ainda não conectada
// (gateway de pagamento, coletor de métricas de infraestrutura, stream de
// eventos em tempo real, etc.). Em vez de forjar números, esta tela deixa
// explícito o que a área fará quando a integração existir, e para onde a
// arquitetura (schema + endpoint) já está prevista.

type PlannedField = { label: string; detail: string };

export default function OwnerInfrastructureWorkspace({
  title,
  summary,
  integration,
  fields,
}: {
  title: string;
  summary: string;
  integration: string;
  fields: PlannedField[];
}) {
  return (
    <section className="owner-directory-panel" aria-label={title}>
      <header className="owner-directory-header">
        <div>
          <strong>{title}</strong>
          <span>Estrutura preparada · dados reais pendentes</span>
        </div>
      </header>
      <div className="owner-empty" role="status">
        <span>◌</span>
        <strong>Aguardando integração: {integration}</strong>
        <p>{summary}</p>
      </div>
      <div className="owner-community-list" aria-label="Campos previstos para esta seção">
        {fields.map((field) => (
          <details className="owner-community-profile" key={field.label} open>
            <summary>
              <div>
                <h2>{field.label}</h2>
                <p>{field.detail}</p>
              </div>
              <b className="inactive">PLACEHOLDER</b>
            </summary>
          </details>
        ))}
      </div>
    </section>
  );
}
