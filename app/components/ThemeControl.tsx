"use client";

import { useEffect, useState } from "react";

type Theme = "CLARO" | "ESCURO" | "AUTO";

export default function ThemeControl({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("AUTO");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = normalizeTheme(window.localStorage.getItem("vinkulo-theme"));
      setTheme(saved);
      applyTheme(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function update(next: Theme) {
    setTheme(next);
    window.localStorage.setItem("vinkulo-theme", next);
    applyTheme(next);
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
