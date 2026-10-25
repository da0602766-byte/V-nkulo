import { requireTenantPermission } from '../../../../lib/tenant';
import { canManageVisitorSharing } from '../../../../lib/visitor-sharing';
import { platformDB, visitorDriveConfig } from '../../../../lib/visitor-drive-store';
import { recordTenantAudit } from '../../../../lib/tenant-audit';

const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'private, no-store'}});
async function access() {
  const a = await requireTenantPermission('dashboard.view');
  if ('error' in a) return a;
  const drive = await visitorDriveConfig(a.context.comunidadeId);
  const canManage = canManageVisitorSharing(a.context) && (!drive || drive.usuario_id === a.user.id);
  return {...a, drive, canManage};
}

export async function GET(request: Request) {
  const a = await access();
  if ('error' in a) return a.error;
  if (!a.canManage) return reply({canManage: false, members: [], grants: [], reason: a.drive
    ? 'O gestor responsável pelo Drive pode compartilhar esta lista.'
    : 'Peça a um administrador ou pastor da comunidade para compartilhar esta lista.'});
  const db = platformDB(), community = a.context.comunidadeId;
  const query = (new URL(request.url).searchParams.get('busca') || '').trim().slice(0, 80);
  const members = await db.prepare(`SELECT u.id,u.nome FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id
    WHERE uc.comunidade_id=? AND uc.status='ATIVO' AND u.ativo=1 AND u.id<>?
    AND (?='' OR instr(lower(u.nome),lower(?))>0) ORDER BY u.nome,u.id LIMIT 51`)
    .bind(community,a.user.id,query,query).all();
  const grants = await db.prepare(`SELECT g.usuario_id,g.papel,u.nome,uc.status,u.ativo FROM (
    SELECT usuario_id,papel FROM visitante_acessos WHERE comunidade_id=?
    UNION ALL SELECT d.usuario_id,d.papel FROM visitante_drive_acessos d WHERE d.comunidade_id=?
      AND NOT EXISTS (SELECT 1 FROM visitante_acessos a WHERE a.comunidade_id=d.comunidade_id AND a.usuario_id=d.usuario_id)
    ) g JOIN usuarios u ON u.id=g.usuario_id
    LEFT JOIN usuario_comunidades uc ON uc.usuario_id=g.usuario_id AND uc.comunidade_id=? ORDER BY u.nome`)
    .bind(community,community,community).all();
  return reply({canManage: true, members: members.results.slice(0,50), hasMore: members.results.length>50,
    grants: grants.results, locked: !!a.drive && a.drive.estado!=='ACTIVE'});
}

export async function POST(request: Request) {
  const a = await access();
  if ('error' in a) return a.error;
  if (!a.canManage) return reply({error:'Somente o gestor autorizado pode compartilhar a lista.'},403);
  if (a.drive && a.drive.estado!=='ACTIVE') return reply({error:'Conclua ou cancele a migração antes de alterar os acessos.'},409);
  const body = await request.json().catch(()=>null);
  if (!body || !['grant','revoke'].includes(body.action) || !Number.isSafeInteger(body.userId) || body.userId<=0 || body.userId===a.user.id)
    return reply({error:'Escolha outro membro e uma ação válida.'},400);
  if (body.action==='grant' && !['READ','EDIT'].includes(body.role)) return reply({error:'Acesso inválido.'},400);
  const db=platformDB(), community=a.context.comunidadeId;
  const member=await db.prepare(`SELECT u.id FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id
    WHERE uc.comunidade_id=? AND uc.usuario_id=? AND uc.status='ATIVO' AND u.ativo=1`).bind(community,body.userId).first();
  if (body.action==='grant' && !member) return reply({error:'Escolha um membro ativo desta comunidade.'},400);
  const statements=[body.action==='grant'
    ? db.prepare(`INSERT INTO visitante_acessos(comunidade_id,usuario_id,papel) VALUES(?,?,?)
        ON CONFLICT(comunidade_id,usuario_id) DO UPDATE SET papel=excluded.papel`).bind(community,body.userId,body.role)
    : db.prepare('DELETE FROM visitante_acessos WHERE comunidade_id=? AND usuario_id=?').bind(community,body.userId)];
  if (a.drive) {
    statements.push(body.action==='grant'
      ? db.prepare(`INSERT INTO visitante_drive_acessos(comunidade_id,usuario_id,papel) VALUES(?,?,?)
          ON CONFLICT(comunidade_id,usuario_id) DO UPDATE SET papel=excluded.papel`).bind(community,body.userId,body.role)
      : db.prepare('DELETE FROM visitante_drive_acessos WHERE comunidade_id=? AND usuario_id=?').bind(community,body.userId));
    statements.push(db.prepare('UPDATE visitante_drive SET revisao=revisao+1 WHERE comunidade_id=?').bind(community));
  }
  await db.batch(statements);
  await recordTenantAudit(db,a.context,a.user.id,'VISITOR_SHARING','SUCESSO',{action:body.action,userId:body.userId,role:body.action==='grant'?body.role:null});
  return reply({ok:true});
}
