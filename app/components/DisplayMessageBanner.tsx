"use client";

import { useEffect, useState } from "react";

export type DisplayMessageItem = {
  id: number;
  titulo: string;
  mensagem: string;
  tipo: string;
  areas: string;
  animacao: string;
  intervalo_segundos: number;
  inicia_em: string | null;
  termina_em: string | null;
  ativo: number;
  ativo_agora?: number;
  criado_em: string;
  atualizado_em: string;
};

export default function DisplayMessageBanner({
  messages,
}: {
  messages: DisplayMessageItem[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (messages.length < 2) return;
    const current = messages[activeIndex % messages.length];
    const timer = window.setTimeout(
      () => setActiveIndex((index) => (index + 1) % messages.length),
      Math.max(3, Number(current.intervalo_segundos) || 7) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [activeIndex, messages]);

  if (!messages.length) return null;
  const normalizedIndex = activeIndex % messages.length;
  const current = messages[normalizedIndex];
  const type = current.tipo.toLowerCase();
  const animation = current.animacao.toLowerCase();

  return (
    <section className="display-message-stack" aria-live="polite">
      <article
        key={current.id}
        className={`display-message-banner type-${type} animation-${animation}`}
        style={{ "--message-cycle": `${Math.max(3, Number(current.intervalo_segundos) || 7)}s` } as React.CSSProperties}
        role={current.tipo === "URGENTE" ? "alert" : "status"}
      >
        <span className="display-message-icon" aria-hidden="true">
          {current.tipo === "URGENTE" ? "!" : current.tipo === "IMPORTANTE" ? "◆" : "◇"}
        </span>
        <div>
          <small>{current.tipo === "INFO" ? "INFORMAÇÃO" : current.tipo}</small>
          <strong>{current.titulo}</strong>
          <p>{current.mensagem}</p>
        </div>
        {messages.length > 1 && (
          <span className="display-message-counter">
            {normalizedIndex + 1}/{messages.length}
          </span>
        )}
      </article>
    </section>
  );
}
