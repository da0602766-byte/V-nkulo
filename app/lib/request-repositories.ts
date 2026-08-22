import { getD1 } from "../../db";

type D1Database = ReturnType<typeof getD1>;

export const REQUEST_REPOSITORY_TYPES = ["ORACAO", "VISITA"] as const;
export type RequestRepositoryType = (typeof REQUEST_REPOSITORY_TYPES)[number];

const REPOSITORY_NAMES: Record<RequestRepositoryType, string> = {
  ORACAO: "Repositório de orações",
  VISITA: "Repositório de visitas",
};

export async function ensureRequestRepositorySuggestions(
  db: D1Database,
  communityId: number,
) {
  for (const type of REQUEST_REPOSITORY_TYPES) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO solicitacao_repositorios
        (comunidade_id, tipo, nome, status)
        VALUES (?, ?, ?, 'SUGERIDO')`,
      )
      .bind(communityId, type, REPOSITORY_NAMES[type])
      .run();
  }
}

export function normalizeWhatsappNumber(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }
  return "";
}
