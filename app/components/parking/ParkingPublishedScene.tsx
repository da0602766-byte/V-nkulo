"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { ParkingScene } from "../../lib/parking-scene";
import type { Space } from "./types";
import ParkingSceneView from "./ParkingSceneView";

export default function ParkingPublishedScene({
  spaces,
  selectedId,
  onSelect,
  busy = false,
  fallback = null,
}: {
  spaces: Space[];
  selectedId: number | null;
  onSelect: (space: Space) => void;
  busy?: boolean;
  fallback?: ReactNode;
}) {
  const [scene, setScene] = useState<ParkingScene | null>(null);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const r = await fetch("/api/pilot/estacionamento/cenario", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!r.ok) {
          if (live) setScene(null);
          return;
        }
        const data = await r.json();
        if (live)
          setScene((previous) =>
            JSON.stringify(previous) === JSON.stringify(data.published)
              ? previous
              : data.published,
          );
      } catch {
        /* Existing accessible map remains available. */
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  if (!scene) return fallback;
  const ids = new Set(spaces.map((s) => s.id));
  const filtered = {
    ...scene,
    objects: scene.objects.filter(
      (o) => o.kind !== "space" || ids.has(o.spaceId || 0),
    ),
  };
  return (
    <ParkingSceneView
      scene={filtered}
      spaces={spaces}
      selected={scene.objects
        .filter((o) => o.spaceId === selectedId)
        .map((o) => o.id)}
      disabled={busy}
      onSelect={(id) => {
        const object = scene.objects.find((o) => o.id === id);
        const space = spaces.find((s) => s.id === object?.spaceId);
        if (space) onSelect(space);
      }}
    />
  );
}
