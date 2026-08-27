"use client";

import { useEffect, useState } from "react";

const MIN_SCALE = 0.9;
const MAX_SCALE = 1.3;
const STEP = 0.1;
const BASE_FONT_SIZE = 16;

export default function FontScaleControl({ userEmail }: { userEmail: string }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = normalizeScale(
        window.localStorage.getItem(storageKey(userEmail)),
      );
      setScale(saved);
      applyScale(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userEmail]);

  function update(next: number) {
    const clamped = normalizeScale(String(next));
    setScale(clamped);
    window.localStorage.setItem(storageKey(userEmail), String(clamped));
    applyScale(clamped);
  }

  return (
    <div
      className="pilot-user-font-scale"
      role="group"
      aria-label="Tamanho do texto"
    >
      <span>Tamanho do texto</span>
      <button
        type="button"
        aria-label="Diminuir textos"
        disabled={scale <= MIN_SCALE}
        onClick={() => update(scale - STEP)}
      >
        A−
      </button>
      <button
        type="button"
        className={scale === 1 ? "active" : ""}
        aria-label="Restaurar tamanho padrão"
        onClick={() => update(1)}
      >
        {Math.round(scale * 100)}%
      </button>
      <button
        type="button"
        aria-label="Aumentar textos"
        disabled={scale >= MAX_SCALE}
        onClick={() => update(scale + STEP)}
      >
        A+
      </button>
    </div>
  );
}

function storageKey(userEmail: string) {
  return `vinkulo:font-scale:${userEmail}`;
}

function normalizeScale(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  // Passos de 0,1 evitam acumular erro de ponto flutuante entre cliques.
  const stepped = Math.round(parsed * 10) / 10;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, stepped));
}

function applyScale(scale: number) {
  document.documentElement.style.fontSize =
    scale === 1 ? "" : `${BASE_FONT_SIZE * scale}px`;
}
