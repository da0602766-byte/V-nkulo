declare global {
  interface Window {
    VinkuloAndroid?: {
      shareToWhatsApp?: (message: string) => void;
      downloadFile?: (url: string, filename: string) => void;
    };
  }
}

export async function downloadFileForDevice(url: string, filename: string) {
  if (typeof window === "undefined") return false;
  const safeFilename = filename.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "documento.pdf";
  const nativeDownload = window.VinkuloAndroid?.downloadFile;
  if (typeof nativeDownload === "function") {
    try {
      nativeDownload(new URL(url, window.location.origin).toString(), safeFilename);
      return true;
    } catch {
      // Continua para o download web quando o bridge de uma versão antiga falhar.
    }
  }

  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Não foi possível preparar o PDF para download.");
  const blob = await response.blob();
  const file = typeof File === "function"
    ? new File([blob], safeFilename, { type: blob.type || "application/pdf" })
    : null;
  const isInstalledAndroidApp = /Android/i.test(window.navigator.userAgent) && Boolean(window.VinkuloAndroid);
  if (file && isInstalledAndroidApp && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: safeFilename });
    return true;
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = safeFilename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  return true;
}

export function shareToWhatsAppApp(message: string) {
  if (typeof window === "undefined") return false;
  const share = window.VinkuloAndroid?.shareToWhatsApp;
  if (typeof share === "function") {
    try {
      share(message);
      return true;
    } catch {
      // Continua para o link direto quando uma versão antiga do APK falhar.
    }
  }

  const encoded = encodeURIComponent(message);
  const fallback = `https://api.whatsapp.com/send?text=${encoded}`;
  const isAndroid = /Android/i.test(window.navigator.userAgent);
  window.location.href = isAndroid
    ? `intent://send?text=${encoded}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${encodeURIComponent(fallback)};end`
    : fallback;
  return true;
}

