export const MEDIA_FAILURE_EVENT = "vinkulo:media-failure";
export type MediaFailure = "DRIVE_RECONNECT" | "DRIVE_OWNER_RECONNECT";

/** Only our media endpoint can diagnose authorization; an image error alone cannot. */
export function createMediaFailureReporter(
  request: typeof fetch,
  notify: (failure: MediaFailure) => void,
) {
  const checked = new Set<string>();
  const announced = new Set<MediaFailure>();
  return async (source: string, origin: string) => {
    let url: URL;
    try { url = new URL(source, origin); } catch { return; }
    if (url.origin !== origin || !url.pathname.startsWith("/api/storage/media/") || checked.has(url.pathname)) return;
    // Bound requests per page session even when a feed contains many broken images.
    if (checked.size >= 32) return;
    checked.add(url.pathname);
    try {
      const response = await request(url.href, { method: "HEAD", cache: "no-store" });
      const failure = response.headers.get("X-Vinkulo-Media-Error");
      if ((failure === "DRIVE_RECONNECT" || failure === "DRIVE_OWNER_RECONNECT") && !announced.has(failure)) {
        announced.add(failure);
        notify(failure);
      }
    } catch { checked.delete(url.pathname); /* Offline is not expired authorization. */ }
  };
}

export const reportMediaFailure = createMediaFailureReporter(
  (...args) => fetch(...args),
  failure => window.dispatchEvent(new CustomEvent(MEDIA_FAILURE_EVENT, { detail: failure })),
);

export function imagePlaceholder(name = "", kind: "avatar" | "image" = "image") {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase("pt-BR");
  const escaped = initials.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
  const drawing = initials
    ? `<text x="48" y="51" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="30" font-weight="600" fill="#68518d" stroke="none">${escaped}</text>`
    : kind === "avatar"
      ? '<circle cx="48" cy="34" r="13"/><path d="M23 76c0-29 50-29 50 0"/>'
      : '<rect x="23" y="25" width="50" height="46" rx="8"/><circle cx="39" cy="40" r="5"/><path d="m25 65 17-17 13 13 8-8 10 10"/>';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="16" fill="#eee8f6"/><g fill="none" stroke="#8973a6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${drawing}</g></svg>`)}`;
}
