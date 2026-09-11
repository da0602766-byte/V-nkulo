"use client";

import { useEffect, useRef, useState } from "react";

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
  // No tema automático, saber se o sistema está no escuro exige consultar o
  // navegador — informação que o servidor não tem. Ler isso durante a
  // renderização fazia o servidor desenhar o sol e o cliente a lua, quebrando
  // a hidratação. A resposta passa a vir do estado, acertada num efeito depois
  // da montagem, como o projeto já faz para o tema salvo logo abaixo.
  const [autoIsDark, setAutoIsDark] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionInProgress = useRef(false);
  const individualKey = themeStorageKey(storageId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = normalizeTheme(
        (individualKey && window.localStorage.getItem(individualKey)) ||
        window.localStorage.getItem("vinkulo-theme"),
      );
      setTheme(saved);
      setAutoIsDark(systemPrefersDark());
      applyTheme(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [individualKey]);

  useEffect(() => {
    if (theme !== "AUTO") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncAutomaticTheme = () => {
      setAutoIsDark(media.matches);
      applyTheme("AUTO");
    };
    media.addEventListener("change", syncAutomaticTheme);
    return () => media.removeEventListener("change", syncAutomaticTheme);
  }, [theme]);

  function update(next: Theme) {
    if (transitionInProgress.current) return;
    transitionInProgress.current = true;
    setIsTransitioning(true);
    setTheme(next);
    setAutoIsDark(systemPrefersDark());
    window.localStorage.setItem("vinkulo-theme", next);
    if (individualKey) window.localStorage.setItem(individualKey, next);
    animateThemeChange(next).finally(() => {
      transitionInProgress.current = false;
      setIsTransitioning(false);
    });
  }

  if (cycle) {
    const isDark = currentThemeIsDark(theme, autoIsDark);
    const nextTheme = isDark ? THEMES[0] : THEMES[1];
    return (
      <div className={`theme-control theme-control-cycle ${compact ? "compact" : ""}${isTransitioning ? " is-transitioning" : ""}`}>
        <button
          type="button"
          className="active"
          aria-label={`${isDark ? "Tema escuro" : "Tema claro"}. Mudar para ${nextTheme.label}`}
          title={`${isDark ? "Tema escuro" : "Tema claro"} · mudar para ${nextTheme.label}`}
          disabled={isTransitioning}
          onClick={() => update(nextTheme.value)}
        >
          <span className="theme-control-glyph" aria-hidden="true"><ThemeGlyph theme={isDark ? "ESCURO" : "CLARO"} /></span>
          <small>{isDark ? "Tema escuro" : "Tema claro"}</small>
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
          disabled={isTransitioning}
          onClick={() => update(item.value)}
        >
          <span className="theme-control-glyph" aria-hidden="true"><ThemeGlyph theme={item.value} /></span>
          <small>{item.label}</small>
        </button>
      ))}
    </div>
  );
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "CLARO", label: "Tema claro" },
  { value: "ESCURO", label: "Tema escuro" },
  { value: "AUTO", label: "Tema automático" },
];

function ThemeGlyph({ theme }: { theme: Theme }) {
  if (theme === "CLARO") {
    return <svg viewBox="0 0 24 24"><circle className="theme-sun-core" cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></svg>;
  }
  if (theme === "ESCURO") {
    return <svg viewBox="0 0 24 24"><path d="M19.6 15.2A8 8 0 0 1 8.8 4.4 8.2 8.2 0 1 0 19.6 15.2Z" /></svg>;
  }
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path className="theme-auto-half" d="M12 4a8 8 0 0 1 0 16Z" /></svg>;
}

function normalizeTheme(value: string | null): Theme {
  return value === "CLARO" || value === "ESCURO" ? value : "AUTO";
}

function themeStorageKey(storageId: string) {
  const normalized = storageId.trim().toLowerCase();
  return normalized ? `vinkulo:theme:${normalized}` : "";
}

function systemPrefersDark() {
  if (typeof window === "undefined") return false;
  return document.documentElement.dataset.theme === "dark" ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function currentThemeIsDark(theme: Theme, autoIsDark: boolean) {
  if (theme === "ESCURO") return true;
  if (theme === "CLARO") return false;
  return autoIsDark;
}

async function animateThemeChange(theme: Theme) {
  applyTheme(theme);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "AUTO") {
    root.removeAttribute("data-pilot-theme");
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = isDark ? "dark" : "light";
    root.style.colorScheme = isDark ? "dark" : "light";
    return;
  }
  const isDark = theme === "ESCURO";
  root.dataset.pilotTheme = theme.toLowerCase();
  root.dataset.theme = isDark ? "dark" : "light";
  root.style.colorScheme = isDark ? "dark" : "light";
}
