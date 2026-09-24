import { getD1 } from '../../db';
import { sha256 } from './local-auth';
import { listCommercialPlans } from './commerce';
import { validatePlan, type CommercialPlan } from './commerce-types';

export type ContractRequest = {
  id:number; link_id:number; nome:string; telefone:string; nascimento:string; cpf_hash:string;cpf_finais:string;
  status:string;planos_permitidos:string;proposta:string|null;expira_em:string;email:string|null;
};
export async function readContractLink(token:string) {
  if(!/^[a-f0-9]{64}$/.test(token)) return null;
  return getD1().prepare(`SELECT s.*,l.id AS link_id,l.expira_em FROM links_contratacao l JOIN solicitacoes_log1 s ON s.id=l.solicitacao_id
    WHERE l.token_hash=? AND l.finalidade='CONTRATACAO' AND l.revogado_em IS NULL AND l.usado_em IS NULL
    AND datetime(l.expira_em)>CURRENT_TIMESTAMP AND s.status='LINK_GERADO' AND datetime(s.retencao_ate)>CURRENT_TIMESTAMP LIMIT 1`)
    .bind(await sha256(token)).first<ContractRequest>();
}
export async function requestPlans(row:Pick<ContractRequest,'planos_permitidos'|'proposta'>) {
  const allowed=JSON.parse(row.planos_permitidos) as string[];
  const proposal:CommercialPlan|null=row.proposta ? validatePlan(JSON.parse(row.proposta)) : null;
  return (await listCommercialPlans()).filter(p=>p.ativo&&p.contratavel&&allowed.includes(p.id))
    .map(p=>p.personalizado ? proposal?.id===p.id ? proposal : null : p).filter((p):p is CommercialPlan=>Boolean(p)&&p!.valor_centavos!==null);
}
