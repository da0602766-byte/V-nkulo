import { getD1 } from "../../db";

type D1Database = ReturnType<typeof getD1>;

type ScheduledEditorialRow = {
  id: number;
  comunidade_id: number;
  titulo: string;
  mensagem: string;
  categoria: string;
  referencia: string;
  imagem_url: string;
  imagem_alt: string;
  visibilidade: string;
  comentarios_habilitados: number;
  autorizado_por: number | null;
};

/**
 * Publica somente mensagens previamente autorizadas pelo proprietário.
 * A chamada é idempotente: cada item é reivindicado por atualização condicional
 * antes da criação da publicação.
 */
export async function publishDueEditorialEntries(db: D1Database = getD1()) {
  const due = await db
    .prepare(
      `SELECT id, comunidade_id, titulo, mensagem, categoria, referencia,
        imagem_url, imagem_alt, visibilidade, comentarios_habilitados,
        autorizado_por
       FROM programacoes_editoriais
       WHERE status = 'AGENDADA' AND publicar_em <= CURRENT_TIMESTAMP
       ORDER BY publicar_em, id
       LIMIT 5`,
    )
    .all<ScheduledEditorialRow>();

  let published = 0;
  for (const item of due.results) {
    const claimed = await db
      .prepare(
        `UPDATE programacoes_editoriais
         SET status = 'PROCESSANDO', atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'AGENDADA'
           AND publicar_em <= CURRENT_TIMESTAMP`,
      )
      .bind(item.id)
      .run();
    if (Number(claimed.meta.changes || 0) !== 1) continue;

    try {
      const community = await db
        .prepare("SELECT id FROM comunidades WHERE id = ? AND status = 'ATIVA' LIMIT 1")
        .bind(item.comunidade_id)
        .first<{ id: number }>();
      if (!community) {
        await db
          .prepare(
            `UPDATE programacoes_editoriais
             SET status = 'BLOQUEADA', atualizado_em = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'PROCESSANDO'`,
          )
          .bind(item.id)
          .run();
        continue;
      }

      const publication = await db
        .prepare(
          `INSERT INTO publicacoes_piloto
           (comunidade_id, titulo, resumo, conteudo, categoria, visibilidade,
            status, origem, comentarios_habilitados, criado_por, imagem_url,
            imagem_thumbnail_url, imagem_alt, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?, 'PUBLICADA', 'IA_AGENDADA', ?, ?, ?, ?, ?,
             CURRENT_TIMESTAMP)`,
        )
        .bind(
          item.comunidade_id,
          item.titulo,
          item.mensagem.slice(0, 220),
          item.mensagem,
          item.categoria,
          "COMUNIDADE",
          item.comentarios_habilitados ? 1 : 0,
          item.autorizado_por,
          item.imagem_url,
          item.imagem_url,
          item.imagem_alt,
        )
        .run();
      const publicationId = Number(publication.meta.last_row_id);
      await db.batch([
        db
          .prepare(
            `UPDATE programacoes_editoriais
             SET status = 'PUBLICADA', publicacao_id = ?,
               atualizado_em = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'PROCESSANDO'`,
          )
          .bind(publicationId, item.id),
        db
          .prepare(
            `INSERT INTO auditoria_piloto
             (comunidade_id, usuario_id, evento, resultado, metadados)
             VALUES (?, ?, 'EDITORIAL_PROGRAMACAO_PUBLICADA', 'SUCESSO', ?)`,
          )
          .bind(
            item.comunidade_id,
            item.autorizado_por,
            JSON.stringify({
              programacaoId: item.id,
              publicacaoId: publicationId,
              categoria: item.categoria,
              origem: "IA_AGENDADA",
              autorizacaoHumana: true,
            }),
          ),
      ]);
      published += 1;
    } catch (error) {
      console.error("Falha ao publicar programação editorial", {
        programacaoId: item.id,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
      await db
        .prepare(
          `UPDATE programacoes_editoriais
           SET status = 'FALHA', atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'PROCESSANDO'`,
        )
        .bind(item.id)
        .run();
    }
  }
  return published;
}
