import { getD1 } from "../../db";

type Database = ReturnType<typeof getD1>;

export type CategoryAgeRule = {
  migracaoAutomatica: boolean;
  idadeMinima: number | null;
  idadeMaxima: number | null;
};

type StoredRule = {
  id: number;
  nome: string;
  idade_minima: number | null;
  idade_maxima: number | null;
};

export function parseCategoryAgeRule(body: Record<string, unknown>):
  | { rule: CategoryAgeRule }
  | { error: string } {
  const migracaoAutomatica = [true, 1, "1", "true", "on"].includes(
    body.migracaoAutomatica as never,
  );
  const idadeMinima = optionalAge(body.idadeMinima);
  const idadeMaxima = optionalAge(body.idadeMaxima);
  if (idadeMinima === "invalid" || idadeMaxima === "invalid") {
    return { error: "As idades devem ficar entre 0 e 130 anos." };
  }
  if (migracaoAutomatica && idadeMinima === null && idadeMaxima === null) {
    return { error: "Informe ao menos uma idade para ativar a classificação automática." };
  }
  if (idadeMinima !== null && idadeMaxima !== null && idadeMinima > idadeMaxima) {
    return { error: "A idade mínima não pode ser maior que a idade máxima." };
  }
  return {
    rule: {
      migracaoAutomatica,
      idadeMinima: migracaoAutomatica ? idadeMinima : null,
      idadeMaxima: migracaoAutomatica ? idadeMaxima : null,
    },
  };
}

export async function findOverlappingAgeRule(
  db: Database,
  communityId: number,
  rule: CategoryAgeRule,
  excludeCategoryId?: number,
) {
  if (!rule.migracaoAutomatica) return null;
  const minimum = rule.idadeMinima ?? 0;
  const maximum = rule.idadeMaxima ?? 130;
  return db
    .prepare(
      `SELECT id, nome FROM visitante_categorias
       WHERE comunidade_id = ? AND ativa = 1 AND migracao_automatica = 1
         AND id != ?
         AND COALESCE(idade_minima, 0) <= ?
         AND COALESCE(idade_maxima, 130) >= ?
       LIMIT 1`,
    )
    .bind(communityId, excludeCategoryId || 0, maximum, minimum)
    .first<{ id: number; nome: string }>();
}

export async function resolveAutomaticVisitorCategory(
  db: Database,
  communityId: number,
  birthDate: string | null,
) {
  const age = calculateAge(birthDate);
  if (age === null) return null;
  const result = await db
    .prepare(
      `SELECT id, nome, idade_minima, idade_maxima
       FROM visitante_categorias
       WHERE comunidade_id = ? AND ativa = 1 AND migracao_automatica = 1
         AND COALESCE(idade_minima, 0) <= ?
         AND COALESCE(idade_maxima, 130) >= ?
       ORDER BY ordem ASC, id ASC
       LIMIT 1`,
    )
    .bind(communityId, age, age)
    .first<StoredRule>();
  return result ? { id: Number(result.id), nome: result.nome, age } : null;
}

export async function migrateVisitorAgeCategories(
  db: Database,
  communityId: number,
) {
  const [categoryResult, visitorResult] = await Promise.all([
    db
      .prepare(
        `SELECT id, nome, idade_minima, idade_maxima
         FROM visitante_categorias
         WHERE comunidade_id = ? AND ativa = 1 AND migracao_automatica = 1
         ORDER BY ordem ASC, id ASC`,
      )
      .bind(communityId)
      .all<StoredRule>(),
    db
      .prepare(
        `SELECT id, data_nascimento, categoria_id
         FROM visitantes
         WHERE comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1
           AND data_nascimento IS NOT NULL
         LIMIT 5000`,
      )
      .bind(communityId)
      .all<{ id: number; data_nascimento: string; categoria_id: number | null }>(),
  ]);
  if (!categoryResult.results.length || !visitorResult.results.length) return 0;
  const updates = visitorResult.results.flatMap((visitor) => {
    const age = calculateAge(visitor.data_nascimento);
    if (age === null) return [];
    const match = categoryResult.results.find(
      (rule) => age >= (rule.idade_minima ?? 0) && age <= (rule.idade_maxima ?? 130),
    );
    if (!match || Number(visitor.categoria_id || 0) === Number(match.id)) return [];
    return [
      db
        .prepare(
          `UPDATE visitantes SET categoria_id = ?, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1`,
        )
        .bind(match.id, visitor.id, communityId),
    ];
  });
  for (let index = 0; index < updates.length; index += 100) {
    await db.batch(updates.slice(index, index + 100));
  }
  return updates.length;
}

export function calculateAge(value: string | null, now = new Date()) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  let age = now.getUTCFullYear() - year;
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day)) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}

function optionalAge(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 130
    ? number
    : "invalid";
}
