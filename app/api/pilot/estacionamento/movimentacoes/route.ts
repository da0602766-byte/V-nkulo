import { getD1 } from "../../../../../db";
import { requireTenantPermission } from "../../../../lib/tenant";

export async function GET(request:Request) {
  const access=await requireTenantPermission("parking.view");
  if("error" in access) return access.error;
  if(!access.context.permissions.some(p=>['parking.entry','parking.exit','parking.edit'].includes(p))) return Response.json({error:'Sem permissão para consultar movimentações.'},{status:403});
  const params=new URL(request.url).searchParams;
  const query=(params.get('q')||'').trim().slice(0,120);
  const page=Math.max(1,Math.floor(Number(params.get('page'))||1));
  const status=params.get('status')||'';
  const where=`m.comunidade_id=? AND (?='' OR m.status=?) AND (?='' OR m.placa LIKE ? OR m.responsavel LIKE ? OR v.codigo LIKE ?)`;
  const binds=[access.context.comunidadeId,status,status,query,'%'+query+'%','%'+query+'%','%'+query+'%'];
  const join=`FROM estacionamento_movimentacoes m LEFT JOIN estacionamento_vagas v ON v.id=m.vaga_id AND v.comunidade_id=m.comunidade_id LEFT JOIN estacionamento_setores s ON s.id=v.setor_id AND s.comunidade_id=m.comunidade_id`;
  const db=getD1();
  const [rows,total]=await Promise.all([
    db.prepare(`SELECT m.id,m.placa,m.tipo_veiculo,m.responsavel,m.vinculo,m.entrada_em,m.saida_em,m.status,v.codigo AS vaga_codigo,s.nome AS setor_nome ${join} WHERE ${where} ORDER BY m.entrada_em DESC,m.id DESC LIMIT 40 OFFSET ?`).bind(...binds,(page-1)*40).all(),
    db.prepare(`SELECT COUNT(*) AS total ${join} WHERE ${where}`).bind(...binds).first<{total:number}>(),
  ]);
  return Response.json({movimentacoes:rows.results,total:Number(total?.total||0),page},{headers:{'Cache-Control':'no-store'}});
}
