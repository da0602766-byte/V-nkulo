const EMOJIS = ["👍", "❤️", "🙏", "🎉"] as const;

export const ALLOWED_NOTICE_EMOJIS = new Set<string>(EMOJIS);

type ReactionRow = { aviso_id: number; emoji: string; total: number; minha: number };
type CommentRow = { id: number; aviso_id: number; texto: string; criado_em: string; usuario_id: number; nome: string };

export async function enrichNotices(db: D1Database, notices: Record<string, unknown>[], user: { id: number; perfil: string }) {
  const ids = notices.map((item) => Number(item.id)).filter(Boolean);
  if (!ids.length) return notices;
  const placeholders = ids.map(() => "?").join(",");
  const [reactionResult, commentResult] = await Promise.all([
    db.prepare(
      `SELECT aviso_id, emoji, COUNT(*) AS total,
       MAX(CASE WHEN usuario_id = ? THEN 1 ELSE 0 END) AS minha
       FROM aviso_reacoes WHERE aviso_id IN (${placeholders}) GROUP BY aviso_id, emoji`,
    ).bind(user.id, ...ids).all<ReactionRow>(),
    db.prepare(
      `SELECT c.id, c.aviso_id, c.texto, c.criado_em, c.usuario_id, u.nome
       FROM aviso_comentarios c JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.aviso_id IN (${placeholders}) ORDER BY c.criado_em ASC`,
    ).bind(...ids).all<CommentRow>(),
  ]);

  return notices.map((notice) => {
    const noticeId = Number(notice.id);
    return {
      ...notice,
      reacoes: EMOJIS.map((emoji) => {
        const row = reactionResult.results.find((item) => item.aviso_id === noticeId && item.emoji === emoji);
        return { emoji, total: Number(row?.total || 0), minha: Boolean(row?.minha) };
      }),
      comentarios: commentResult.results.filter((item) => item.aviso_id === noticeId).map((item) => ({
        id: item.id,
        nome: item.nome,
        texto: item.texto,
        criado_em: item.criado_em,
        pode_excluir: user.perfil === "ADMIN" || item.usuario_id === user.id,
      })),
    };
  });
}
