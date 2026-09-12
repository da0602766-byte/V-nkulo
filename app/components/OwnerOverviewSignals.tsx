"use client";

import { useCallback, useEffect, useState } from "react";
import "./OwnerCommandCenter.css";

type Tendencia = { atual: number; anterior: number; variacao: number; direcao: string };

type Destaque = {
  id: string;
  nivel: "INFORMACAO" | "ATENCAO" | "CRITICO";
  titulo: string;
  detalhe: string;
  correlacao: boolean;
};

type VisaoGeral = {
  plataforma: Record<string, number>;
  presenca: Record<string, number>;
  tendencias: { usuariosAtivos: Tendencia; erros: Tendencia; crescimento: Tendencia };
  incidentes: { abertos: number; criticos: number };
  cobrancas: { vencidas: number; pendentes: number };
  moduloMaisUsado: { nome: string; total: number } | null;
  destaques: Destaque[];
  saude: "ESTAVEL" | "ATENCAO" | "CRITICA";
  geradoEm: string;
};

const SAUDE = {
  ESTAVEL: { rotulo: "Estável", classe: "occ-tag-ok" },
  ATENCAO: { rotulo: "Atenção", classe: "occ-tag-warn" },
  CRITICA: { rotulo: "Crítico", classe: "occ-tag-critical" },
} as const;

/**
 * Faixa de decisão da Visão Geral: responde de relance o estado da plataforma
 * e aponta para onde ir. O detalhe fica nas áreas específicas — aqui só entra
 * o que muda a próxima ação.
 */
export default function OwnerOverviewSignals({
  onNavigate,
}: {
  onNavigate?: (tab: string) => void;
}) {
  const [data, setData] = useState<VisaoGeral | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/proprietario/visao-geral", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar.");
      setData(result);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (error) {
    return (
      <p className="operations-feedback error" role="alert">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="owner-empty" role="status">
        <span>◌</span>
        <strong>{loading ? "Lendo a situação da plataforma…" : "Sem dados"}</strong>
      </div>
    );
  }

  const saude = SAUDE[data.saude] || SAUDE.ESTAVEL;
  const atalho = (tab: string) => (onNavigate ? () => onNavigate(tab) : undefined);

  return (
    <section className="occ-panel occ-overview" aria-label="Situação da plataforma">
      <div className="occ-metrics">
        <article>
          <span>SAÚDE DO SISTEMA</span>
          <strong className="occ-health">
            <b className={saude.classe}>{saude.rotulo}</b>
          </strong>
          <small>
            {data.incidentes.criticos > 0
              ? `${data.incidentes.criticos} incidente(s) crítico(s)`
              : data.tendencias.erros.direcao === "ALTA"
                ? "Falhas em alta no período"
                : "Sem incidente crítico em aberto"}
          </small>
        </article>
        <article>
          <span>COMUNIDADES</span>
          <strong>{Number(data.plataforma.comunidades_ativas || 0)}</strong>
          <small>
            de {Number(data.plataforma.comunidades || 0)} no total
            {Number(data.plataforma.comunidades_suspensas || 0) > 0
              ? ` · ${data.plataforma.comunidades_suspensas} suspensa(s)`
              : ""}
          </small>
        </article>
        <article>
          <span>PESSOAS</span>
          <strong>{Number(data.plataforma.usuarios_ativos || 0)}</strong>
          <small>
            de {Number(data.plataforma.usuarios || 0)} cadastradas ·{" "}
            {formatarVariacao(data.tendencias.crescimento)} em 30 dias
          </small>
        </article>
        <article>
          <span>ON-LINE AGORA</span>
          <strong>{Number(data.presenca.online_agora || 0)}</strong>
          <small>{Number(data.presenca.sessoes_ativas || 0)} sessão(ões) ativa(s)</small>
        </article>
        <article>
          <span>DECISÕES PENDENTES</span>
          <strong>{Number(data.plataforma.solicitacoes_pendentes || 0)}</strong>
          <small>Solicitações de comunidade aguardando</small>
        </article>
        <article>
          <span>PAGAMENTOS</span>
          <strong>{Number(data.cobrancas.vencidas || 0)}</strong>
          <small>{Number(data.cobrancas.pendentes || 0)} em aberto no prazo</small>
        </article>
      </div>

      <section className="occ-highlights">
        <header>
          <p className="pilot-kicker">O QUE PEDE ATENÇÃO</p>
          <h2>Destaques do período</h2>
        </header>
        {data.destaques.length === 0 ? (
          <p className="occ-quiet">
            Nenhum sinal fora do esperado nos dados disponíveis. Destaques aparecem
            quando há número que os sustente — nada é gerado para preencher espaço.
          </p>
        ) : (
          <ul className="occ-highlight-list">
            {data.destaques.map((destaque) => (
              <li key={destaque.id} data-nivel={destaque.nivel}>
                <div>
                  <strong>{destaque.titulo}</strong>
                  <p>{destaque.detalhe}</p>
                  {destaque.correlacao && (
                    <em>Correlação observada, não causa confirmada.</em>
                  )}
                </div>
                {destinoDoDestaque(destaque.id) && onNavigate && (
                  <button type="button" onClick={atalho(destinoDoDestaque(destaque.id)!)}>
                    Abrir
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="occ-updated">
        {data.moduloMaisUsado
          ? `Módulo mais adotado: ${data.moduloMaisUsado.nome} (${data.moduloMaisUsado.total} comunidades). `
          : ""}
        Atualizado em {formatarData(data.geradoEm)}.
      </p>
    </section>
  );
}

/** Leva o destaque para a área onde ele é tratado. */
function destinoDoDestaque(id: string) {
  if (id === "incidentes-criticos" || id.startsWith("anomalia-erros")) return "incidents";
  if (id === "erros") return "performance";
  if (id === "cobrancas-vencidas") return "finance";
  if (id === "comunidades-suspensas" || id.startsWith("comunidade-")) return "communities";
  if (id === "usuarios-ativos") return "realtime";
  return null;
}

function formatarVariacao(tendencia: Tendencia) {
  if (!tendencia) return "sem variação";
  return `${tendencia.variacao > 0 ? "+" : ""}${tendencia.variacao}%`;
}

function formatarData(value: string) {
  if (!value) return "—";
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}
