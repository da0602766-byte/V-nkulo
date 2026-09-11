"use client";

import { useState } from "react";

export type ChartSets = Record<"semana" | "mes" | "ano", { labels: string[]; values: number[] }>;

export default function DashboardChart({ datasets }: { datasets: ChartSets }) {
  const [period, setPeriod] = useState<keyof ChartSets>("semana");
  const data = datasets[period];
  const max = Math.max(1, ...data.values);

  return (
    <article className="panel chart-panel" id="relatorios">
      <div className="panel-heading">
        <div><p className="eyebrow">CRESCIMENTO</p><h2>Visitantes por período</h2></div>
        <div className="period-tabs" role="group" aria-label="Período do gráfico">
          {(["semana", "mes", "ano"] as const).map((item) => (
            <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>
              {item === "mes" ? "Mês" : item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-summary"><strong>{data.values.reduce((sum, value) => sum + value, 0)}</strong><span>visitantes no período selecionado</span></div>
      <div className="bar-chart" aria-label={`Gráfico de visitantes por ${period}`}>
        {data.values.map((value, index) => (
          <div className="bar-column" key={`${data.labels[index]}-${index}`}>
            <span className="bar-value">{value}</span>
            <span className="bar" style={{ height: `${Math.max(8, (value / max) * 100)}%` }} />
            <small>{data.labels[index]}</small>
          </div>
        ))}
      </div>
    </article>
  );
}
