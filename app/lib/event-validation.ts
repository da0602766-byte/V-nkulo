const CATEGORIES = new Set([
  "CULTO",
  "CELULA",
  "TREINAMENTO",
  "CONFERENCIA",
  "ACAO_COMUNITARIA",
  "OUTRO",
]);
const STATUSES = new Set(["RASCUNHO", "PUBLICADO"]);

export function parseEventPayload(payload: unknown) {
  const body = (payload || {}) as Record<string, unknown>;
  const titulo = cleanText(body.titulo, 140);
  const descricao = cleanText(body.descricao, 2000);
  const categoria = cleanText(body.categoria, 40).toUpperCase() || "OUTRO";
  const iniciaEm = normalizeDateTime(body.iniciaEm);
  const terminaEm = body.terminaEm
    ? normalizeDateTime(body.terminaEm)
    : null;
  const local = cleanText(body.local, 180);
  const status = cleanText(body.status, 30).toUpperCase() || "RASCUNHO";
  const capacidadeRaw = Number(body.capacidade || 0);
  const capacidade =
    Number.isInteger(capacidadeRaw) && capacidadeRaw > 0
      ? capacidadeRaw
      : null;
  const escalasAbremEm = body.escalasAbremEm
    ? normalizeDateTime(body.escalasAbremEm)
    : null;
  const reservasAbremEm = body.reservasAbremEm
    ? normalizeDateTime(body.reservasAbremEm)
    : null;
  const publico = body.publico === true || body.publico === 1;
  const enquete = parsePoll(body.enquete);

  if (!titulo || !iniciaEm) {
    return { error: "Título e data de início são obrigatórios." } as const;
  }
  if (!CATEGORIES.has(categoria) || !STATUSES.has(status)) {
    return { error: "Categoria ou status inválido." } as const;
  }
  if (terminaEm && Date.parse(terminaEm) < Date.parse(iniciaEm)) {
    return {
      error: "A data de término não pode ser anterior ao início.",
    } as const;
  }
  if (
    (escalasAbremEm && Date.parse(escalasAbremEm) >= Date.parse(iniciaEm)) ||
    (reservasAbremEm && Date.parse(reservasAbremEm) >= Date.parse(iniciaEm))
  ) {
    return {
      error: "A abertura das escalas e reservas precisa acontecer antes do evento.",
    } as const;
  }
  if (
    body.capacidade &&
    (!Number.isInteger(capacidadeRaw) ||
      capacidadeRaw < 1 ||
      capacidadeRaw > 100_000)
  ) {
    return { error: "A capacidade deve estar entre 1 e 100.000." } as const;
  }
  return {
    titulo,
    descricao,
    categoria,
    iniciaEm,
    terminaEm,
    local,
    publico,
    status,
    capacidade,
    escalasAbremEm,
    reservasAbremEm,
    enquete,
  } as const;
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeDateTime(value: unknown) {
  const text = cleanText(value, 40);
  const time = Date.parse(text);
  return text && Number.isFinite(time) ? new Date(time).toISOString() : null;
}
import { parsePoll } from "./event-voting";
