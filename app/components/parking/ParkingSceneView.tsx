"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ParkingScene } from "../../lib/parking-scene";
import type { Space } from "./types";
import { spaceState } from "./ParkingSpaceMap";
import type { SceneRenderOptions, mountParkingRenderer } from "./parking-three";
import "./parking-scene.css";

type Props = {
  scene: ParkingScene;
  spaces: Space[];
  selected: string[];
  onSelect: (id: string, add: boolean) => void;
  onMove?: (id: string, x: number, y: number) => void;
  editing?: boolean;
  move?: boolean;
  snap?: boolean;
  disabled?: boolean;
};
export default function ParkingSceneView({
  scene,
  spaces,
  selected,
  onSelect,
  onMove,
  editing = false,
  move = false,
  snap = true,
  disabled = false,
}: Props) {
  const [mode, setMode] = useState<"3d" | "2d" | "list">("3d");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const engine = useRef<ReturnType<typeof mountParkingRenderer> | null>(null);
  const states = useMemo(() => {
    const byId = new Map(spaces.map((s) => [s.id, s]));
    return Object.fromEntries(
      scene.objects
        .filter((o) => o.kind === "space")
        .map((o) => [
          o.id,
          byId.has(o.spaceId || 0)
            ? spaceState(byId.get(o.spaceId!)!).className
            : "available",
        ]),
    );
  }, [scene.objects, spaces]);
  const options: SceneRenderOptions = {
    scene,
    selected,
    states,
    editing: editing && !disabled,
    top: false,
    move,
    snap,
    onSelect: (id, add) => {
      if (!disabled) onSelect(id, add);
    },
    onMove: (id, x, y) => {
      if (!disabled) onMove?.(id, x, y);
    },
    onError: () => {
      setFailed(true);
      setMode("2d");
    },
  };
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
    engine.current?.update(options);
  });
  useEffect(() => {
    if (mode !== "3d" || failed) return;
    let cancelled = false;
    import("./parking-three")
      .then(({ mountParkingRenderer }) => {
        if (cancelled || !host.current) return;
        try {
          engine.current = mountParkingRenderer(host.current, latest.current);
          setLoading(false);
        } catch {
          setFailed(true);
          setMode("2d");
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setMode("2d");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
    };
  }, [mode, failed]);
  const drag = useRef<{
    pointerId: number;
    id: string;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    originalX: number;
    originalY: number;
  } | null>(null);
  const xy = (e: React.PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  };
  const picked = scene.objects.find((o) => selected.includes(o.id));
  const visible = editing
    ? scene.objects
    : scene.objects.filter((o) => o.kind === "space");
  return (
    <section
      className="parking-scene"
      aria-label={
        editing
          ? "Editor visual do estacionamento"
          : "Mapa visual do estacionamento"
      }
    >
      <div className="parking-scene-toolbar">
        <div role="group" aria-label="Visualização">
          <button
            type="button"
            aria-pressed={mode === "3d"}
            disabled={failed}
            onClick={() => {
              setLoading(true);
              setMode("3d");
            }}
          >
            3D
          </button>
          <button
            type="button"
            aria-pressed={mode === "2d"}
            onClick={() => setMode("2d")}
          >
            2D
          </button>
          <button
            type="button"
            aria-pressed={mode === "list"}
            onClick={() => setMode("list")}
          >
            Lista
          </button>
        </div>
        <div>
          <button
            type="button"
            aria-label="Diminuir zoom"
            onClick={() => {
              engine.current?.zoom(1.2);
              setZoom((z) => Math.max(0.5, z / 1.2));
            }}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Aumentar zoom"
            onClick={() => {
              engine.current?.zoom(0.8);
              setZoom((z) => Math.min(5, z * 1.2));
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              engine.current?.reset();
              setZoom(1);
            }}
          >
            Centralizar
          </button>
          {mode === "3d" && selected.length > 0 && (
            <button type="button" onClick={() => engine.current?.focus()}>
              Localizar seleção
            </button>
          )}
        </div>
      </div>
      {failed && (
        <p role="status">
          Visualização 2D ativada. O 3D não está disponível neste aparelho.
        </p>
      )}
      {mode === "3d" && (
        <div className="parking-scene-stage" ref={host}>
          {loading && (
            <span className="parking-scene-loading" role="status">
              Preparando a maquete…
            </span>
          )}
        </div>
      )}
      {mode === "2d" && (
        <div className="parking-scene-flat">
          <svg
            ref={svg}
            role="img"
            aria-label="Planta do estacionamento; seleção também disponível na lista"
            viewBox={`0 0 ${scene.width} ${scene.depth}`}
            style={{ width: `${zoom * 100}%`, minHeight: 360 * zoom }}
            onPointerMove={(e) => {
              const d = drag.current,
                p = xy(e);
              if (!d || !p || d.pointerId !== e.pointerId) return;
              const node = svg.current?.querySelector(
                `[data-object="${d.id}"]`,
              );
              node?.setAttribute(
                "transform",
                `translate(${d.originalX + p.x - d.x} ${d.originalY + p.y - d.y}) rotate(${scene.objects.find((o) => o.id === d.id)?.rotation || 0})`,
              );
            }}
            onPointerUp={(e) => {
              const d = drag.current,
                p = xy(e);
              if (!d || !p || d.pointerId !== e.pointerId) return;
              drag.current = null;
              const moved =
                Math.hypot(e.clientX - d.clientX, e.clientY - d.clientY) > 5;
              const round = (n: number) =>
                Math.max(0, snap ? Math.round(n * 2) / 2 : n);
              if (moved)
                onMove?.(
                  d.id,
                  round(d.originalX + p.x - d.x),
                  round(d.originalY + p.y - d.y),
                );
              else onSelect(d.id, e.shiftKey);
            }}
            onPointerCancel={(e) => {
              const d = drag.current;
              if (d && d.pointerId !== e.pointerId) return;
              if (d) {
                const o = scene.objects.find((o) => o.id === d.id);
                svg.current
                  ?.querySelector(`[data-object="${d.id}"]`)
                  ?.setAttribute(
                    "transform",
                    `translate(${d.originalX} ${d.originalY}) rotate(${o?.rotation || 0})`,
                  );
              }
              drag.current = null;
            }}
          >
            <rect
              width={scene.width}
              height={scene.depth}
              rx=".6"
              fill={scene.ground}
            />
            {[...scene.objects]
              .sort(
                (a, b) =>
                  Number(a.kind === "space") - Number(b.kind === "space"),
              )
              .map((o) => (
                <g
                  key={o.id}
                  data-object={o.id}
                  transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`}
                  onPointerDown={(e) => {
                    if (!e.isPrimary || e.button !== 0) return;
                    if (disabled || (!editing && o.kind !== "space")) return;
                    const p = xy(e);
                    if (editing && move && !o.locked && p) {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      drag.current = {
                        pointerId: e.pointerId,
                        id: o.id,
                        x: p.x,
                        y: p.y,
                        clientX: e.clientX,
                        clientY: e.clientY,
                        originalX: o.x,
                        originalY: o.y,
                      };
                    } else onSelect(o.id, e.shiftKey);
                  }}
                  style={{
                    cursor: editing && move ? "move" : "pointer",
                    touchAction: editing && move ? "none" : "auto",
                  }}
                >
                  {o.kind === "tree" ? (
                    <ellipse rx={o.width / 2} ry={o.depth / 2} fill={o.color} />
                  ) : (
                    <rect
                      x={-o.width / 2}
                      y={-o.depth / 2}
                      width={o.width}
                      height={o.depth}
                      rx={o.kind === "space" ? 0.12 : 0.2}
                      fill={
                        o.kind === "space"
                          ? states[o.id] === "occupied"
                            ? "#69798f"
                            : states[o.id] === "reserved"
                              ? "#9f7c37"
                              : states[o.id] === "blocked"
                                ? "#626271"
                                : o.spaceType === "PCD"
                                  ? "#326eaf"
                                  : "#446653"
                          : o.color
                      }
                      stroke={
                        selected.includes(o.id)
                          ? "#b18aff"
                          : o.kind === "space"
                            ? "#fafafa"
                            : "none"
                      }
                      strokeWidth={selected.includes(o.id) ? 0.2 : 0.06}
                    />
                  )}
                  {(o.kind === "space" ||
                    o.kind === "sign" ||
                    o.kind === "gate") && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="white"
                      fontSize={Math.min(0.7, o.width / 4)}
                    >
                      {o.name}
                    </text>
                  )}
                </g>
              ))}
          </svg>
        </div>
      )}
      {mode === "list" && (
        <div className="parking-scene-object-list">
          {visible.length ? (
            visible.map((o) => (
              <button
                type="button"
                key={o.id}
                disabled={disabled}
                aria-pressed={selected.includes(o.id)}
                onClick={(e) => onSelect(o.id, e.shiftKey)}
              >
                <strong>{o.name}</strong>
                <span>
                  {o.kind === "space"
                    ? {
                        available: "Disponível",
                        occupied: "Ocupada",
                        reserved: "Reservada",
                        blocked: "Bloqueada",
                      }[states[o.id]]
                    : o.kind}
                </span>
              </button>
            ))
          ) : (
            <p>Nenhum elemento cadastrado.</p>
          )}
        </div>
      )}
      <div className="parking-scene-caption">
        <span>
          {editing
            ? move
              ? "Arraste o objeto. Use os campos para ajustes precisos."
              : "Selecione um objeto. Shift permite seleção múltipla."
            : "Arraste para explorar. Toque em uma vaga para consultar."}
        </span>
        {picked && (
          <strong className="parking-scene-picked">{picked.name}</strong>
        )}
      </div>
      <div className="parking-scene-legend">
        <span>🟢 Disponível</span>
        <span>🟡 Reservada</span>
        <span>● Ocupada</span>
        <span>× Bloqueada</span>
      </div>
    </section>
  );
}
