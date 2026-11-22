import { LOGO_LOADING_KEY, initialLogoLabel, parseLogoLoadingState } from "./logo-loading-state";
/** Page readiness is driven by mounted loaders, never by background polling. */
const LOGO_REVEAL_MS = 640;
const RECOVERY_MS = 25000;
// Only existing full-page loaders and Visitantes opt into the branded overlay.
// Module imports, tab skeletons and ordinary navigation keep local feedback.
const LOADERS = '[data-vinkulo-loading], .vp-loading[aria-busy="true"], .vp-main[data-page-loading="true"]';
// These only delay an already active arrival; they never start one on a normal tab.
const READINESS = '[data-vinkulo-content-loading="true"], [data-page-loading="true"], .workspace-module-loading[aria-busy="true"], .owner-loading, .oc-loading, .people-loading, .gestao-loading, .event-skeleton-grid, .secretary-skeleton-hero, .request-care-skeleton, .network-loading, .editorial-loading, .statistics-loading, .platform-optimizer-loading, .cells-load-state[aria-busy="true"], .storage-load-state[aria-busy="true"], .central-dashboard[aria-busy="true"], .day-thread-main-v5[aria-busy="true"]';

export function mountLogoTransition(overlay: HTMLDivElement) {
  const root = document.documentElement;
  const content = document.getElementById("main-content");
  const backdrop = overlay.querySelector<HTMLElement>(".platform-loading-backdrop")!;
  const symbol = overlay.querySelector<HTMLElement>(".platform-loading-symbol")!;
  const labelBox = overlay.querySelector<HTMLElement>(".platform-loading-label")!;
  const label = overlay.querySelector<HTMLElement>(".platform-loading-message")!;
  const pulse = overlay.querySelector<HTMLElement>(".vinkulo-animated-mark")!;
  const recovery = overlay.querySelector<HTMLElement>(".platform-loading-recovery")!;
  const revealSurface = content || backdrop;
  const revealPoses = [["logo", symbol, null], ["halo", overlay, "::before"], ["label", labelBox, null]] as const;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let phase: "idle" | "waiting" | "revealing" = "idle";
  let started = 0;
  let dismissed = false;
  let readyFrame = 0;
  let revealFallback = 0;
  let safety = 0;
  let destination: HTMLElement | undefined;
  const previousInert = content?.inert ?? false;
  const activeBefore = () => document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let previousFocus = activeBefore();
  const setPhase = (next: typeof phase) => {
    phase = next;
    overlay.dataset.phase = next;
    if (next === "idle") delete root.dataset.logoTransition;
    else root.dataset.logoTransition = next;
    if (content) content.inert = next !== "idle" || previousInert;
  };
  const releaseDestination = () => {
    destination?.removeAttribute("data-vinkulo-destination");
    destination = undefined;
  };
  const clearReveal = () => {
    window.clearTimeout(revealFallback);
    releaseDestination();
    delete overlay.dataset.logoFlight;
    for (const [name] of revealPoses) {
      overlay.style.removeProperty(`--vinkulo-${name}-from-transform`);
      overlay.style.removeProperty(`--vinkulo-${name}-from-opacity`);
    }
    overlay.style.removeProperty("--vinkulo-pulse-from-transform");
    overlay.style.removeProperty("--vinkulo-logo-flight-transform");
    root.style.removeProperty("--vinkulo-reveal-duration");
    root.style.removeProperty("--vinkulo-page-entry-transform");
  };
  const cancelReadyFrame = () => {
    window.cancelAnimationFrame(readyFrame);
    readyFrame = 0;
  };
  const finish = () => {
    cancelReadyFrame();
    window.clearTimeout(safety);
    setPhase("idle");
    clearReveal();
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
  const start = (message = "Preparando sua experiência", since = Date.now()) => {
    if (phase === "idle") previousFocus = activeBefore();
    if (phase === "revealing") clearReveal();
    started = since;
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
    window.clearTimeout(safety);
    if (reducedMotion.matches) { finish(); return; }

    // Capture the rendered pose so a cached page can reveal during the entrance.
    const poses = revealPoses.map(([name, part, pseudo]) => {
      const { transform, opacity } = getComputedStyle(part, pseudo);
      return { name, transform, opacity };
    });
    const pulseTransform = getComputedStyle(pulse).transform;
    const frame = overlay.getBoundingClientRect();
    const zoom = frame.width / overlay.offsetWidth || 1;
    let flightTransform: string | undefined;
    // Measure before translating the page so the mark lands at its resting position.
    for (const mark of document.querySelectorAll<HTMLElement>("[data-vinkulo-logo]")) {
      if (mark.closest("[data-vinkulo-loading], .platform-loading-transition")) continue;
      const rect = mark.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth || getComputedStyle(mark).visibility === "hidden") continue;
      const x = (rect.left + rect.width / 2 - frame.left - frame.width / 2) / zoom;
      const y = (rect.top + rect.height / 2 - frame.top - frame.height / 2) / zoom;
      const scale = Math.min(rect.width / symbol.offsetWidth, rect.height / symbol.offsetHeight) / zoom;
      destination = mark;
      flightTransform = `translate(${x}px, ${y}px) scale(${scale})`;
      break;
    }
    if (destination && flightTransform) {
      destination.setAttribute("data-vinkulo-destination", "");
      overlay.dataset.logoFlight = "true";
      overlay.style.setProperty("--vinkulo-logo-flight-transform", flightTransform);
    }
    for (const { name, transform, opacity } of poses) {
      overlay.style.setProperty(`--vinkulo-${name}-from-transform`, transform);
      overlay.style.setProperty(`--vinkulo-${name}-from-opacity`, opacity);
    }
    overlay.style.setProperty("--vinkulo-pulse-from-transform", pulseTransform);
    root.style.setProperty("--vinkulo-reveal-duration", `${LOGO_REVEAL_MS}ms`);
    if (window.scrollY) root.style.setProperty("--vinkulo-page-entry-transform", "none");
    setPhase("revealing");
    // Watchdog for environments that suppress CSS animation events.
    revealFallback = window.setTimeout(finish, LOGO_REVEAL_MS + 180);
  };
  const contentPending = () => Array.from(document.querySelectorAll<HTMLElement>(READINESS))
    .some(marker => marker.getClientRects().length > 0);
  const sync = () => {
    const pending = document.querySelector<HTMLElement>(LOADERS);
    if (pending) {
      cancelReadyFrame();
      if (dismissed) return;
      const message = pending.dataset.vinkuloLoading || "Carregando esta página…";
      if (phase !== "waiting") start(message, phase === "revealing" ? started : Date.now());
      else if (label.textContent !== message) label.textContent = message;
      return;
    }
    dismissed = false;
    if (phase === "idle" || document.readyState !== "complete") return;
    if (contentPending()) {
      cancelReadyFrame();
      if (phase === "revealing") start(label.textContent || undefined, started);
      return;
    }
    if (phase !== "waiting" || readyFrame) return;
    // Recheck after a paint so adjacent React commits can register their loaders.
    readyFrame = window.requestAnimationFrame(() => {
      readyFrame = window.requestAnimationFrame(() => {
        readyFrame = 0;
        if (!document.querySelector(LOADERS) && !contentPending()) reveal();
      });
    });
  };
  const onPageShow = (event: PageTransitionEvent) => {
    // A restored document is already ready. Ignore departure markers until
    // their components clear them, then accept the next explicit load.
    if (event.persisted) { dismissed = Boolean(document.querySelector(LOADERS)); finish(); }
  };
  const onRetry = () => window.location.reload();
  const onDismiss = () => { dismissed = true; finish(); };
  const onRevealEnd = (event: AnimationEvent) => {
    const animation = content ? "vinkulo-page-in" : "vinkulo-backdrop-out";
    if (event.target === revealSurface && event.animationName === animation && phase === "revealing") finish();
  };
  const onMotionChange = () => { if (phase === "revealing" && reducedMotion.matches) finish(); };
  const observer = new MutationObserver(sync);
  root.dataset.logoController = "ready";
  delete root.dataset.logoUnavailable;
  observer.observe(content || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy", "data-page-loading", "data-vinkulo-loading", "data-vinkulo-content-loading"] });
  // Portaled login and navigation loaders live outside main-content.
  observer.observe(document.body, { childList: true });
  window.addEventListener("load", sync);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("resize", releaseDestination);
  revealSurface.addEventListener("animationend", onRevealEnd);
  reducedMotion.addEventListener("change", onMotionChange);
  overlay.querySelector("[data-loading-retry]")?.addEventListener("click", onRetry);
  overlay.querySelector("[data-loading-dismiss]")?.addEventListener("click", onDismiss);
  // Once per document, entering the community starts the arrival animation.
  // Local tab changes use history and never remount this controller.
  let continuation = parseLogoLoadingState(JSON.stringify({started:Number(root.dataset.logoLoadingStarted),label:root.dataset.logoLoadingLabel}));
  if (!continuation) try { continuation = parseLogoLoadingState(sessionStorage.getItem(LOGO_LOADING_KEY)); } catch { /* Storage is optional. */ }
  const entryLabel = initialLogoLabel(location.pathname, location.search);
  if (continuation) start(continuation.label, continuation.started);
  else if (entryLabel) start(entryLabel);
  else setPhase("idle");
  sync();
  return () => {
    observer.disconnect();
    window.removeEventListener("load", sync);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("resize", releaseDestination);
    revealSurface.removeEventListener("animationend", onRevealEnd);
    reducedMotion.removeEventListener("change", onMotionChange);
    overlay.querySelector("[data-loading-retry]")?.removeEventListener("click", onRetry);
    overlay.querySelector("[data-loading-dismiss]")?.removeEventListener("click", onDismiss);
    finish();
    delete root.dataset.logoController;
  };
}
