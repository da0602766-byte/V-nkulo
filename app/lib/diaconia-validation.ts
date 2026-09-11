const CHECKLIST_STATUSES = new Set([
  "PENDENTE",
  "FEITO",
  "NAO_FEITO",
  "SUBSTITUIDO",
]);

export function parseChecklistItem(payload: unknown) {
  const body = asRecord(payload);
  const scheduleId = positiveInteger(body.scheduleId);
  const assignmentId = positiveInteger(body.assignmentId);
  const tarefa = cleanText(body.tarefa, 180);
  if (!scheduleId || !tarefa) {
    return { error: "Escala e tarefa são obrigatórias." } as const;
  }
  return { scheduleId, assignmentId, tarefa } as const;
}

export function parseChecklistUpdate(payload: unknown) {
  const body = asRecord(payload);
  const itemId = positiveInteger(body.itemId);
  const status = cleanText(body.status, 30).toUpperCase();
  const substitutoUsuarioId = positiveInteger(body.substitutoUsuarioId);
  const substitutoExternoNome = cleanText(body.substitutoExternoNome, 120);
  const observacao = cleanText(body.observacao, 600);
  if (!itemId || !CHECKLIST_STATUSES.has(status)) {
    return { error: "Item ou status do checklist inválido." } as const;
  }
  if (
    status === "SUBSTITUIDO" &&
    (!substitutoUsuarioId && !substitutoExternoNome)
  ) {
    return {
      error: "Informe um substituto cadastrado ou o nome do substituto externo.",
    } as const;
  }
  if (
    status === "SUBSTITUIDO" &&
    substitutoUsuarioId &&
    substitutoExternoNome
  ) {
    return {
      error: "Escolha somente um tipo de substituto.",
    } as const;
  }
  return {
    itemId,
    status,
    substitutoUsuarioId:
      status === "SUBSTITUIDO" ? substitutoUsuarioId : null,
    substitutoExternoNome:
      status === "SUBSTITUIDO" ? substitutoExternoNome : "",
    observacao,
  } as const;
}

export function parseDiaconiaReport(payload: unknown) {
  const body = asRecord(payload);
  const scheduleId = positiveInteger(body.scheduleId);
  const resumo = cleanText(body.resumo, 2000);
  if (!scheduleId || resumo.length < 10) {
    return {
      error: "Escala e resumo com pelo menos 10 caracteres são obrigatórios.",
    } as const;
  }
  return { scheduleId, resumo } as const;
}

export function cleanDiaconiaAction(value: unknown) {
  return cleanText(value, 50).toUpperCase();
}

function asRecord(value: unknown) {
  return (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
