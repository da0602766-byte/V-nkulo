// Ordered rules are shared by the page labels and the aggregate counter.
const CATEGORY_RULES = [
  ["escalas", ["escala", "minister"]],
  ["eventos", ["evento"]],
  ["pedidos", ["pedido", "oração", "solicita"]],
  ["mensagens", ["mensagem", "chat"]],
] as const;

export type NotificationCategory = typeof CATEGORY_RULES[number][0] | "sistema";

export function notificationCategory(item: { tipo: string; area: string; titulo: string }): NotificationCategory {
  const value = `${item.tipo} ${item.area} ${item.titulo}`.toLocaleLowerCase("pt-BR");
  return CATEGORY_RULES.find(([, terms]) => terms.some(term => value.includes(term)))?.[0] ?? "sistema";
}

// SQLite lower() folds ASCII. Ç/Ã are the only non-ASCII letters in the
// matching terms; normalize their uppercase forms to match the JS rule too.
// This expression uses fixed columns and fixed internal terms, never user SQL.
export const NOTIFICATION_CATEGORY_SQL = `CASE ${CATEGORY_RULES.map(([category, terms]) =>
  `WHEN ${terms.map(term => `instr(replace(replace(lower(n.tipo || ' ' || n.area || ' ' || n.titulo), 'Ç', 'ç'), 'Ã', 'ã'), '${term}') > 0`).join(" OR ")} THEN '${category}'`
).join(" ")} ELSE 'sistema' END`;
