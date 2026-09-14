import type { getD1 } from "../../db";

type D1Database = ReturnType<typeof getD1>;

export type SecretaryScheduleDetail = Record<string, unknown> & {
  id: number;
  titulo: string;
  ministerio_nome: string;
  comunidade_nome: string;
  inicia_em: string;
  termina_em: string;
  local: string;
  status: string;
  observacoes: string;
  responsavel_nome: string | null;
  repertorio: string[];
  links_recursos: Array<{
    id: string;
    tipo: string;
    titulo: string;
    url: string;
  }>;
  equipes: Array<{
    equipe_id: number;
    equipe_nome: string;
    equipe_cor: string;
    funcao: string;
    ponto_encontro: string;
    horario_encontro: string;
  }>;
  designacoes: Array<Record<string, unknown>>;
  checklist: Array<Record<string, unknown>>;
};

export async function getSecretaryScheduleDetail(
  db: D1Database,
  scheduleId: number,
  communityId?: number,
) {
  const schedule = await db
    .prepare(
      `SELECT s.id, s.comunidade_id, s.ministerio_id, s.titulo,
        s.inicia_em, s.termina_em, s.local, s.status, s.observacoes,
        s.repertorio, s.links_recursos, s.share_token,
        m.nome AS ministerio_nome, c.nome AS comunidade_nome,
        responsavel.nome AS responsavel_nome
       FROM escalas_ministerio s
       JOIN ministerios_comunidade m
         ON m.id = s.ministerio_id
        AND m.comunidade_id = s.comunidade_id
       JOIN comunidades c ON c.id = s.comunidade_id
       LEFT JOIN usuarios responsavel ON responsavel.id = s.responsavel_usuario_id
       WHERE s.id = ? ${communityId ? "AND s.comunidade_id = ?" : ""}
       LIMIT 1`,
    )
    .bind(...(communityId ? [scheduleId, communityId] : [scheduleId]))
    .first<Record<string, unknown>>();
  if (!schedule) return null;
  const community = Number(schedule.comunidade_id);
  const assignments = await db
    .prepare(
      `SELECT d.id, d.usuario_id, u.nome, d.funcao, d.status,
        d.equipe_id, equipe.nome AS equipe_nome, equipe.cor AS equipe_cor
       FROM escala_designacoes d
       JOIN usuarios u ON u.id = d.usuario_id
       LEFT JOIN ministerio_equipes equipe
         ON equipe.id = d.equipe_id
        AND equipe.comunidade_id = d.comunidade_id
       WHERE d.escala_id = ? AND d.comunidade_id = ? AND d.ativo = 1
       ORDER BY equipe.ordem ASC, equipe.nome ASC, u.nome ASC`,
    )
    .bind(scheduleId, community)
    .all<Record<string, unknown>>();
  const checklist = await db
    .prepare(
      `SELECT ci.id, ci.designacao_id, ci.tarefa, ci.status, ci.observacao,
        u.nome AS responsavel_nome
       FROM ministerio_checklist_itens ci
       LEFT JOIN escala_designacoes d
         ON d.id = ci.designacao_id
        AND d.comunidade_id = ci.comunidade_id
       LEFT JOIN usuarios u ON u.id = d.usuario_id
       WHERE ci.escala_id = ? AND ci.comunidade_id = ?
       ORDER BY ci.id ASC`,
    )
    .bind(scheduleId, community)
    .all<Record<string, unknown>>();
  const teams = await db
    .prepare(
      `SELECT se.equipe_id, equipe.nome AS equipe_nome, equipe.cor AS equipe_cor,
        se.funcao, se.ponto_encontro, se.horario_encontro
       FROM escala_equipes se
       JOIN ministerio_equipes equipe
         ON equipe.id = se.equipe_id
        AND equipe.comunidade_id = se.comunidade_id
       WHERE se.escala_id = ? AND se.comunidade_id = ?
       ORDER BY equipe.ordem ASC, equipe.nome ASC`,
    )
    .bind(scheduleId, community)
    .all<SecretaryScheduleDetail["equipes"][number]>();
  return {
    ...schedule,
    repertorio: parseList(schedule.repertorio) as string[],
    links_recursos: parseList(schedule.links_recursos) as SecretaryScheduleDetail["links_recursos"],
    equipes: teams.results,
    designacoes: assignments.results,
    checklist: checklist.results,
  } as SecretaryScheduleDetail;
}

function parseList(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
