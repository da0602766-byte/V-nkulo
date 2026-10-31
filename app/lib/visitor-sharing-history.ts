import { platformDB, type VisitorDriveConfig, VisitorDriveError } from './visitor-drive-store';
import { scheduleWebPushDelivery } from './push-delivery-queue';
import type { VisitorShareRole } from './visitor-sharing';
export function sharingCleanupStatements(db: D1Database) {
  return [
    db.prepare("DELETE FROM visitante_acesso_historico WHERE criado_em <= datetime('now','-30 days')"),
    db.prepare("DELETE FROM notificacoes_sistema WHERE area='VISITANTES' AND criado_por='visitor-sharing' AND criado_em <= datetime('now','-30 days')"),
  ];
}
export async function purgeVisitorSharingHistory(db: D1Database) {
  await db.batch(sharingCleanupStatements(db));
}

type Change = {community: number; communityName: string; actorId: number; userId: number; action: 'grant'|'revoke'; role?: VisitorShareRole; drive: VisitorDriveConfig|null};
export async function changeVisitorSharing(input: Change) {
  const db=platformDB(), {community,actorId,userId,action,drive}=input;
  const member=await db.prepare(`SELECT u.nome,u.ativo,uc.status FROM usuarios u
    LEFT JOIN usuario_comunidades uc ON uc.usuario_id=u.id AND uc.comunidade_id=? WHERE u.id=?`)
    .bind(community,userId).first<{nome:string;ativo:number;status:string|null}>();
  if(action==='grant'&&(!member?.ativo||member.status!=='ATIVO'))throw new VisitorDriveError('Escolha um membro ativo desta comunidade.',400);
  const current=await db.prepare(`SELECT (SELECT papel FROM visitante_acessos WHERE comunidade_id=? AND usuario_id=?) AS papel,
    (SELECT papel FROM visitante_drive_acessos WHERE comunidade_id=? AND usuario_id=?) AS drive_papel`)
    .bind(community,userId,community,userId).first<{papel:VisitorShareRole|null;drive_papel:VisitorShareRole|null}>();
  const previous=current?.papel||current?.drive_papel||null, next=action==='grant'?input.role!:null;
  if(previous===next&&(!next||(current?.papel===next&&(!drive||current.drive_papel===next))))return {ok:true,changed:false,memberName:member?.nome||'Membro',role:next,message:next?'Este membro já possui esse acesso.':'Este compartilhamento já foi removido.'};
  const event=next?(previous?'ALTERADO':'CONCEDIDO'):'REMOVIDO',operation=crypto.randomUUID();
  const roleLabel=next==='EDIT'?'consultar e editar':'consultar';
  const title=event==='CONCEDIDO'?'Lista de Visitantes compartilhada':event==='ALTERADO'?'Seu acesso a Visitantes mudou':'Compartilhamento de Visitantes removido';
  const message=next?`Você pode ${roleLabel} a lista de ${input.communityName}. Toque para abrir os contatos.`:`Seu compartilhamento em ${input.communityName} foi removido. Permissões do cargo continuam válidas.`;
  const destination=next?`/painel/visitantes?section=compartilhar&comunidade=${community}`:'/painel?view=inicio';
  // The compare-and-write runs inside the same batch as access, history and notice.
  // A concurrent change cannot generate a success notice for a discarded operation.
  const statements=[...sharingCleanupStatements(db),db.prepare(`INSERT INTO visitante_acesso_historico
    (operacao,comunidade_id,autor_id,membro_id,acao,papel_anterior,papel)
    SELECT ?,?,?,?,?,?,? WHERE COALESCE((SELECT papel FROM visitante_acessos WHERE comunidade_id=? AND usuario_id=?),'')=?
      AND COALESCE((SELECT papel FROM visitante_drive_acessos WHERE comunidade_id=? AND usuario_id=?),'')=?
      AND ${drive?"EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=? AND revisao=? AND estado='ACTIVE' AND usuario_id=?)":"NOT EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=?)"}`)
    .bind(operation,community,actorId,userId,event,previous,next,community,userId,current?.papel||'',community,userId,current?.drive_papel||'',...drive?[community,drive.revisao,actorId]:[community])];
  const guard='EXISTS (SELECT 1 FROM visitante_acesso_historico WHERE operacao=?)';
  statements.push(next?db.prepare(`INSERT INTO visitante_acessos(comunidade_id,usuario_id,papel,concedido_por) SELECT ?,?,?,? WHERE ${guard}
    ON CONFLICT(comunidade_id,usuario_id) DO UPDATE SET papel=excluded.papel,concedido_por=excluded.concedido_por`).bind(community,userId,next,actorId,operation)
    :db.prepare(`DELETE FROM visitante_acessos WHERE comunidade_id=? AND usuario_id=? AND ${guard}`).bind(community,userId,operation));
  if(drive||!next){
    statements.push(next?db.prepare(`INSERT INTO visitante_drive_acessos(comunidade_id,usuario_id,papel) SELECT ?,?,? WHERE ${guard}
      ON CONFLICT(comunidade_id,usuario_id) DO UPDATE SET papel=excluded.papel`).bind(community,userId,next,operation)
      :db.prepare(`DELETE FROM visitante_drive_acessos WHERE comunidade_id=? AND usuario_id=? AND ${guard}`).bind(community,userId,operation));
    if(drive)statements.push(db.prepare(`UPDATE visitante_drive SET revisao=revisao+1 WHERE comunidade_id=? AND ${guard}`).bind(community,operation));
  }
  statements.push(db.prepare(`INSERT INTO notificacoes_sistema
    (tipo,titulo,mensagem,area,usuario_id,comunidade_id,remetente_usuario_id,destino_rota,criado_por)
    SELECT 'IMPORTANTE',?,?,'VISITANTES',?,?,?,?,'visitor-sharing' WHERE ${guard}
    AND EXISTS(SELECT 1 FROM usuarios WHERE id=? AND ativo=1)`)
    .bind(title,message.slice(0,500),userId,community,actorId,destination,operation,userId));
  const results=await db.batch(statements);
  if(!results[2].meta.changes)throw new VisitorDriveError('Outro gestor alterou este acesso. Atualize a lista e tente novamente.',409);
  try{scheduleWebPushDelivery(db);}catch{/* The persisted notification and delivery queue remain available. */}
  return {ok:true,changed:true,memberName:member?.nome||'Membro',role:next,action:event,notified:!!member?.ativo};
}
