"use client";

import { useEffect } from "react";

const SELECTOR = "[data-smart-scroll-header]";

export default function SmartScrollHeader() {
  useEffect(() => {
    let previousY = window.scrollY;
    let frame = 0;

    const showAll = () => {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((header) => {
        header.dataset.scrollHidden = "false";
      });
    };

    const update = () => {
      frame = 0;
      const currentY = Math.max(0, window.scrollY);
      const delta = currentY - previousY;
      const headers = [...document.querySelectorAll<HTMLElement>(SELECTOR)];
      const isInteracting = headers.some((header) =>
        header.matches(":focus-within") || Boolean(header.querySelector("details[open]")),
      );

      if (currentY < 64 || delta < -8 || isInteracting) {
        showAll();
      } else if (delta > 8 && currentY > 110) {
        headers.forEach((header) => {
          header.dataset.scrollHidden = "true";
          header.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
            details.open = false;
          });
        });
      }
      previousY = currentY;
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    const onFocus = () => showAll();

    showAll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onFocus);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("focusin", onFocus);
    };
  }, []);

  return null;
}
