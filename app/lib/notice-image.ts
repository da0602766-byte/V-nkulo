export function normalizeNoticeImage(value: unknown) {
  const image = String(value || "").trim();
  if (!image) return { image: null as string | null };
  if (/^\/api\/storage\/media\/[A-Za-z0-9_.-]+$/i.test(image)) {
    return { image };
  }
  return {
    error: "A imagem compartilhada precisa estar no Google Drive da comunidade.",
  };
}
