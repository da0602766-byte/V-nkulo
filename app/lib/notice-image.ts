export function normalizeNoticeImage(value: unknown) {
  const image = String(value || "").trim();
  if (!image) return { image: null as string | null };
  if (image.length > 900_000) {
    return { error: "A imagem convertida da notícia ficou grande demais." };
  }
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image)) {
    return { image };
  }
  try {
    const url = new URL(image);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      image.length <= 2_000
    ) {
      return { image };
    }
  } catch {
    // Retorna a mensagem amigável abaixo.
  }
  return {
    error: "Envie uma foto JPG, PNG, WebP ou um endereço de imagem válido.",
  };
}
