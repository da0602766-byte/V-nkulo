import type { getD1 } from "../../db";

type D1Database = ReturnType<typeof getD1>;

export type PromotionScope = "COMUNIDADE" | "MINISTERIO";

export type PromotionNotice = {
  id: number;
  escopo: PromotionScope;
  contexto: string;
  papelAnterior: string;
  papelNovo: string;
  titulo: string;
  destaques: string[];
  promovidoPorNome: string;
  criadoEm: string;
};

export type IntroductionKind = "PLATAFORMA" | "COMUNIDADE";

export type IntroductionState = {
  plataforma: boolean;
  comunidade: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  MEMBRO: "Membro",
  LIDER: "Líder",
  COLIDER: "Colíder",
  PASTOR: "Pastor",
  SECRETARIO: "Secretário",
  ADMIN: "Administrador",
  ADMINISTRADOR: "Administrador",
  VOLUNTARIO: "Voluntário",
  DIACONO: "Diácono",
  COORDENADOR: "Coordenador",
};

// A hierarquia decide o que conta como promoção: só avisamos quando a pessoa
// sobe de posição. Rebaixamentos e trocas laterais não geram comemoração.
const ROLE_WEIGHT: Record<string, number> = {
  MEMBRO: 1,
  VOLUNTARIO: 1,
  DIACONO: 2,
  COORDENADOR: 3,
  COLIDER: 3,
  SECRETARIO: 4,
  LIDER: 5,
  PASTOR: 6,
  ADMIN: 7,
  ADMINISTRADOR: 7,
};

export function roleLabel(role: string) {
  const key = String(role || "").toUpperCase();
  return ROLE_LABELS[key] || key.charAt(0) + key.slice(1).toLowerCase();
}

export function isPromotion(previousRole: string, nextRole: string) {
  const previous = ROLE_WEIGHT[String(previousRole || "").toUpperCase()] ?? 1;
  const next = ROLE_WEIGHT[String(nextRole || "").toUpperCase()] ?? 1;
  return next > previous;
}

export function promotionTitle(
  scope: PromotionScope,
  role: string,
  context: string,
) {
  const label = roleLabel(role);
  if (scope === "MINISTERIO" && context) return `${label} do ${context}`;
  if (context) return `${label} · ${context}`;
  return label;
}

export function promotionHighlights(
  scope: PromotionScope,
  role: string,
  context: string,
) {
  if (scope === "MINISTERIO") {
    return [
      `Acesso ao painel de escalas ${context ? `do ${context}` : "do ministério"}`,
      "Pode criar escalas e aprovar confirmações da equipe",
      "Novo selo de liderança visível no seu perfil",
    ];
  }
  return [
    `Novas permissões de ${roleLabel(role).toLowerCase()} nesta comunidade`,
    "Acesso às áreas liberadas para a sua nova função",
    "Novo selo visível para as pessoas da comunidade",
  ];
}

