"use client";

import { useEffect, useState } from "react";

// ============================================
// TIPOS
// ============================================

type EngagementData = {
  id: number;
  nome_completo: string;
  engagement_score: number;
  status: string;
  ultimo_contato: string | null;
  data_entrada: string;
  acompanhamentos_total: number;
  encontro_com_deus: number;
  curso_membros: number;
  categoria_id: number | null;
  ministerio: string | null;
};

type CadenciaItem = {
  id: number;
  nome_completo: string;
  ultimo_contato: string | null;
  dias_sem_contato: number;
  prioridade: "urgente" | "alta" | "normal" | "baixa";
  proximo_contato: string | null;
};

type LoadMetricItem = {
  responsavel: string;
  total_visitantes: number;
  visitantes_novos: number;
  em_acompanhamento: number;
  integrados: number;
  carga_percentual: number;
};

type ConflictItem = {
  tipo: string;
  severidade: "crítico" | "aviso" | "info";
  descricao: string;
  visitante_ids: number[];
  sugestao: string;
};

type RegionalItem = {
  id: number;
  nome: string;
  total_visitantes: number;
  novos: number;
  integrados: number;
};

type CadenciaAvancadaItem = {
  id: number;
  nome_completo: string;
  ultimo_contato: string | null;
  dias_sem_contato: number;
  categoria: string | null;
  responsavel: string | null;
  prioridade: "urgente" | "alta" | "normal" | "baixa";
  sugestao: string;
};

type ContactItem = {
  id: number;
  tipo: string;
  canal: string;
  resultado: string;
  descricao: string;
  duracao_minutos: number | null;
  proxima_acao: string | null;
  responsavel_nome: string | null;
  criado_em: string;
};

type VisitaItem = {
  id: number;
  data_visita: string;
  local: string;
  tipo: string;
  duracao_minutos: number | null;
  resultado: string | null;
  proxima_visita_sugerida: string | null;
  responsavel_nome: string | null;
  notas: string;
};

interface RelacionamentoToolsProps {
  visitantes?: EngagementData[];
  compacto?: boolean;
}

// ============================================
// COMPONENTES INDIVIDUAIS
// ============================================

/**
 * FERRAMENTA 1: Engagement Score Badge
 * Exibe o score visual de um visitante
 */
function EngagementScoreBadge({ score }: { score: number }) {
  let classificacao: "alto" | "medio" | "baixo";
  let cor: string;
  let label: string;

  if (score >= 70) {
    classificacao = "alto";
    cor = "#10b981";
    label = "Alto";
  } else if (score >= 40) {
    classificacao = "medio";
    cor = "#f59e0b";
    label = "Médio";
  } else {
    classificacao = "baixo";
    cor = "#ef4444";
    label = "Baixo";
  }

  return (
    <div
      className="relacionamento-score"
      style={{
        background: cor,
        color: "white",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 12px",
        borderRadius: "20px",
        fontWeight: "bold",
        fontSize: "12px",
      }}
      title={`Score de engajamento: ${score}/100`}
    >
      <span style={{ fontSize: "16px" }}>
        {classificacao === "alto" && "✓"}
        {classificacao === "medio" && "◐"}
        {classificacao === "baixo" && "✗"}
      </span>
      <span>{score}</span>
      <span style={{ fontSize: "11px", opacity: 0.9 }}>{label}</span>
    </div>
  );
}

/**
 * FERRAMENTA 2: Régua de Acompanhamento
 * Barra visual mostrando progresso do visitante
 */
