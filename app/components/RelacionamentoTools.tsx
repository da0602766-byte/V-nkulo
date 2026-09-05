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
  visitantes?: Array<Pick<EngagementData, "id" | "nome_completo" | "status">>;
  compacto?: boolean;
  onAbrirVisitante?: (visitanteId: number) => void;
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
 * O funil (visitor-funnel-v5) já mostra a distribuição agregada por estágio;
 * aqui a régua vira só o rótulo do estágio individual, sem repetir a barra.
 */
function ReguaAcompanhamento({ status }: { status: string }) {
  const rotulos: Record<string, string> = {
    NOVO: "Recebido",
    EM_CONTATO: "Contatado",
    EM_ACOMPANHAMENTO: "Em acompanhamento",
    INTEGRADO: "Integrado",
  };
  const etapas = ["NOVO", "EM_CONTATO", "EM_ACOMPANHAMENTO", "INTEGRADO"];
  const indexAtual = Math.max(etapas.indexOf(status), 0);
  const cor = status === "INTEGRADO" ? "#10b981" : status === "EM_ACOMPANHAMENTO" ? "#3b82f6" : status === "EM_CONTATO" ? "#f59e0b" : "var(--color-text-muted)";

  return (
    <div
      className="regua-acompanhamento"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "8px",
        marginBottom: "8px",
        fontSize: "11px",
        color: "var(--color-text-muted)",
      }}
      title={`Etapa ${indexAtual + 1} de ${etapas.length} no funil de acolhimento`}
    >
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: cor, display: "inline-block" }} />
      <span style={{ fontWeight: "bold", color: "var(--color-text)" }}>{rotulos[status] || status}</span>
      <span>· etapa {indexAtual + 1}/{etapas.length}</span>
    </div>
  );
}

/**
 * FERRAMENTA 3: Cadência de Contato
 * Lista visitantes que precisam de contato
 */
