export function momentIsActive(post: { status: string; momento_expira_em?: string | null }, now: number) {
  if (post.status !== "PUBLICADA" || !post.momento_expira_em || !now) return false;
  const raw = post.momento_expira_em;
  const expires = Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw.replace(" ", "T") + "Z");
  return Number.isFinite(expires) && expires > now;
}
