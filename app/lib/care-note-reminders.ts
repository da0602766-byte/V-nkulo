import { scheduleWebPushDelivery } from "./push-delivery-queue";

export function normalizeReminder(value: unknown, previous?: string | null, now = Date.now()): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const iso = new Date(timestamp).toISOString();
  return iso === previous || timestamp > now ? iso : undefined;
}

/** Scheduled and foreground consumers share the same atomic insert + receipt. */
export async function deliverCareNoteReminders(db: D1Database, userId?: number) {
  const due = await db.prepare(`SELECT l.id, l.comunidade_id, l.usuario_id, j.key AS note_index,
    json_extract(j.value,'$.id') AS note_id, json_extract(j.value,'$.lembreteEm') AS due_at
    FROM layouts_interface l JOIN usuarios u ON u.id=l.usuario_id AND u.ativo=1
    JOIN comunidades c ON c.id=l.comunidade_id AND c.status='ATIVA',
    json_each(CASE WHEN json_valid(l.configuracao) THEN l.configuracao ELSE '{}' END,'$.notes') j
    WHERE l.escopo='care-notes:user:'||l.usuario_id AND (? IS NULL OR l.usuario_id=?)
      AND (c.proprietario_usuario_id=u.id OR EXISTS(SELECT 1 FROM usuario_comunidades uc
        WHERE uc.usuario_id=u.id AND uc.comunidade_id=c.id AND uc.status='ATIVO'))
      AND datetime(json_extract(j.value,'$.lembreteEm'))<=datetime('now')
      AND json_extract(j.value,'$.lembreteEnviadoEm') IS NULL
    ORDER BY datetime(json_extract(j.value,'$.lembreteEm')) LIMIT 100`)
    .bind(userId ?? null, userId ?? null).all<{id:number; comunidade_id:number; usuario_id:number; note_index:number; note_id:string; due_at:string}>();
  let delivered = 0;
  for (const note of due.results) {
    const path = `$.notes[${Number(note.note_index)}]`;
    const guard = `id=? AND json_extract(configuracao,?||'.id')=?
      AND json_extract(configuracao,?||'.lembreteEm')=?
      AND json_extract(configuracao,?||'.lembreteEnviadoEm') IS NULL`;
    const bindings = [note.id, path, note.note_id, path, note.due_at, path];
    const result = await db.batch([
      db.prepare(`INSERT INTO notificacoes_sistema
        (tipo,titulo,mensagem,area,usuario_id,comunidade_id,destino_rota,criado_por)
        SELECT 'IMPORTANTE','Lembrete de post-it','Você tem uma anotação para revisar.','VISITANTES',usuario_id,comunidade_id,?,'care-note-reminder'
        FROM layouts_interface WHERE ${guard}`)
        .bind(`/painel/visitantes?anotacao=${encodeURIComponent(note.note_id)}`, ...bindings),
      db.prepare(`UPDATE layouts_interface SET configuracao=json_set(configuracao,?||'.lembreteEnviadoEm',?),
        versao=versao+1, atualizado_em=CURRENT_TIMESTAMP WHERE ${guard}`)
        .bind(path, new Date().toISOString(), ...bindings),
    ]);
    delivered += Number(result[0].meta.changes || 0);
  }
  if (delivered) scheduleWebPushDelivery(db);
  return { delivered };
}
