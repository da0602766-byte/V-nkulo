// Núcleo puro da central de incidentes: conjuntos fechados, normalização de
// título, fingerprint de agrupamento e prioridade de atendimento.
//
// Objetivo central: o mesmo problema, acontecendo mil vezes, precisa virar UM
// incidente com contador — nunca mil incidentes.
//
// Fica em .mjs (e não .ts) pela mesma razão que tenant-policy.mjs: são funções
// puras, e assim os testes em tests/ conseguem importá-las direto. A parte que
// fala com o banco vive em incident-center.ts, que reexporta tudo daqui.

export const AREAS_INCIDENTE = [
  "MODULO",
  "COMUNIDADE",
  "INTEGRACAO",
  "BANCO",
  "AUTENTICACAO",
  "PUBLICACAO",
  "VERSAO",
  "DESEMPENHO",
];

export const GRAVIDADES_INCIDENTE = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];

export const STATUS_INCIDENTE = [
  "ABERTO",
  "EM_ANALISE",
  "MITIGADO",
  "RESOLVIDO",
  "IGNORADO",
];

const ROTULOS_AREA = {
  MODULO: "Módulo",
  COMUNIDADE: "Comunidade",
  INTEGRACAO: "Integração",
  BANCO: "Banco de dados",
  AUTENTICACAO: "Autenticação",
  PUBLICACAO: "Publicação",
  VERSAO: "Versão",
  DESEMPENHO: "Desempenho",
};

const ROTULOS_GRAVIDADE = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  CRITICA: "Crítica",
};

const ROTULOS_STATUS = {
  ABERTO: "Aberto",
  EM_ANALISE: "Em análise",
  MITIGADO: "Mitigado",
  RESOLVIDO: "Resolvido",
  IGNORADO: "Ignorado",
};

/**
 * Rótulo em português para qualquer um dos conjuntos fechados.
 * @param {"area" | "gravidade" | "status"} tipo
 * @param {string} valor
 */
export function rotularIncidente(tipo, valor) {
  if (tipo === "area") return ROTULOS_AREA[normalizarArea(valor)];
  if (tipo === "gravidade") return ROTULOS_GRAVIDADE[normalizarGravidade(valor)];
  return ROTULOS_STATUS[normalizarStatus(valor)];
}

export function normalizarArea(valor) {
  const texto = String(valor ?? "").trim().toUpperCase();
  return AREAS_INCIDENTE.includes(texto) ? texto : "MODULO";
}

export function normalizarGravidade(valor) {
  const texto = String(valor ?? "").trim().toUpperCase();
  return GRAVIDADES_INCIDENTE.includes(texto) ? texto : "MEDIA";
}

export function normalizarStatus(valor) {
  const texto = String(valor ?? "").trim().toUpperCase();
  return STATUS_INCIDENTE.includes(texto) ? texto : "ABERTO";
}

const PESO_GRAVIDADE = { BAIXA: 0, MEDIA: 1, ALTA: 2, CRITICA: 3 };

/** Mantém a gravidade mais severa entre a registrada e a nova ocorrência. */
export function gravidadeMaisSevera(a, b) {
  return PESO_GRAVIDADE[normalizarGravidade(a)] >=
    PESO_GRAVIDADE[normalizarGravidade(b)]
    ? normalizarGravidade(a)
    : normalizarGravidade(b);
}

/**
 * Normaliza o título para agrupamento. Função PURA.
 *
 * Remove tudo que é volátil entre duas ocorrências do mesmo problema: UUIDs,
 * datas/horas, números, hashes hexadecimais, e-mails, trechos entre aspas,
 * acentos e pontuação. O que sobra é a "forma" do erro — duas mensagens como
 * `Falha ao publicar aviso 118 na comunidade 7` e
 * `Falha ao publicar aviso 902 na comunidade 31` colapsam no mesmo texto.
 * @param {unknown} titulo
 */
export function normalizarTituloIncidente(titulo) {
  const base = String(titulo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return base
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g,
      " ",
    )
    .replace(/\b\d{4}-\d{2}-\d{2}([t ]\d{2}:\d{2}(:\d{2})?(\.\d+)?z?)?\b/g, " ")
    .replace(/\b\d{2}:\d{2}(:\d{2})?\b/g, " ")
    .replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, " ")
    .replace(/\b0x[0-9a-f]+\b/g, " ")
    .replace(/\b[0-9a-f]{12,}\b/g, " ")
    .replace(/["'`“”‘’][^"'`“”‘’]*["'`“”‘’]/g, " ")
    .replace(/\b[\w.-]+@[\w.-]+\b/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hash FNV-1a de 32 bits em hexadecimal. Determinístico e sem dependências. */
function fnv1a(texto) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < texto.length; index += 1) {
    hash ^= texto.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Fingerprint determinístico do incidente. Função PURA.
 * Mesma área + mesmo módulo + mesmo título normalizado ⇒ mesma chave.
 */
export function calcularChaveAgrupamento(entrada = {}) {
  const area = normalizarArea(entrada.area);
  const modulo =
    normalizarTituloIncidente(entrada.modulo).replace(/\s+/g, "-") || "geral";
  const titulo = normalizarTituloIncidente(entrada.titulo);
  const assinatura = `${area}|${modulo}|${titulo}`;
  return `${area.toLowerCase()}:${modulo}:${fnv1a(assinatura)}`.slice(0, 160);
}

/**
 * Prioridade de atendimento (1 = atender agora … 5 = pode esperar).
 *
 * HEURÍSTICA, não métrica exata: combina gravidade (base), volume de
 * ocorrências e alcance (quantas comunidades sentiram o problema). Serve para
 * ordenar a fila do proprietário, não para prometer prazo de atendimento. Um
 * problema "médio" que atinge muitas comunidades sobe; um problema "alto"
 * isolado e raro desce um degrau. O resultado é sempre truncado em 1..5.
 */
export function classificarPrioridade(entrada = {}) {
  const gravidade = normalizarGravidade(entrada.gravidade);
  const ocorrencias = Math.max(0, Math.trunc(Number(entrada.ocorrencias) || 0));
  const comunidades = Math.max(
    0,
    Math.trunc(Number(entrada.comunidadesAfetadas) || 0),
  );

  // Base pela gravidade declarada.
  let prioridade = { CRITICA: 1, ALTA: 2, MEDIA: 3, BAIXA: 4 }[gravidade];

  // Volume: repetição insistente antecipa o atendimento.
  if (ocorrencias >= 50) prioridade -= 2;
  else if (ocorrencias >= 10) prioridade -= 1;

  // Alcance: quanto mais comunidades sentem, mais cedo entra na fila.
  if (comunidades >= 10) prioridade -= 2;
  else if (comunidades >= 3) prioridade -= 1;

  // Isolado e raro: pode esperar um degrau.
  if (ocorrencias <= 1 && comunidades <= 1 && gravidade !== "CRITICA") {
    prioridade += 1;
  }

  return Math.min(5, Math.max(1, prioridade));
}