function ReguaAcompanhamento({ status }: { status: string }) {
  const etapas = ["NOVO", "EM_CONTATO", "EM_ACOMPANHAMENTO", "INTEGRADO"];
  const indexAtual = etapas.indexOf(status);

  return (
    <div
      className="regua-acompanhamento"
      style={{
        display: "flex",
        gap: "12px",
        alignItems: "center",
        marginTop: "12px",
        marginBottom: "12px",
        fontSize: "12px",
      }}
    >
      <span style={{ color: "var(--color-text-muted)", minWidth: "80px" }}>
        Progresso:
      </span>
      <div style={{ display: "flex", gap: "8px", flex: 1 }}>
        {etapas.map((etapa, index) => (
          <div
            key={etapa}
            style={{
              flex: 1,
              height: "8px",
              background: index <= indexAtual ? "var(--color-primary, #3b82f6)" : "var(--color-border, #e5e7eb)",
              borderRadius: "4px",
              position: "relative",
              transition: "background 200ms",
            }}
            title={etapa.replace(/_/g, " ")}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * FERRAMENTA 3: Cadência de Contato
 * Lista visitantes que precisam de contato
 */
function CadenciaContato({ items, limite = 5 }: { items: CadenciaItem[]; limite?: number }) {
  const prioritarios = items.slice(0, limite);

  const corPrioridade = (prioridade: string) => {
    switch (prioridade) {
      case "urgente":
        return "#ef4444";
      case "alta":
        return "#f59e0b";
      case "normal":
        return "#3b82f6";
      default:
        return "#10b981";
    }
  };

  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "14px", fontWeight: "bold" }}>
        📞 Próximas Cadências ({items.length})
      </h3>
      {prioritarios.length === 0 ? (
        <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "13px" }}>
          Sem contatos pendentes neste momento.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {prioritarios.map((item) => (
            <li
              key={item.id}
              style={{
                padding: "8px 0",
                borderBottom: "1px solid var(--color-border)",
                fontSize: "13px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                <strong>{item.nome_completo}</strong>
                <br />
                <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
                  {item.dias_sem_contato} dias sem contato
                </span>
              </span>
              <span
                style={{
                  background: corPrioridade(item.prioridade),
                  color: "white",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "bold",
                  whiteSpace: "nowrap",
                  marginLeft: "8px",
                }}
              >
                {item.prioridade.toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * FERRAMENTA 4: Load Metrics
 * Distribuição de carga por responsável
 */
function LoadMetrics({ items }: { items: LoadMetricItem[] }) {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "14px", fontWeight: "bold" }}>
        📊 Distribuição de Carga
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {items.map((item, index) => (
          <div key={index}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "13px", fontWeight: "bold" }}>{item.responsavel}</span>
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                {item.total_visitantes} visitantes
              </span>
            </div>
            <div
              style={{
                background: "var(--color-border)",
                borderRadius: "4px",
                height: "8px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: "linear-gradient(90deg, #3b82f6, #10b981)",
                  height: "100%",
                  width: `${Math.min(item.carga_percentual, 100)}%`,
                  transition: "width 200ms",
                }}
              />
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              Novos: {item.visitantes_novos} | Acompanhando: {item.em_acompanhamento} | Integrados:{" "}
              {item.integrados}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * FERRAMENTA 5: Conflict Detection
 * Alertas sobre problemas de dados
 */
function ConflictDetection({ items }: { items: ConflictItem[] }) {
  if (items.length === 0) return null;

  const corSeveridade = (severidade: string) => {
    switch (severidade) {
      case "crítico":
        return "#ef4444";
      case "aviso":
        return "#f59e0b";
      default:
        return "#3b82f6";
    }
  };

  const iconSeveridade = (severidade: string) => {
    switch (severidade) {
      case "crítico":
        return "🚨";
      case "aviso":
        return "⚠️";
      default:
        return "ℹ️";
    }
  };

  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "14px", fontWeight: "bold" }}>
        🔍 Detecção de Conflitos ({items.length})
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {items.map((item, index) => (
          <div
            key={index}
            style={{
              padding: "8px 12px",
              background: corSeveridade(item.severidade) + "15",
              border: `2px solid ${corSeveridade(item.severidade)}`,
              borderRadius: "4px",
              fontSize: "12px",
            }}
          >
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "4px" }}>
              <span>{iconSeveridade(item.severidade)}</span>
              <div>
                <strong>{item.descricao}</strong>
                <br />
                <span style={{ color: "var(--color-text-muted)" }}>💡 {item.sugestao}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

/**
 * FERRAMENTA 8: Contact Logging
 * Histórico de contatos realizados
 */
function ContactLogList({ items, visitanteId }: { items: ContactItem[]; visitanteId?: number }) {
  if (items.length === 0) return null;

  const canalIcon = (canal: string) => {
    switch (canal) {
      case "WHATSAPP":
        return "💬";
      case "TELEFONE":
        return "☎️";
      case "PRESENCIAL":
        return "👤";
      case "EMAIL":
        return "📧";
      default:
        return "📝";
    }
  };

  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "14px", fontWeight: "bold" }}>
        📋 Histórico de Contatos ({items.length})
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "400px", overflowY: "auto" }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              padding: "10px 12px",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              fontSize: "12px",
              background: "var(--color-surface)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <strong>{canalIcon(item.canal)} {item.canal}</strong>
              <time style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>
                {new Date(item.criado_em).toLocaleDateString("pt-BR")}
              </time>
            </div>
            <div style={{ marginBottom: "4px" }}>
              <span style={{ fontWeight: "bold" }}>{item.resultado}</span>
            </div>
            {item.descricao && (
              <div style={{ color: "var(--color-text-muted)", fontSize: "11px", marginBottom: "4px" }}>
                {item.descricao}
              </div>
            )}
            {(item.duracao_minutos || item.proxima_acao || item.responsavel_nome) && (
              <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                {item.duracao_minutos && <span>⏱️ {item.duracao_minutos}min </span>}
                {item.proxima_acao && <span>→ {item.proxima_acao} </span>}
                {item.responsavel_nome && <span>· {item.responsavel_nome}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * FERRAMENTA 9: Visita Tracking
 * Rastreamento de visitas presenciais
 */
function VisitaTrackingList({ items }: { items: VisitaItem[] }) {
  if (items.length === 0) return null;

  const tipoIcon = (tipo: string) => {
    switch (tipo) {
      case "ACOLHIDA":
        return "👋";
      case "ACOMPANHAMENTO":
        return "🤝";
      case "ESPECIALIZADO":
        return "⭐";
      default:
        return "📍";
    }
  };

  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "14px", fontWeight: "bold" }}>
        🏃 Rastreamento de Visitas ({items.length})
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "400px", overflowY: "auto" }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              padding: "10px 12px",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              fontSize: "12px",
              background: "var(--color-surface)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <strong>{tipoIcon(item.tipo)} {item.tipo}</strong>
              <time style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>
                {new Date(item.data_visita).toLocaleDateString("pt-BR")}
              </time>
            </div>
            <div style={{ color: "var(--color-text-muted)", fontSize: "11px", marginBottom: "4px" }}>
              📍 {item.local}
            </div>
            {item.resultado && (
              <div style={{ marginBottom: "4px" }}>
                <span>{item.resultado}</span>
              </div>
            )}
            {(item.duracao_minutos || item.proxima_visita_sugerida || item.responsavel_nome) && (
              <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                {item.duracao_minutos && <span>⏱️ {item.duracao_minutos}min </span>}
                {item.proxima_visita_sugerida && (
                  <span>→ Próxima: {new Date(item.proxima_visita_sugerida).toLocaleDateString("pt-BR")} </span>
                )}
                {item.responsavel_nome && <span>· {item.responsavel_nome}</span>}
              </div>
            )}
            {item.notas && (
              <div style={{ fontSize: "10px", background: "rgba(255,255,255,0.3)", padding: "4px 6px", marginTop: "4px", borderRadius: "3px" }}>
                💬 {item.notas}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * FERRAMENTA 6: Regional Grouping
 * Agrupa visitantes por região/célula
 */
function RegionalGrouping({ items }: { items: RegionalItem[] }) {
  if (items.length === 0) return null;

  const maxVisitantes = Math.max(...items.map((i) => i.total_visitantes), 1);

  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "14px", fontWeight: "bold" }}>
        🗺️ Agrupamento Regional ({items.length} célula(s))
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "12px",
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              padding: "12px",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              background: "var(--color-surface)",
            }}
          >
            <div style={{ marginBottom: "8px" }}>
              <strong style={{ fontSize: "13px" }}>{item.nome}</strong>
            </div>
            <div
              style={{
                background: "var(--color-border)",
                borderRadius: "4px",
                height: "6px",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  background: "linear-gradient(90deg, #3b82f6, #10b981)",
                  height: "100%",
                  width: `${(item.total_visitantes / maxVisitantes) * 100}%`,
                }}
              />
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              <div>👥 {item.total_visitantes} visitante(s)</div>
              <div>🆕 {item.novos} novo(s)</div>
              <div>✓ {item.integrados} integrado(s)</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * FERRAMENTA 7: Cadência Avançada
 * Recomendações inteligentes de contato
 */
function CadenciaAvancada({ items, limite = 10 }: { items: CadenciaAvancadaItem[]; limite?: number }) {
  const prioritarios = items.slice(0, limite);

  const corPrioridade = (prioridade: string) => {
    switch (prioridade) {
      case "urgente":
        return "#ef4444";
      case "alta":
        return "#f59e0b";
      case "normal":
        return "#3b82f6";
      default:
        return "#10b981";
    }
  };

  const iconPrioridade = (prioridade: string) => {
    switch (prioridade) {
      case "urgente":
        return "🚨";
      case "alta":
        return "⚠️";
      case "normal":
        return "⏱️";
      default:
        return "✓";
    }
  };

  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "14px", fontWeight: "bold" }}>
        🎯 Cadência Inteligente ({items.length} sugestão(s))
      </h3>
      {prioritarios.length === 0 ? (
        <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "13px" }}>
          Nenhuma ação urgente no momento.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {prioritarios.map((item) => (
            <div
              key={item.id}
              style={{
                padding: "10px 12px",
                background: corPrioridade(item.prioridade) + "10",
                border: `1px solid ${corPrioridade(item.prioridade)}30`,
                borderRadius: "6px",
                fontSize: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "6px",
                }}
              >
                <div>
                  <strong>{item.nome_completo}</strong>
                  {item.categoria && (
                    <div style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>
                      {item.categoria}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    background: corPrioridade(item.prioridade),
                    color: "white",
                    padding: "2px 8px",
                    borderRadius: "3px",
                    fontWeight: "bold",
                    fontSize: "10px",
                    whiteSpace: "nowrap",
                    marginLeft: "8px",
                  }}
                >
                  {iconPrioridade(item.prioridade)} {item.prioridade.toUpperCase()}
                </span>
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: "11px", marginBottom: "4px" }}>
                {item.dias_sem_contato} dias sem contato
                {item.responsavel && ` · Responsável: ${item.responsavel}`}
              </div>
              {item.sugestao && (
                <div style={{ background: "rgba(255,255,255,0.5)", padding: "4px 6px", borderRadius: "3px" }}>
                  💡 {item.sugestao}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * RelacionamentoTools
 * Componente integrado que exibe todas as ferramentas de relacionamento
 */
export function RelacionamentoTools({ visitantes = [], compacto = false }: RelacionamentoToolsProps) {
  const [engagement, setEngagement] = useState<EngagementData[]>([]);
  const [cadencia, setCadencia] = useState<CadenciaItem[]>([]);
  const [cadenciaAvancada, setCadenciaAvancada] = useState<CadenciaAvancadaItem[]>([]);
  const [carga, setCarga] = useState<LoadMetricItem[]>([]);
  const [regional, setRegional] = useState<RegionalItem[]>([]);
  const [conflitos, setConflitos] = useState<ConflictItem[]>([]);
  const [contatos, setContatos] = useState<ContactItem[]>([]);
  const [visitas, setVisitas] = useState<VisitaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionadoVisitanteId, setSelecionadoVisitanteId] = useState<number | null>(null);

  useEffect(() => {
    const carregarDados = async () => {
      try {
        setCarregando(true);

        // Carregar todas as ferramentas em paralelo
        const [resEngagement, resCadencia, resCarga, resRegional, resConflitos, resCadenciaAvancada] = await Promise.all([
          fetch("/api/pilot/relacionamento?ferramenta=engagement").then((r) => r.json()),
          fetch("/api/pilot/relacionamento?ferramenta=cadencia").then((r) => r.json()),
          fetch("/api/pilot/relacionamento?ferramenta=carga").then((r) => r.json()),
          fetch("/api/pilot/relacionamento?ferramenta=regional").then((r) => r.json()),
          fetch("/api/pilot/relacionamento?ferramenta=conflitos").then((r) => r.json()),
          fetch("/api/pilot/relacionamento?ferramenta=cadencia-avancada").then((r) => r.json()),
        ]);

        setEngagement(resEngagement.dados || []);
        setCadencia(resCadencia.dados || []);
        setCarga(resCarga.dados || []);
        setRegional(resRegional.dados || []);
        setConflitos(resConflitos.dados || []);
        setCadenciaAvancada(resCadenciaAvancada.dados || []);
      } catch (erro) {
        console.error("Erro ao carregar ferramentas de relacionamento:", erro);
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, []);

  if (compacto) {
    // Versão compacta: mostra apenas resumo
    return (
      <div
        style={{
          padding: "12px",
          background: "var(--color-surface, #f9fafb)",
          borderRadius: "6px",
          fontSize: "13px",
        }}
      >
        {carregando ? (
          <span style={{ color: "var(--color-text-muted)" }}>Carregando ferramentas...</span>
        ) : (
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <div>
              <strong>👥 Visitantes:</strong> {engagement.length}
            </div>
            <div>
              <strong>📞 Para Contatar:</strong> {cadenciaAvancada.filter((c) => c.prioridade === "urgente").length}
            </div>
            <div>
              <strong>🗺️ Regiões Ativas:</strong> {regional.length}
            </div>
            <div>
              <strong>🚨 Conflitos:</strong> {conflitos.length}
            </div>
            {engagement.length > 0 && (
              <div>
                <strong>📈 Engajamento Médio:</strong>{" "}
                {Math.round(engagement.reduce((sum, v) => sum + v.engagement_score, 0) / engagement.length)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Versão completa
  return (
    <div className="relacionamento-tools">
      {carregando ? (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted)" }}>
          ⏳ Carregando ferramentas de relacionamento...
        </div>
      ) : (
        <>
          {/* Seção de Engagement */}
          {engagement.length > 0 && (
            <div style={{ marginBottom: "24px" }}>
              <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "14px", fontWeight: "bold" }}>
                ✨ Scores de Engajamento
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
                  gap: "12px",
                }}
              >
                {engagement.slice(0, 12).map((v) => (
                  <div
                    key={v.id}
                    style={{
                      padding: "12px",
                      border: "1px solid var(--color-border)",
                      borderRadius: "6px",
                      background: "var(--color-surface)",
                    }}
                  >
                    <div style={{ marginBottom: "8px" }}>
                      <strong style={{ fontSize: "13px" }}>{v.nome_completo}</strong>
                    </div>
                    <EngagementScoreBadge score={v.engagement_score} />
                    <ReguaAcompanhamento status={v.status} />
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "8px" }}>
                      {v.ultimo_contato
                        ? `Último contato: ${new Date(v.ultimo_contato).toLocaleDateString("pt-BR")}`
                        : "Sem contatos"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cadência */}
          {cadencia.length > 0 && <CadenciaContato items={cadencia} limite={8} />}

          {/* Cadência Avançada */}
          {cadenciaAvancada.length > 0 && <CadenciaAvancada items={cadenciaAvancada} limite={10} />}

          {/* Regional Grouping */}
          {regional.length > 0 && <RegionalGrouping items={regional} />}

          {/* Load Metrics */}
          {carga.length > 0 && <LoadMetrics items={carga} />}

          {/* Contact Logging */}
          {contatos.length > 0 && <ContactLogList items={contatos} visitanteId={selecionadoVisitanteId || undefined} />}

          {/* Visita Tracking */}
          {visitas.length > 0 && <VisitaTrackingList items={visitas} />}

          {/* Conflitos */}
          {conflitos.length > 0 && <ConflictDetection items={conflitos} />}

          {/* Resumo */}
          {engagement.length === 0 && cadencia.length === 0 && carga.length === 0 && conflitos.length === 0 && regional.length === 0 && cadenciaAvancada.length === 0 && contatos.length === 0 && visitas.length === 0 && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted)" }}>
              📊 Nenhum dado disponível no momento
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default RelacionamentoTools;
