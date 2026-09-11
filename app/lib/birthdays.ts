import { getD1 } from "../../db";

export async function ensureTodayBirthdayNotices() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: string) => today.find((item) => item.type === type)?.value || "";
  const monthDay = `${part("month")}-${part("day")}`;
  const year = Number(part("year"));
  if (!monthDay.match(/^\d{2}-\d{2}$/) || !year) return;

  const db = getD1();
  const birthdays = await db.prepare(
    "SELECT id, nome FROM usuarios WHERE ativo = 1 AND data_nascimento IS NOT NULL AND substr(data_nascimento, 6, 5) = ?",
  ).bind(monthDay).all<{ id: number; nome: string }>();

  for (const user of birthdays.results) {
    await db.prepare(
      `INSERT OR IGNORE INTO avisos
        (titulo, resumo, conteudo, tipo, prioridade, publicado, publicado_por, aniversario_usuario_id, aniversario_ano)
       VALUES (?, ?, ?, 'NOTICIA', 'NORMAL', 1, 'SISTEMA', ?, ?)`,
    ).bind(
      `Hoje é aniversário de ${user.nome}! 🎉`,
      `Celebre este dia especial com ${user.nome}. Deixe uma reação ou comentário!`,
      "Que este novo ciclo seja cheio de alegria, cuidado e boas experiências.",
      user.id,
      year,
    ).run();
  }
}
