// Mensagens privadas moram só no banco do sistema — nunca mais no Google
// Drive. Em troca da rapidez de guardar tudo aqui, a plataforma se
// compromete a não acumular histórico: cada semana abre uma conversa nova
// (ver `ciclo_semana` em conversas_privadas) e, sem exceção, toda conversa
// de uma semana encerrada é apagada — a mensagem cascateia junto pela FK.
// A aba Mensagens deixa esse aviso sempre visível (aviso prévio), então
// ninguém é pego de surpresa.

const RETENTION_CHECK_INTERVAL_MS = 10 * 60 * 1000;
let nextRetentionCheckAt = 0;

/**
 * Roda oportunisticamente a cada requisição (chamada em worker/index.ts,
 * como o otimizador geral da plataforma), no máximo uma vez a cada
 * RETENTION_CHECK_INTERVAL_MS. Ao contrário do otimizador — que o
 * proprietário pode desligar ou espaçar — esta limpeza não tem
 * configuração de liga/desliga nem intervalo ajustável: a promessa de
 * apagar toda semana não pode virar promessa condicional.
 */
export async function purgeExpiredPrivateMessagesIfDue(
  db: D1Database,
  now = Date.now(),
) {
  if (now < nextRetentionCheckAt) return;
  nextRetentionCheckAt = now + RETENTION_CHECK_INTERVAL_MS;
  await db
    .prepare(
      "DELETE FROM conversas_privadas WHERE ciclo_semana <> strftime('%Y-%W','now')",
    )
    .run();
}

/** Próxima segunda-feira 00h00 UTC — momento em que o ciclo semanal vira e
 * a limpeza definitiva alcança a conversa da semana atual. */
export function nextWeeklyPurgeAt(from: Date = new Date()) {
  const startOfToday = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const weekday = new Date(startOfToday).getUTCDay(); // 0=domingo .. 6=sábado
  const daysAhead = ((8 - weekday) % 7) || 7;
  return new Date(startOfToday + daysAhead * 86_400_000);
}

// O ciclo vira em horário universal, que cai em dias diferentes conforme o
// fuso de quem lê. O texto fixo fala de "virada da semana" e quem mostra o
// dia e a hora exatos é a interface, já no fuso do próprio usuário.
export const CHAT_RETENTION_NOTICE =
  "Por privacidade, o Vínkulo não guarda um histórico permanente de conversas: toda semana, na virada, as mensagens do período são apagadas por completo, sem exceção. Guarde fora da plataforma o que precisar manter.";
