"use client";

import { useRef, useState } from "react";
import { useThemePreference } from "../lib/use-theme-preference";
import { applyTheme, type ThemePreference as Theme } from "../lib/theme-preference";

export default function ThemeControl({
  compact = false,
  cycle = false,
  storageId = "",
  onManualChange,
}: {
  compact?: boolean;
  cycle?: boolean;
  storageId?: string;
  onManualChange?: () => void;
}) {
  const { theme, resolvedDark, updateTheme } = useThemePreference(storageId);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionInProgress = useRef(false);

  function update(next: Theme) {
    if (transitionInProgress.current) return;
    transitionInProgress.current = true;
    setIsTransitioning(true);
    onManualChange?.();
    updateTheme(next);
    animateThemeChange(next).finally(() => {
      transitionInProgress.current = false;
      setIsTransitioning(false);
    });
  }

  if (cycle) {
    const isDark = resolvedDark;
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

async function animateThemeChange(theme: Theme) {
  applyTheme(theme);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
}
