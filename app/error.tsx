"use client";

import Link from "./components/StableLink";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="app-error-page" role="alert">
      <section className="app-error-card">
        <p className="pilot-kicker">NÃO FOI POSSÍVEL ABRIR ESTA TELA</p>
        <h1>A navegação foi interrompida.</h1>
        <p>
          Seus dados continuam preservados. Tente novamente ou volte para a
          visão geral.
        </p>
        <div className="app-error-actions">
          <button type="button" onClick={reset}>
            Tentar novamente
          </button>
          <Link href="/painel?view=inicio">Voltar à visão geral</Link>
        </div>
      </section>
    </main>
  );
}
