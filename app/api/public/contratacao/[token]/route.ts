import { getD1 } from '../../../../../db';
import { normalizeCpf } from '../../../../lib/cpf';
import { privateHash, rateLimit, secureToken } from '../../../../lib/access-security';
import { readContractLink, requestPlans } from '../../../../lib/contracting';
import { hashPassword, normalizeEmail, validatePassword, verifyPassword } from '../../../../lib/local-auth';

type Context={params:Promise<{token:string}>};
export async function GET(_request:Request,context:Context) {
  const row=await readContractLink((await context.params).token);
  if(!row) return Response.json({error:'Este link está inválido, expirado, revogado ou já utilizado.'},{status:404});
  return Response.json({expiresAt:row.expira_em,plans:await requestPlans(row),payments:{available:false,mode:'REVISAO_ADMINISTRATIVA'}},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request,context:Context) {
  const {token}=await context.params;
  if(!await rateLimit(request,'contract',token,5)) return Response.json({error:'Aguarde 15 minutos e tente novamente.'},{status:429});
  const row=await readContractLink(token);
  if(!row) return Response.json({error:'Link indisponível. Solicite um novo link.'},{status:409});
  const body=await request.json().catch(()=>null); const cpf=normalizeCpf(body?.cpf);
  const email=normalizeEmail(body?.email); const senha=String(body?.senha||'');
  const nome=String(body?.comunidadeNome||'').trim(); const cidade=String(body?.cidade||'').trim();
  if(!cpf||await privateHash('cpf',cpf)!==row.cpf_hash||!/^\S+@\S+\.\S+$/.test(email)||email.length>180||validatePassword(senha)||senha.length>256||nome.length<3||nome.length>120||cidade.length<2||cidade.length>120||body?.aceite!==true) return Response.json({error:'Revise os dados, informe o CPF da solicitação e aceite as condições.'},{status:400});
  const plan=(await requestPlans(row)).find(p=>p.id===body.planoId);
  if(!plan||plan.versao!==body.versao) return Response.json({error:'As condições do plano mudaram. Recarregue e revise antes de contratar.'},{status:409});
  const db=getD1();
  const existing=await db.prepare(`SELECT u.id,u.ativo,u.senha_hash,u.senha_salt,i.cpf_hash FROM usuarios u LEFT JOIN identidades_cpf i ON i.usuario_id=u.id WHERE lower(u.email)=? LIMIT 1`).bind(email)
    .first<{id:number;ativo:number;senha_hash:string;senha_salt:string;cpf_hash:string|null}>();
  if(existing && (!existing.ativo || (existing.cpf_hash && existing.cpf_hash!==row.cpf_hash) || !existing.senha_salt || !await verifyPassword(senha,existing.senha_salt,existing.senha_hash))) return Response.json({error:'Não foi possível confirmar as credenciais do responsável.'},{status:401});
  const identity=await db.prepare('SELECT usuario_id FROM identidades_cpf WHERE cpf_hash=?').bind(row.cpf_hash).first<{usuario_id:number}>();
  if(identity && identity.usuario_id!==existing?.id) return Response.json({error:'Não foi possível confirmar as credenciais do responsável.'},{status:409});
  const password=existing ? null : await hashPassword(senha);
  const claim=secureToken();
  const results=await db.batch([
    db.prepare(`UPDATE links_contratacao SET usado_em=CURRENT_TIMESTAMP,uso_chave=? WHERE id=? AND usado_em IS NULL AND revogado_em IS NULL AND datetime(expira_em)>CURRENT_TIMESTAMP
      AND EXISTS(SELECT 1 FROM solicitacoes_log1 WHERE id=? AND status='LINK_GERADO' AND datetime(retencao_ate)>CURRENT_TIMESTAMP)
      AND EXISTS(SELECT 1 FROM planos_plataforma WHERE id=? AND ativo=1 AND contratavel=1 AND (personalizado=1 OR versao=?))`).bind(claim,row.link_id,row.id,plan.id,plan.versao),
    db.prepare(`UPDATE solicitacoes_log1 SET status='CONTRATADA',plano_id=?,contrato=?,email=?,senha_hash=?,senha_salt=?,usuario_id=?,comunidade_nome=?,comunidade_cidade=?,atualizado_em=CURRENT_TIMESTAMP
      WHERE id=? AND status='LINK_GERADO' AND EXISTS(SELECT 1 FROM links_contratacao WHERE id=? AND uso_chave=?)`)
      .bind(plan.id,JSON.stringify(plan),email,password?.hash||null,password?.salt||null,existing?.id||null,nome,cidade,row.id,row.link_id,claim),
    db.prepare(`INSERT INTO auditoria_piloto(evento,resultado,metadados) SELECT 'CONTRATACAO_SOLICITADA','SUCESSO',? WHERE EXISTS(SELECT 1 FROM links_contratacao WHERE id=? AND uso_chave=?)`)
      .bind(JSON.stringify({solicitacaoId:row.id,planoId:plan.id,versao:plan.versao}),row.link_id,claim),
  ]);
  if(!results[0].meta.changes||!results[1].meta.changes) return Response.json({error:'Link indisponível. Solicite um novo link.'},{status:409});
  return Response.json({ok:true,message:'Contratação enviada para aprovação. Nenhum pagamento foi processado. Aguarde a confirmação pelo telefone informado.'},{status:202});
}
