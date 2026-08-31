"use client";

import { useEffect, useState } from "react";

export default function GoogleAppReturn({ error = "" }: { error?: string }) {
  const [intentUrl, setIntentUrl] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fallback = `${window.location.origin}/login`;
      setIntentUrl(`intent://google-login-complete#Intent;scheme=vinkulo;package=com.vinkulo.app;component=com.vinkulo.app/.MainActivity;S.browser_fallback_url=${encodeURIComponent(fallback)};end`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (error || !intentUrl) return;
    const timer = window.setTimeout(() => { window.location.href = intentUrl; }, 350);
    return () => window.clearTimeout(timer);
  }, [error, intentUrl]);

  return (
    <main className="google-app-return">
      <section>
        <span className={error ? "error" : "success"} aria-hidden="true">{error ? "!" : "✓"}</span>
        <h1>{error ? "Não foi possível concluir" : "Login concluído"}</h1>
        <p>{error || "Sua conta foi confirmada. O Vínkulo receberá o acesso automaticamente."}</p>
        {!error && intentUrl && <a href={intentUrl}>Voltar ao aplicativo</a>}
        {error && <a href="/login">Tentar novamente</a>}
        <small>Você pode fechar esta aba depois que o aplicativo abrir.</small>
      </section>
    </main>
  );
}
