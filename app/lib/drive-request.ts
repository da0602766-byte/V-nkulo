/** Retry only safe reads; never automatically replay an upload. */
export async function driveRead(url: URL | string, init: RequestInit) {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }); }
    catch (error) {
      if (attempt >= 2) throw error;
      await pause(attempt);
      continue;
    }
    let limited = response.status === 429;
    if (response.status === 403) {
      const details = await response.clone().json().catch(() => null) as { error?: { errors?: Array<{ reason: string }> } } | null;
      limited = Boolean(details?.error?.errors?.some(e => ['rateLimitExceeded', 'userRateLimitExceeded'].includes(e.reason)));
    }
    if ((!limited && ![500, 502, 503, 504].includes(response.status)) || attempt >= 2) return response;
    const header = response.headers.get('retry-after');
    const seconds = header ? Number(header) : NaN;
    const retryMs = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : 0;
    // Respect longer server cooldowns by returning the partial-load error for a later retry.
    if (retryMs > 2000) return response;
    await response.body?.cancel();
    await pause(attempt, Math.max(0, retryMs || 0));
  }
}
async function pause(attempt: number, retryMs = 0) {
  await new Promise(resolve => setTimeout(resolve, Math.max(retryMs, Math.min(2000, 250 * 2 ** attempt + Math.random() * 100))));
}
