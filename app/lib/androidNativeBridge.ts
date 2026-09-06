declare global {
  interface Window {
    VinkuloAndroid?: {
      shareToWhatsApp?: (message: string) => void;
      downloadFile?: (url: string, filename: string) => void;
      openGoogleAuth?: (authorizationUrl: string) => void;
      addCalendarEvent?: (eventJson: string) => void;
    };
  }
}

export function isVinkuloAndroidApp() {
  return typeof window !== "undefined" && Boolean(window.VinkuloAndroid);
}

export function createGooglePairingSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function openGoogleAuthorizationInApp(authorizationUrl: string) {
  if (typeof window === "undefined") return false;
  const openGoogleAuth = window.VinkuloAndroid?.openGoogleAuth;
  if (typeof openGoogleAuth !== "function") return false;
  const target = new URL(authorizationUrl);
  if (target.protocol !== "https:" || target.hostname !== "accounts.google.com") {
    throw new Error("O endereço de autorização do Google não é válido.");
  }
  openGoogleAuth(target.toString());
  return true;
}

export type DeviceCalendarEvent = {
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  description?: string;
};

export async function downloadFileForDevice(url: string, filename: string) {
  if (typeof window === "undefined") return false;
  const safeFilename = filename.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "documento.pdf";
  const absoluteUrl = new URL(url, window.location.origin).toString();
  const isInstalledAndroidApp = /Android/i.test(window.navigator.userAgent) && Boolean(window.VinkuloAndroid);

  // Em versões já distribuídas do APK, o bridge de download não devolve um
  // resultado confiável: a tela ficava em "Preparando" sem salvar o arquivo.
  // A navegação para uma resposta attachment é tratada pelo DownloadManager
  // do Android e mantém os cookies da sessão atual.
  if (isInstalledAndroidApp) {
    window.location.assign(absoluteUrl);
    return true;
  }

  const response = await fetch(absoluteUrl, { credentials: "include" });
  if (!response.ok) throw new Error("Não foi possível preparar o PDF para download.");
  const blob = await response.blob();
  const file = typeof File === "function"
    ? new File([blob], safeFilename, { type: blob.type || "application/pdf" })
    : null;
  if (file && /Android/i.test(window.navigator.userAgent) && navigator.share && navigator.canShare?.({ files: [file] })) {
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
export function addCalendarEventForDevice(event: DeviceCalendarEvent) {
  if (typeof window === "undefined") return false;
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt);
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    throw new Error("O horário desta escala é inválido para o calendário.");
  }

  const calendarEvent = {
    title: event.title.trim().slice(0, 180),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    location: String(event.location || "").trim().slice(0, 300),
    description: String(event.description || "").trim().slice(0, 3000),
  };
  const nativeCalendar = window.VinkuloAndroid?.addCalendarEvent;
  if (typeof nativeCalendar === "function") {
    try {
      // A tela nativa de inclusão ainda exige a confirmação do usuário.
      nativeCalendar(JSON.stringify(calendarEvent));
      return true;
    } catch {
      // Continua para o Google Agenda quando uma versão antiga do APK falhar.
    }
  }

  const calendarUrl = new URL("https://calendar.google.com/calendar/render");
  calendarUrl.searchParams.set("action", "TEMPLATE");
  calendarUrl.searchParams.set("text", calendarEvent.title);
  calendarUrl.searchParams.set(
    "dates",
    `${toGoogleCalendarDate(startsAt)}/${toGoogleCalendarDate(endsAt)}`,
  );
  if (calendarEvent.location) {
    calendarUrl.searchParams.set("location", calendarEvent.location);
  }
  if (calendarEvent.description) {
    calendarUrl.searchParams.set("details", calendarEvent.description);
  }

  if (/Android/i.test(window.navigator.userAgent)) {
    const fallbackUrl = calendarUrl.toString();
    const extras = [
      "scheme=content",
      "action=android.intent.action.INSERT",
      "type=vnd.android.cursor.item/event",
      `S.title=${encodeIntentValue(calendarEvent.title)}`,
      `l.beginTime=${startsAt.getTime()}`,
      `l.endTime=${endsAt.getTime()}`,
      calendarEvent.location && `S.eventLocation=${encodeIntentValue(calendarEvent.location)}`,
      calendarEvent.description && `S.description=${encodeIntentValue(calendarEvent.description)}`,
      `S.browser_fallback_url=${encodeIntentValue(fallbackUrl)}`,
      "end",
    ].filter(Boolean).join(";");

    // Sem package fixo: o aparelho pode usar Google Agenda, Calendário Samsung
    // ou qualquer calendário compatível instalado pelo próprio usuário.
    window.location.href =
      `intent://com.android.calendar/events#Intent;${extras}`;
    return true;
  }

  const opened = window.open(calendarUrl.toString(), "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(calendarUrl.toString());
  return true;
}

function toGoogleCalendarDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function encodeIntentValue(value: string) {
  return encodeURIComponent(value).replace(/%20/g, "%20");
}
