"use client";

import { prepareImageForUpload, type ImagePurpose } from "./client-image";
import { storeLocalMedia } from "./local-media";

export async function saveImageOutsidePlatform(
  file: File,
  purpose: ImagePurpose,
  resourceId?: number,
) {
  const prepared = await prepareImageForUpload(file, purpose);
  const preferenceResponse = await fetch("/api/storage/preferences", {
    cache: "no-store",
  });
  const preference = (await preferenceResponse.json()) as {
    preference?: { provider?: string };
    error?: string;
  };
  if (!preferenceResponse.ok) {
    throw new Error(
      preference.error || "Não foi possível verificar o destino da imagem.",
    );
  }
  if (preference.preference?.provider !== "GOOGLE_DRIVE") {
    if (purpose !== "profile-photo") {
      throw new Error(
        "Conteúdo compartilhado precisa do Google Drive da comunidade. Ative-o em Minha conta.",
      );
    }
    return {
      url: await storeLocalMedia(prepared),
      storage: "LOCAL" as const,
    };
  }

  return uploadSharedImage(prepared, purpose, resourceId);
}

async function uploadSharedImage(
  prepared: File,
  purpose: ImagePurpose,
  resourceId?: number,
) {
  const form = new FormData();
  form.set("purpose", purpose);
  form.set("file", prepared);
  if (resourceId) form.set("resourceId", String(resourceId));
  const response = await fetch("/api/pilot/uploads", {
    method: "POST",
    body: form,
  });
  const result = await readUploadResponse(response);
  if (!response.ok || !result.url) {
    throw new Error(result.error || "Não foi possível enviar a imagem.");
  }
  return {
    url: result.url,
    storage: "GOOGLE_DRIVE" as const,
  };
}

async function readUploadResponse(response: Response) {
  const responseText = await response.text();
  try {
    return JSON.parse(responseText) as { url?: string; error?: string };
  } catch {
    if (response.status === 413 || /payload too large/i.test(responseText)) {
      return {
        error:
          "A imagem ficou grande demais para o envio. Escolha outra foto ou tente uma versão menor.",
      };
    }
    return {
      error:
        responseText.trim().slice(0, 180) ||
        "O servidor não conseguiu processar a imagem.",
    };
  }
}