export async function recordPromotionNotice(
  db: D1Database,
  input: {
    comunidadeId: number;
    usuarioId: number;
    escopo: PromotionScope;
    contexto?: string;
    papelAnterior: string;
    papelNovo: string;
    promovidoPor: number;
  },
) {
  const contexto = input.contexto || "";
  if (!isPromotion(input.papelAnterior, input.papelNovo)) return;
  // A própria pessoa se promovendo (ex.: dona da comunidade se atribuindo um
  // ministério) não precisa de aviso comemorativo.
  if (input.promovidoPor === input.usuarioId) return;
  await db
    .prepare(
      `INSERT INTO avisos_promocao
       (comunidade_id, usuario_id, escopo, contexto, papel_anterior,
        papel_novo, titulo, destaques, promovido_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.comunidadeId,
      input.usuarioId,
      input.escopo,
      contexto,
      input.papelAnterior,
      input.papelNovo,
      promotionTitle(input.escopo, input.papelNovo, contexto),
      JSON.stringify(promotionHighlights(input.escopo, input.papelNovo, contexto)),
      input.promovidoPor,
    )
    .run();
}

export async function getPendingPromotionNotice(
  db: D1Database,
  comunidadeId: number,
  usuarioId: number,
): Promise<PromotionNotice | null> {
  const row = await db
    .prepare(
      `SELECT a.id, a.escopo, a.contexto, a.papel_anterior, a.papel_novo,
        a.titulo, a.destaques, a.criado_em,
        COALESCE(u.nome, '') AS promovido_por_nome
       FROM avisos_promocao a
       LEFT JOIN usuarios u ON u.id = a.promovido_por
       WHERE a.usuario_id = ? AND a.comunidade_id = ? AND a.visto_em IS NULL
       ORDER BY a.id DESC
       LIMIT 1`,
    )
    .bind(usuarioId, comunidadeId)
    .first<{
      id: number;
      escopo: string;
      contexto: string;
      papel_anterior: string;
      papel_novo: string;
      titulo: string;
      destaques: string;
      criado_em: string;
      promovido_por_nome: string;
    }>();
  if (!row) return null;
  let destaques: string[] = [];
  try {
    const parsed = JSON.parse(row.destaques || "[]");
    if (Array.isArray(parsed)) {
      destaques = parsed.map((item) => String(item)).slice(0, 6);
    }
  } catch {
    destaques = [];
  }
  return {
    id: Number(row.id),
    escopo: row.escopo === "MINISTERIO" ? "MINISTERIO" : "COMUNIDADE",
    contexto: row.contexto || "",
    papelAnterior: row.papel_anterior || "",
    papelNovo: row.papel_novo || "",
    titulo: row.titulo || roleLabel(row.papel_novo || ""),
    destaques,
    promovidoPorNome: row.promovido_por_nome || "",
    criadoEm: row.criado_em || "",
  };
}

export async function markPromotionNoticeSeen(
  db: D1Database,
  noticeId: number,
  usuarioId: number,
) {
  await db
    .prepare(
      `UPDATE avisos_promocao
       SET visto_em = CURRENT_TIMESTAMP
       WHERE id = ? AND usuario_id = ? AND visto_em IS NULL`,
    )
    .bind(noticeId, usuarioId)
    .run();
}

export async function getIntroductionState(
  db: D1Database,
  usuarioId: number,
  comunidadeId: number,
): Promise<IntroductionState> {
  const rows = await db
    .prepare(
      `SELECT tipo FROM usuario_introducoes
       WHERE usuario_id = ?
         AND ((tipo = 'PLATAFORMA' AND comunidade_id = 0)
           OR (tipo = 'COMUNIDADE' AND comunidade_id = ?))`,
    )
    .bind(usuarioId, comunidadeId)
    .all<{ tipo: string }>();
  const seen = new Set((rows.results || []).map((row) => String(row.tipo)));
  return {
    plataforma: seen.has("PLATAFORMA"),
    comunidade: seen.has("COMUNIDADE"),
  };
}

export async function markIntroductionSeen(
  db: D1Database,
  input: {
    usuarioId: number;
    comunidadeId: number;
    tipo: IntroductionKind;
    pulada: boolean;
    etapa: number;
  },
) {
  const scopeId = input.tipo === "PLATAFORMA" ? 0 : input.comunidadeId;
  await db
    .prepare(
      `INSERT INTO usuario_introducoes
       (usuario_id, comunidade_id, tipo, status, etapa)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(usuario_id, tipo, comunidade_id) DO UPDATE SET
         status = excluded.status,
         etapa = excluded.etapa,
         registrado_em = CURRENT_TIMESTAMP`,
    )
    .bind(
      input.usuarioId,
      scopeId,
      input.tipo,
      input.pulada ? "PULADA" : "CONCLUIDA",
      Math.max(0, Math.trunc(input.etapa) || 0),
    )
    .run();
}
