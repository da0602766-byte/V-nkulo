"use client";

// Atividade próxima de tempo real. Todos os números vêm de /api/proprietario/
// tempo-real, derivados das sessões reais. Indicadores sem telemetria chegam
// como null e são exibidos como "sem telemetria para este indicador ainda".

import { useCallback, useEffect, useRef, useState } from "react";
import "./OwnerOperationsWorkspaces.css";

const INTERVALO_MS = 30000;

type Bucket = { bucket: string; usuarios: number; sessoes: number };
type Realtime = {
  agora: {
    pessoasOnline: number;
    sessoesAtivas: number;
    duracaoMediaMinutos: number | null;
    duracaoAproximada: boolean;
    amostraDuracao: number;
    picoSimultaneo: number;
    picoEm: string | null;
  };
  comunidades: {
    comunidadeId: number | null;
    comunidade: string;
    pessoasOnline: number;
    sessoesAtivas: number;
  }[];
  porHora: Bucket[];
  porDia: Bucket[];
  simultaneosPorHora: Bucket[];
  horariosDePico: Bucket[];
  modulos: null | unknown;
  dispositivos: null | unknown;
  geradoEm: string;
};

export default function OwnerRealtimeWorkspace() {
  const [data, setData] = useState<Realtime | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/proprietario/tempo-real", { cache: "no-store" });
      const result = (await response.json()) as Realtime & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar.");
      if (!mounted.current) return;
      setData(result);
      setError("");
    } catch (loadError) {
      if (mounted.current) setError((loadError as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), INTERVALO_MS);
    return () => {
      mounted.current = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  return (
    <section className="owner-ops owner-directory-panel" aria-label="Atividade em tempo real">
      <header className="owner-ops-head owner-directory-header">
        <div>
          <p className="pilot-kicker">ATIVIDADE EM TEMPO REAL</p>
          <h1>Quem está usando a plataforma agora</h1>
          <p>
            Somente contagens agregadas de sessões. Nenhum conteúdo privado das
            comunidades é lido ou exibido aqui. Atualiza sozinho a cada 30
            segundos.
          </p>
        </div>
        <div className="owner-ops-actions">
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {error && (
        <p className="operations-feedback error" role="alert">
          {error}
        </p>
      )}

      {!data ? (
        loading ? (
          <div className="owner-empty" role="status">
            <span>◌</span>
            <strong>Lendo as sessões ativas…</strong>
            <p>Um instante enquanto os indicadores são calculados.</p>
          </div>
        ) : (
          <div className="owner-empty" role="status">
            <span>◌</span>
            <strong>Sem dados de atividade</strong>
            <p>Nenhuma sessão foi registrada até agora.</p>
          </div>
        )
      ) : (
        <>
          <div className="owner-ops-cards">
            <article>
              <span>ONLINE AGORA</span>
              <strong>{data.agora.pessoasOnline}</strong>
              <small>Pessoas com sessão válida</small>
            </article>
            <article>
              <span>SESSÕES ATIVAS</span>
              <strong>{data.agora.sessoesAtivas}</strong>
              <small>Inclui a mesma pessoa em vários dispositivos</small>
            </article>
            <article>
              <span>PICO SIMULTÂNEO (24H)</span>
              <strong>{data.agora.picoSimultaneo}</strong>
              <small>{data.agora.picoEm ? `Em ${formatHour(data.agora.picoEm)}` : "Sem pico observado"}</small>
            </article>
            <article>
              <span>DURAÇÃO MÉDIA</span>
              <strong>
                {data.agora.duracaoMediaMinutos == null
                  ? "—"
                  : formatMinutes(data.agora.duracaoMediaMinutos)}
              </strong>
              <small>
                {data.agora.duracaoMediaMinutos == null
                  ? "Sem telemetria para este indicador ainda"
                  : `Aproximada (sem registro de logout) · ${data.agora.amostraDuracao} sessões`}
              </small>
            </article>
          </div>

          <Chart
            title="Usuários ativos por hora (últimas 24h)"
            hint="Pessoas distintas que iniciaram sessão em cada hora."
            buckets={data.porHora}
            label={formatHour}
            empty="Nenhuma sessão iniciada nas últimas 24 horas."
          />

          <Chart
            title="Usuários ativos por dia (últimos 14 dias)"
            hint="Pessoas distintas que iniciaram sessão em cada dia."
            buckets={data.porDia}
            label={formatDay}
            empty="Nenhuma sessão iniciada nos últimos 14 dias."
          />

          <section className="owner-ops-chart" aria-label="Atividade por comunidade">
            <h2>Atividade por comunidade</h2>
            <p className="owner-ops-note">
              Apenas o nome da comunidade e contagens. Nada do conteúdo interno
              é acessado.
            </p>
            {data.comunidades.length === 0 ? (
              <div className="owner-empty" role="status">
                <span>◌</span>
                <strong>Ninguém online agora</strong>
                <p>Nenhuma sessão válida no momento.</p>
              </div>
            ) : (
              <div className="owner-ops-table-wrap">
                <table className="owner-ops-table">
                  <thead>
                    <tr>
                      <th>Comunidade</th>
                      <th>Pessoas online</th>
                      <th>Sessões ativas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.comunidades.map((item) => (
                      <tr key={`${item.comunidadeId ?? "sem"}-${item.comunidade}`}>
                        <td>{item.comunidade}</td>
                        <td>{item.pessoasOnline}</td>
                        <td>{item.sessoesAtivas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="owner-ops-chart" aria-label="Horários de pico">
            <h2>Horários de pico</h2>
            {data.horariosDePico.length === 0 ? (
              <p className="owner-ops-note">Ainda sem horários de pico nas últimas 24 horas.</p>
            ) : (
              <div className="owner-ops-flow">
                {data.horariosDePico.map((item) => (
                  <span key={item.bucket}>
                    <b>{formatHour(item.bucket)}</b> · {item.usuarios} pessoas
                  </span>
                ))}
              </div>
            )}
          </section>

          {(data.modulos === null || data.dispositivos === null) && (
            <div className="owner-empty" role="status">
              <span>◌</span>
              <strong>Sem telemetria para este indicador ainda</strong>
              <p>
                Módulos mais utilizados e dispositivos dependem de telemetria de
                navegação, que a plataforma ainda não registra. Preferimos deixar
                o campo vazio a exibir números inventados.
              </p>
            </div>
          )}

          <p className="owner-ops-note">
            Atualizado em{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "medium",
              timeZone: "America/Sao_Paulo",
            }).format(new Date(data.geradoEm))}
          </p>
        </>
      )}
    </section>
  );
}

function Chart({
  title,
  hint,
  buckets,
  label,
  empty,
}: {
  title: string;
  hint: string;
  buckets: Bucket[];
  label: (value: string) => string;
  empty: string;
}) {
  const max = Math.max(1, ...buckets.map((item) => item.usuarios));
  return (
    <section className="owner-ops-chart" aria-label={title}>
      <h2>{title}</h2>
      <p className="owner-ops-note">{hint}</p>
      {buckets.length === 0 ? (
        <div className="owner-empty" role="status">
          <span>◌</span>
          <strong>Sem movimento no período</strong>
          <p>{empty}</p>
        </div>
      ) : (
        <div className="owner-ops-bars" role="img" aria-label={title}>
          {buckets.map((item) => (
            <div key={item.bucket}>
              <b>
                <i
                  style={{ height: `${Math.max(4, (item.usuarios / max) * 100)}%` }}
                  title={`${label(item.bucket)}: ${item.usuarios} pessoas, ${item.sessoes} sessões`}
                />
              </b>
              <span>{label(item.bucket)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Os buckets chegam em UTC: "2026-09-12T13:00" (hora) ou "2026-09-12" (dia).
function parseUtc(value: string) {
  return new Date(value.includes("T") ? `${value}:00Z` : `${value}T00:00:00Z`);
}

function formatHour(value: string) {
  const date = parseUtc(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function formatDay(value: string) {
  const date = parseUtc(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}
