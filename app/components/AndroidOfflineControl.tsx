"use client";

import { useEffect, useState } from "react";
import "./android-offline-control.css";

export default function AndroidOfflineControl() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    setError("");
    try {
      const response = await fetch("/api/proprietario/android", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar a configuração.");
      setEnabled(data.offlineEnabled);
    } catch (failure) { setError((failure as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  async function toggle() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/proprietario/android", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offlineEnabled: !enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      setEnabled(data.offlineEnabled);
      setMessage(data.offlineEnabled ? "Modo offline ativado para todas as comunidades." : "Modo offline desativado para todas as comunidades.");
      window.dispatchEvent(new Event("vinkulo:offline-policy-changed"));
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="android-offline-control" aria-labelledby="android-offline-title">
    <header><div><p className="pilot-kicker">TODOS OS USUÁRIOS</p><h2 id="android-offline-title">Modo offline no APK</h2></div>
      <span className={enabled ? "enabled" : "disabled"}>{enabled === null ? "Consultando…" : enabled ? "Ativado" : "Desativado"}</span></header>
    <p>Controle se o aplicativo pode abrir as funções offline. Quando desativado, a falta de internet mostra somente um aviso animado, com opção de tentar novamente.</p>
    <button type="button" className="primary" disabled={busy || enabled === null} onClick={() => void toggle()}>{busy ? "Salvando…" : enabled ? "Desativar para todos" : "Ativar para todos"}</button>
    <small>Requer APK 1.23.0 ou superior. O app consulta este controle a cada 30 segundos enquanto está aberto e conectado. Aparelhos sem internet recebem a mudança ao reconectar. Rascunhos já salvos são preservados.</small>
    <a href="/downloads/VINKULO_ANDROID_1.23.0.apk" download>Baixar APK atualizado</a>
    {message && <p role="status">{message}</p>}
    {error && <div role="alert"><p>{error}</p>{enabled === null && <button type="button" onClick={() => void load()}>Tentar novamente</button>}</div>}
  </section>;
}
