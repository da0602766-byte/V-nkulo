import type { DashboardPeriod, OperationalDashboard } from "../lib/operational-dashboard-types";

const number = (value: number) => value.toLocaleString("pt-BR");
export default function OperationalDeliveryChart({ series, period }: { series: OperationalDashboard["series"]; period: DashboardPeriod }) {
  const maximum = Math.ceil(Math.max(2, ...series.map(item => item.accepted + item.failed + item.other)) / 2) * 2;
  const width = 720, height = 180, left = 0, bottom = 176, plotHeight = 164;
  const step = (width - left - 12) / Math.max(1, series.length);
  const label = (at: string) => new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", ...(period === "24h" ? { hour: "2-digit" as const } : {}),
  }).format(new Date(at));
  const total = series.reduce((sum, item) => sum + item.accepted + item.failed + item.other, 0);
  return <div className="opd-chart">
    <h4>Notificações ao longo do período</h4>
    <p>Estado por última atualização, por {period === "24h" ? "hora" : "dia"}. Horário de Brasília; primeiro e último intervalos podem ser parciais.</p>
    <div className="opd-chart-legend"><span><i className="opd-accepted" />Aceitas</span><span><i className="opd-failed" />Falhas</span><span><i className="opd-other" />Demais estados</span></div>
    <p className="opd-chart-scale">Escala: 0 a {number(maximum)} registros por intervalo</p>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Gráfico de notificações: ${number(total)} registros em ${series.length} intervalos. Consulte os valores na tabela abaixo.`}>
      {[0, .5, 1].map(ratio => <g key={ratio}><line className="opd-gridline" x1={left} x2={width - 12} y1={bottom - ratio * plotHeight} y2={bottom - ratio * plotHeight} />
        </g>)}
      {series.map((item, index) => {
        const x = left + index * step + step * .15, bar = step * .7;
        const values = [item.accepted, item.failed, item.other], colors = ["opd-accepted", "opd-failed", "opd-other"];
        let used = 0;
        return <g key={item.at}><title>{label(item.at)}: {item.accepted} aceitas, {item.failed} falhas, {item.other} demais estados</title>
          {values.map((value, i) => { const h = value / maximum * plotHeight; used += h; return <rect key={i} className={colors[i]} x={x} y={bottom - used} width={bar} height={h} />; })}
        </g>;
      })}
    </svg>
    <div className="opd-chart-axis" aria-hidden="true">{[0, Math.floor(series.length / 2), series.length - 1].map(index => <span key={index}>{series[index] ? label(series[index].at) : ""}</span>)}</div>
    {!total && <p className="opd-chart-empty">Sem registros para este período e canal.</p>}
    <details><summary>Ver valores em tabela</summary><div className="opd-table-scroll" tabIndex={0} role="region" aria-label="Valores do gráfico de notificações">
      <table><caption>Registros por última atualização · horário de Brasília</caption><thead><tr><th scope="col">Intervalo</th><th scope="col">Aceitas</th><th scope="col">Falhas</th><th scope="col">Demais</th></tr></thead>
        <tbody>{series.map(item => <tr key={item.at}><th scope="row">{label(item.at)}</th><td>{number(item.accepted)}</td><td>{number(item.failed)}</td><td>{number(item.other)}</td></tr>)}</tbody></table>
    </div></details>
  </div>;
}
