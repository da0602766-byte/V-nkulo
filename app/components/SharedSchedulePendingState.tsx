"use client";

import { useEffect, useMemo, useState } from "react";

export default function SharedSchedulePendingState({
  opensAt,
  serverNow,
}: {
  opensAt: string;
  serverNow: number;
}) {
  const opensAtMs = useMemo(() => Date.parse(opensAt), [opensAt]);
  const [clockOffset] = useState(() => serverNow - Date.now());
  const [now, setNow] = useState(() => Date.now() + clockOffset);

  useEffect(() => {
    const refreshWhenAvailable = () => {
      const current = Date.now() + clockOffset;
      setNow(current);
      if (Number.isFinite(opensAtMs) && current >= opensAtMs) {
        window.location.reload();
      }
    };
    refreshWhenAvailable();
    const interval = window.setInterval(refreshWhenAvailable, 1_000);
    return () => window.clearInterval(interval);
  }, [clockOffset, opensAtMs]);

  const remaining = Math.max(0, opensAtMs - now);
  return (
    <main className="shared-secretary-page shared-secretary-access-state shared-secretary-pending-state">
      <section>
        <span className="shared-secretary-brand">V+</span>
        <p>VÍNKULO · ACESSO TEMPORÁRIO</p>
        <h1>Acesso ainda não liberado</h1>
        <p>
          Esta escala estará disponível em {formatDate(opensAt)}. Você pode
          manter esta tela aberta: ela será atualizada automaticamente no
          horário autorizado.
        </p>
        <div className="shared-secretary-countdown" aria-live="polite">
          <small>Tempo restante</small>
          <strong>{formatCountdown(remaining)}</strong>
        </div>
        <button type="button" onClick={() => window.location.reload()}>
          Verificar acesso agora
        </button>
        <a className="shared-secretary-signup" href="/login?modo=cadastro">Ainda não tem conta? Cadastre-se</a>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatCountdown(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Liberando acesso…";
  const totalSeconds = Math.ceil(value / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [
    days ? `${days}d` : "",
    hours || days ? `${hours}h` : "",
    `${minutes}min`,
    `${seconds}s`,
  ].filter(Boolean).join(" ");
}
