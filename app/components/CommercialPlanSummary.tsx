import {type CommercialPlan,formatPlanPrice,PLAN_LIMITS,PLAN_RESOURCES} from '../lib/commerce-types';
import {COMMUNITY_MODULES} from '../lib/community-modules';

export default function CommercialPlanSummary({plan}:{plan:CommercialPlan}) {
  return <div className="commerce-note"><strong>{plan.nome} · {formatPlanPrice(plan)}</strong><p>{plan.descricao}</p>
    <p>Duração: {plan.duracao_dias?`${plan.duracao_dias} dias`:'sem data de término definida'}.</p>
    <p>Recursos: {[...plan.modulos.map(key=>COMMUNITY_MODULES.find(m=>m.key===key)!.label),...plan.recursos.map(key=>PLAN_RESOURCES.find(r=>r.key===key)!.label)].join(', ')||'nenhum liberado'}.</p>
    <ul>{PLAN_LIMITS.map(({key,label})=><li key={key}>{label}: {plan.limites[key]??'sem limite definido'}</li>)}</ul>
    {plan.condicoes&&<p style={{whiteSpace:'pre-wrap'}}>{plan.condicoes}</p>}
  </div>;
}
