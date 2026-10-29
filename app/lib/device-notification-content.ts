/** Text shown only after resolving a notification for its authenticated recipient. */
export function deviceNotificationContent(title: string | null | undefined, message: string | null | undefined) {
  return {
    title: compact(title, 120) || "Nova notificação · Vínkulo",
    body: compact(message, 500) || "Abra o Vínkulo para ver os detalhes deste aviso.",
  };
}

function compact(value: string | null | undefined, limit: number) {
  const characters = Array.from((value || "").replace(/\s+/g, " ").trim());
  return characters.length <= limit ? characters.join("") : characters.slice(0, limit - 1).join("") + "…";
}
