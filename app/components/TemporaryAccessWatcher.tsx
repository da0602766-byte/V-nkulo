"use client";

import { useEffect, useState } from "react";

export default function TemporaryAccessWatcher({
  resourceLabel,
  endsAt,
}: {
  resourceLabel: string;
  endsAt: string;
}) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const validate = async () => {
      try {
        const response = await fetch("/api/pilot/acesso-temporario/atual", {
          cache: "no-store",
        });
        const result = (await response.json()) as {
          status?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || result.status !== "ATIVO") {
          const status = String(result.status || "encerrado").toLowerCase();
          setMessage(
            status === "cancelado"
              ? "A autorização foi cancelada."
              : "O acesso temporário foi encerrado.",
          );
          window.setTimeout(
            () => window.location.replace(`/painel?acessoTemporario=${status}`),
            900,
          );
        }
      } catch {
        if (!cancelled) setMessage("Revalidando autorização temporária…");
      }
    };
    void validate();
    const interval = window.setInterval(() => void validate(), 5_000);
    const expiryDelay = Math.max(0, Date.parse(endsAt) - Date.now());
    const expiryTimer = window.setTimeout(
      () => void validate(),
      Math.min(expiryDelay + 150, 2_147_000_000),
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(expiryTimer);
    };
  }, [endsAt]);

  return (
    <aside className="temporary-access-banner" role="status">
      <span aria-hidden="true">◷</span>
      <div>
        <strong>{message || `Acesso temporário · ${resourceLabel}`}</strong>
        <small>Válido até {formatTime(endsAt)}; o servidor revalida cada operação.</small>
      </div>
    </aside>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
