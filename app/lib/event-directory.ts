export type EventPeriod = "PROXIMOS" | "ANTERIORES" | "TODOS";

type DirectoryEvent = {
  titulo: string;
  descricao: string;
  local: string;
  status: string;
  inicia_em: string;
  termina_em: string | null;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function filterEventDirectory<T extends DirectoryEvent>(events: T[], search: string, status: string, period: EventPeriod, now: number): T[] {
  const term = normalize(search.trim());
  return events.filter((item) => {
    const ended = Date.parse(item.termina_em || item.inicia_em) < now;
    return (status === "TODOS" || item.status === status)
      && (period === "TODOS" || (period === "ANTERIORES" ? ended : !ended))
      && normalize(`${item.titulo} ${item.local} ${item.descricao}`).includes(term);
  }).sort((a, b) => (period === "ANTERIORES" ? -1 : 1) * (Date.parse(a.inicia_em) - Date.parse(b.inicia_em)));
}
