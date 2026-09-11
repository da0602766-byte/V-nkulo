import PublicHeader from "../components/PublicHeader";

export default function PlansPage() {
  return (
    <main className="vinkulo-site public-directory">
      <PublicHeader />
      <section className="directory-intro">
        <p className="pilot-kicker">PREPARAÇÃO COMERCIAL</p><h1>Planos ainda não estão à venda</h1>
        <p>A contratação permanece indisponível. Não existe checkout, cobrança, assinatura ou gateway de pagamento nesta etapa.</p>
      </section>
      <section className="plans-grid">
        <article><span>ACESSO CONTROLADO</span><h2>Avaliação da plataforma</h2><strong>Sem cobrança</strong><ul><li>Comunidades e ministérios</li><li>Permissões por perfil</li><li>Automação em revisão humana</li></ul><button disabled>Contratação indisponível</button></article>
        <article className="plan-muted"><span>FUTURO</span><h2>Redes e afiliadas</h2><strong>Em preparação</strong><ul><li>Limite de afiliadas previsto</li><li>Período de teste previsto</li><li>Gateway ainda não escolhido</li></ul><button disabled>Módulo desativado</button></article>
      </section>
    </main>
  );
}
