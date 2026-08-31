export const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024;

export type ImagePurpose =
  | "community-logo"
  | "community-banner"
  | "ministry-banner"
  | "login-logo"
  | "login-background"
  | "visual-editor-image"
  | "post-image"
  | "profile-photo"
  | "platform-logo"
  | "platform-feed-banner"
  | "feedback-evidence";

const LARGE_BACKGROUNDS = new Set<ImagePurpose>([
  "community-banner",
  "ministry-banner",
  "login-background",
  "platform-feed-banner",
]);

const COMPACT_ASSETS = new Set<ImagePurpose>([
  "community-logo",
  "login-logo",
  "profile-photo",
  "platform-logo",
]);

export async function prepareImageForUpload(file: File, purpose: ImagePurpose) {
  validateSourceImage(file);
  const profile = LARGE_BACKGROUNDS.has(purpose)
    ? { maximum: 4096, targetBytes: 7.8 * 1024 * 1024 }
    : COMPACT_ASSETS.has(purpose)
      ? { maximum: 2048, targetBytes: 3 * 1024 * 1024 }
      : { maximum: 3200, targetBytes: 6.4 * 1024 * 1024 };
  const blob = await convertToWebp(file, profile.maximum, profile.targetBytes);
  return new File(
    [blob],
    `${file.name.replace(/\.[^.]+$/, "") || "imagem"}.webp`,
    { type: "image/webp", lastModified: Date.now() },
  );
}

function validateSourceImage(file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error(
      "Escolha uma imagem válida. SVG não é aceito por segurança; use JPG, PNG, WebP, GIF, BMP ou AVIF.",
    );
  }
  if (file.size < 1 || file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(
      "A imagem original deve ter no máximo 50 MB para a conversão automática.",
    );
  }
}

async function convertToWebp(
  file: File,
  maximumDimension: number,
  targetBytes: number,
) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "O navegador não conseguiu abrir esta imagem. Tente JPG, PNG, WebP, GIF, BMP ou AVIF.",
    );
  }
  try {
    let smallest: Blob | null = null;
    const dimensions = [
      maximumDimension,
      Math.round(maximumDimension * 0.82),
      Math.round(maximumDimension * 0.68),
    ];
    for (const maximum of dimensions) {
      const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) continue;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.96, 0.9, 0.84, 0.76, 0.68]) {
        const candidate = await canvasToBlob(canvas, quality);
        if (!candidate) continue;
        if (!smallest || candidate.size < smallest.size) smallest = candidate;
        if (candidate.size <= targetBytes) return candidate;
      }
    }
    if (smallest && smallest.size <= targetBytes) return smallest;
    throw new Error(
      "Não foi possível otimizar esta imagem sem comprometer a qualidade. Tente outra foto.",
    );
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
}
