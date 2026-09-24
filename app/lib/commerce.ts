import { getD1 } from '../../db';
import { type CommercialPlan, PLAN_LIMITS, validatePlan } from './commerce-types';

export function readPlan(row: Record<string,unknown>): CommercialPlan {
  const limits=JSON.parse(String(row.limites||'{}'));
  return validatePlan({...row,ativo:Boolean(row.ativo),contratavel:Boolean(row.contratavel),destaque:Boolean(row.destaque),personalizado:Boolean(row.personalizado),
    modulos:JSON.parse(String(row.modulos)),recursos:JSON.parse(String(row.recursos)),
    limites:Object.fromEntries(PLAN_LIMITS.map(({key})=>[key,limits[key]??null]))});
}
export async function listCommercialPlans() {
  const rows=await getD1().prepare('SELECT * FROM planos_plataforma ORDER BY rowid').all<Record<string,unknown>>();
  return rows.results.map(readPlan);
}
export async function getSubscription(communityId:number) {
  const row=await getD1().prepare(`SELECT contrato,status,termina_em FROM assinaturas_comunidade WHERE comunidade_id=?`).bind(communityId).first<{contrato:string;status:string;termina_em:string|null}>();
  if(!row) return null; // Existing communities retain their pre-migration policy.
  const active=row.status==='ATIVA' && (!row.termina_em || Date.parse(row.termina_em)>Date.now());
  return {active,plan:validatePlan(JSON.parse(row.contrato))};
}
export function filterPlanPermissions(permissions:string[], plan:CommercialPlan|null, active=true) {
  if(!active) return permissions.filter(p=>p.startsWith('profile.self.') || p==='community.view');
  if(!plan) return permissions;
  return permissions.filter(p=> {
    if((p.startsWith('feed.')||p==='community.feed.settings')&&!plan.recursos.includes('feed')) return false;
    if(p.startsWith('requests.')&&!plan.recursos.includes('requests')) return false;
    if((p.endsWith('.report')||p.includes('stats.')||p.includes('reports.'))&&!plan.recursos.includes('reports')) return false;
    return true;
  });
}
