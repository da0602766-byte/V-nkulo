"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isAppleMobile() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isAndroidMobile() {
  return /android/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return Boolean(window.VinkuloAndroid) || ["standalone", "fullscreen", "minimal-ui"].some((mode) =>
    window.matchMedia(`(display-mode: ${mode})`).matches,
  ) ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://") ||
    window.localStorage.getItem("vinkulo-app-installed") === "1";
}

export default function MobileAppInstall() {
  const pathname = usePathname();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [androidDevice, setAndroidDevice] = useState(false);

  useEffect(() => {
    const refreshVisibility = () => {
      if (isStandalone()) {
        setVisible(false);
        return false;
      }
      return true;
    };

    const initial = window.setTimeout(() => {
      if (!refreshVisibility()) return;
      const android = isAndroidMobile();
      setAndroidDevice(android);
      if (android) setVisible(true);
      if (isAppleMobile()) setVisible(true);
    }, 0);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
      setVisible(true);
    }
    const onInstalled = () => {
      window.localStorage.setItem("vinkulo-app-installed", "1");
      setVisible(false);
    };
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("pageshow", refreshVisibility);
    // No Android/Chromium o aviso aparece somente quando o próprio navegador
    // confirma que a página pode ser instalada. Isso evita exibi-lo dentro do
    // aplicativo já instalado. No iOS, onde esse evento não existe, mostramos
    // as instruções apenas no Safari móvel e fora do modo standalone.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }

    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("pageshow", refreshVisibility);
    };
  }, []);

  if (!visible || pathname !== "/") return null;

  const install = async () => {
    if (!installEvent) {
      setShowHelp(true);
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted") setVisible(false);
  };

  return (
    <aside className="mobile-app-install" aria-label="Instalar aplicativo Vínkulo">
      <div className="mobile-app-install__icon" aria-hidden="true">✦</div>
      <div>
        <strong>Use o Vínkulo como aplicativo</strong>
        <p>{androidDevice ? "Android 1.3.0 com compartilhamento direto no WhatsApp." : "Abra mais rápido pelo ícone na tela do seu celular."}</p>
      </div>
      {androidDevice ? (
        <a className="mobile-app-install__download" href="/downloads/VINKULO_ANDROID_1.3.0.apk" download>
          Baixar APK
        </a>
      ) : (
        <button type="button" onClick={() => void install()}>
          Instalar
        </button>
      )}
      <button
        type="button"
        className="mobile-app-install__close"
        aria-label="Fechar aviso de instalação"
        onClick={() => setVisible(false)}
      >
        ×
      </button>
      {showHelp && (
        <div className="mobile-app-install__help" role="status">
          {isAppleMobile()
            ? <>No iPhone, toque em Compartilhar e escolha <strong>Adicionar à Tela de Início</strong>.</>
            : <>No Android, abra o menu do navegador e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</>}
        </div>
      )}
    </aside>
  );
}
