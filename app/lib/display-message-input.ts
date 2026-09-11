export const DISPLAY_AREAS = [
  "login",
  "todas",
  "inicio",
  "avisos",
  "visitantes",
  "acompanhamentos",
  "celulas",
  "relatorios",
  "louvor",
  "diaconia",
  "cultos",
  "teens",
  "modulos",
  "usuarios",
  "personalizar",
  "seguranca",
  "menu",
] as const;

export const DISPLAY_TYPES = ["INFO", "IMPORTANTE", "URGENTE"] as const;
export const DISPLAY_ANIMATIONS = ["SUAVE", "DESLIZAR", "PULSAR"] as const;

type DisplayMessagePayload = {
  titulo?: unknown;
  mensagem?: unknown;
  tipo?: unknown;
  areas?: unknown;
  animacao?: unknown;
  intervaloSegundos?: unknown;
  iniciaEm?: unknown;
  terminaEm?: unknown;
  ativo?: unknown;
};

export type NormalizedDisplayMessage = {
  titulo: string;
  mensagem: string;
  tipo: (typeof DISPLAY_TYPES)[number];
  areas: string;
  animacao: (typeof DISPLAY_ANIMATIONS)[number];
  intervaloSegundos: number;
  iniciaEm: string | null;
  terminaEm: string | null;
  ativo: number;
};

export function normalizeDisplayMessage(
  payload: DisplayMessagePayload,
): { value?: NormalizedDisplayMessage; error?: string } {
  const titulo = String(payload.titulo || "").trim().slice(0, 120);
  const mensagem = String(payload.mensagem || "").trim().slice(0, 2000);
  if (titulo.length < 2 || mensagem.length < 2) {
    return { error: "Informe um título e uma mensagem." };
  }

  const tipoCandidate = String(payload.tipo || "INFO").toUpperCase();
  const tipo = DISPLAY_TYPES.includes(
    tipoCandidate as (typeof DISPLAY_TYPES)[number],
  )
    ? (tipoCandidate as (typeof DISPLAY_TYPES)[number])
    : "INFO";
  const animationCandidate = String(payload.animacao || "SUAVE").toUpperCase();
  const animacao = DISPLAY_ANIMATIONS.includes(
    animationCandidate as (typeof DISPLAY_ANIMATIONS)[number],
  )
    ? (animationCandidate as (typeof DISPLAY_ANIMATIONS)[number])
    : "SUAVE";

  const rawAreas = Array.isArray(payload.areas) ? payload.areas : [];
  const areas = [
    ...new Set(
      rawAreas
        .map(String)
        .filter((area) =>
          DISPLAY_AREAS.includes(area as (typeof DISPLAY_AREAS)[number]),
        ),
    ),
  ];
  if (!areas.length) {
    return { error: "Escolha pelo menos um local para exibir a mensagem." };
  }

  const iniciaEm = normalizeDate(payload.iniciaEm);
  const terminaEm = normalizeDate(payload.terminaEm);
  if (payload.iniciaEm && !iniciaEm) {
    return { error: "A data inicial não é válida." };
  }
  if (payload.terminaEm && !terminaEm) {
    return { error: "A data final não é válida." };
  }
  if (
    iniciaEm &&
    terminaEm &&
    new Date(terminaEm).getTime() <= new Date(iniciaEm).getTime()
  ) {
    return { error: "A data final deve ser posterior à data inicial." };
  }

  const intervaloSegundos = Math.min(
    30,
    Math.max(3, Number(payload.intervaloSegundos) || 7),
  );

  return {
    value: {
      titulo,
      mensagem,
      tipo,
      areas: JSON.stringify(areas),
      animacao,
      intervaloSegundos,
      iniciaEm,
      terminaEm,
      ativo: payload.ativo === false || payload.ativo === 0 ? 0 : 1,
    },
  };
}

function normalizeDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