// Mantido para a versão compacta legada do módulo.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const total = items.reduce((sum, item) => sum + item.total_visitantes, 0);

  return (
    <section className="relationship-insight-card-v4 is-load">
      <header><div><p className="pilot-kicker">RESPONSÁVEIS</p><h3>Distribuição do cuidado</h3></div><strong>{total}<small> pessoas</small></strong></header>
      <div className="relationship-load-list-v4">
        {items.map((item) => (
          <article key={item.responsavel}>
            <header><strong>{item.responsavel}</strong><span>{item.total_visitantes}</span></header>
            <progress max="100" value={Math.min(item.carga_percentual, 100)} aria-label={`${item.responsavel}: ${item.total_visitantes} pessoas`} />
            <dl><div><dt>Novos</dt><dd>{item.visitantes_novos}</dd></div><div><dt>Em cuidado</dt><dd>{item.em_acompanhamento}</dd></div><div><dt>Integrados</dt><dd>{item.integrados}</dd></div></dl>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * FERRAMENTA 5: Conflict Detection
 * Alertas sobre problemas de dados
 */
function ConflictDetection({ items }: { items: ConflictItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="relationship-insight-card-v4 is-alerts">
      <header><div><p className="pilot-kicker">QUALIDADE DOS DADOS</p><h3>Pontos para revisar</h3></div><strong>{items.length}<small> alertas</small></strong></header>
      <div className="relationship-alert-list-v4">
        {items.map((item, index) => (
          <article key={`${item.tipo}-${index}`} data-severity={item.severidade}><span aria-hidden="true" /><div><strong>{item.descricao}</strong><p>{item.sugestao}</p></div></article>
        ))}
      </div>
    </section>
  );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

/**
 * FERRAMENTA 8: Contact Logging
 * Histórico de contatos realizados
 */
function ContactLogList({ items }: { items: ContactItem[] }) {
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
      {items.length === 0 && (
        <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "12px" }}>
          Nenhum contato registrado para esta pessoa.
        </p>
      )}
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
      {items.length === 0 && (
        <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "12px" }}>
          Nenhuma visita registrada para esta pessoa.
        </p>
      )}
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
  const populated = items.filter((item) => item.total_visitantes > 0);
  const emptyCount = items.length - populated.length;

  return (
    <section className="relationship-insight-card-v4 is-regional">
      <header><div><p className="pilot-kicker">CÉLULAS</p><h3>Onde estão as pessoas</h3></div><strong>{populated.length}<small> ativas</small></strong></header>
      <div className="relationship-region-grid-v4">
        {populated.map((item) => (
          <article key={item.id}><header><strong>{item.nome}</strong><span>{item.total_visitantes} {item.total_visitantes === 1 ? "pessoa" : "pessoas"}</span></header><dl><div><dt>Novos</dt><dd>{item.novos}</dd></div><div><dt>Integrados</dt><dd>{item.integrados}</dd></div><div><dt>Em cuidado</dt><dd>{Math.max(0, item.total_visitantes - item.integrados)}</dd></div></dl></article>
        ))}
        {!populated.length && <p className="relationship-insight-empty-v4">Nenhuma pessoa confirmada está vinculada a uma célula.</p>}
      </div>
      {emptyCount > 0 && <footer>{emptyCount} {emptyCount === 1 ? "célula sem pessoas foi ocultada" : "células sem pessoas foram ocultadas"} desta visão.</footer>}
    </section>
  );
}

/**
 * FERRAMENTA 7: Cadência Avançada
 * Recomendações inteligentes de contato
 */
// Mantido para a versão compacta legada do módulo.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
export function RelacionamentoTools({ visitantes = [], compacto = false, onAbrirVisitante }: RelacionamentoToolsProps) {
  const [engagement, setEngagement] = useState<EngagementData[]>([]);
  const [cadencia, setCadencia] = useState<CadenciaItem[]>([]);
  const [cadenciaAvancada, setCadenciaAvancada] = useState<CadenciaAvancadaItem[]>([]);
  const [carga, setCarga] = useState<LoadMetricItem[]>([]);
  const [regional, setRegional] = useState<RegionalItem[]>([]);
  const [conflitos, setConflitos] = useState<ConflictItem[]>([]);
  const [contatos, setContatos] = useState<ContactItem[]>([]);
  const [visitas, setVisitas] = useState<VisitaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [historicoCarregando, setHistoricoCarregando] = useState(false);
  const [historicoErro, setHistoricoErro] = useState("");
  const [selecionadoVisitanteId, setSelecionadoVisitanteId] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  const [mobileView, setMobileView] = useState<"prioridades" | "pessoas" | "historico">("prioridades");
  const visitanteHistoricoId = selecionadoVisitanteId ?? visitantes[0]?.id ?? null;

  function abrirVisitante(visitanteId: number) {
    setSelecionadoVisitanteId(visitanteId);
    onAbrirVisitante?.(visitanteId);
  }

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

  useEffect(() => {
    if (!visitanteHistoricoId) return;
    let active = true;
    const loadHistory = async () => {
      setHistoricoCarregando(true);
      setHistoricoErro("");
      try {
        const [contactsResponse, visitsResponse] = await Promise.all([
          fetch(`/api/pilot/relacionamento?ferramenta=contatos&visitanteId=${visitanteHistoricoId}`),
          fetch(`/api/pilot/relacionamento?ferramenta=visitas&visitanteId=${visitanteHistoricoId}`),
        ]);
        if (!contactsResponse.ok || !visitsResponse.ok) {
          throw new Error("Não foi possível carregar o histórico desta pessoa.");
        }
        const [contactsPayload, visitsPayload] = await Promise.all([
          contactsResponse.json(),
          visitsResponse.json(),
        ]);
        if (!active) return;
        setContatos(contactsPayload.dados || []);
        setVisitas(visitsPayload.dados || []);
      } catch (error) {
        if (!active) return;
        setContatos([]);
        setVisitas([]);
        setHistoricoErro((error as Error).message);
      } finally {
        if (active) setHistoricoCarregando(false);
      }
    };
    void loadHistory();
    return () => {
      active = false;
    };
  }, [visitanteHistoricoId]);

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

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const engagementVisivel = engagement.filter((item) => !termo || item.nome_completo.toLocaleLowerCase("pt-BR").includes(termo));
  const prioridades = (cadenciaAvancada.length ? cadenciaAvancada : cadencia.map((item) => ({
    ...item,
    categoria: null,
    responsavel: null,
    sugestao: item.prioridade === "urgente" ? "Faça um contato pessoal hoje e combine o próximo passo." : "Retome o vínculo e registre o retorno.",
  }))).filter((item) => !termo || item.nome_completo.toLocaleLowerCase("pt-BR").includes(termo));
  const visitantesHistorico = visitantes.filter((item) => !termo || item.nome_completo.toLocaleLowerCase("pt-BR").includes(termo));
  const urgentes = prioridades.filter((item) => item.prioridade === "urgente").length;
  const semContato = engagement.filter((item) => !item.ultimo_contato).length;
  const media = engagement.length ? Math.round(engagement.reduce((sum, item) => sum + item.engagement_score, 0) / engagement.length) : 0;

  return (
    <section className="relationship-command-center-v3" aria-labelledby="relacionamento-tools-title" data-mobile-view={mobileView}>
      <header className="relationship-head-v3">
        <div><p className="pilot-kicker">CENTRAL DE RELACIONAMENTO</p><h2 id="relacionamento-tools-title">Prioridades e próximos cuidados</h2><span>Encontre quem precisa de atenção, entenda o motivo e aja sem perder o histórico.</span></div>
        <dl><div><dt>Urgentes</dt><dd>{urgentes}</dd></div><div><dt>Sem contato</dt><dd>{semContato}</dd></div><div><dt>Engajamento médio</dt><dd>{media}</dd></div></dl>
      </header>
      <label className="relationship-search-v3"><span aria-hidden="true">⌕</span><input type="search" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Pesquisar pessoa, prioridade ou histórico" aria-label="Pesquisar na central de relacionamento" />{busca && <button type="button" onClick={() => setBusca("")} aria-label="Limpar pesquisa">×</button>}</label>
      <nav className="relationship-mobile-nav-v3" aria-label="Áreas da central de relacionamento">
        <button type="button" className={mobileView === "prioridades" ? "active" : ""} aria-pressed={mobileView === "prioridades"} onClick={() => setMobileView("prioridades")}><span aria-hidden="true">!</span>Prioridades<b>{prioridades.length}</b></button>
        <button type="button" className={mobileView === "pessoas" ? "active" : ""} aria-pressed={mobileView === "pessoas"} onClick={() => setMobileView("pessoas")}><span aria-hidden="true">◎</span>Pessoas<b>{engagementVisivel.length}</b></button>
        <button type="button" className={mobileView === "historico" ? "active" : ""} aria-pressed={mobileView === "historico"} onClick={() => setMobileView("historico")}><span aria-hidden="true">↻</span>Histórico</button>
      </nav>
      {carregando ? (
        <div className="relationship-loading-v3"><span /><span /><span /><p>Organizando prioridades…</p></div>
      ) : (
        <>
          <div className="relationship-priority-grid-v3" data-mobile-panel="prioridades">
            <section className="relationship-priority-list-v3" aria-labelledby="relationship-priority-title-v3">
              <header><div><p className="pilot-kicker">ORDEM DE CUIDADO</p><h3 id="relationship-priority-title-v3">Comece por estas pessoas</h3></div><span>{prioridades.length}</span></header>
              <div>
                {prioridades.slice(0, 8).map((item) => <button type="button" key={item.id} data-priority={item.prioridade} aria-label={`Abrir ficha de ${item.nome_completo}`} onClick={() => abrirVisitante(item.id)}>
                  <i aria-hidden="true" /><span><strong>{item.nome_completo}</strong><small>{item.dias_sem_contato} dias sem contato{item.responsavel ? ` · ${item.responsavel}` : ""}</small><em>{item.sugestao}</em></span><b>{item.prioridade}</b>
                </button>)}
                {!prioridades.length && <div className="relationship-empty-v3"><strong>Nenhuma prioridade encontrada</strong><p>{busca ? "Tente outro nome ou limpe a pesquisa." : "Os próximos cuidados aparecerão aqui conforme o histórico de contato."}</p></div>}
              </div>
            </section>
            <aside className="relationship-suggestions-v3" aria-labelledby="relationship-suggestions-title-v3">
              <header><p className="pilot-kicker">SUGESTÕES</p><h3 id="relationship-suggestions-title-v3">Organização e cuidado</h3></header>
              <ol>
                <li data-tone={urgentes ? "urgent" : "calm"}><span>1</span><div><strong>{urgentes ? `Acolha ${urgentes} ${urgentes === 1 ? "pessoa urgente" : "pessoas urgentes"}` : "Prioridades em dia"}</strong><p>{urgentes ? "Contato pessoal hoje, com responsável e próximo passo definidos." : "Continue registrando cada retorno para manter a cadência saudável."}</p></div></li>
                <li data-tone={semContato ? "attention" : "calm"}><span>2</span><div><strong>{semContato ? `${semContato} sem primeiro contato` : "Primeiro contato concluído"}</strong><p>{semContato ? "Distribua entre os responsáveis e evite abordagens duplicadas." : "As pessoas ativas já têm histórico de relacionamento."}</p></div></li>
                <li><span>3</span><div><strong>Registre o próximo cuidado</strong><p>Depois da conversa, escolha uma data e deixe uma anotação com checklist.</p></div></li>
              </ol>
            </aside>
          </div>

          <section className="relationship-people-v3" aria-labelledby="relationship-people-title-v3" data-mobile-panel="pessoas">
            <header><div><p className="pilot-kicker">VISÃO POR PESSOA</p><h3 id="relationship-people-title-v3">Engajamento e etapa</h3></div><span>{engagementVisivel.length} pessoas</span></header>
            <div>
              {engagementVisivel.slice(0, 12).map((item) => <button type="button" key={item.id} aria-label={`Abrir ficha de ${item.nome_completo}`} onClick={() => abrirVisitante(item.id)}>
                <span className="relationship-person-avatar-v3">{item.nome_completo.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
                <span><strong>{item.nome_completo}</strong><ReguaAcompanhamento status={item.status} /><small>{item.ultimo_contato ? `Último contato ${new Date(item.ultimo_contato).toLocaleDateString("pt-BR")}` : "Ainda sem contato"}</small></span>
                <EngagementScoreBadge score={item.engagement_score} />
              </button>)}
              {!engagementVisivel.length && <div className="relationship-empty-v3"><strong>Nenhuma pessoa encontrada</strong><p>Ajuste a pesquisa para voltar à lista completa.</p></div>}
            </div>
          </section>

          {visitantes.length > 0 && (
            <section className="relationship-history-v3" aria-labelledby="relacionamento-history-title" data-mobile-panel="historico">
              <header><div><p className="pilot-kicker">LINHA DO TEMPO</p><h3 id="relacionamento-history-title">Contatos e visitas</h3><small>Todo o histórico da pessoa, em ordem, para orientar o próximo cuidado.</small></div><select aria-label="Pessoa do histórico de relacionamento" value={visitanteHistoricoId || ""} onChange={(event) => setSelecionadoVisitanteId(Number(event.target.value) || null)}>{visitantesHistorico.map((visitor) => <option key={visitor.id} value={visitor.id}>{visitor.nome_completo}</option>)}</select></header>
              <div className="relationship-history-columns-v3">
                <section><header><strong>Contatos</strong><span>{contatos.length}</span></header>{visitanteHistoricoId && !historicoCarregando && !historicoErro && <ContactLogList items={contatos} />}</section>
                <section><header><strong>Visitas</strong><span>{visitas.length}</span></header>{visitanteHistoricoId && !historicoCarregando && !historicoErro && <VisitaTrackingList items={visitas} />}</section>
              </div>
              {historicoCarregando && <p className="relacionamento-history-state">Carregando contatos e visitas…</p>}
              {historicoErro && <p className="relacionamento-history-state is-error" role="alert">{historicoErro}</p>}
            </section>
          )}

          {(regional.length > 0 || carga.length > 0 || conflitos.length > 0) && <details className="relationship-insights-v3" data-mobile-panel="historico"><summary><span><strong>Indicadores complementares</strong><small>Somente pessoas confirmadas · responsáveis, células e dados para revisar</small></span><i aria-hidden="true">⌄</i></summary><div>{carga.length > 0 && <LoadMetrics items={carga} />}{regional.length > 0 && <RegionalGrouping items={regional} />}{conflitos.length > 0 && <ConflictDetection items={conflitos} />}</div></details>}

          {engagement.length === 0 && cadencia.length === 0 && cadenciaAvancada.length === 0 && <div className="relationship-empty-v3"><strong>A central ainda não tem dados suficientes</strong><p>Cadastre visitantes e registre contatos para receber prioridades e sugestões.</p></div>}
        </>
      )}
    </section>
  );
}

export default RelacionamentoTools;
