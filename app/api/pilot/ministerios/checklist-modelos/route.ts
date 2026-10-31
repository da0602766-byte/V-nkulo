import { getD1 } from '../../../../../db';
import { requireTenantPermission } from '../../../../lib/tenant';
import { canManageMinistry } from '../../../../lib/ministry-access';

async function authorize(ministryId: number) {
  const access = await requireTenantPermission('ministries.view');
  if ('error' in access) return access.error;
  const db = getD1();
  if (!Number.isSafeInteger(ministryId) || access.context.communityAccess === 'FEED_ONLY' || !await canManageMinistry(db, access.context, access.user.id, ministryId)) return Response.json({error:'Sem permissão para os modelos deste ministério.'},{status:403});
  return {db, access};
}
export async function GET(request: Request) {
  const id=Number(new URL(request.url).searchParams.get('ministerioId'));
  const auth=await authorize(id); if(auth instanceof Response)return auth;
  const rows=await auth.db.prepare('SELECT id,nome,itens,versao FROM ministerio_checklist_modelos WHERE comunidade_id=? AND ministerio_id=? ORDER BY nome').bind(auth.access.context.comunidadeId,id).all<{id:number;nome:string;itens:string;versao:number}>();
  return Response.json({modelos:rows.results.map(row=>({...row,itens:JSON.parse(row.itens)}))});
}
export async function POST(request: Request) {
  const body=await request.json().catch(()=>null); if(!body)return Response.json({error:'Dados inválidos.'},{status:400});
  const ministryId=Number(body.ministerioId),auth=await authorize(ministryId); if(auth instanceof Response)return auth;
  const {db,access}=auth, community=access.context.comunidadeId;
  const name=String(body.nome||'').trim();
  if(!name || name.length>100 || !Array.isArray(body.itens) || !body.itens.length || body.itens.length>30)return Response.json({error:'Informe um nome e de 1 a 30 tarefas.'},{status:400});
  const members=await db.prepare('SELECT id FROM ministerio_voluntarios WHERE ministerio_id=? AND comunidade_id=? AND ativo=1').bind(ministryId,community).all<{id:number}>();
  const allowed=new Set(members.results.map(row=>String(row.id)));
  const items=body.itens.map((item:{tarefa?:unknown;voluntarioId?:unknown})=>({tarefa:String(item?.tarefa||'').trim(),voluntarioId:allowed.has(String(item?.voluntarioId))?String(item.voluntarioId):''}));
  if(items.some((item:{tarefa:string})=>!item.tarefa||item.tarefa.length>180))return Response.json({error:'Cada tarefa deve ter até 180 caracteres.'},{status:400});
  if(body.id){
    const result=await db.prepare('UPDATE ministerio_checklist_modelos SET nome=?,itens=?,versao=versao+1 WHERE id=? AND ministerio_id=? AND comunidade_id=? AND versao=?').bind(name,JSON.stringify(items),Number(body.id),ministryId,community,Number(body.versao)).run();
    if(!result.meta.changes)return Response.json({error:'Este modelo mudou. Recarregue os modelos antes de salvar.'},{status:409});
  }else{
    const count=await db.prepare('SELECT COUNT(*) AS total FROM ministerio_checklist_modelos WHERE ministerio_id=? AND comunidade_id=?').bind(ministryId,community).first<{total:number}>();
    if(Number(count?.total)>=50)return Response.json({error:'Limite de 50 modelos por ministério.'},{status:400});
    await db.prepare('INSERT INTO ministerio_checklist_modelos (comunidade_id,ministerio_id,nome,itens) VALUES(?,?,?,?)').bind(community,ministryId,name,JSON.stringify(items)).run();
  }
  return Response.json({ok:true});
}
