declare global {
  interface Window {
    VinkuloAndroid?: {
      shareToWhatsApp?: (message: string) => void;
      downloadFile?: (url: string, filename: string) => void;
      addCalendarEvent?: (eventJson: string) => void;
    };
  }
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
    const intentQuery = calendarUrl.searchParams.toString();
    window.location.href =
      `intent://calendar.google.com/calendar/render?${intentQuery}` +
      `#Intent;scheme=https;package=com.google.android.calendar;` +
      `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
    return true;
  }

  const opened = window.open(calendarUrl.toString(), "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(calendarUrl.toString());
  return true;
}

function toGoogleCalendarDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
