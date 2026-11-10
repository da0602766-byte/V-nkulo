/** Automatic welcome dialogs must not cover the arrival animation's top layer. */
export function openDialogAfterLoading(dialog: HTMLDialogElement, onOpen?: () => void) {
  const root = document.documentElement;
  const observer = new MutationObserver(open);
  function open() {
    const overlay = document.querySelector<HTMLElement>(".platform-loading-transition");
    if (!root.dataset.logoUnavailable && overlay && overlay.dataset.phase !== "idle") return;
    observer.disconnect();
    if (dialog.isConnected && !dialog.open) { dialog.showModal(); onOpen?.(); }
  }
  observer.observe(root, { attributes: true, attributeFilter: ["data-logo-transition", "data-logo-unavailable"] });
  open();
  return () => observer.disconnect();
}
