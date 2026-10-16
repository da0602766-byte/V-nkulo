import type { getD1 } from "../../db";
import { isSystemOwnerAccount } from "./local-auth";
import { scheduleWebPushDelivery } from "./push-delivery-queue";

type Database = ReturnType<typeof getD1>;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** Owner-only account deletion. Notifications, unlinking and audit commit together. */
export async function deleteUserAccount(db: Database, actorId: number, userId: number) {
  try {
  const target = await db.prepare("SELECT id, nome, email, criado_em, celula AS celula_vinculada FROM usuarios WHERE id = ?")
    .bind(userId).first<{ id: number; nome: string; email: string; criado_em: string; celula_vinculada: string | null }>();
  if (!target) return Response.json({ error: "Conta não encontrada." }, { status: 404 });
  if (target.id === actorId || isSystemOwnerAccount(target)) {
    return Response.json({ error: "A conta proprietária do sistema não pode ser excluída." }, { status: 409 });
  }

    // Resolve recipients before removing any membership, including leaders of linked cells.
    const recipients = await db.prepare(`
      WITH communities AS (
        SELECT comunidade_id FROM usuario_comunidades WHERE usuario_id = ?
        UNION SELECT comunidade_id FROM ministerio_voluntarios WHERE usuario_id = ?
        UNION SELECT comunidade_id FROM escala_designacoes WHERE usuario_id = ?
        UNION SELECT comunidade_id FROM celulas WHERE lider_usuario_id = ? OR vice_lider_usuario_id = ?
        UNION SELECT id FROM comunidades WHERE proprietario_usuario_id = ? OR pastor_responsavel_usuario_id = ?
        UNION SELECT comunidade_id FROM ministerios_comunidade WHERE responsavel_usuario_id = ?
        UNION SELECT comunidade_id FROM escalas_ministerio WHERE responsavel_usuario_id = ?
        UNION SELECT comunidade_id FROM visitante_categorias WHERE responsavel_usuario_id = ?
      ), leaders AS (
        SELECT uc.usuario_id, uc.comunidade_id FROM usuario_comunidades uc
        WHERE uc.comunidade_id IN (SELECT comunidade_id FROM communities)
          AND uc.status = 'ATIVO' AND uc.papel IN ('PASTOR', 'ADMIN_COMUNIDADE', 'SUPERADMIN')
        UNION SELECT m.responsavel_usuario_id, m.comunidade_id FROM ministerios_comunidade m
          JOIN ministerio_voluntarios v ON v.ministerio_id = m.id AND v.comunidade_id = m.comunidade_id
          WHERE v.usuario_id = ? AND v.ativo = 1
        UNION SELECT l.usuario_id, l.comunidade_id FROM ministerio_voluntarios l
          JOIN ministerio_voluntarios v ON v.ministerio_id = l.ministerio_id AND v.comunidade_id = l.comunidade_id
          WHERE v.usuario_id = ? AND v.ativo = 1 AND l.ativo = 1 AND l.papel = 'LIDER'
        UNION SELECT COALESCE(e.responsavel_usuario_id, e.atualizado_por, e.criado_por), e.comunidade_id
          FROM escalas_ministerio e JOIN escala_designacoes d ON d.escala_id = e.id AND d.comunidade_id = e.comunidade_id
          WHERE d.usuario_id = ? AND d.ativo = 1
        UNION SELECT c.lider_usuario_id, c.comunidade_id FROM celulas c
          WHERE c.comunidade_id IN (SELECT comunidade_id FROM communities)
            AND (c.nome = ? OR c.lider_usuario_id = ? OR c.vice_lider_usuario_id = ?)
        UNION SELECT c.vice_lider_usuario_id, c.comunidade_id FROM celulas c
          WHERE c.comunidade_id IN (SELECT comunidade_id FROM communities)
            AND (c.nome = ? OR c.lider_usuario_id = ? OR c.vice_lider_usuario_id = ?)
        UNION SELECT c.proprietario_usuario_id, c.id FROM comunidades c WHERE c.id IN (SELECT comunidade_id FROM communities)
        UNION SELECT c.pastor_responsavel_usuario_id, c.id FROM comunidades c WHERE c.id IN (SELECT comunidade_id FROM communities)
      ) SELECT DISTINCT l.usuario_id, l.comunidade_id FROM leaders l
        JOIN usuarios u ON u.id = l.usuario_id AND u.ativo = 1
        JOIN usuario_comunidades uc ON uc.usuario_id = u.id AND uc.comunidade_id = l.comunidade_id AND uc.status = 'ATIVO'
        WHERE l.usuario_id <> ?
    `).bind(userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId,
      target.celula_vinculada || "", userId, userId, target.celula_vinculada || "", userId, userId, userId)
      .all<{ usuario_id: number; comunidade_id: number }>();

    const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all<{ name: string }>();
    const statements: D1PreparedStatement[] = [];
    // Batch schema reads: the former sequential scan exhausted Worker subrequests.
    for (let offset = 0; offset < tables.results.length; offset += 40) {
      const chunk = tables.results.slice(offset, offset + 40);
      const keys = await db.batch<{ table: string; from: string; on_delete: string }>(chunk.map(({ name }) => db.prepare(`PRAGMA foreign_key_list(${quote(name)})`)));
      const relevant = chunk.map((entry, i) => ({ ...entry, keys: (keys[i].results || []).filter(key => key.table === "usuarios") })).filter(entry => entry.keys.length);
      if (!relevant.length) continue;
      const columns = await db.batch<{ name: string; notnull: number }>(relevant.map(({ name }) => db.prepare(`PRAGMA table_info(${quote(name)})`)));
      relevant.forEach((entry, i) => {
        for (const key of entry.keys) {
          // CASCADE belongs to personal data (sessions, memberships, preferences, etc.).
          if (key.on_delete.toUpperCase() === "CASCADE") continue;
          const required = (columns[i].results || []).find(column => column.name === key.from)?.notnull;
          statements.push(db.prepare(required
            ? `DELETE FROM ${quote(entry.name)} WHERE ${quote(key.from)} = ?`
            : `UPDATE ${quote(entry.name)} SET ${quote(key.from)} = NULL WHERE ${quote(key.from)} = ?`).bind(userId));
        }
      });
    }
    // A recipient of an old notification must never become a broadcast recipient.
    statements.unshift(db.prepare("DELETE FROM notificacoes_sistema WHERE usuario_id = ?").bind(userId));
    statements.push(db.prepare("DELETE FROM usuarios WHERE id = ?").bind(userId));
    for (const recipient of recipients.results) {
      statements.push(db.prepare(`INSERT INTO notificacoes_sistema
        (tipo, titulo, mensagem, area, usuario_id, comunidade_id, remetente_usuario_id, destino_rota, criado_por)
        VALUES ('IMPORTANTE', 'Conta excluída pelo proprietário', ?, 'USUARIOS', ?, ?, ?, '/painel?view=pessoas', 'VÍNKULO')`)
        .bind(`${target.nome} teve a conta excluída pelo proprietário. Seus vínculos foram removidos. Revise responsáveis, equipes e escalas da comunidade.`,
          recipient.usuario_id, recipient.comunidade_id, actorId));
    }
    statements.push(db.prepare(`INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados)
      VALUES (NULL, ?, 'CONTA_EXCLUIDA_DEFINITIVAMENTE', 'SUCESSO', ?)`)
      .bind(actorId, JSON.stringify({ usuarioId: userId, lideresNotificados: recipients.results.length })));
    await db.batch(statements);
    scheduleWebPushDelivery(db);
    return Response.json({ ok: true, deleted: true, notified: recipients.results.length });
  } catch (error) {
    console.error("Account deletion failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Não foi possível concluir a exclusão. Nenhuma alteração foi salva. Tente novamente." }, { status: 500 });
  }
}
