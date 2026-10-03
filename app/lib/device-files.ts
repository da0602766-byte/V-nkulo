"use client";
import { readLocalMedia } from "./local-media";
import { MAX_COPY_BYTES, safeFileName } from "./file-copy";

export async function prepareDeviceFile(source: string, name = "arquivo") {
  const url = new URL(source, window.location.origin);
  if (url.origin === window.location.origin && url.pathname.startsWith("/local-media/")) {
    const saved = await readLocalMedia(url.pathname);
    return new File([saved.blob], safeFileName(saved.name, saved.type), { type: saved.type });
  }
  if (!["https:", "http:", "blob:"].includes(url.protocol)) throw new Error("Endereço do arquivo inválido.");
  const response = await fetch(url, { credentials: url.origin === window.location.origin ? "include" : "omit" });
  if (!response.ok) throw new Error(response.status === 401 ? "Entre novamente para baixar este arquivo." : "O arquivo não está disponível. Verifique a conexão e tente novamente.");
  if (response.headers.get("content-type")?.includes("text/html")) throw new Error("O endereço abriu uma página. Entre novamente e tente baixar o arquivo.");
  if (Number(response.headers.get("content-length")) > MAX_COPY_BYTES) throw new Error("Use arquivos de até 20 MB nesta opção.");
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_COPY_BYTES) throw new Error("Use arquivos de até 20 MB nesta opção.");
  const disposition = response.headers.get("content-disposition") || "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let serverName = disposition.match(/filename="([^"]+)"/i)?.[1];
  if (encodedName) { try { serverName = decodeURIComponent(encodedName); } catch { /* Keep the supplied name. */ } }
  return new File([blob], safeFileName(serverName || name, blob.type), { type: blob.type || "application/octet-stream" });
}

/** Call from a fresh click: mobile share sheets require a live user gesture. */
export async function savePreparedFile(file: File, source?: string) {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (mobile && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: file.name });
    return "shared";
  }
  if (window.VinkuloAndroid && source) {
    const url = new URL(source, location.origin);
    if (url.origin === location.origin && url.pathname.startsWith("/api/")) {
      url.searchParams.set("download", "1");
      window.location.assign(url.href);
      return "started";
    }
  }
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return "started";
}

export async function syncFileToDrive(file: File, notify = true) {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/storage/copies", { method: "POST", body: form });
  const result = await response.json() as { error?: string; reconnect?: boolean; alreadySaved?: boolean; id: string; hash: string };
  if (!response.ok) throw Object.assign(new Error(result.error || "Não foi possível salvar no Drive."), { reconnect: result.reconnect });
  if (notify) window.dispatchEvent(new Event("vinkulo:files-changed"));
  return result;
}
