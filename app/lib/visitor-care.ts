// Shared, serializable visitor care fields. Missing answers stay unknown.
export const CARE_FIELDS = {
  tipoPessoa: "tipo_pessoa",
  certificadoBatismo: "certificado_batismo",
  discipulado: "discipulado",
  discipulador: "discipulador",
  doaADoa: "doa_a_doa",
  doaReceber: "doa_receber",
  doacoesRealizadas: "doacoes_realizadas",
  oficial: "oficial",
  funcaoOficial: "funcao_oficial",
  responsavelAcompanhamento: "responsavel_acompanhamento",
  proximaAcao: "proxima_acao",
  dataProximaAcao: "data_proxima_acao",
} as const;

export type VisitorCare = {
  tipo_pessoa?: string;
  certificado_batismo?: string;
  discipulado?: string;
  discipulador?: string | null;
  doa_a_doa?: string;
  doa_receber?: string;
  doacoes_realizadas?: string | null;
  oficial?: string;
  funcao_oficial?: string | null;
  responsavel_acompanhamento?: string | null;
  proxima_acao?: string | null;
  data_proxima_acao?: string | null;
};

export function isVisitorDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function visitorBoolean(value: unknown) {
  return [true, 1, "1", "true", "on", "SIM"].includes(value as never);
}

export function visitorAge(birth: string | null, today: string) {
  if (!birth || !isVisitorDate(birth) || birth > today) return null;
  return Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - (today.slice(5) < birth.slice(5) ? 1 : 0);
}

export function visitorAgeGroup(birth: string | null, today: string) {
  const age = visitorAge(birth, today);
  return age === null ? "Não informado" : age < 12 ? "Criança" : age < 18 ? "Adolescente" : "Adulto";
}

export function parseVisitorCare(payload: Record<string, unknown>, previous: Record<string, unknown> = {}) {
  const values: Record<string, string | null> = {};
  for (const [input, column] of Object.entries(CARE_FIELDS)) {
    const raw = Object.hasOwn(payload, input) ? payload[input] : previous[column];
    const value = String(raw ?? "").trim();
    if (["certificadoBatismo", "discipulado", "doaADoa", "doaReceber", "oficial"].includes(input)) {
      const answer = value || "NAO_INFORMADO";
      if (!["SIM", "NAO", "NAO_INFORMADO"].includes(answer)) return { error: "Revise as respostas de acompanhamento." } as const;
      values[column] = answer;
    } else if (input === "tipoPessoa") {
      if (value && !["VISITANTE", "MEMBRO"].includes(value)) return { error: "Vínculo com a igreja inválido." } as const;
      values[column] = value || "VISITANTE";
    } else {
      const limit = input === "doacoesRealizadas" ? 1500 : input === "proximaAcao" ? 300 : input === "dataProximaAcao" ? 10 : 120;
      if (value.length > limit) return { error: "Um dos campos de acompanhamento excede o tamanho permitido." } as const;
      values[column] = value || null;
    }
  }
  if (values.data_proxima_acao && !isVisitorDate(values.data_proxima_acao)) return { error: "Data da próxima ação inválida." } as const;
  if (values.data_proxima_acao && !values.proxima_acao) return { error: "Descreva a próxima ação para definir um prazo." } as const;
  if (values.discipulado === "SIM" && !values.discipulador) return { error: "Informe quem acompanha o discipulado." } as const;
  if (values.oficial === "SIM" && !values.funcao_oficial) return { error: "Informe a função do oficial." } as const;
  if (values.discipulado === "NAO") values.discipulador = null;
  if (values.oficial === "NAO") values.funcao_oficial = null;
  return { values } as const;
}

export function visitorIntegrationGaps(person: VisitorCare & { celula_id?: number | null; ministerio?: string | null; batizado?: string }) {
  return [
    !person.celula_id && "Vincular a uma célula",
    person.discipulado !== "SIM" && (person.discipulado === "NAO" ? "Iniciar discipulado" : "Confirmar discipulado"),
    !person.ministerio?.trim() && "Conversar sobre ministério",
    person.batizado === "SIM" && person.certificado_batismo !== "SIM" && "Verificar certificado de batismo",
    person.doa_receber === "SIM" && "Acompanhar apoio do Doa a Doa",
  ].filter(Boolean) as string[];
}
