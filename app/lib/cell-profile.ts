// Perfil público da célula — os campos que a liderança edita e que a tela do
// membro usa para escolher onde entrar. Criação e edição passam pelas mesmas
// funções para que os limites não divirjam entre as duas rotas.

const WEEK_DAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const MAX_TAGS = 8;

export function parseCellDays(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value.map(String)
    : String(value || "").split(",");
  return [...new Set(list.map((day) => day.trim().toUpperCase()).filter((day) => WEEK_DAYS.includes(day)))];
}

export function parseCellTags(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value.map(String)
    : String(value || "").split(",");
  return [
    ...new Set(
      list
        .map((tag) => tag.trim().replace(/\s+/g, " ").slice(0, 28))
        .filter(Boolean),
    ),
  ].slice(0, MAX_TAGS);
}

// Hora de início anunciada ("19h30", "19:30"). Guardada como texto porque é o
// que se lê no convite; a duração de cada encontro continua na agenda.
export function parseCellSchedule(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 20);
}

// Agrupamento pastoral das células (Rede Centro, Rede Sul). Não tem relação com
// o módulo Redes do sistema, que agrupa igrejas.
export function parseCellNetwork(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 60);
}

// Só aceita imagem que saiu do próprio envio da célula: um objeto no bucket da
// plataforma ou uma mídia do armazenamento conectado. Sem isto, a capa viraria
// um campo livre para apontar qualquer endereço externo no perfil público.
export function parseCellCoverUrl(value: unknown): { value: string } | { error: string } {
  const url = String(value || "").trim().slice(0, 600);
  if (!url) return { value: "" };
  if (
    !/^\/api\/pilot\/uploads\/images\/cell-cover\/cell-\d+\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(url) &&
    !/^\/api\/storage\/media\/[A-Za-z0-9_.-]+$/i.test(url)
  ) {
    return { error: "Use uma imagem enviada pela área da própria célula." };
  }
  return { value: url };
}
