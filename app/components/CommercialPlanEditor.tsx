"use client";
import { COMMUNITY_MODULES, toggleCommunityModule } from '../lib/community-modules';
import { PLAN_LIMITS, PLAN_RESOURCES, type CommercialPlan } from '../lib/commerce-types';

export default function CommercialPlanEditor({plan,onChange,proposal=false}:{plan:CommercialPlan;onChange:(p:CommercialPlan)=>void;proposal?:boolean}) {
  function field<K extends keyof CommercialPlan>(key:K,value:CommercialPlan[K]){onChange({...plan,[key]:value});}
  return <div className="commerce-fields">
    <label>Nome<input required maxLength={70} value={plan.nome} onChange={e=>field('nome',e.target.value)}/></label>
    <label>Valor em reais<input type="number" min="0" max="1000000" step="0.01" placeholder="Sob proposta" value={plan.valor_centavos===null?'':plan.valor_centavos/100} onChange={e=>field('valor_centavos',e.target.value===''?null:Math.round(Number(e.target.value)*100))}/></label>
    <label>Periodicidade<select value={plan.periodicidade} onChange={e=>field('periodicidade',e.target.value as CommercialPlan['periodicidade'])}><option value="MENSAL">Mensal</option><option value="ANUAL">Anual</option><option value="UNICO">Única / gratuito</option><option value="PERSONALIZADO">Personalizada</option></select></label>
    <label>Duração em dias<input type="number" min="1" max="36500" placeholder="Sem vencimento definido" value={plan.duracao_dias??''} onChange={e=>field('duracao_dias',e.target.value===''?null:Number(e.target.value))}/></label>
    <label className="commerce-wide">Descrição<textarea maxLength={400} rows={2} value={plan.descricao} onChange={e=>field('descricao',e.target.value)}/></label>
    {!proposal&&<fieldset className="commerce-wide commerce-checks"><legend>Disponibilidade</legend>{([{key:'ativo',label:'Plano ativo'},{key:'contratavel',label:'Disponível para contratação'},{key:'destaque',label:'Destaque comercial'},{key:'personalizado',label:'Condições individuais por comunidade'}] as const).map(({key,label})=><label key={key}><input type="checkbox" checked={plan[key]} onChange={e=>field(key,e.target.checked)}/>{label}</label>)}</fieldset>}
    <fieldset className="commerce-wide commerce-checks"><legend>Módulos</legend>{COMMUNITY_MODULES.map(m=><label key={m.key}><input type="checkbox" checked={plan.modulos.includes(m.key)} onChange={e=>field('modulos',toggleCommunityModule(plan.modulos,m.key,e.target.checked))}/><span>{m.label}<small>{m.description}</small></span></label>)}</fieldset>
    <fieldset className="commerce-wide commerce-checks"><legend>Recursos</legend>{PLAN_RESOURCES.map(r=><label key={r.key}><input type="checkbox" checked={plan.recursos.includes(r.key)} onChange={e=>field('recursos',e.target.checked?[...plan.recursos,r.key]:plan.recursos.filter(k=>k!==r.key))}/>{r.label}</label>)}</fieldset>
    <p className="commerce-wide commerce-note">Limites em branco significam sem limite definido. Reduções preservam os dados existentes e impedem novos cadastros acima da cota.</p>
    {PLAN_LIMITS.map(({key,label})=><label key={key}>{label}<input type="number" min={key==='usuarios'||key==='administradores'?1:0} max="1000000" placeholder="Sem limite" value={plan.limites[key]??''} onChange={e=>field('limites',{...plan.limites,[key]:e.target.value===''?null:Number(e.target.value)})}/></label>)}
    <label className="commerce-wide">Condições específicas<textarea rows={3} maxLength={3000} value={plan.condicoes} onChange={e=>field('condicoes',e.target.value)}/></label>
  </div>;
}
