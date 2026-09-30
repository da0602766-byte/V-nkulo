"use client";

import { useEffect, type RefObject } from "react";

/** Measures navigation, including enlarged text, safe areas and the raised add button. */
export default function useFeedbackPosition(region: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const observed = new Set<Element>();
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    function measure() {
      const targets = [...document.querySelectorAll<HTMLElement>(".pilot-mobile-nav, .public-mobile-nav")];
      const current = new Set<Element>([...targets, ...(region.current ? [region.current] : [])]);
      for (const target of observed) if (!current.has(target)) { resize.unobserve(target); observed.delete(target); }
      for (const target of current) if (!observed.has(target)) { resize.observe(target); observed.add(target); }
      let bottom = 24;
      for (const nav of targets) {
        if (!nav.getClientRects().length || getComputedStyle(nav).visibility === "hidden") continue;
        const top = Math.min(nav.getBoundingClientRect().top, ...Array.from(nav.children).map(child => child.getBoundingClientRect().top));
        bottom = Math.max(bottom, window.innerHeight - top + 12);
      }
      const scale = Number.parseFloat(getComputedStyle(root).zoom) || 1;
      root.style.setProperty("--app-feedback-bottom", `${bottom / scale}px`);
      const height = region.current?.getBoundingClientRect().height || 0;
      root.style.setProperty("--app-feedback-help-bottom", `${(bottom + height + (height ? 12 : 0)) / scale}px`);
    }
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      root.style.removeProperty("--app-feedback-bottom");
      root.style.removeProperty("--app-feedback-help-bottom");
    };
  }, [region]);
}
