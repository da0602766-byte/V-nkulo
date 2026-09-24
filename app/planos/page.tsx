import PublicHeader from '../components/PublicHeader';
import Link from '../components/StableLink';
import {getLandingPlans} from '../lib/platform-plans';

export default async function PlansPage() {
  const plans=await getLandingPlans();
  return <main className="vinkulo-site public-directory"><PublicHeader/>
    <section className="directory-intro"><p className="pilot-kicker">PLANOS VÍNKULO</p><h1>Um plano para sua comunidade.</h1><p>Envie uma solicitação pelo LOG1. Após a análise, você receberá um link individual para escolher seu plano e confirmar as condições.</p></section>
    {plans.length?<section className="plans-grid">{plans.map(plan=><article key={plan.name}><h2>{plan.name}</h2><strong>{plan.price}</strong><p>{plan.description}</p><ul>{plan.items.map((item,i)=><li key={i}>{item}</li>)}</ul><Link href="/log1">Solicitar comunidade →</Link></article>)}</section>:<section className="directory-intro"><h2>Vamos conhecer sua comunidade.</h2><p>Os planos estão em configuração. Você já pode enviar sua solicitação para conversar com o responsável pela plataforma.</p><Link href="/log1">Enviar solicitação pelo LOG1 →</Link></section>}
  </main>;
}
