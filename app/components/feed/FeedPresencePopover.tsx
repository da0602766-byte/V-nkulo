"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./feed-interactions.css";

/** Prefer the left of the right-hand rail; fall back inline when neither side fits. */
export function presencePopoverPosition(anchor: { left: number; right: number; top: number }, height: number, viewportWidth: number, viewportHeight: number) {
  const gap = 12;
  const width = 300;
  if (viewportWidth < 1000) return null;
  const left = anchor.left >= width + gap * 2 ? anchor.left - width - gap
    : viewportWidth - anchor.right >= width + gap * 2 ? anchor.right + gap : null;
  if (left === null) return null;
  const maxHeight = Math.max(44, viewportHeight - gap * 2);
  return { left, top: Math.max(gap, Math.min(anchor.top, viewportHeight - Math.min(height, maxHeight) - gap)), width, maxHeight };
}

export default function FeedPresencePopover({ id, label, anchorRef, triggerRef, onClose, onDismiss, children }: {
  id: string;
  label: string;
  anchorRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const [position, setPosition] = useState<ReturnType<typeof presencePopoverPosition>>(null);
  const floating = position !== null;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    // The clicked button is assigned before render. The row's conditional DOM
    // ref may not attach until after this child's first layout effect.
    const anchor = triggerRef.current;
    if (!panel || !anchor) return;
    const update = () => {
      const viewport = window.visualViewport;
      const offsetTop = viewport?.offsetTop || 0;
      const offsetLeft = viewport?.offsetLeft || 0;
      const rect = anchor.getBoundingClientRect();
      const next = presencePopoverPosition({ left: rect.left - offsetLeft, right: rect.right - offsetLeft, top: rect.top - offsetTop }, panel.getBoundingClientRect().height, viewport?.width || window.innerWidth, viewport?.height || window.innerHeight);
      if (next) { next.left += offsetLeft; next.top += offsetTop; }
      setPosition((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    observer.observe(anchor);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [triggerRef, floating]);

  useLayoutEffect(() => {
    if (!floating || focusedRef.current) return;
    focusedRef.current = true;
    panelRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [floating]);

  useLayoutEffect(() => {
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !anchorRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) onDismiss();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [anchorRef, onDismiss]);

  const panel = <div ref={panelRef} id={id} className={`presence-profile-popover feed-presence-popover${floating ? " feed-presence-floating" : ""}`} style={position || undefined} role={floating ? "dialog" : "region"} aria-label={label} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (!floating || event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    if ((event.shiftKey && document.activeElement === controls[0]) || (!event.shiftKey && document.activeElement === controls.at(-1))) {
      // Resume the list's tab order instead of jumping to the end of document.body.
      if (event.shiftKey) event.preventDefault();
      triggerRef.current?.focus({ preventScroll: true });
      onDismiss();
    }
  }}>{children}</div>;
  return floating ? createPortal(panel, document.body) : panel;
}
