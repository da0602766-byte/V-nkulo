export type ThemePreference = "CLARO" | "ESCURO" | "AUTO";

const THEME_KEY = "vinkulo-theme";
const THEME_EVENT = "vinkulo:theme-change";
const SYSTEM_THEME = "(prefers-color-scheme: dark)";

export function normalizeTheme(value: string | null): ThemePreference | null {
  const normalized = value?.toUpperCase();
  return normalized === "CLARO" || normalized === "ESCURO" || normalized === "AUTO" ? normalized : null;
}

export function themeStorageKey(storageId: string) {
  const normalized = storageId.trim().toLowerCase();
  return normalized ? `vinkulo:theme:${normalized}` : "";
}

export function readThemePreference(storageId = "", fallback: ThemePreference = "AUTO"): ThemePreference {
  try {
    const individualKey = themeStorageKey(storageId);
    return normalizeTheme(individualKey ? window.localStorage.getItem(individualKey) : null) ||
      normalizeTheme(window.localStorage.getItem(THEME_KEY)) ||
      normalizeTheme(window.localStorage.getItem("vinkulo-login-theme")) || fallback;
  } catch {
    return normalizeTheme(document.documentElement.dataset.themePreference || null) || fallback;
  }
}

export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  const dark = theme === "ESCURO" || (theme === "AUTO" && window.matchMedia(SYSTEM_THEME).matches);
  root.dataset.themePreference = theme;
  root.dataset.theme = dark ? "dark" : "light";
  if (theme === "AUTO") root.removeAttribute("data-pilot-theme");
  else root.dataset.pilotTheme = theme.toLowerCase();
  root.style.colorScheme = dark ? "dark" : "light";
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function saveThemePreference(theme: ThemePreference, storageId = "") {
  // A interface continua funcionando quando o navegador bloqueia o armazenamento.
  try {
    window.localStorage.setItem(THEME_KEY, theme);
    const individualKey = themeStorageKey(storageId);
    if (individualKey) window.localStorage.setItem(individualKey, theme);
    window.localStorage.removeItem("vinkulo-login-theme");
  } catch { /* A preferência ainda vale nesta página. */ }
  applyTheme(theme);
}

export function getThemeSnapshot() {
  const root = document.documentElement;
  return `${normalizeTheme(root.dataset.themePreference || null) || "AUTO"}:${root.dataset.theme === "dark" ? "dark" : "light"}`;
}

export function subscribeThemePreference(onChange: () => void) {
  const media = window.matchMedia(SYSTEM_THEME);
  const systemChanged = () => {
    if (document.documentElement.dataset.themePreference === "AUTO") applyTheme("AUTO");
  };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) applyTheme(readThemePreference());
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", storageChanged);
  media.addEventListener("change", systemChanged);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", storageChanged);
    media.removeEventListener("change", systemChanged);
  };
}

// Executado antes da primeira pintura. A chave antiga do login é apenas fallback
// de migração; uma escolha global explícita, inclusive AUTO, sempre prevalece.
export const THEME_BOOTSTRAP_SCRIPT = "(()=>{let t='AUTO';try{const n=v=>['CLARO','ESCURO','AUTO'].includes((v||'').toUpperCase())?(v||'').toUpperCase():null;t=n(localStorage.getItem('vinkulo-theme'))||n(localStorage.getItem('vinkulo-login-theme'))||'AUTO'}catch{}const r=document.documentElement,d=t==='ESCURO'||(t==='AUTO'&&matchMedia('(prefers-color-scheme: dark)').matches);r.dataset.themePreference=t;r.dataset.theme=d?'dark':'light';if(t==='AUTO')delete r.dataset.pilotTheme;else r.dataset.pilotTheme=t.toLowerCase();r.style.colorScheme=d?'dark':'light'})();";
