import { LOGO_LOADING_KEY, initialLogoLabel, parseLogoLoadingState } from "./logo-loading-state";
/** Page readiness is driven by mounted loaders, never by background polling. */
export const LOGO_REVEAL_MS = 2000;
// Let the two arms finish drawing once, even when the page is already cached.
const MIN_WAIT_MS = 1800;
const RECOVERY_MS = 25000;
// Only existing full-page loaders and Visitantes opt into the branded overlay.
// Module imports, tab skeletons and ordinary navigation keep local feedback.
const LOADERS = '[data-vinkulo-loading], .vp-loading[aria-busy="true"], .vp-main[data-page-loading="true"]';
// These only delay an already active arrival; they never start one on a normal tab.
const READINESS = '[data-vinkulo-content-loading="true"], [data-page-loading="true"], .workspace-module-loading[aria-busy="true"], .owner-loading, .oc-loading, .people-loading, .gestao-loading, .event-skeleton-grid, .secretary-skeleton-hero, .request-care-skeleton, .network-loading, .editorial-loading, .statistics-loading, .platform-optimizer-loading, .cells-load-state[aria-busy="true"], .storage-load-state[aria-busy="true"], .central-dashboard[aria-busy="true"], .day-thread-main-v5[aria-busy="true"]';

export function mountLogoTransition(overlay: HTMLDivElement) {
  const root = document.documentElement;
  const content = document.getElementById("main-content");
  const symbol = overlay.querySelector<HTMLElement>(".platform-loading-symbol")!;
  const label = overlay.querySelector<HTMLElement>(".platform-loading-label")!;
  const recovery = overlay.querySelector<HTMLElement>(".platform-loading-recovery")!;
  let phase = "idle";
  let started = performance.now();
  let dismissed = false;
  let timer = 0;
  let safety = 0;
  let destination: HTMLElement | undefined;
  let flight: Animation | undefined;
  const previousInert = content?.inert ?? false;
  const activeBefore = () => document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let previousFocus = activeBefore();
  const setPhase = (next: string) => {
    phase = next;
    overlay.dataset.phase = next;
    if (next === "idle") delete root.dataset.logoTransition;
    else root.dataset.logoTransition = next;
    if (content) content.inert = next !== "idle" || previousInert;
  };
  const cancelFlight = () => {
    flight?.cancel();
    flight = undefined;
    destination?.removeAttribute("data-vinkulo-destination");
    destination = undefined;
  };
  const finish = () => {
    window.clearTimeout(timer);
    window.clearTimeout(safety);
    cancelFlight();
    setPhase("idle");
    delete root.dataset.navigationLoading;
    delete root.dataset.logoLoadingStarted;
    delete root.dataset.logoLoadingLabel;
    root.style.removeProperty("--vinkulo-loading-offset");
    try { sessionStorage.removeItem(LOGO_LOADING_KEY); } catch { /* Storage is optional. */ }
    recovery.hidden = true;
    // Restore keyboard focus only when the overlay itself received it.
    if ((overlay.contains(document.activeElement) || document.activeElement === document.body) && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const armRecovery = () => {
    window.clearTimeout(safety);
    safety = window.setTimeout(() => { recovery.hidden = false; }, RECOVERY_MS);
  };
  const start = (message = "Carregando o Vínkulo…", since = Date.now()) => {
    if (phase === "idle") previousFocus = activeBefore();
    window.clearTimeout(timer);
    cancelFlight();
    delete overlay.dataset.noDestination;
    started = performance.now() - Math.max(0, Date.now() - since);
    root.style.setProperty("--vinkulo-loading-offset", `${-Math.max(0, Date.now() - since)}ms`);
    try { sessionStorage.setItem(LOGO_LOADING_KEY, JSON.stringify({ started: since, label: message })); } catch { /* Storage is optional. */ }
    dismissed = false;
    label.textContent = message;
    recovery.hidden = true;
    setPhase("waiting");
    armRecovery();
  };
  const reveal = () => {
    if (phase !== "waiting") return;
    setPhase("revealing");
    window.clearTimeout(safety);
    // Rects reflect the actual responsive header/sidebar, including browser zoom.
    destination = Array.from(document.querySelectorAll<HTMLElement>("[data-vinkulo-logo]"))
      .find(mark => {
        if (mark.closest("[data-vinkulo-loading], .platform-loading-transition")) return false;
        const rect = mark.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth && getComputedStyle(mark).visibility !== "hidden";
      });
    if (destination && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && typeof symbol.animate === "function") {
      const from = symbol.getBoundingClientRect();
      const to = destination.getBoundingClientRect();
      const zoom = overlay.getBoundingClientRect().width / overlay.offsetWidth || 1;
      destination.setAttribute("data-vinkulo-destination", "");
      flight = symbol.animate([
        { transform: "translate(-50%, -50%) scale(1)" },
        { transform: `translate(calc(-50% + ${(to.left + to.width / 2 - from.left - from.width / 2) / zoom}px), calc(-50% + ${(to.top + to.height / 2 - from.top - from.height / 2) / zoom}px)) scale(${to.width / from.width}, ${to.height / from.height})` },
      ], { duration: LOGO_REVEAL_MS, easing: "cubic-bezier(.22,.68,.18,1)", fill: "forwards" });
    } else {
      overlay.dataset.noDestination = "true";
    }
    timer = window.setTimeout(() => { delete overlay.dataset.noDestination; finish(); }, LOGO_REVEAL_MS);
  };
  const sync = () => {
    const pending = document.querySelector<HTMLElement>(LOADERS);
    if (pending) {
      if (dismissed) return;
      const message = pending.dataset.vinkuloLoading || "Carregando esta página…";
      if (phase !== "waiting") start(message, phase === "revealing" ? Date.now() - (performance.now() - started) : Date.now());
      else label.textContent = message;
      window.clearTimeout(timer);
      return;
    }
    dismissed = false;
    if (phase !== "waiting" || document.readyState !== "complete") return;
    window.clearTimeout(timer);
    if (Array.from(document.querySelectorAll<HTMLElement>(READINESS)).some(marker => marker.getClientRects().length > 0)) return;
    // Coalesce loaders that mount in adjacent React commits.
    timer = window.setTimeout(reveal, Math.max(300, MIN_WAIT_MS - (performance.now() - started)));
  };
  const onPageShow = (event: PageTransitionEvent) => {
    // A restored document is already ready. Ignore departure markers until
    // their components clear them, then accept the next explicit load.
    if (event.persisted) { dismissed = Boolean(document.querySelector(LOADERS)); finish(); }
  };
  const onRetry = () => window.location.reload();
  const onDismiss = () => { dismissed = true; finish(); };
  const onResize = () => {
    if (phase === "revealing") { cancelFlight(); overlay.dataset.noDestination = "true"; }
  };
  const observer = new MutationObserver(sync);
  root.dataset.logoController = "ready";
  delete root.dataset.logoUnavailable;
  setPhase("idle");
  observer.observe(content || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy", "data-page-loading", "data-vinkulo-loading", "data-vinkulo-content-loading"] });
  // Portaled login and navigation loaders live outside main-content.
  observer.observe(document.body, { childList: true });
  window.addEventListener("load", sync);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("resize", onResize);
  overlay.querySelector("[data-loading-retry]")?.addEventListener("click", onRetry);
  overlay.querySelector("[data-loading-dismiss]")?.addEventListener("click", onDismiss);
  // Once per document, entering the community starts the arrival animation.
  // Local tab changes use history and never remount this controller.
  let continuation = null;
  continuation = parseLogoLoadingState(JSON.stringify({started:Number(root.dataset.logoLoadingStarted),label:root.dataset.logoLoadingLabel}));
  if (!continuation) try { continuation = parseLogoLoadingState(sessionStorage.getItem(LOGO_LOADING_KEY)); } catch { /* Storage is optional. */ }
  const entryLabel = initialLogoLabel(location.pathname, location.search);
  if (continuation) start(continuation.label, continuation.started);
  else if (entryLabel) start(entryLabel);
  sync();
  return () => {
    observer.disconnect();
    window.removeEventListener("load", sync);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("resize", onResize);
    overlay.querySelector("[data-loading-retry]")?.removeEventListener("click", onRetry);
    overlay.querySelector("[data-loading-dismiss]")?.removeEventListener("click", onDismiss);
    finish();
    delete root.dataset.logoController;
  };
}
