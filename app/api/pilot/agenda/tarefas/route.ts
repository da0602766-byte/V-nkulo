import { hasCalendarConflict } from '../../../../lib/calendar-conflict';
import { getD1 } from '../../../../../db';
import { requireTenantPermission } from '../../../../lib/tenant';

type Row = { id:number; criado_por:number; responsavel_id:number; titulo:string; descricao:string; inicia_em:string|null; termina_em:string|null; prazo_em:string|null; prioridade:string; status:string; visibilidade:string; motivo_bloqueio:string; versao:number; responsavel:string };
const statuses = new Set(['PLANEJADO','EM_ANDAMENTO','BLOQUEADO','CONCLUIDO']);
const priorities = new Set(['P1','P2','P3']);
const manager = (permissions:string[], owner:boolean) => permissions.includes('events.manage') || owner;
function output(row:Row, userId:number, canManage:boolean) {
  return {id:`tarefa-${row.id}`,camada:'TAREFA',origemId:row.id,titulo:row.titulo,descricao:row.descricao,iniciaEm:row.inicia_em,terminaEm:row.termina_em,prazoEm:row.prazo_em,prioridade:row.prioridade,status:row.status,visibilidade:row.visibilidade,responsavelId:row.responsavel_id,responsavel:row.responsavel,versao:row.versao,motivoBloqueio:row.motivo_bloqueio,local:'',diaInteiro:false,meu:row.criado_por===userId,podeEditar:row.criado_por===userId || row.responsavel_id===userId || (canManage && row.visibilidade==='COMUNIDADE')};
}
export async function GET(request:Request) {
  const access = await requireTenantPermission('dashboard.view');
  if ('error' in access) return access.error;
  const {comunidadeId,userId,permissions}=access.context;
  const canManage=manager(permissions,access.user.system_owner===true);
  const url=new URL(request.url), de=url.searchParams.get('de') || '', ate=url.searchParams.get('ate') || '';
  if (!Number.isFinite(Date.parse(de)) || !Number.isFinite(Date.parse(ate)) || Date.parse(ate)<Date.parse(de) || Date.parse(ate)-Date.parse(de)>62*86400000) return Response.json({error:'Período inválido.'},{status:400});
  const db=getD1();
  const [rows, owners] = await Promise.all([
    db.prepare(`SELECT t.*, u.nome AS responsavel FROM agenda_tarefas t JOIN usuarios u ON u.id=t.responsavel_id
      WHERE t.comunidade_id=? AND (t.visibilidade='COMUNIDADE' OR t.criado_por=? OR t.responsavel_id=?)
      AND (t.inicia_em IS NULL OR datetime(t.inicia_em) BETWEEN datetime(?) AND datetime(?) OR (datetime(t.inicia_em)<datetime(?) AND datetime(t.termina_em)>datetime(?)))
      ORDER BY t.inicia_em, t.id LIMIT 401`).bind(comunidadeId,userId,userId,de,ate,de,de).all<Row>(),
    canManage
      ? db.prepare(`SELECT u.id,u.nome FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id=u.id WHERE uc.comunidade_id=? AND uc.status='ATIVO' AND u.ativo=1 ORDER BY u.nome LIMIT 1000`).bind(comunidadeId).all<{id:number;nome:string}>()
      : Promise.resolve({results:[{id:userId,nome:access.user.nome}]}),
  ]);
  return Response.json({itens:rows.results.slice(0,400).map(row=>output(row,userId,canManage)),responsaveis:owners.results,usuarioId:userId,limitado:rows.results.length>400});
}
async function write(request:Request, editing:boolean) {
  const access=await requireTenantPermission('dashboard.view');
  if ('error' in access) return access.error;
  const {comunidadeId,userId,permissions}=access.context, db=getD1();
  const canManage=manager(permissions,access.user.system_owner===true);
  let body:Record<string,unknown>;
  try { body=await request.json(); } catch { return Response.json({error:'Envio inválido.'},{status:400}); }
  if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'Envio inválido.'},{status:400});
  const id=Number(body.id), version=Number(body.versao);
  let previous:Row|null=null;
  if(editing){
    if(!Number.isInteger(id)||id<=0||!Number.isInteger(version)||version<1)return Response.json({error:'Informe o registro e sua versão.'},{status:400});
    previous=await db.prepare(`SELECT t.*,u.nome AS responsavel FROM agenda_tarefas t JOIN usuarios u ON u.id=t.responsavel_id WHERE t.id=? AND t.comunidade_id=? AND (t.visibilidade='COMUNIDADE' OR t.criado_por=? OR t.responsavel_id=?)`).bind(id,comunidadeId,userId,userId).first<Row>();
    if(!previous)return Response.json({error:'Tarefa não encontrada.'},{status:404});
    if(!output(previous,userId,canManage).podeEditar)return Response.json({error:'Você não pode alterar esta tarefa.'},{status:403});
    if(previous.versao!==version)return Response.json({error:'Esta tarefa foi alterada em outra sessão. Atualize antes de salvar.'},{status:409});
  }
  const title=String(body.titulo||'').trim(), description=String(body.descricao||'').trim(), reason=String(body.motivoBloqueio||'').trim();
  const start=body.iniciaEm ? String(body.iniciaEm):null,end=body.terminaEm?String(body.terminaEm):null,due=body.prazoEm?String(body.prazoEm):null;
  const owner=Number(body.responsavelId || userId), priority=String(body.prioridade||'P2'),status=String(body.status||'PLANEJADO'), visibility=body.visibilidade==='COMUNIDADE'?'COMUNIDADE':'PRIVADO';
  if(!title||title.length>140||description.length>2000||reason.length>500||!priorities.has(priority)||!statuses.has(status)||!Number.isInteger(owner)||owner<1) return Response.json({error:'Revise título, responsável, prioridade e status.'},{status:400});
  if([start,end,due].some(value=>value!==null&&!Number.isFinite(Date.parse(value))) || (end && (!start || Date.parse(end)<=Date.parse(start))))return Response.json({error:'Revise as datas. O término deve ser depois do início.'},{status:400});
  if(status==='BLOQUEADO'&&!reason)return Response.json({error:'Informe o motivo do bloqueio.'},{status:400});
  if(!canManage && (owner!==userId || visibility==='COMUNIDADE') && (!previous || owner!==previous.responsavel_id || visibility!==previous.visibilidade))return Response.json({error:'Somente a gestão pode atribuir tarefas ou compartilhar na comunidade.'},{status:403});
  if(visibility==='PRIVADO' && owner!==(previous?.criado_por || userId))return Response.json({error:'Tarefas privadas devem ficar com seu criador. Use Comunidade para atribuir a outra pessoa.'},{status:400});
  const member=await db.prepare(`SELECT 1 AS ok FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id WHERE uc.comunidade_id=? AND uc.usuario_id=? AND uc.status='ATIVO' AND u.ativo=1`).bind(comunidadeId,owner).first();
  if(!member)return Response.json({error:'Responsável indisponível nesta comunidade.'},{status:400});
  if(start&&!['CONCLUIDO'].includes(status)&&body.aceitarConflito!==true){
    const overlap=await hasCalendarConflict(db,comunidadeId,owner,start,end,'TAREFA',editing?id:0);
    if(overlap)return Response.json({error:'O responsável já tem um compromisso nesse horário. Confirme a sobreposição para continuar.',conflito:true},{status:409});
  }
  const values=[owner,title,description,start?new Date(start).toISOString():null,end?new Date(end).toISOString():null,due?new Date(due).toISOString():null,priority,status,visibility,reason,status==='CONCLUIDO'?(previous?.status==='CONCLUIDO'?undefined:new Date().toISOString()):null];
  // A conclusão mantém sua data original quando o registro já estava concluído.
  const completed=previous?.status==='CONCLUIDO'&&status==='CONCLUIDO';
  let result;
  if(editing)result=await db.prepare(`UPDATE agenda_tarefas SET responsavel_id=?,titulo=?,descricao=?,inicia_em=?,termina_em=?,prazo_em=?,prioridade=?,status=?,visibilidade=?,motivo_bloqueio=?,concluido_em=CASE WHEN ?=1 THEN concluido_em ELSE ? END,versao=versao+1,atualizado_em=CURRENT_TIMESTAMP WHERE id=? AND comunidade_id=? AND versao=? RETURNING id,versao`).bind(...values.slice(0,10),completed?1:0,values[10]??null,id,comunidadeId,version).first<{id:number;versao:number}>();
  else result=await db.prepare(`INSERT INTO agenda_tarefas(comunidade_id,criado_por,responsavel_id,titulo,descricao,inicia_em,termina_em,prazo_em,prioridade,status,visibilidade,motivo_bloqueio,concluido_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id,versao`).bind(comunidadeId,userId,...values.map(value=>value??null)).first<{id:number;versao:number}>();
  if(!result)return Response.json({error:'O registro mudou. Atualize antes de salvar.'},{status:409});
  return Response.json({...result,message:'Tarefa salva.'},{status:editing?200:201});
}
export const POST=(request:Request)=>write(request,false);
export const PATCH=(request:Request)=>write(request,true);
