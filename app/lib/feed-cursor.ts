export const FEED_PAGE_SIZE = 10;
export const FEED_MAX_PAGE_SIZE = 20;

export type FeedCursor = {
  criadoEm: string;
  id: number;
};

export function encodeFeedCursor(cursor: FeedCursor) {
  return Buffer.from(
    JSON.stringify({ criadoEm: cursor.criadoEm, id: cursor.id }),
    "utf8",
  ).toString("base64url");
}

export function decodeFeedCursor(value: string | null): FeedCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<FeedCursor>;
    if (
      typeof decoded.criadoEm !== "string" ||
      !decoded.criadoEm ||
      !Number.isSafeInteger(decoded.id) ||
      Number(decoded.id) <= 0
    ) {
      return null;
    }
    return { criadoEm: decoded.criadoEm, id: Number(decoded.id) };
  } catch {
    return null;
  }
}

export function normalizeFeedLimit(value: string | number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return FEED_PAGE_SIZE;
  return Math.max(1, Math.min(Math.trunc(parsed), FEED_MAX_PAGE_SIZE));
}

export function pageFeedRows<T extends { id: number; criado_em: string }>(
  rows: T[],
  limit: number,
) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeFeedCursor({ criadoEm: last.criado_em, id: last.id })
        : null,
  };
}
