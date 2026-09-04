/** D1 batch is one transaction. Only the winning update can invalidate tokens/sessions. */
/** @param {any} db @param {string} tokenHash @param {string} hash @param {string} salt @param {string|null} expectedHash */
export async function replacePasswordWithToken(db, tokenHash, hash, salt, expectedHash = null) {
  const results = await db.batch([
    db.prepare(`UPDATE usuarios SET senha_hash = ?, senha_salt = ?, tentativas_login = 0,
      bloqueado_ate = NULL, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = (SELECT usuario_id FROM redefinicoes_senha WHERE token_hash = ?
        AND usado = 0 AND datetime(expira_em) > CURRENT_TIMESTAMP LIMIT 1)
      AND ativo = 1 AND (? IS NULL OR senha_hash = ?)`)
      .bind(hash, salt, tokenHash, expectedHash, expectedHash),
    db.prepare(`UPDATE redefinicoes_senha SET usado = 1 WHERE usuario_id IN
      (SELECT id FROM usuarios WHERE senha_hash = ? AND senha_salt = ?)`)
      .bind(hash, salt),
    db.prepare(`DELETE FROM sessoes WHERE usuario_id IN
      (SELECT id FROM usuarios WHERE senha_hash = ? AND senha_salt = ?)`)
      .bind(hash, salt),
  ]);
  return Number(results[0].meta.changes) === 1;
}
