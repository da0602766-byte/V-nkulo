/** Review requests are retained for 180 days. Subscription snapshots and users have their own lifecycle. */
export async function purgeAccessRequests(db: D1Database) {
  await db.batch([
    db.prepare(`UPDATE solicitacoes_log1 SET status='EXPIRADA',atualizado_em=CURRENT_TIMESTAMP
      WHERE status='LINK_GERADO' AND NOT EXISTS(SELECT 1 FROM links_contratacao l
        WHERE l.solicitacao_id=solicitacoes_log1.id AND l.revogado_em IS NULL AND l.usado_em IS NULL AND datetime(l.expira_em)>CURRENT_TIMESTAMP)`),
    db.prepare('DELETE FROM solicitacoes_log1 WHERE datetime(retencao_ate)<=CURRENT_TIMESTAMP'),
    db.prepare("DELETE FROM controlled_auth_rate_limits WHERE expira_em<unixepoch('now','-1 day')"),
  ]);
}
