export const MAX_COPY_BYTES = 20 * 1024 * 1024;

export async function contentHash(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function safeFileName(name: string, type = "") {
  const clean = name.replace(/[\u0000-\u001f\\/:*?"<>|]+/g, "-").trim().slice(0, 140) || "arquivo";
  if (/\.[a-z0-9]{1,8}$/i.test(clean)) return clean;
  const extension: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf", "text/plain": ".txt" };
  return clean + (extension[type] || "");
}
