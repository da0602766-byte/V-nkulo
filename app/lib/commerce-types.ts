import { COMMUNITY_MODULES, normalizeCommunityModules, type CommunityModuleKey } from './community-modules';

export const PLAN_RESOURCES = [{key:'feed',label:'Feed'}, {key:'requests',label:'Pedidos'}, {key:'reports',label:'Relatórios'}] as const;
export const PLAN_LIMITS = [{key:'usuarios',label:'Usuários'}, {key:'administradores',label:'Administradores'}, {key:'cadastros',label:'Visitantes cadastrados'}, {key:'celulas',label:'Células'}, {key:'ministerios',label:'Ministérios'}] as const;
export type PlanResource = typeof PLAN_RESOURCES[number]['key'];
export type PlanLimit = typeof PLAN_LIMITS[number]['key'];
export type CommercialPlan = {
  id:string; nome:string; descricao:string; valor_centavos:number|null;
  periodicidade:'MENSAL'|'ANUAL'|'UNICO'|'PERSONALIZADO'; duracao_dias:number|null;
  ativo:boolean; contratavel:boolean; destaque:boolean; personalizado:boolean;
  modulos:CommunityModuleKey[]; recursos:PlanResource[]; limites:Record<PlanLimit,number|null>;
  condicoes:string; versao:number;
};
export const REQUEST_STATUS: Record<string,string> = {NOVA:'Nova solicitação',EM_ANALISE:'Em análise',LINK_GERADO:'Link de contratação disponível',CONTRATADA:'Aguardando aprovação',ATIVADA:'Ativada',RECUSADA:'Recusada',EXPIRADA:'Expirada'};
export function formatPlanPrice(plan: Pick<CommercialPlan,'valor_centavos'|'periodicidade'>) {
  if (plan.valor_centavos === null) return 'Sob proposta';
  if (plan.valor_centavos === 0) return 'Gratuito';
  const price = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(plan.valor_centavos/100);
  return price + (plan.periodicidade==='MENSAL' ? ' / mês' : plan.periodicidade==='ANUAL' ? ' / ano' : '');
}
export function validatePlan(value: unknown): CommercialPlan {
  if (!value || typeof value !== 'object') throw new Error('Informe a configuração do plano.');
  const p=value as CommercialPlan;
  if (!/^[a-z0-9-]{1,64}$/.test(p.id||'') || !p.nome?.trim() || p.nome.length>70) throw new Error('Nome ou identificador de plano inválido.');
  if (p.valor_centavos !== null && (!Number.isSafeInteger(p.valor_centavos) || p.valor_centavos<0 || p.valor_centavos>100000000)) throw new Error('Valor inválido. Use centavos inteiros.');
  if (!['MENSAL','ANUAL','UNICO','PERSONALIZADO'].includes(p.periodicidade)) throw new Error('Periodicidade inválida.');
  if (p.duracao_dias!==null && (!Number.isInteger(p.duracao_dias) || p.duracao_dias<1 || p.duracao_dias>36500)) throw new Error('Duração inválida.');
  if (!Array.isArray(p.modulos) || p.modulos.some(k=>!COMMUNITY_MODULES.some(m=>m.key===k)) || !Array.isArray(p.recursos) || p.recursos.some(k=>!PLAN_RESOURCES.some(m=>m.key===k))) throw new Error('Selecione somente recursos existentes.');
  const limites={} as CommercialPlan['limites'];
  for(const {key} of PLAN_LIMITS) {
    const n=p.limites?.[key];
    if(n!==null && (!Number.isInteger(n) || Number(n)<(key==='usuarios'||key==='administradores'?1:0) || Number(n)>1000000)) throw new Error(`Limite inválido: ${key}.`);
    limites[key]=n;
  }
  if(limites.usuarios!==null && limites.administradores!==null && limites.administradores>limites.usuarios) throw new Error('O limite de administradores não pode superar o de usuários.');
  if(p.contratavel && (!p.ativo || (!p.personalizado && p.valor_centavos===null))) throw new Error('Defina o valor e ative o plano antes de disponibilizá-lo.');
  return {...p,nome:p.nome.trim(),descricao:String(p.descricao||'').slice(0,400),condicoes:String(p.condicoes||'').slice(0,3000),
    ativo:Boolean(p.ativo),contratavel:Boolean(p.contratavel),destaque:Boolean(p.destaque),personalizado:Boolean(p.personalizado),
    modulos:normalizeCommunityModules(p.modulos,[]),recursos:[...new Set(p.recursos)],limites,versao:Number(p.versao)||1};
}
