import type { getD1 } from "../../db";
import { hasScheduleConflict } from "./ministry-access";

type D1Database = ReturnType<typeof getD1>;

export type ScheduleSubstitutionCandidate = {
  voluntarioId: number;
  usuarioId: number;
  nome: string;
  funcao: string;
  fotoPerfil: string | null;
};

export async function listScheduleSubstitutionCandidates(
  db: D1Database,
  {
    comunidadeId,
    escalaId,
    usuarioAtualId,
  }: {
    comunidadeId: number;
    escalaId: number;
    usuarioAtualId: number;
  },
): Promise<ScheduleSubstitutionCandidate[]> {
  const candidates = await db
    .prepare(
      `SELECT mv.id AS voluntario_id, mv.usuario_id, u.nome, mv.funcao,
        u.foto_perfil
       FROM escalas_ministerio s
       JOIN ministerio_voluntarios mv
         ON mv.ministerio_id = s.ministerio_id
        AND mv.comunidade_id = s.comunidade_id
        AND mv.ativo = 1
       JOIN usuarios u ON u.id = mv.usuario_id AND u.ativo = 1
       JOIN usuario_comunidades uc
         ON uc.usuario_id = mv.usuario_id
        AND uc.comunidade_id = mv.comunidade_id
        AND uc.status = 'ATIVO'
       WHERE s.id = ? AND s.comunidade_id = ? AND s.status = 'PUBLICADA'
         AND mv.usuario_id != ?
         AND NOT EXISTS (
           SELECT 1 FROM escala_designacoes existing
           WHERE existing.escala_id = s.id
             AND existing.comunidade_id = s.comunidade_id
             AND existing.usuario_id = mv.usuario_id
             AND existing.ativo = 1
         )
       ORDER BY u.nome ASC
       LIMIT 100`,
    )
    .bind(escalaId, comunidadeId, usuarioAtualId)
    .all<{
      voluntario_id: number;
      usuario_id: number;
      nome: string;
      funcao: string;
      foto_perfil: string | null;
    }>();
  return candidates.results.map((candidate) => ({
    voluntarioId: Number(candidate.voluntario_id),
    usuarioId: Number(candidate.usuario_id),
    nome: String(candidate.nome),
    funcao: String(candidate.funcao),
    fotoPerfil: candidate.foto_perfil || null,
  }));
}

export async function assignScheduleSubstitute(
  db: D1Database,
  {
    comunidadeId,
    escalaId,
    designacaoOriginalId,
    usuarioOriginalId,
    substitutoVoluntarioId,
    statusOriginal,
  }: {
    comunidadeId: number;
    escalaId: number;
    designacaoOriginalId: number;
    usuarioOriginalId: number;
    substitutoVoluntarioId: number;
    statusOriginal: "INDISPONIVEL" | "SUBSTITUICAO_SOLICITADA";
  },
) {
  const original = await db
    .prepare(
      `SELECT d.id, d.funcao, s.inicia_em, s.termina_em
       FROM escala_designacoes d
       JOIN escalas_ministerio s
         ON s.id = d.escala_id AND s.comunidade_id = d.comunidade_id
       WHERE d.id = ? AND d.escala_id = ? AND d.comunidade_id = ?
         AND d.usuario_id = ? AND d.ativo = 1 AND d.status = 'PENDENTE'
         AND s.status = 'PUBLICADA'
       LIMIT 1`,
    )
    .bind(
      designacaoOriginalId,
      escalaId,
      comunidadeId,
      usuarioOriginalId,
    )
    .first<{
      id: number;
      funcao: string;
      inicia_em: string;
      termina_em: string;
    }>();
  if (!original) {
    return { error: "Esta designação não está mais disponível para resposta." } as const;
  }
  const candidate = (
    await listScheduleSubstitutionCandidates(db, {
      comunidadeId,
      escalaId,
      usuarioAtualId: usuarioOriginalId,
    })
  ).find((item) => item.voluntarioId === substitutoVoluntarioId);
  if (!candidate) {
    return {
      error: "Escolha uma pessoa ativa deste ministério que ainda não esteja na escala.",
    } as const;
  }
  if (
    await hasScheduleConflict(db, {
      comunidadeId,
      usuarioId: candidate.usuarioId,
      iniciaEm: original.inicia_em,
      terminaEm: original.termina_em,
      excludeScheduleId: escalaId,
    })
  ) {
    return {
      error: `${candidate.nome} possui conflito de horário com outra escala. Escolha outra pessoa.`,
    } as const;
  }
  const [replacementInsert, originalUpdate] = await db.batch([
    db
      .prepare(
        `INSERT INTO escala_designacoes
         (comunidade_id, escala_id, voluntario_id, usuario_id, funcao, status,
          ativo, resposta_em, atualizado_em)
         SELECT ?, ?, ?, ?, ?, 'PENDENTE', 1, NULL, CURRENT_TIMESTAMP
         FROM escala_designacoes original
         WHERE original.id = ? AND original.escala_id = ?
           AND original.comunidade_id = ? AND original.usuario_id = ?
           AND original.ativo = 1 AND original.status = 'PENDENTE'
         ON CONFLICT(escala_id, voluntario_id) DO UPDATE SET
           usuario_id = excluded.usuario_id,
           funcao = excluded.funcao,
           status = 'PENDENTE',
           ativo = 1,
           resposta_em = NULL,
           atualizado_em = CURRENT_TIMESTAMP`,
      )
      .bind(
        comunidadeId,
        escalaId,
        candidate.voluntarioId,
        candidate.usuarioId,
        original.funcao,
        designacaoOriginalId,
        escalaId,
        comunidadeId,
        usuarioOriginalId,
      ),
    db
      .prepare(
        `UPDATE escala_designacoes
         SET status = ?, resposta_em = CURRENT_TIMESTAMP,
           atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND escala_id = ? AND comunidade_id = ?
           AND usuario_id = ? AND ativo = 1 AND status = 'PENDENTE'`,
      )
      .bind(
        statusOriginal,
        designacaoOriginalId,
        escalaId,
        comunidadeId,
        usuarioOriginalId,
      ),
  ]);
  if (
    !Number(replacementInsert.meta.changes) ||
    !Number(originalUpdate.meta.changes)
  ) {
    return {
      error: "A escala foi alterada enquanto você escolhia. Atualize e tente novamente.",
    } as const;
  }
  const replacement = await db
    .prepare(
      `SELECT id FROM escala_designacoes
       WHERE escala_id = ? AND comunidade_id = ? AND voluntario_id = ?
       LIMIT 1`,
    )
    .bind(escalaId, comunidadeId, candidate.voluntarioId)
    .first<{ id: number }>();
  return {
    candidate,
    replacementAssignmentId: Number(replacement?.id || 0),
    replacementFunction: original.funcao,
  } as const;
}
