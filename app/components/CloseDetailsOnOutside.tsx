"use client";

import { useEffect } from "react";

export default function CloseDetailsOnOutside() {
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((detail) => {
        const keepOpen = Boolean(
          detail.closest("details[data-keep-open-on-outside]"),
        );
        if (!keepOpen && (!target || !detail.contains(target))) {
          detail.open = false;
        }
      });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((detail) => {
        detail.open = false;
      });
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return null;
}
