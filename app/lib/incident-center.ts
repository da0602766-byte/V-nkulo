import type { getD1 } from "../../db";

// Central de incidentes da plataforma.
//
// Objetivo central: o mesmo problema, acontecendo mil vezes, precisa virar UM
// incidente com contador — nunca mil incidentes. Para isso cada registro passa
// por uma normalização determinística do título (remove números, ids, UUIDs,
// datas, caminhos e aspas) e por um fingerprint estável (`chave_agrupamento`).
// Quem já existe é incrementado; quem estava resolvido é reaberto como
// recorrência.

export type IncidentDatabase = ReturnType<typeof getD1>;

// O núcleo puro (conjuntos fechados, normalização de título, fingerprint de
// agrupamento e prioridade) vive em incident-grouping.mjs (nome distinto para o bundler não
// confundir os dois módulos) para poder ser
// importado direto pelos testes, seguindo a convenção de tenant-policy.mjs.
// Este módulo acrescenta os tipos e a parte que fala com o banco.
export {
  AREAS_INCIDENTE,
  GRAVIDADES_INCIDENTE,
  STATUS_INCIDENTE,
  rotularIncidente,
  normalizarArea,
  normalizarGravidade,
  normalizarStatus,
  gravidadeMaisSevera,
  normalizarTituloIncidente,
  calcularChaveAgrupamento,
  classificarPrioridade,
} from "./incident-grouping.mjs";

import {
  calcularChaveAgrupamento,
  classificarPrioridade,
  gravidadeMaisSevera as gravidadeMaisSeveraPura,
  normalizarArea,
  normalizarGravidade as normalizarGravidadePura,
  normalizarStatus as normalizarStatusPura,
} from "./incident-grouping.mjs";

// Reexpõe os normalizadores puros com o tipo estreito do conjunto fechado:
// em .mjs eles devolvem string, e aqui o resto do módulo depende da união.
const normalizarGravidade = (valor: unknown) =>
  normalizarGravidadePura(valor) as GravidadeIncidente;
const normalizarStatus = (valor: unknown) =>
  normalizarStatusPura(valor) as StatusIncidente;
const gravidadeMaisSevera = (a: unknown, b: unknown) =>
  gravidadeMaisSeveraPura(a, b) as GravidadeIncidente;

export type AreaIncidente =
  | "MODULO" | "COMUNIDADE" | "INTEGRACAO" | "BANCO"
  | "AUTENTICACAO" | "PUBLICACAO" | "VERSAO" | "DESEMPENHO";
export type GravidadeIncidente = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
export type StatusIncidente =
  | "ABERTO" | "EM_ANALISE" | "MITIGADO" | "RESOLVIDO" | "IGNORADO";

export type RegistroIncidente = {
  area?: unknown;
  modulo?: unknown;
  titulo: string;
  descricao?: unknown;
  gravidade?: unknown;
  comunidadeId?: number | null;
  usuarioId?: number | null;
  detalhe?: unknown;
  contexto?: unknown;
};

export type ResultadoRegistro = {
  id: number;
  chaveAgrupamento: string;
  novo: boolean;
  reaberto: boolean;
  ocorrencias: number;
  comunidadesAfetadas: number;
  gravidade: GravidadeIncidente;
  prioridade: number;
};

const limpar = (valor: unknown, maximo: number) =>
  String(valor ?? "").trim().slice(0, maximo);

const identificador = (valor: unknown): number | null => {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
};

const serializarContexto = (valor: unknown): string => {
  if (valor === undefined || valor === null) return "{}";
  try {
    const texto =
      typeof valor === "string" ? valor : JSON.stringify(valor) || "{}";
    return texto.slice(0, 4000);
  } catch {
    return "{}";
  }
};

type LinhaIncidente = {
  id: number;
  chave_agrupamento: string;
  status: string;
  gravidade: string;
  ocorrencias: number;
  comunidades_afetadas: number;
};

/**
 * Registra uma ocorrência de problema. Agrupa por fingerprint: se o incidente
 * já existe, incrementa o contador em vez de criar outro. Sempre grava uma
 * linha em `incidente_ocorrencias` para preservar o histórico.
 */
