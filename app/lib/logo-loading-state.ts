export const LOGO_LOADING_KEY = "vinkulo:page-loading";
export function parseLogoLoadingState(raw: string | null, now = Date.now()): { started: number; label: string } | null {
  try {
    const state = JSON.parse(raw || "null");
    if (!state || !Number.isFinite(state.started) || state.started > now || now - state.started > 30000 || typeof state.label !== "string" || state.label.length > 180) return null;
    return { started: state.started, label: state.label };
  } catch { return null; }
}
export function initialLogoLabel(pathname: string, search: string): string | null {
  const view = new URLSearchParams(search).get("view");
  if (pathname === "/painel" && (!view || view === "inicio")) return "Entrando na comunidade…";
  if (pathname === "/painel/visitantes") return "Abrindo Visitantes…";
  return null;
}
function bootstrap(key: string, parse: typeof parseLogoLoadingState, labelFor: typeof initialLogoLabel) {
  let previous = null;
  try { previous = parse(sessionStorage.getItem(key)); } catch { /* Storage is optional. */ }
  const label = previous?.label || labelFor(location.pathname, location.search);
  if (!label) return;
  const state = previous || {started: Date.now(), label};
  try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* Storage is optional. */ }
  const root = document.documentElement;
  root.dataset.logoLoadingStarted = String(state.started);
  root.dataset.logoLoadingLabel = state.label;
  root.dataset.logoTransition = "waiting";
  root.style.setProperty("--vinkulo-loading-offset", `${-(Date.now() - state.started)}ms`);
}
// Set the arrival state in <head>, before any page content can be painted.
export const LOGO_LOADING_BOOTSTRAP = `(${bootstrap.toString()})(${JSON.stringify(LOGO_LOADING_KEY)},${parseLogoLoadingState.toString()},${initialLogoLabel.toString()});`;
