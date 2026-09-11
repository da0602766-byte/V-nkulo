import type { Cell, CellHealth } from "./types";

// Saúde da célula: nome, dia e liderança não respondem à pergunta que a
// liderança faz de fato — qual célula parou de reportar, qual está
// encolhendo e qual já tem gente para multiplicar. Tudo abaixo sai dos
// relatórios que a rota já devolve; nada de consulta nova. Lógica idêntica à
// que vivia em TenantOperations.tsx antes do redesenho de Gestão/Participação.
export const CELL_HEALTH_WEEKS = 8;
export const CELL_REPORT_GRACE_DAYS = 21;

export function cellHealth(cell: Cell, agora: number): CellHealth {
  // Antes do relógio acertar no cliente não dá para julgar atraso sem chutar
  // uma data, e chutar aqui pintaria célula saudável de vermelho.
  if (!agora) {
    return {
      id: "AGUARDANDO",
      label: "Calculando",
      weeks: [],
      semanasEmDia: 0,
      mediaPresentes: 0,
    };
  }
  // Os relatórios chegam da rota em ordem decrescente de data.
  const recentes = cell.relatorios.slice(0, CELL_HEALTH_WEEKS);
  const weeks = [...recentes]
    .reverse()
    .map((item) => (item.aconteceu ? Number(item.presentes) || 0 : 0));
  const semanasEmDia = recentes.filter((item) => item.aconteceu).length;
  const comPresenca = weeks.filter((valor) => valor > 0);
  const mediaPresentes = comPresenca.length
    ? Math.round(comPresenca.reduce((soma, valor) => soma + valor, 0) / comPresenca.length)
    : 0;

  const ultimo = cell.ultimo_relatorio_em
    ? Date.parse(cell.ultimo_relatorio_em)
    : Number.NaN;
  const diasSemReportar = Number.isNaN(ultimo)
    ? Number.POSITIVE_INFINITY
    : Math.floor((agora - ultimo) / 86400000);

  if (diasSemReportar > CELL_REPORT_GRACE_DAYS) {
    const semanas = Number.isFinite(diasSemReportar)
      ? Math.floor(diasSemReportar / 7)
      : 0;
    return {
      id: "SEM_RELATORIO",
      label: semanas
        ? `Sem relatório há ${semanas} ${semanas === 1 ? "semana" : "semanas"}`
        : "Sem relatório",
      weeks,
      semanasEmDia,
      mediaPresentes,
    };
  }

  // Encolhendo: a média das duas últimas semanas caiu abaixo de 70% da média
  // das quatro anteriores. Uma semana ruim sozinha não acusa nada.
  const ultimas = weeks.slice(-2).filter((valor) => valor > 0);
  const anteriores = weeks.slice(-6, -2).filter((valor) => valor > 0);
  const mediaUltimas = ultimas.length
    ? ultimas.reduce((soma, valor) => soma + valor, 0) / ultimas.length
    : 0;
  const mediaAnteriores = anteriores.length
    ? anteriores.reduce((soma, valor) => soma + valor, 0) / anteriores.length
    : 0;
  const encolhendo = mediaAnteriores > 0 && mediaUltimas < mediaAnteriores * 0.7;

  if (encolhendo) {
    return { id: "ATENCAO", label: "Atenção", weeks, semanasEmDia, mediaPresentes };
  }
  if (mediaPresentes >= 15 && semanasEmDia >= 6) {
    return {
      id: "MULTIPLICAR",
      label: "Pronta p/ multiplicar",
      weeks,
      semanasEmDia,
      mediaPresentes,
    };
  }
  return { id: "SAUDAVEL", label: "Saudável", weeks, semanasEmDia, mediaPresentes };
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export function whatsappHref(phone: string | null | undefined) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 10 && digits.length <= 15
    ? `https://wa.me/${digits}`
    : null;
}
