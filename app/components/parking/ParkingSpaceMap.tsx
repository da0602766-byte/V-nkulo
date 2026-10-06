"use client";

import { useRef, useState } from "react";
import { hasCustomParkingLayout, isSpaceAvailable, parkingLabel } from "./format";
import type { Space } from "./types";

export function spaceState(space: Space) {
  if (space.status === "OCUPADA") return { label: "Ocupada", className: "occupied", mark: "●" };
  if (space.status !== "LIVRE") return { label: "Indisponível", className: "blocked", mark: "×" };
  if (space.reservada) return { label: "Reservada", className: "reserved", mark: "R" };
  return { label: "Disponível", className: "available", mark: "○" };
}

export default function ParkingSpaceMap({ spaces, selectedId, onSelect, busy = false }: {
  spaces: Space[]; selectedId: number | null; onSelect: (space: Space) => void; busy?: boolean;
}) {
  const [mode, setMode] = useState<"map" | "list">("map");
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const positioned = hasCustomParkingLayout(spaces);
  const list = mode === "list" || !positioned;
  const width = Math.max(280, ...spaces.map(s => s.posicao_x + 72));
  const height = Math.max(160, ...spaces.map(s => s.posicao_y + 64));

  return <section className="parking-v2-map" aria-label="Mapa de vagas">
    <div className="parking-v2-map-tools">
      <div role="group" aria-label="Visualização das vagas">
        <button type="button" aria-pressed={!list} disabled={!positioned} onClick={() => setMode("map")}>Mapa</button>
        <button type="button" aria-pressed={list} onClick={() => setMode("list")}>Lista de vagas</button>
      </div>
      {!list && <div role="group" aria-label="Zoom do mapa">
        <button type="button" aria-label="Reduzir mapa" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1,z-.25))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Ampliar mapa" disabled={zoom >= 2} onClick={() => setZoom(z => Math.min(2,z+.25))}>+</button>
        <button type="button" onClick={() => { setZoom(1); viewport.current?.scrollTo({ left:0,top:0 }); }}>Voltar ao início</button>
      </div>}
    </div>
    {!positioned && spaces.length > 0 && <p className="parking-v2-note">As posições deste setor precisam ser configuradas ou revisadas pela gestão. A lista mostra as vagas cadastradas.</p>}
    <div className="parking-v2-legend" aria-label="Legenda">
      <span className="available">○ Disponível</span><span className="reserved">R Reservada</span>
      <span className="occupied">● Ocupada</span><span className="blocked">× Indisponível</span>
      <span className="selected">✓ Selecionada</span><span>Minha: sua reserva</span><span>PCD / Idoso: tipo da vaga</span>
    </div>
    {!list && <p className="parking-v2-map-hint">Arraste para navegar. No celular, deslize para os lados. No teclado, use Tab e Enter.</p>}
    <div ref={viewport} className={list ? "parking-v2-space-list" : "parking-v2-map-viewport"}
      onPointerDown={event => {
        if (list || event.pointerType !== "mouse") return;
        const node=event.currentTarget;
        drag.current={x:event.clientX,y:event.clientY,left:node.scrollLeft,top:node.scrollTop,moved:false}; suppressClick.current=false;
      }}
      onPointerMove={event => {
        const state=drag.current;
        if (!state || !event.buttons) return;
        const dx=event.clientX-state.x,dy=event.clientY-state.y;
        if (Math.abs(dx)+Math.abs(dy)>6) { state.moved=true; suppressClick.current=true; event.currentTarget.scrollLeft=state.left-dx; event.currentTarget.scrollTop=state.top-dy; }
      }}
      onPointerUp={() => { drag.current=null; }} onPointerCancel={() => { drag.current=null; }}
      onClickCapture={event => { if(suppressClick.current) {event.preventDefault(); event.stopPropagation(); suppressClick.current=false;} }}>
      <div className={list ? "parking-space-lines" : "parking-v2-map-extent"} style={list ? undefined : {width:width*zoom,height:height*zoom}}>
        <div className={list ? "parking-space-lines" : "parking-v2-map-canvas"} style={list ? undefined : {width,height,transform:`scale(${zoom})`}}>
          {spaces.map(space => {
            const status=spaceState(space), selected=selectedId===space.id, own=Boolean(space.minha_reserva);
            const selectable=isSpaceAvailable(space) && !busy;
            const label=`Vaga ${space.codigo}, ${space.setor_nome}, ${parkingLabel(space.tipo)}, ${own ? "sua reserva" : status.label}${selected ? ", selecionada" : ""}`;
            return <button key={space.id} type="button" className={`parking-v2-space ${status.className}${selected ? " selected" : ""}${own ? " own" : ""}`}
              style={list ? undefined : {left:space.posicao_x,top:space.posicao_y}}
              aria-label={label} aria-pressed={selected} aria-disabled={!selectable && !own}
              onClick={() => {if(selectable || own) onSelect(space);}}>
              <strong>{space.codigo}</strong><span>{selected ? "✓" : own ? "Minha" : status.mark}</span>
              {list && <span>{status.label}</span>}{space.tipo!=="COMUM" && <small>{parkingLabel(space.tipo)}</small>}
            </button>;
          })}
        </div>
      </div>
      {!spaces.length && <p className="gestao-empty">O mapa deste estacionamento ainda não foi configurado.</p>}
    </div>
  </section>;
}
