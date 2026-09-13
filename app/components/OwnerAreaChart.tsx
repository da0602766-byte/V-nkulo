"use client";

import { useId, useMemo, useState } from "react";
import "./OwnerAreaChart.css";

export type OwnerAreaPoint = { label: string; value: number; alert?: boolean };
export type OwnerAreaSeries = {
  name: string;
  color: "teal" | "violet";
  points: OwnerAreaPoint[];
};

/**
 * Gráfico de área suave com preenchimento em gradiente, no estilo adotado no
 * redesign da área do Proprietário (curva monótona, grade pontilhada, rótulo
 * ao passar o mouse). Implementado em SVG puro — sem biblioteca de gráficos —
 * para não acrescentar dependência nova a um app que hoje não usa nenhuma.
 *
 * Aceita uma ou duas séries (`series`), alinhadas pelo mesmo eixo de rótulos.
 * Com duas séries, só a primeira recebe preenchimento em gradiente — a
 * segunda vira só linha, para as áreas não se sobreporem visualmente.
 *
 * Pontos marcados com `alert: true` (ex.: um dia fora do padrão) ganham um
 * marcador destacado na cor de gravidade em vez de silenciosamente sumir
 * dentro da curva.
 */
export default function OwnerAreaChart({
  series,
  height = 220,
  formatValue = (value: number) => String(value),
  ariaLabel,
}: {
  series: OwnerAreaSeries[];
  height?: number;
  formatValue?: (value: number) => string;
  ariaLabel: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const largura = 600;
  const margemEsquerda = 6;
  const margemDireita = 6;
  const margemTopo = 12;
  const margemBase = 24;

  const rotulos = series[0]?.points.map((ponto) => ponto.label) || [];

  const construidas = useMemo(() => {
    const maximoGeral = Math.max(
      1,
      ...series.flatMap((serie) => serie.points.map((ponto) => ponto.value)),
    );
    const alturaUtil = height - margemTopo - margemBase;
    const base = height - margemBase;

    const suavizar = (pts: { x: number; y: number }[]) => {
      if (pts.length < 2) return pts.length ? `M ${pts[0].x} ${pts[0].y}` : "";
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
      }
      return d;
    };

    return series.map((serie) => {
      const passo =
        serie.points.length > 1
          ? (largura - margemEsquerda - margemDireita) / (serie.points.length - 1)
          : 0;
      const pontos = serie.points.map((ponto, indice) => ({
        ...ponto,
        x: margemEsquerda + passo * indice,
        y: margemTopo + alturaUtil * (1 - ponto.value / maximoGeral),
      }));
      const linhaPath = suavizar(pontos);
      const areaPath = pontos.length
        ? `${linhaPath} L ${pontos[pontos.length - 1].x} ${base} L ${pontos[0].x} ${base} Z`
        : "";
      return { ...serie, pontos, linhaPath, areaPath };
    });
  }, [series, height]);

  if (!series.length || !series[0]?.points.length) return null;

  const linhasGrade = 4;
  const principal = construidas[0];
  const cor = (nome: OwnerAreaSeries["color"]) =>
    nome === "violet" ? "var(--violet)" : "var(--teal)";

  return (
    <div className="oac-wrap">
      {series.length > 1 && (
        <div className="oac-legend">
          {series.map((serie) => (
            <span key={serie.name}>
              <i style={{ background: cor(serie.color) }} />
              {serie.name}
            </span>
          ))}
        </div>
      )}
      <svg
        className="oac-svg"
        viewBox={`0 0 ${largura} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={cor(principal.color)} stopOpacity={0.22} />
            <stop offset="100%" stopColor={cor(principal.color)} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {Array.from({ length: linhasGrade + 1 }, (_, indice) => {
          const y = margemTopo + ((height - margemTopo - margemBase) / linhasGrade) * indice;
          return (
            <line
              key={indice}
              className="oac-grid"
              x1={margemEsquerda}
              x2={largura - margemDireita}
              y1={y}
              y2={y}
            />
          );
        })}

        <path className="oac-area" d={principal.areaPath} fill={`url(#${gradientId})`} />

        {construidas.map((serie) => (
          <path
            key={serie.name}
            className="oac-line"
            d={serie.linhaPath}
            fill="none"
            style={{ stroke: cor(serie.color) }}
          />
        ))}

        {principal.pontos.map((ponto, indice) => (
          <g key={ponto.label + indice}>
            {construidas.map((serie) => (
              <circle
                key={serie.name}
                className={ponto.alert ? "oac-dot oac-dot-alert" : "oac-dot"}
                cx={serie.pontos[indice]?.x}
                cy={serie.pontos[indice]?.y}
                r={hover === indice ? 4.5 : ponto.alert ? 3.6 : 0}
                style={ponto.alert ? undefined : { stroke: cor(serie.color) }}
              />
            ))}
            {/* Área de captura de hover mais larga que o ponto visível. */}
            <rect
              x={ponto.x - (principal.pontos.length > 1 ? largura / principal.pontos.length / 2 : largura / 2)}
              y={0}
              width={principal.pontos.length > 1 ? largura / principal.pontos.length : largura}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHover(indice)}
            />
          </g>
        ))}
      </svg>

      <div className="oac-axis">
        {rotulos.map((rotulo, indice) => (
          <span
            key={rotulo + indice}
            className={indice === hover ? "oac-axis-label active" : "oac-axis-label"}
          >
            {rotulo}
          </span>
        ))}
      </div>

      {hover !== null && (
        <div
          className="oac-tooltip"
          style={{
            left: `${(principal.pontos[hover].x / largura) * 100}%`,
            top: `${(principal.pontos[hover].y / height) * 100}%`,
          }}
        >
          {construidas.map((serie) => (
            <div key={serie.name} className="oac-tooltip-row">
              <strong>{formatValue(serie.pontos[hover]?.value ?? 0)}</strong>
              {series.length > 1 && <span>{serie.name}</span>}
            </div>
          ))}
          <span className="oac-tooltip-label">{rotulos[hover]}</span>
        </div>
      )}
    </div>
  );
}