export async function registrarIncidente(
  db: IncidentDatabase,
  entrada: RegistroIncidente,
): Promise<ResultadoRegistro> {
  const titulo = limpar(entrada.titulo, 200);
  if (titulo.length < 3) {
    throw new Error("Informe um título para o incidente.");
  }
  const area = normalizarArea(entrada.area);
  const modulo = limpar(entrada.modulo, 80);
  const gravidadeInformada = normalizarGravidade(entrada.gravidade);
  const descricao = limpar(entrada.descricao, 2000);
  const comunidadeId = identificador(entrada.comunidadeId);
  const usuarioId = identificador(entrada.usuarioId);
  const detalhe = limpar(entrada.detalhe, 1000);
  const contexto = serializarContexto(entrada.contexto);
  const chave = calcularChaveAgrupamento({ area, modulo, titulo });

  const existente = await db
    .prepare(
      `SELECT id, chave_agrupamento, status, gravidade, ocorrencias, comunidades_afetadas
       FROM incidentes_plataforma WHERE chave_agrupamento = ? LIMIT 1`,
    )
    .bind(chave)
    .first<LinhaIncidente>();

  let incidenteId: number;
  let novo = false;
  let reaberto = false;
  let gravidade = gravidadeInformada;
  let ocorrencias = 1;

  if (existente) {
    incidenteId = existente.id;
    const statusAtual = normalizarStatus(existente.status);
    reaberto = statusAtual === "RESOLVIDO" || statusAtual === "IGNORADO";
    gravidade = gravidadeMaisSevera(
      normalizarGravidade(existente.gravidade),
      gravidadeInformada,
    );
    ocorrencias = Math.max(0, Number(existente.ocorrencias) || 0) + 1;
  } else {
    const criado = await db
      .prepare(
        `INSERT INTO incidentes_plataforma
           (chave_agrupamento, titulo, descricao, area, modulo, gravidade, status,
            prioridade, ocorrencias, comunidades_afetadas,
            primeira_ocorrencia, ultima_ocorrencia)
         VALUES (?, ?, ?, ?, ?, ?, 'ABERTO', ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(
        chave,
        titulo,
        descricao,
        area,
        modulo,
        gravidade,
        classificarPrioridade({
          gravidade,
          ocorrencias: 1,
          comunidadesAfetadas: comunidadeId ? 1 : 0,
        }),
      )
      .run();
    incidenteId = Number(criado.meta.last_row_id);
    novo = true;
  }

  // O histórico é sempre gravado, inclusive na primeira vez.
  await db
    .prepare(
      `INSERT INTO incidente_ocorrencias
         (incidente_id, comunidade_id, usuario_id, detalhe, contexto)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(incidenteId, comunidadeId, usuarioId, detalhe, contexto)
    .run();

  const alcance = await db
    .prepare(
      `SELECT COUNT(DISTINCT comunidade_id) AS total
       FROM incidente_ocorrencias
       WHERE incidente_id = ? AND comunidade_id IS NOT NULL`,
    )
    .bind(incidenteId)
    .first<{ total: number }>();
  const comunidadesAfetadas = Math.max(0, Number(alcance?.total) || 0);

  const prioridade = classificarPrioridade({
    gravidade,
    ocorrencias,
    comunidadesAfetadas,
  });

  if (novo) {
    await db
      .prepare(
        `UPDATE incidentes_plataforma
         SET comunidades_afetadas = ?, prioridade = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(comunidadesAfetadas, prioridade, incidenteId)
      .run();
  } else {
    // Recorrência: contador sobe, janela de tempo se estende e um incidente já
    // resolvido volta para ABERTO (limpando a resolução anterior).
    await db
      .prepare(
        `UPDATE incidentes_plataforma
         SET ocorrencias = ?,
             comunidades_afetadas = ?,
             gravidade = ?,
             prioridade = ?,
             status = CASE WHEN status IN ('RESOLVIDO', 'IGNORADO') THEN 'ABERTO' ELSE status END,
             resolucao = CASE WHEN status IN ('RESOLVIDO', 'IGNORADO') THEN '' ELSE resolucao END,
             resolvido_por = CASE WHEN status IN ('RESOLVIDO', 'IGNORADO') THEN NULL ELSE resolvido_por END,
             resolvido_em = CASE WHEN status IN ('RESOLVIDO', 'IGNORADO') THEN NULL ELSE resolvido_em END,
             descricao = CASE WHEN descricao = '' THEN ? ELSE descricao END,
             ultima_ocorrencia = CURRENT_TIMESTAMP,
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        ocorrencias,
        comunidadesAfetadas,
        gravidade,
        prioridade,
        descricao,
        incidenteId,
      )
      .run();
  }

  return {
    id: incidenteId,
    chaveAgrupamento: chave,
    novo,
    reaberto,
    ocorrencias,
    comunidadesAfetadas,
    gravidade,
    prioridade,
  };
}
