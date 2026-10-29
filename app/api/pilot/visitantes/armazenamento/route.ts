import { changeVisitorSharing } from '../../../../lib/visitor-sharing-history';
import { requireTenantPermission } from '../../../../lib/tenant';
import { createGoogleAuthorization, getGoogleConnection, googleIntegrationAvailable } from '../../../../lib/google-integration';
import { archiveCounts, validateVisitorArchive, MAX_VISITOR_ARCHIVE_BYTES } from '../../../../lib/visitor-drive-format';
import { assertSameSource, captureVisitorArchive, verifyArchiveSchema } from '../../../../lib/visitor-drive-migration';
import { driveAccess, newVisitorFolder, ownerToken, platformDB, readArchive, visitorDriveConfig, VisitorDriveError, writeArchive } from '../../../../lib/visitor-drive-store';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function access() {
  const a=await requireTenantPermission('dashboard.view');if('error' in a)return a;
  const manager=!a.context.temporaryAccess&&(a.context.isCommunityOwner||a.context.isOwner||['PASTOR','ADMIN_COMUNIDADE','SUPERADMIN'].includes(a.context.papel));
  return {...a,manager};
}
export async function GET() {
  const a=await access();if('error' in a)return a.error;
  const c=await visitorDriveConfig(a.context.comunidadeId),db=platformDB(),canManage=a.manager&&(!c||c.usuario_id===a.user.id);
  const role=c?await driveAccess(c,a.user.id):null;
  const connection=canManage?await getGoogleConnection(a.user.id):null;
  const grants=canManage?(await db.prepare(`SELECT g.usuario_id,g.papel,u.nome FROM visitante_drive_acessos g JOIN usuarios u ON u.id=g.usuario_id WHERE g.comunidade_id=? ORDER BY u.nome`).bind(a.context.comunidadeId).all()).results:[];
  const members=canManage?(await db.prepare(`SELECT u.id,u.nome FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id WHERE uc.comunidade_id=? AND uc.status='ATIVO' AND u.ativo=1 AND u.id<>? ORDER BY u.nome LIMIT 501`).bind(a.context.comunidadeId,a.user.id).all()).results:[];
  return reply({state:c?.estado||'LEGACY',revision:c?.revisao??0,canManage,role,grants,members,
    googleAvailable:googleIntegrationAvailable(),googleConnected:!!(connection?.drive_enabled&&!connection.revoked_at&&connection.refresh_token_ciphertext),googleEmail:connection?.google_email,
    verifiedAt:c?.verificado_em,folderUrl:canManage&&c?.pasta_id?`https://drive.google.com/drive/folders/${c.pasta_id}`:null});
}
export async function POST(request:Request) {
  const a=await access();if('error' in a)return a.error;
  if(!a.manager)return reply({error:'Somente um gestor permanente pode configurar o armazenamento.'},403);
  const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')return reply({error:'Solicitação inválida.'},400);
  const db=platformDB(),community=a.context.comunidadeId;
  let c=await visitorDriveConfig(community);
  if(c&&c.usuario_id!==a.user.id)return reply({error:'A configuração pertence ao gestor responsável pela conta Drive.'},403);
  try {
    if(body.action==='authorize') {
      const result=await createGoogleAuthorization(new URL(request.url).origin,{purpose:'drive',visitorStorage:true,userId:a.user.id,returnTo:'/painel/visitantes?section=armazenamento'});
      return Response.json({url:result.url},{headers:{'Set-Cookie':`__Host-vinkulo_google_state=${result.nonce}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,'Cache-Control':'no-store'}});
    }
    if(body.action==='prepare') {
      if(c&&c.estado!=='LOCKED')throw new VisitorDriveError('Uma migração já foi preparada. Revise o destino antes de continuar.');
      const legacy=await db.prepare('SELECT lock_ate FROM visitante_planilha WHERE comunidade_id=?').bind(community).first<{lock_ate:number}>();
      if(legacy&&legacy.lock_ate>Date.now())throw new VisitorDriveError('A planilha anterior está sendo sincronizada. Aguarde e tente novamente.');
      if(!c){await db.batch([db.prepare("INSERT INTO visitante_drive(comunidade_id,usuario_id,estado) VALUES(?,?,'LOCKED')").bind(community,a.user.id),db.prepare('UPDATE visitante_planilha SET habilitada=0 WHERE comunidade_id=?').bind(community)]);c=(await visitorDriveConfig(community))!;}
      const token=await ownerToken(c);
      if(!c.pasta_id){const folder=await newVisitorFolder(token);const r=await db.prepare("UPDATE visitante_drive SET pasta_id=?,revisao=revisao+1 WHERE comunidade_id=? AND revisao=? AND estado='LOCKED'").bind(folder,community,c.revisao).run();if(!r.meta.changes)throw new VisitorDriveError('Outra preparação está em andamento. Atualize.');c=(await visitorDriveConfig(community))!;}
      const archive=await captureVisitorArchive(community);await verifyArchiveSchema(archive);
      const saved=await writeArchive(c,token,archive);
      const updated=await db.prepare("UPDATE visitante_drive SET estado='REVIEW',arquivo_id=?,hash=?,revisao=revisao+1,verificado_em=CURRENT_TIMESTAMP WHERE comunidade_id=? AND revisao=? AND estado='LOCKED'").bind(saved.arquivo_id,saved.hash,community,c.revisao).run();
      if(!updated.meta.changes)throw new VisitorDriveError('Outra preparação terminou antes. Atualize a página.');
      return reply({ok:true,counts:archiveCounts(archive),message:'Arquivo relido e verificado no Drive. A origem ainda não foi excluída.'});
    }
    if(!c)throw new VisitorDriveError('Prepare o Drive antes de continuar.');
    if(body.action==='cancel') {
      if(!['LOCKED','REVIEW'].includes(c.estado))throw new VisitorDriveError('A migração ativa não pode ser revertida para o banco da plataforma.');
      const r=await db.prepare("DELETE FROM visitante_drive WHERE comunidade_id=? AND revisao=? AND estado IN ('LOCKED','REVIEW')").bind(community,c.revisao).run();
      if(!r.meta.changes)throw new VisitorDriveError('O estado mudou. Atualize a página.');
      return reply({ok:true,message:'Preparação cancelada; a origem foi preservada. O arquivo já enviado permanece no seu Drive.'});
    }
    if(body.action==='verify') {
      const archive=await readArchive(c,await ownerToken(c));await verifyArchiveSchema(archive);
      if(c.estado==='REVIEW')await assertSameSource(archive);
      return reply({ok:true,counts:archiveCounts(archive),revision:c.revisao});
    }
    if(body.action==='activate') {
      if(c.estado!=='REVIEW'||body.revision!==c.revisao||body.confirmation!=='MIGRAR VISITANTES')throw new VisitorDriveError('Verifique o arquivo e confirme MIGRAR VISITANTES para excluir a origem.');
      const archive=await readArchive(c,await ownerToken(c));await verifyArchiveSchema(archive);await assertSameSource(archive);
      // Batch is transactional: triggers block inserts/updates throughout the switch.
      // All deletes depend on the successful revision-checked transition.
      const guard="EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=? AND estado='PURGING' AND revisao=?)";
      const statements=[db.prepare("UPDATE visitante_drive SET estado='PURGING' WHERE comunidade_id=? AND revisao=? AND estado='REVIEW'").bind(community,c.revisao)];
      for(const table of ['acompanhamentos','visitor_contacts','visitor_visits','visitantes','visitante_categorias','visitante_campos'])statements.push(db.prepare(`DELETE FROM ${table} WHERE comunidade_id=? AND ${guard}`).bind(community,community,c.revisao));
      statements.push(db.prepare(`DELETE FROM layouts_interface WHERE comunidade_id=? AND escopo LIKE 'care-notes:user:%' AND ${guard}`).bind(community,community,c.revisao));
      statements.push(db.prepare(`DELETE FROM visitante_planilha WHERE comunidade_id=? AND ${guard}`).bind(community,community,c.revisao));
      statements.push(db.prepare("UPDATE visitante_drive SET estado='ACTIVE',revisao=revisao+1 WHERE comunidade_id=? AND revisao=? AND estado='PURGING'").bind(community,c.revisao));
      const result=await db.batch(statements);if(!result[0].meta.changes)throw new VisitorDriveError('A configuração mudou. Verifique novamente.');
      return reply({ok:true,message:'Drive ativado. Os registros foram removidos das tabelas operacionais da plataforma.'});
    }
    if(body.action==='grant'||body.action==='revoke') {
      if(c.estado!=='ACTIVE')throw new VisitorDriveError('Ative o Drive antes de compartilhar.');
      const id=Number(body.userId);if(!Number.isSafeInteger(id)||id<=0||id===c.usuario_id)throw new VisitorDriveError('Escolha outra pessoa da comunidade.');
      const member=await db.prepare('SELECT u.id FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id WHERE uc.comunidade_id=? AND uc.usuario_id=? AND uc.status=\'ATIVO\' AND u.ativo=1').bind(community,id).first();
      if(!member&&body.action==='grant')throw new VisitorDriveError('A pessoa não possui vínculo ativo nesta comunidade.');
      if(body.action==='grant'&&!['READ','EDIT'].includes(body.role))throw new VisitorDriveError('Permissão inválida.');
      return reply(await changeVisitorSharing({community,communityName:a.context.comunidadeNome,actorId:a.user.id,userId:id,action:body.action,role:body.role,drive:c}));
    }
    if(body.action==='restore') {
      if(c.estado!=='ACTIVE'||body.revision!==c.revisao||body.confirmation!=='RESTAURAR BACKUP')throw new VisitorDriveError('Confirme RESTAURAR BACKUP para substituir o arquivo atual.');
      if(new TextEncoder().encode(JSON.stringify(body.archive)).length>MAX_VISITOR_ARCHIVE_BYTES)throw new VisitorDriveError('Backup acima do limite de 4 MB.');
      validateVisitorArchive(body.archive,community);await verifyArchiveSchema(body.archive);
      const token=await ownerToken(c),destination=body.newFolder===true?{...c,pasta_id:await newVisitorFolder(token)}:c;
      const saved=await writeArchive(destination,token,body.archive);
      const r=await db.prepare("UPDATE visitante_drive SET pasta_id=?,arquivo_id=?,hash=?,revisao=revisao+1,verificado_em=CURRENT_TIMESTAMP WHERE comunidade_id=? AND revisao=? AND estado='ACTIVE'").bind(saved.pasta_id,saved.arquivo_id,saved.hash,community,c.revisao).run();
      if(!r.meta.changes)throw new VisitorDriveError('Outra pessoa alterou os dados. Revise antes de restaurar.');
      return reply({ok:true,message:'Backup restaurado e relido no Drive. A versão anterior permanece na pasta para recuperação.'});
    }
    throw new VisitorDriveError('Ação inválida.',400);
  } catch(error) {return reply({error:error instanceof VisitorDriveError?error.message:'Não foi possível concluir com segurança. A origem foi preservada; confira a conexão com o Drive e tente novamente.'},error instanceof VisitorDriveError?error.status:503);}
}
