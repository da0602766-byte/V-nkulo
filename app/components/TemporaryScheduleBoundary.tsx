"use client";

import { type ReactNode, useEffect, useState } from "react";

export default function TemporaryScheduleBoundary({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  const [closed, setClosed] = useState("");

  useEffect(() => {
    let cancelled = false;
    const validate = async () => {
      try {
        const response = await fetch(`/api/acesso-temporario/${token}`, {
          cache: "no-store",
        });
        const result = (await response.json()) as { status?: string };
        if (!cancelled && (!response.ok || result.status !== "ATIVO")) {
          setClosed(
            result.status === "CANCELADO"
              ? "Esta autorização foi cancelada."
              : "O acesso temporário foi encerrado.",
          );
        }
      } catch {
        // Mantém o conteúdo; ele continua somente leitura e será revalidado.
      }
    };
    const interval = window.setInterval(() => void validate(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token]);

  if (closed) {
    return (
      <main className="temporary-access-page">
        <section className="temporary-access-card">
          <h1>Acesso encerrado</h1>
          <p>{closed}</p>
        </section>
      </main>
    );
  }
  return <>{children}</>;
}
