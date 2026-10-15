"use client";

import { useEffect, useState } from "react";

export default function OfflineModeEntry() {
  const [native, setNative] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let attempts = 0;
    const check = () => {
      setNative(Boolean(window.VinkuloAndroid));
      setReady((window.VinkuloAndroid?.offlineModeVersion ?? 0) >= 1);
    };
    check();
    const timer = window.setInterval(() => {
      check();
      if (window.VinkuloAndroid || ++attempts >= 10) window.clearInterval(timer);
    }, 1000);
    window.addEventListener("pageshow", check);
    return () => { window.clearInterval(timer); window.removeEventListener("pageshow", check); };
  }, []);
  return <section className="offline-mode-entry offline-mode-settings" aria-labelledby="offline-settings-title">
    <div><h2 id="offline-settings-title">Use o Vínkulo sem internet</h2><p>No aplicativo Android, guarde cadastros, pedidos, anotações e relatórios no aparelho. Envie as pendências quando voltar a se conectar.</p></div>
    <div className="offline-mode-entry__actions">
      {ready ? <a className="primary" href="/mobile-app/index.html?mode=manual">Abrir modo offline</a>
        : <a className="primary" href="/downloads/VINKULO_ANDROID_1.22.0.apk" download>{native ? "Atualizar para usar offline" : "Instalar app com modo offline"}</a>}
      <small>{ready ? "Ative as funções uma vez com internet. Guardar rascunho não envia; acompanhe a confirmação nas pendências." : "Disponível no aplicativo Android 1.22.0. Após instalar, entre na comunidade e abra este modo."}</small>
    </div>
  </section>;
}
