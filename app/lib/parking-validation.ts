const VEHICLE_TYPES = new Set(["CARRO", "MOTO", "VAN", "ONIBUS", "OUTRO"]);
const LINKS = new Set(["MEMBRO", "VISITANTE", "VOLUNTARIO", "EQUIPE"]);
const OCCURRENCE_TYPES = new Set([
  "SEGURANCA",
  "DANO",
  "BLOQUEIO",
  "ORIENTACAO",
  "OUTRO",
]);
const SEVERITIES = new Set(["BAIXA", "MEDIA", "ALTA"]);

export function parseParkingEntry(payload: Record<string, unknown>) {
  const placa = String(payload.placa || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
  const responsavel = String(payload.responsavel || "").trim().slice(0, 120);
  const tipoVeiculo = String(payload.tipoVeiculo || "CARRO").toUpperCase();
  const vinculo = String(payload.vinculo || "VISITANTE").toUpperCase();
  const vagaId = Number(payload.vagaId);
  const observacoes = String(payload.observacoes || "").trim().slice(0, 600);
  if (placa.length < 4) return { error: "Informe uma placa válida." } as const;
  if (responsavel.length < 2) {
    return { error: "Informe o responsável pelo veículo." } as const;
  }
  if (!VEHICLE_TYPES.has(tipoVeiculo)) {
    return { error: "Tipo de veículo inválido." } as const;
  }
  if (!LINKS.has(vinculo)) return { error: "Vínculo inválido." } as const;
  if (!Number.isInteger(vagaId) || vagaId <= 0) {
    return { error: "Selecione uma vaga disponível." } as const;
  }
  return {
    placa,
    responsavel,
    tipoVeiculo,
    vinculo,
    vagaId,
    observacoes,
  } as const;
}

export function parseParkingOccurrence(payload: Record<string, unknown>) {
  const tipo = String(payload.tipo || "OUTRO").toUpperCase();
  const gravidade = String(payload.gravidade || "BAIXA").toUpperCase();
  const descricao = String(payload.descricao || "").trim().slice(0, 1200);
  const movimentacaoId = Number(payload.movimentacaoId || 0);
  if (!OCCURRENCE_TYPES.has(tipo)) {
    return { error: "Tipo de ocorrência inválido." } as const;
  }
  if (!SEVERITIES.has(gravidade)) {
    return { error: "Gravidade inválida." } as const;
  }
  if (descricao.length < 8) {
    return { error: "Descreva a ocorrência com mais detalhes." } as const;
  }
  return {
    tipo,
    gravidade,
    descricao,
    movimentacaoId:
      Number.isInteger(movimentacaoId) && movimentacaoId > 0
        ? movimentacaoId
        : null,
  } as const;
}

export function parseParkingConfig(payload: Record<string, unknown>) {
  const nomeModulo = String(payload.nomeModulo || "Estacionamento")
    .trim()
    .slice(0, 50);
  const corDestaque = String(payload.corDestaque || "#d99a32").trim();
  if (nomeModulo.length < 3) {
    return { error: "Informe um nome para o módulo." } as const;
  }
  if (!/^#[0-9a-f]{6}$/i.test(corDestaque)) {
    return { error: "Cor de destaque inválida." } as const;
  }
  return {
    ativo: payload.ativo === true,
    nomeModulo,
    corDestaque,
    responsavelUsuarioId: positiveIntegerOrNull(payload.responsavelUsuarioId),
    instrucoes: String(payload.instrucoes || "").trim().slice(0, 600),
  } as const;
}

export function parseParkingSector(payload: Record<string, unknown>) {
  const nome = String(payload.nome || "").trim().slice(0, 40);
  const cor = String(payload.cor || "#3b82f6").trim();
  const ordem = Number(payload.ordem || 0);
  if (nome.length < 2) return { error: "Informe o nome do setor." } as const;
  if (!/^#[0-9a-f]{6}$/i.test(cor)) {
    return { error: "Cor do setor inválida." } as const;
  }
  if (!Number.isInteger(ordem) || ordem < 0 || ordem > 99) {
    return { error: "Posição do setor inválida." } as const;
  }
  return { nome, cor, ordem } as const;
}

export function parseParkingSpaces(payload: Record<string, unknown>) {
  const setorId = Number(payload.setorId);
  const prefixo = String(payload.prefixo || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
  const quantidade = Number(payload.quantidade);
  const tipo = String(payload.tipo || "COMUM").toUpperCase();
  if (!Number.isInteger(setorId) || setorId <= 0) {
    return { error: "Selecione um setor." } as const;
  }
  if (!prefixo) return { error: "Informe o prefixo das vagas." } as const;
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 40) {
    return { error: "Crie entre 1 e 40 vagas por vez." } as const;
  }
  if (!new Set(["COMUM", "RESERVADA", "IDOSO", "PCD"]).has(tipo)) {
    return { error: "Tipo de vaga inválido." } as const;
  }
  return { setorId, prefixo, quantidade, tipo } as const;
}

export function parseParkingHelper(payload: Record<string, unknown>) {
  const usuarioId = Number(payload.usuarioId);
  const escalaId = Number(payload.escalaId);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return { error: "Selecione uma pessoa da comunidade." } as const;
  }
  if (!Number.isInteger(escalaId) || escalaId <= 0) {
    return { error: "Nenhuma escala ativa foi encontrada." } as const;
  }
  return { usuarioId, escalaId } as const;
}

function positiveIntegerOrNull(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
