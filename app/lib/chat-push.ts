/** Recheck access at delivery/display time, not just when the sender posted. */
export async function getAuthorizedChatPush(db: D1Database, notificationId: number, recipientId: number) {
  return db.prepare(`SELECT c.id AS conversationId, c.comunidade_id AS communityId
    FROM notificacoes_sistema n
    JOIN mensagens_privadas m ON m.id=n.entidade_id AND m.remetente_id=n.remetente_usuario_id
    JOIN conversas_privadas c ON c.id=m.conversa_id AND c.comunidade_id=n.comunidade_id
    JOIN comunidades community ON community.id=c.comunidade_id AND community.status='ATIVA'
    JOIN usuarios sender ON sender.id=m.remetente_id AND sender.ativo=1
    JOIN usuarios recipient ON recipient.id=n.usuario_id AND recipient.ativo=1
    JOIN usuario_comunidades sc ON sc.usuario_id=sender.id AND sc.comunidade_id=c.comunidade_id AND sc.status='ATIVO'
    JOIN usuario_comunidades rc ON rc.usuario_id=recipient.id AND rc.comunidade_id=c.comunidade_id AND rc.status='ATIVO'
    WHERE n.id=? AND n.usuario_id=? AND n.area='CHAT' AND m.lida_em IS NULL
      AND c.ciclo_semana=strftime('%Y-%W','now')
      AND sender.id IN (c.usuario_menor_id,c.usuario_maior_id)
      AND recipient.id IN (c.usuario_menor_id,c.usuario_maior_id) AND recipient.id<>sender.id
      AND (CASE WHEN sender.perfil='ADMIN' OR sc.papel IN ('ADMIN_COMUNIDADE','PASTOR','LIDER')
        OR EXISTS (SELECT 1 FROM oficiais_comunidade o WHERE o.usuario_comunidade_id=sc.id) THEN 1 ELSE 0 END)
        = (CASE WHEN recipient.perfil='ADMIN' OR rc.papel IN ('ADMIN_COMUNIDADE','PASTOR','LIDER')
        OR EXISTS (SELECT 1 FROM oficiais_comunidade o WHERE o.usuario_comunidade_id=rc.id) THEN 1 ELSE 0 END)
      AND NOT EXISTS (SELECT 1 FROM configuracoes pref WHERE pref.chave='notification_preferences:' || recipient.id
        AND CASE WHEN json_valid(pref.valor) THEN json_extract(pref.valor,'$.mensagens')=0 ELSE 0 END)
    LIMIT 1`).bind(notificationId, recipientId).first<{ conversationId: number; communityId: number }>();
}
