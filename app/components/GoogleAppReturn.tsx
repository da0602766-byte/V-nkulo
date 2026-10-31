"use client";

import { useEffect, useState } from "react";

export default function GoogleAppReturn({ error = "" }: { error?: string }) {
  const [intentUrl, setIntentUrl] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fallback = new URL(window.location.href);
      fallback.searchParams.set("manual", "1");
      setIntentUrl(`intent://google-login-complete#Intent;scheme=vinkulo;package=com.vinkulo.app;component=com.vinkulo.app/.MainActivity;S.browser_fallback_url=${encodeURIComponent(fallback.href)};end`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (error || !intentUrl) return;
    if (new URLSearchParams(window.location.search).has("manual")) return;
    const timer = window.setTimeout(() => { window.location.href = intentUrl; }, 350);
    return () => window.clearTimeout(timer);
  }, [error, intentUrl]);

  return (
    <main className="google-app-return">
      <section>
        <span className={`google-return-mark ${error ? "error" : "success"}`} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            {error
              ? <><path d="M7 7 17 17" /><path d="M17 7 7 17" /></>
              : <path d="M5 12.8 10 17.6 19 7.2" />}
          </svg>
        </span>
        <h1 style={{ color: "inherit" }}>{error ? "Não foi possível concluir" : "Autorização concluída"}</h1>
        <p>{error || "Sua conta foi confirmada. Volte ao Vínkulo para continuar, sem entrar novamente."}</p>
        {intentUrl && <a href={intentUrl}>Voltar ao aplicativo</a>}
        <small>Se o aplicativo não abrir automaticamente, toque no botão ou abra o Vínkulo no celular. Você pode fechar esta aba.</small>
      </section>
    </main>
  );
}
