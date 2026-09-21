type AttentionVisitor = {
  ativo: number;
  categoria_nome: string | null;
  telefone: string | null;
  responsavel_email: string | null;
  acompanhante: string | null;
  data_entrada: string;
  ultimo_contato: string | null;
  proximo_contato: string | null;
};

export function visitorToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function visitorDaysWithoutContact(visitor: AttentionVisitor, today = visitorToday()) {
  const lastContact = visitor.ultimo_contato;
  const timestamp = lastContact
    ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(lastContact) ? lastContact : `${lastContact.replace(" ", "T")}Z`)
    : null;
  const reference = timestamp && !Number.isNaN(timestamp.getTime())
    ? visitorToday(timestamp) : visitor.data_entrada.slice(0, 10);
  const days = Math.floor((Date.parse(today) - Date.parse(reference)) / 86_400_000);
  return Number.isFinite(days) ? Math.max(0, days) : 0;
}

export function getVisitorAttention(visitor: AttentionVisitor, today = visitorToday()) {
  const reasons: string[] = [];
  if (!visitor.ativo) return { tone: "none", reasons } as const;
  const nextContact = visitor.proximo_contato?.slice(0, 10);
  const overdue = Boolean(nextContact && nextContact < today);
  if (overdue) reasons.push("Retorno atrasado");
  else if (nextContact === today) reasons.push("Contato hoje");
  const daysSinceEntry = (Date.parse(today) - Date.parse(visitor.data_entrada.slice(0, 10))) / 86_400_000;
  if (daysSinceEntry >= 15 && visitorDaysWithoutContact(visitor, today) >= 15) {
    reasons.push("Sem contato há 15 dias ou mais");
  }
  if (!visitor.categoria_nome?.trim()) reasons.push("Sem categoria");
  if (!visitor.telefone?.trim()) reasons.push("Sem telefone");
  if (!visitor.responsavel_email?.trim() && !visitor.acompanhante?.trim()) reasons.push("Sem responsável");
  return { tone: overdue ? "overdue" : reasons.length ? "attention" : "none", reasons } as const;
}
