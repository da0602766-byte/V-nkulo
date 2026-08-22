const UNIT_TYPES = new Set([
  "SEDE",
  "AFILIADA",
  "CONGREGACAO",
  "UNIDADE_REGIONAL",
  "INDEPENDENTE",
]);
const NETWORK_ROLES = new Set([
  "NETWORK_OWNER",
  "NETWORK_PRESIDENT",
  "NETWORK_ADMIN",
  "REGIONAL_SUPERVISOR",
  "NETWORK_AUDITOR",
  "LOCAL_PASTOR",
  "INTERIM_PASTOR",
  "LOCAL_ADMIN",
]);
const UNIT_STATUSES = new Set([
  "ATIVA",
  "AGUARDANDO_RESPONSAVEL",
  "EM_REGULARIZACAO",
  "SOB_RESPONSABILIDADE_INTERINA",
  "RESTRITA_TEMPORARIAMENTE",
  "SUSPENSA",
]);
const COMMERCIAL_STATUSES = new Set([
  "SEM_COBRANCA",
  "EM_TESTE",
  "ISENTA",
  "PREPARADA",
  "PENDENTE_PAGAMENTO",
  "ATIVA",
  "EM_CARENCIA",
  "RESTRITA_FINANCEIRAMENTE",
]);

export function parseNetwork(payload: Record<string, unknown>) {
  const nome = String(payload.nome || "").trim().slice(0, 100);
  const slug = slugify(String(payload.slug || nome));
  const comunidadeMaeId = positiveInteger(payload.comunidadeMaeId);
  if (nome.length < 3) return { error: "Informe o nome da rede." } as const;
  if (!slug) return { error: "Informe um identificador válido." } as const;
  if (!comunidadeMaeId) {
    return { error: "Selecione a igreja-mãe." } as const;
  }
  return { nome, slug, comunidadeMaeId } as const;
}

export function parseNetworkUnit(payload: Record<string, unknown>) {
  const redeId = positiveInteger(payload.redeId);
  const comunidadeId = positiveInteger(payload.comunidadeId);
  const tipo = String(payload.tipo || "AFILIADA").toUpperCase();
  const regiao = String(payload.regiao || "").trim().slice(0, 80);
  if (!redeId || !comunidadeId) {
    return { error: "Rede e comunidade são obrigatórias." } as const;
  }
  if (!UNIT_TYPES.has(tipo)) return { error: "Tipo de unidade inválido." } as const;
  return { redeId, comunidadeId, tipo, regiao } as const;
}

export function parseNetworkManager(payload: Record<string, unknown>) {
  const redeId = positiveInteger(payload.redeId);
  const usuarioId = positiveInteger(payload.usuarioId);
  const papel = String(payload.papel || "NETWORK_ADMIN").toUpperCase();
  const regiao = String(payload.regiao || "").trim().slice(0, 80);
  if (!redeId || !usuarioId) {
    return { error: "Rede e usuário são obrigatórios." } as const;
  }
  if (!NETWORK_ROLES.has(papel)) return { error: "Papel de rede inválido." } as const;
  return { redeId, usuarioId, papel, regiao } as const;
}

export function parseNetworkUnitUpdate(payload: Record<string, unknown>) {
  const redeId = positiveInteger(payload.redeId);
  const unidadeId = positiveInteger(payload.unidadeId);
  const responsavelUsuarioId = optionalPositiveInteger(payload.responsavelUsuarioId);
  const pastorInterinoUsuarioId = optionalPositiveInteger(payload.pastorInterinoUsuarioId);
  const status = String(payload.status || "ATIVA").toUpperCase();
  const restricaoNivel = Number(payload.restricaoNivel || 0);
  const prazoResponsavel = optionalDate(payload.prazoResponsavel);
  if (!redeId || !unidadeId) {
    return { error: "Rede e unidade são obrigatórias." } as const;
  }
  if (!UNIT_STATUSES.has(status)) return { error: "Status de unidade inválido." } as const;
  if (!Number.isInteger(restricaoNivel) || restricaoNivel < 0 || restricaoNivel > 3) {
    return { error: "Nível de restrição inválido." } as const;
  }
  return {
    redeId,
    unidadeId,
    responsavelUsuarioId,
    pastorInterinoUsuarioId,
    status,
    restricaoNivel,
    prazoResponsavel,
  } as const;
}

export function parseNetworkCommercial(payload: Record<string, unknown>) {
  const redeId = positiveInteger(payload.redeId);
  const planoId = optionalPositiveInteger(payload.planoId);
  const limiteAfiliadas = Number(payload.limiteAfiliadas || 0);
  const valorFuturoCentavos = Number(payload.valorFuturoCentavos || 0);
  const statusComercial = String(payload.statusComercial || "SEM_COBRANCA").toUpperCase();
  const testeInicio = optionalDate(payload.testeInicio);
  const testeFim = optionalDate(payload.testeFim);
  if (!redeId) return { error: "Rede obrigatória." } as const;
  if (!Number.isInteger(limiteAfiliadas) || limiteAfiliadas < 0 || limiteAfiliadas > 10000) {
    return { error: "Limite de afiliadas inválido." } as const;
  }
  if (!Number.isInteger(valorFuturoCentavos) || valorFuturoCentavos < 0) {
    return { error: "Valor futuro inválido." } as const;
  }
  if (!COMMERCIAL_STATUSES.has(statusComercial)) {
    return { error: "Status comercial inválido." } as const;
  }
  return {
    redeId,
    planoId,
    limiteAfiliadas,
    valorFuturoCentavos,
    statusComercial,
    isenta: payload.isenta === true,
    testeInicio,
    testeFim,
  } as const;
}

export function parseNetworkPlan(payload: Record<string, unknown>) {
  const nome = String(payload.nome || "").trim().slice(0, 80);
  const slug = slugify(String(payload.slug || nome));
  const limiteAfiliadas = Number(payload.limiteAfiliadas || 0);
  const valorFuturoCentavos = Number(payload.valorFuturoCentavos || 0);
  if (nome.length < 2) return { error: "Informe o nome do plano." } as const;
  if (!slug) return { error: "Informe um identificador válido." } as const;
  if (!Number.isInteger(limiteAfiliadas) || limiteAfiliadas < 0 || limiteAfiliadas > 10000) {
    return { error: "Limite de afiliadas inválido." } as const;
  }
  if (!Number.isInteger(valorFuturoCentavos) || valorFuturoCentavos < 0) {
    return { error: "Valor futuro inválido." } as const;
  }
  return { nome, slug, limiteAfiliadas, valorFuturoCentavos } as const;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalPositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return positiveInteger(value);
}

function optionalDate(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
