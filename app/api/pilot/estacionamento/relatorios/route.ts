import { getD1 } from "../../../../../db";
import { notifyUser } from "../../../../lib/pilot-notifications";
import { requireTenantPermission } from "../../../../lib/tenant";

export async function GET() {
  const access = await requireTenantPermission("parking.view");
  if ("error" in access) return access.error;
  const db = getD1();
  await db.prepare(`INSERT OR IGNORE INTO estacionamento_relatorios_escala (comunidade_id,escala_id,usuario_id)
    SELECT e.comunidade_id,e.id,d.usuario_id FROM escalas_ministerio e
    JOIN ministerios_comunidade m ON m.id=e.ministerio_id AND m.comunidade_id=e.comunidade_id
    JOIN escala_designacoes d ON d.escala_id=e.id AND d.comunidade_id=e.comunidade_id AND d.ativo=1
    WHERE e.comunidade_id=? AND m.categoria='ESTACIONAMENTO' AND datetime(e.termina_em)<=datetime('now')`).bind(access.context.comunidadeId).run();
  const canReview = access.context.permissions.includes("parking.configure") || access.context.permissions.includes("parking.helpers.manage");
  const rows = await db.prepare(`SELECT r.*,e.titulo,e.inicia_em,e.termina_em,u.nome AS membro_nome FROM estacionamento_relatorios_escala r JOIN escalas_ministerio e ON e.id=r.escala_id JOIN usuarios u ON u.id=r.usuario_id WHERE r.comunidade_id=? AND (?=1 OR r.usuario_id=?) ORDER BY r.atualizado_em DESC LIMIT 60`).bind(access.context.comunidadeId,canReview?1:0,access.user.id).all();
  return Response.json({ relatorios: rows.results, canReview });
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("parking.view");
  if ("error" in access) return access.error;
  const payload=await request.json() as Record<string,unknown>; const id=Number(payload.id); const action=String(payload.acao||"").toUpperCase(); const db=getD1();
  const row=await db.prepare(`SELECT r.*,m.responsavel_usuario_id FROM estacionamento_relatorios_escala r JOIN escalas_ministerio e ON e.id=r.escala_id JOIN ministerios_comunidade m ON m.id=e.ministerio_id WHERE r.id=? AND r.comunidade_id=?`).bind(id,access.context.comunidadeId).first<Record<string,unknown>>();
  if(!row) return Response.json({error:"Relatório não encontrado."},{status:404});
  const canReview=access.context.permissions.includes("parking.configure")||Number(row.responsavel_usuario_id)===access.user.id;
  if(action==="ENVIAR"&&Number(row.usuario_id)===access.user.id){ await db.prepare(`UPDATE estacionamento_relatorios_escala SET resumo=?,entradas=?,saidas=?,ocorrencias=?,status='AGUARDANDO_LIDER',atualizado_em=CURRENT_TIMESTAMP WHERE id=?`).bind(String(payload.resumo||"").slice(0,1200),Math.max(0,Number(payload.entradas)||0),Math.max(0,Number(payload.saidas)||0),Math.max(0,Number(payload.ocorrencias)||0),id).run(); }
  else if((action==="CONFIRMAR"||action==="CORRIGIR")&&canReview){ const status=action==="CONFIRMAR"?"ENVIADO_PASTOR":"AGUARDANDO_MEMBRO"; await db.prepare(`UPDATE estacionamento_relatorios_escala SET resumo=COALESCE(?,resumo),status=?,revisado_por=?,enviado_pastor_em=CASE WHEN ?='ENVIADO_PASTOR' THEN CURRENT_TIMESTAMP ELSE enviado_pastor_em END,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`).bind(payload.resumo?String(payload.resumo).slice(0,1200):null,status,access.user.id,status,id).run(); }
  else return Response.json({error:"Você não pode executar esta etapa."},{status:403});
  if(action==="CONFIRMAR"){ const pastors=await db.prepare(`SELECT u.id FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id WHERE uc.comunidade_id=? AND uc.status='ATIVO' AND uc.papel IN ('PASTOR','ADMIN_COMUNIDADE')`).bind(access.context.comunidadeId).all<{id:number}>(); await Promise.all(pastors.results.map(p=>notifyUser(db,{userId:Number(p.id),title:"Relatório de estacionamento revisado",message:`O relatório da escala ${row.escala_id} foi confirmado pela liderança.`,entityId:id,destination:"/painel?view=estacionamento",createdBy:access.user.email}))); }
  return Response.json({ok:true});
}
