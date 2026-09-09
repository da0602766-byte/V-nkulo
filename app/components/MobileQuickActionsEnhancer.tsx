"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function MobileQuickActionsEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const refreshTarget = () => {
      const nextTarget = document.querySelector<HTMLElement>(
        "#pilot-mobile-sheet .pilot-mobile-action-grid",
      );
      setTarget((current) => (current === nextTarget ? current : nextTarget));
      if (!nextTarget) setQuery("");
    };

    refreshTarget();
    const observer = new MutationObserver(refreshTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!target) return;
    const normalizedQuery = normalize(query);
    const buttons = Array.from(
      target.querySelectorAll<HTMLButtonElement>(":scope > button"),
    );

    for (const button of buttons) {
      const searchableText = normalize(button.textContent || "");
      button.hidden = Boolean(normalizedQuery) && !searchableText.includes(normalizedQuery);
    }

    return () => {
      for (const button of buttons) button.hidden = false;
    };
  }, [query, target]);

  if (!target) return null;

  return createPortal(
    <>
      <label className="pilot-mobile-action-search" aria-label="Buscar ação rápida">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.4 15.4 4.1 4.1" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar ação..."
          autoComplete="off"
        />
      </label>
      <aside className="pilot-mobile-action-more" aria-label="Mais atalhos">
        <span aria-hidden="true">✦</span>
        <div>
          <strong>Precisa de outra opção?</strong>
          <small>Em breve mais atalhos aqui para facilitar seu dia a dia.</small>
        </div>
        <b aria-hidden="true">›</b>
      </aside>
    </>,
    target,
  );
}
