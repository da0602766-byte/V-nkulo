"use client";
import { useEffect, useState } from "react";
import "./offline-mode-entry.css";
import { useAndroidOfflinePolicy } from "./useAndroidOfflineEnabled";
import { needsAndroidPolicyUpdate } from "../lib/android-version";

export default function OfflineModeEntry() {
  const [native, setNative] = useState(false);
  const [ready, setReady] = useState(false);
  const policy = useAndroidOfflinePolicy();
  useEffect(() => {
    let attempts = 0;
    const check = () => {
      setNative(Boolean(window.VinkuloAndroid));
      setReady((window.VinkuloAndroid?.offlineModeVersion ?? 0) >= 1 && !needsAndroidPolicyUpdate(window.VinkuloAndroid?.version));
    };
    check();
    const timer = window.setInterval(() => {
      check();
      if (window.VinkuloAndroid || ++attempts >= 10) window.clearInterval(timer);
    }, 1000);
    window.addEventListener("pageshow", check);
    return () => { window.clearInterval(timer); window.removeEventListener("pageshow", check); };
  }, []);
  if (policy.enabled === false) return null;
  return <section className="offline-mode-entry offline-mode-settings" aria-labelledby="offline-settings-title">
    <div className="offline-mode-entry__details"><h2 id="offline-settings-title">Use o Vínkulo sem internet</h2><p>No aplicativo Android, guarde cadastros, pedidos, anotações e relatórios no aparelho. Confira cada envio quando voltar a se conectar.</p>
      {ready && <dl className="offline-mode-entry__status">
        <div><dt>Validade do acesso</dt><dd>Confira em Gerenciar offline e nas funções ativadas, dentro do aplicativo.</dd></div>
        <div><dt>Envios pendentes</dt><dd>Abra o modo offline e consulte a Central de pendências. Este painel não recebe a contagem do aparelho.</dd></div>
      </dl>}
      {ready && <p className="offline-mode-entry__hint">Acesso vencido? Reconecte com a mesma conta e comunidade e ative novamente a função. O trabalho salvo permanece no aparelho. Uma tentativa de envio só está concluída quando o registro aparece como confirmado.</p>}
    </div>
    <div className="offline-mode-entry__actions">
      {policy.enabled === null ? <p role="status">{policy.status === "checking" ? "Consultando disponibilidade…" : "Não foi possível confirmar a disponibilidade. Reconecte e tente novamente. Seus rascunhos não foram apagados."}</p>
        : ready ? <a className="primary" href="/mobile-app/index.html?mode=manual">Abrir modo offline</a>
        : <a className="primary" href="/downloads/VINKULO_ANDROID_1.24.1_HOMOLOGACAO.apk" download>{native ? "Atualizar para usar offline" : "Instalar app com modo offline"}</a>}
      {policy.status === "unavailable" && policy.enabled === true && <p role="status">Sem confirmação atual da conexão. A disponibilidade anterior não garante acesso válido; o aplicativo confere a autorização local ao abrir.</p>}
      {policy.status === "unavailable" && <button type="button" onClick={policy.refresh}>Verificar disponibilidade</button>}
      <small>{ready ? "Guardar rascunho não envia. Relatórios de células permanecem como rascunhos locais. Não desinstale o app para tentar corrigir uma pendência." : "Disponível no aplicativo Android 1.24.1. Atualize por cima da instalação existente para preservar os rascunhos; depois entre na comunidade."}</small>
    </div>
  </section>;
}
