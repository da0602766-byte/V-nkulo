import { accountDeletionRecipients } from "./account-deletion-recipients";
import type { getD1 } from "../../db";
import { isSystemOwnerAccount } from "./local-auth";
import { scheduleWebPushDelivery } from "./push-delivery-queue";

type Database = ReturnType<typeof getD1>;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** Owner-only account deletion. Notifications, unlinking and audit commit together. */
export async function deleteUserAccount(db: Database, actorId: number, userId: number) {
  const reference = crypto.randomUUID();
  let stage = "consultar a conta";
  let committed = false;
  try {
  const target = await db.prepare("SELECT id, nome, email, criado_em, celula AS celula_vinculada FROM usuarios WHERE id = ?")
    .bind(userId).first<{ id: number; nome: string; email: string; criado_em: string; celula_vinculada: string | null }>();
  if (!target) return Response.json({ error: "Conta não encontrada." }, { status: 404 });
  if (target.id === actorId || isSystemOwnerAccount(target)) {
    return Response.json({ error: "A conta proprietária do sistema não pode ser excluída." }, { status: 409 });
  }

    stage = "consultar os líderes vinculados";
    const recipients = await accountDeletionRecipients(db, userId, target.celula_vinculada || "");
    stage = "preparar os vínculos da conta";

    // D1 owns _cf_* tables; schema PRAGMAs on them are forbidden in Workers.
    const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND lower(name) NOT GLOB '_cf_*'")
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
          // Approval attribution must not delete a shared community subscription.
          if (entry.name === "assinaturas_comunidade" && key.from === "aprovado_por") {
            statements.push(db.prepare("UPDATE assinaturas_comunidade SET aprovado_por = ? WHERE aprovado_por = ?").bind(actorId, userId));
            continue;
          }
          statements.push(db.prepare(required
            ? `DELETE FROM ${quote(entry.name)} WHERE ${quote(key.from)} = ?`
            : `UPDATE ${quote(entry.name)} SET ${quote(key.from)} = NULL WHERE ${quote(key.from)} = ?`).bind(userId));
        }
      });
    }
    // A recipient of an old notification must never become a broadcast recipient.
    statements.unshift(db.prepare("DELETE FROM notificacoes_sistema WHERE usuario_id = ?").bind(userId));
    statements.push(db.prepare("DELETE FROM usuarios WHERE id = ?").bind(userId));
    for (const recipient of recipients) {
      statements.push(db.prepare(`INSERT INTO notificacoes_sistema
        (tipo, titulo, mensagem, area, usuario_id, comunidade_id, remetente_usuario_id, destino_rota, criado_por)
        VALUES ('IMPORTANTE', 'Conta excluída pelo proprietário', ?, 'USUARIOS', ?, ?, ?, '/painel?view=pessoas', 'VÍNKULO')`)
        .bind(`${target.nome} teve a conta excluída pelo proprietário. Seus vínculos foram removidos. Revise responsáveis, equipes e escalas da comunidade.`,
          recipient.usuario_id, recipient.comunidade_id, actorId));
    }
    statements.push(db.prepare(`INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados)
      VALUES (NULL, ?, 'CONTA_EXCLUIDA_DEFINITIVAMENTE', 'SUCESSO', ?)`)
      .bind(actorId, JSON.stringify({ usuarioId: userId, lideresNotificados: recipients.length })));
    stage = "remover a conta e seus vínculos";
    await db.batch(statements);
    committed = true;
    try { scheduleWebPushDelivery(db); } catch (error) { console.error("Account deletion push scheduling", reference, error); }
    return Response.json({ ok: true, deleted: true, notified: recipients.length });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason = /too many terms|too many sql|too many subrequests|limit/i.test(detail) ? "O banco atingiu um limite de processamento."
      : /foreign key|constraint/i.test(detail) ? "Um vínculo de dados impediu a remoção."
      : /no such table|no such column/i.test(detail) ? "A estrutura do banco está desatualizada."
      : /timeout|timed out|overload|busy|network/i.test(detail) ? "O banco está temporariamente indisponível."
      : "Ocorreu uma falha interna de processamento.";
    console.error("Account deletion failed", { reference, stage, detail });
    return Response.json({ error: `Não foi possível ${stage}. ${reason} ${committed ? "A exclusão foi concluída, mas houve falha na resposta." : "Nenhuma alteração foi salva."} Referência: ${reference}`, code: "ACCOUNT_DELETE_FAILED", reference }, { status: 500 });
  }
}
