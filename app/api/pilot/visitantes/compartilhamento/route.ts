import { requireTenantPermission } from '../../../../lib/tenant';
import { canManageVisitorSharing, visitorShareRole } from '../../../../lib/visitor-sharing';
import { platformDB, visitorDriveConfig, VisitorDriveError } from '../../../../lib/visitor-drive-store';
import { changeVisitorSharing, purgeVisitorSharingHistory } from '../../../../lib/visitor-sharing-history';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function access(){
  const a=await requireTenantPermission('dashboard.view');if('error' in a)return a;
  const drive=await visitorDriveConfig(a.context.comunidadeId);
  return {...a,drive,canManage:canManageVisitorSharing(a.context)&&(!drive||drive.usuario_id===a.user.id)};
}
export async function GET(request:Request){
  const a=await access();if('error' in a)return a.error;
  const db=platformDB(),community=a.context.comunidadeId,url=new URL(request.url);
  await purgeVisitorSharingHistory(db);
  const cursor=Number(url.searchParams.get('before')||0);
  if(!Number.isSafeInteger(cursor)||cursor<0)return reply({error:'Página de histórico inválida.'},400);
  const history=await db.prepare(`SELECT h.id,h.acao,h.papel_anterior,h.papel,h.criado_em,
    COALESCE(autor.nome,'Conta removida') AS autor,COALESCE(membro.nome,'Conta removida') AS membro
    FROM visitante_acesso_historico h LEFT JOIN usuarios autor ON autor.id=h.autor_id LEFT JOIN usuarios membro ON membro.id=h.membro_id
    WHERE h.comunidade_id=? AND h.criado_em>datetime('now','-30 days') AND (?=1 OR h.membro_id=?) AND (?=0 OR h.id<?)
    ORDER BY h.id DESC LIMIT 21`).bind(community,a.canManage?1:0,a.user.id,cursor,cursor).all<{id:number}>();
  const rows=history.results.slice(0,20),nextCursor=history.results.length>20?rows.at(-1)?.id:null;
  if(url.searchParams.get('history')==='1')return reply({history:rows,nextCursor});
  const myRole=await visitorShareRole(community,a.user.id);
  const common={history:rows,nextCursor,myRole,communityName:a.context.comunidadeNome,canViewList:a.context.permissions.includes('visitors.view')};
  if(!a.canManage)return reply({...common,canManage:false,members:[],grants:[],reason:a.drive?'O responsável pelo Drive gerencia os acessos.':'Um administrador ou pastor gerencia os acessos.'});
  const query=(url.searchParams.get('busca')||'').trim().slice(0,80);
  const [members,grants]=await Promise.all([
    db.prepare(`SELECT u.id,u.nome FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id
      WHERE uc.comunidade_id=? AND uc.status='ATIVO' AND u.ativo=1 AND u.id<>?
      AND (?='' OR instr(lower(u.nome),lower(?))>0) ORDER BY u.nome,u.id LIMIT 51`).bind(community,a.user.id,query,query).all(),
    db.prepare(`SELECT g.usuario_id,g.papel,u.nome,uc.status,u.ativo FROM (
      SELECT usuario_id,papel FROM visitante_acessos WHERE comunidade_id=?
      UNION ALL SELECT d.usuario_id,d.papel FROM visitante_drive_acessos d WHERE d.comunidade_id=?
        AND NOT EXISTS(SELECT 1 FROM visitante_acessos a WHERE a.comunidade_id=d.comunidade_id AND a.usuario_id=d.usuario_id)
      ) g JOIN usuarios u ON u.id=g.usuario_id LEFT JOIN usuario_comunidades uc ON uc.usuario_id=g.usuario_id AND uc.comunidade_id=?
      ORDER BY u.nome`).bind(community,community,community).all(),
  ]);
  return reply({...common,canManage:true,members:members.results.slice(0,50),hasMore:members.results.length>50,grants:grants.results,locked:!!a.drive&&a.drive.estado!=='ACTIVE'});
}
export async function POST(request:Request){
  const a=await access();if('error' in a)return a.error;
  if(!a.canManage)return reply({error:'Somente o gestor autorizado pode compartilhar a lista.'},403);
  if(a.drive&&a.drive.estado!=='ACTIVE')return reply({error:'A migração para o Drive está pendente. Abra Armazenamento e acessos para continuar.',code:'MIGRATION_PENDING'},409);
  const body=await request.json().catch(()=>null);
  if(!body||!['grant','revoke'].includes(body.action)||!Number.isSafeInteger(body.userId)||body.userId<=0||body.userId===a.user.id)
    return reply({error:'Escolha outro membro e uma ação válida.'},400);
  if(body.action==='grant'&&!['READ','EDIT'].includes(body.role))return reply({error:'Acesso inválido.'},400);
  try{return reply(await changeVisitorSharing({community:a.context.comunidadeId,communityName:a.context.comunidadeNome,actorId:a.user.id,userId:body.userId,action:body.action,role:body.role,drive:a.drive}));}
  catch(error){if(error instanceof VisitorDriveError)return reply({error:error.message},error.status);return reply({error:'Não foi possível salvar o acesso. Atualize a lista e confira antes de tentar novamente.'},503);}
}
