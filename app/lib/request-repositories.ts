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

export async function routeRequestToRepository(
  db: D1Database,
  input: { communityId: number; requestId: number; requestType: RequestRepositoryType; forwardedBy: number },
) {
  await ensureRequestRepositorySuggestions(db, input.communityId);
  await db.prepare(
    `UPDATE solicitacao_repositorios
     SET status = 'ATIVO', confirmado_por = COALESCE(confirmado_por, ?),
       confirmado_em = COALESCE(confirmado_em, CURRENT_TIMESTAMP), atualizado_em = CURRENT_TIMESTAMP
     WHERE comunidade_id = ? AND tipo = ?`,
  ).bind(input.forwardedBy, input.communityId, input.requestType).run();
  const repository = await db.prepare(
    `SELECT id FROM solicitacao_repositorios
     WHERE comunidade_id = ? AND tipo = ? AND status = 'ATIVO' LIMIT 1`,
  ).bind(input.communityId, input.requestType).first<{ id: number }>();
  if (!repository) throw new Error("Repositório do pedido não foi encontrado.");
  await db.prepare(
    `INSERT OR IGNORE INTO solicitacao_repositorio_itens
     (repositorio_id, comunidade_id, solicitacao_id, encaminhado_por)
     VALUES (?, ?, ?, ?)`,
  ).bind(repository.id, input.communityId, input.requestId, input.forwardedBy).run();
  return repository.id;
}

export function normalizeWhatsappNumber(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }
  return "";
}
