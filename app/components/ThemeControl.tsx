"use client";

import { useEffect, useState } from "react";

type Theme = "CLARO" | "ESCURO" | "AUTO";

export default function ThemeControl({
  compact = false,
  cycle = false,
  storageId = "",
}: {
  compact?: boolean;
  cycle?: boolean;
  storageId?: string;
}) {
  const [theme, setTheme] = useState<Theme>("AUTO");
  const individualKey = themeStorageKey(storageId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = normalizeTheme(
        (individualKey && window.localStorage.getItem(individualKey)) ||
        window.localStorage.getItem("vinkulo-theme"),
      );
      setTheme(saved);
      applyTheme(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [individualKey]);

  function update(next: Theme) {
    setTheme(next);
    window.localStorage.setItem("vinkulo-theme", next);
    if (individualKey) window.localStorage.setItem(individualKey, next);
    applyTheme(next);
  }

  const activeTheme = THEMES.find((item) => item.value === theme) || THEMES[2];

  if (cycle) {
    const nextTheme = THEMES[(THEMES.findIndex((item) => item.value === theme) + 1) % THEMES.length];
    return (
      <div className={`theme-control theme-control-cycle ${compact ? "compact" : ""}`}>
        <button
          type="button"
          className="active"
          aria-label={`${activeTheme.label}. Mudar para ${nextTheme.label}`}
          title={`${activeTheme.label} · mudar para ${nextTheme.label}`}
          onClick={() => update(nextTheme.value)}
        >
          <span aria-hidden="true">{activeTheme.icon}</span>
          <small>{activeTheme.label}</small>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`theme-control ${compact ? "compact" : ""}`}
      role="group"
      aria-label="Tema da plataforma"
    >
      {THEMES.map((item) => (
        <button
          key={item.value}
          type="button"
          className={theme === item.value ? "active" : ""}
          aria-label={item.label}
          aria-pressed={theme === item.value}
          title={item.label}
          onClick={() => update(item.value)}
        >
          <span aria-hidden="true">{item.icon}</span>
          <small>{item.label}</small>
        </button>
      ))}
    </div>
  );
}

const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: "CLARO", label: "Tema claro", icon: "☀" },
  { value: "ESCURO", label: "Tema escuro", icon: "◐" },
  { value: "AUTO", label: "Tema automático", icon: "A" },
];

function normalizeTheme(value: string | null): Theme {
  return value === "CLARO" || value === "ESCURO" ? value : "AUTO";
}

function themeStorageKey(storageId: string) {
  const normalized = storageId.trim().toLowerCase();
  return normalized ? `vinkulo:theme:${normalized}` : "";
}

function applyTheme(theme: Theme) {
  if (theme === "AUTO") {
    document.documentElement.removeAttribute("data-pilot-theme");
    document.documentElement.style.colorScheme = "light dark";
    return;
  }
  document.documentElement.dataset.pilotTheme = theme.toLowerCase();
  document.documentElement.style.colorScheme =
    theme === "ESCURO" ? "dark" : "light";
}
