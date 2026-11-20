"use client";

import { Activity, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import "./workspace-experience.css";
import { WorkspaceDrafts } from "./WorkspaceDrafts";

/** Keep only visited, authorized areas in memory. Activity suspends hidden effects.
 * The parent key changes with user, community and permissions, clearing all drafts. */
export default function WorkspaceDeck<T extends string>({ active, allowed, children, onNavigate }: {
  active: T; allowed: readonly T[]; children: (view: T) => ReactNode; onNavigate: (view: T) => void;
}) {
  const [visited, setVisited] = useState<T[]>([active]);
  if (!visited.includes(active)) setVisited([...visited, active]);
  return <WorkspaceDrafts><div className="workspace-experience" onClickCapture={event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    const destination = url.searchParams.get("view") as T;
    if (url.origin === window.location.origin && url.pathname === "/painel" && url.searchParams.size === 1 && !url.hash && allowed.includes(destination)) {
      event.preventDefault(); onNavigate(destination);
    }
  }}>{visited.filter(view => allowed.includes(view)).map(view =>
    <Activity key={view} mode={view === active ? "visible" : "hidden"}>
      <WorkspacePosition><div data-workspace-area={view}>{children(view)}</div></WorkspacePosition>
    </Activity>
  )}</div></WorkspaceDrafts>;
}

function WorkspacePosition({ children }: { children: ReactNode }) {
  const position = useRef<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: position.current ?? 0, behavior: "instant" });
    });
    return () => {
      position.current = window.scrollY; cancelAnimationFrame(frame);
      element?.querySelectorAll<HTMLMediaElement>("video,audio").forEach(media => media.pause());
      element?.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(field => { field.value = ""; });
    };
  }, []);
  return <div ref={root}>{children}</div>;
}
