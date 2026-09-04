"use client";
import { useEffect, useRef, type RefObject } from "react";

/** Keep keyboard focus in an open modal and return it to its trigger. */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>, onEscape?: () => void) {
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);
  useEffect(() => {
    if (!open || !ref.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
    )).filter(element => element.getClientRects().length > 0);
    focusables()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); escapeRef.current?.(); return; }
      if (event.key !== "Tab") return;
      const elements = focusables();
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener("keydown", keydown);
    return () => { dialog.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, [open, ref]);
}
