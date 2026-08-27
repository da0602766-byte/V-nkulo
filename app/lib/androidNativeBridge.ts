declare global {
  interface Window {
    VinkuloAndroid?: {
      shareToWhatsApp?: (message: string) => void;
    };
  }
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

