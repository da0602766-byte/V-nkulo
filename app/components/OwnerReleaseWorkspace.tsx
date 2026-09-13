"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./OwnerReleaseWorkspace.css";
import {
  ETAPAS_PIPELINE,
  formatarDuracao,
  rotularPublicacao,
} from "../lib/release-pipeline.mjs";

// Painel de publicações do proprietário.
//
// Esta tela REGISTRA e GOVERNA o processo de publicação: mostra o que o
// CI/hospedagem reportou de cada etapa, quem aprovou, o que falhou e o que
// precisa ser revertido. Ela não roda build, não executa testes e não faz
// deploy — nenhum número aqui é estimado: etapa sem relato aparece como
// pendente, e health check sem resultado aparece como não reportado.

type Etapa = {
  id: number;
  etapa: string;
  rotulo: string;
  descricao: string;
  critica: boolean;
  ordem: number;
  status: string;
  iniciadoEm: string | null;
  concluidoEm: string | null;
  duracaoMs: number;
  resultado: string;
  logs: string;
};

type Avaliacao = {
  saudavel: boolean;
  gravidade: string;
  exigeRollback: boolean;
  motivo: string;
  falhas: { chave: string; rotulo: string; critica: boolean; detalhe: string }[];
  verificadas: number;
  taxaErro: number | null;
  limiteErro: number;
};

type Resumo = {
  total: number;
  concluidas: number;
  falhadas: number;
  pendentes: number;
  progresso: number;
  duracaoMs: number;
  primeiraFalha: string | null;
  primeiraFalhaRotulo: string;
  concluido: boolean;
};

type Deploy = {
  id: number;
  versao: string;
  commitSha: string;
  branch: string;
  autor: string;
  mensagem: string;
  ambiente: string;
  status: string;
  etapaAtual: string;
  iniciadoEm: string;
  concluidoEm: string | null;
  duracaoMs: number;
  aprovacaoStatus: string;
  aprovadoPor: string | null;
  aprovadoEm: string | null;
  aprovacaoMotivo: string;
  avaliacaoSaude: Avaliacao;
  rollbackDeId: number | null;
  rollbackDeVersao: string | null;
  rollbackMotivo: string;
  rollbackAutomatico: boolean;
  observacoes: string;
  registradoPor: string | null;
  etapas: Etapa[];
  resumo: Resumo;
};

type Summary = {
  status: Record<string, number>;
  ultimaPublicada: {
    id: number;
    versao: string;
    ambiente: string;
    commitSha: string;
    concluidoEm: string | null;
    duracaoMs: number;
  } | null;
  emAndamento: Deploy | null;
  falhasRecentes: number;
  reversoesAutomaticas: number;
  aguardandoAprovacao: number;
};

type HistoricoItem = {
  id: number;
  versao: string;
  ambiente: string;
  status: string;
  commitSha: string;
  concluidoEm: string | null;
};

type Comparacao = {
  versaoAnterior: string;
  commitAnterior: string;
  publicadaEm: string | null;
  ordem: number;
} | null;

const AMBIENTES = ["PRODUCAO", "PREVIA", "HOMOLOGACAO"];
const STATUS = [
  "PENDENTE",
  "EM_ANDAMENTO",
  "AGUARDANDO_APROVACAO",
  "PUBLICADO",
  "FALHOU",
  "REVERTIDO",
  "CANCELADO",
];

function formatarData(valor: string | null) {
  if (!valor) return "—";
  const data = new Date(valor.includes("T") ? valor : `${valor.replace(" ", "T")}Z`);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FORMULARIO_VAZIO = {
  versao: "",
  commitSha: "",
  branch: "",
  autor: "",
  mensagem: "",
  ambiente: "PRODUCAO",
};

export default function OwnerReleaseWorkspace() {
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [detail, setDetail] = useState<Deploy | null>(null);
  const [comparacao, setComparacao] = useState<Comparacao>(null);
  const [selectedId, setSelectedId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [motivoAprovacao, setMotivoAprovacao] = useState("");
  const [motivoRollback, setMotivoRollback] = useState("");
  const [confirmandoRollback, setConfirmandoRollback] = useState(false);
  const [logsAbertos, setLogsAbertos] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORMULARIO_VAZIO);
  const [filters, setFilters] = useState({ ambiente: "", status: "", periodo: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      for (const [chave, valor] of Object.entries(filters)) {
        if (valor) query.set(chave, valor);
      }
      const response = await fetch(
        `/api/proprietario/publicacoes?${query.toString()}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível carregar as publicações.");
      setDeploys(result.deploys || []);
      setSummary(result.summary || null);
      setHistorico(result.historico || []);
      setSelectedId((atual) => {
        if (atual) return atual;
        return result.summary?.emAndamento?.id || result.deploys?.[0]?.id || 0;
      });
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openDetail = useCallback(async (deployId: number) => {
    if (!deployId) {
      setDetail(null);
      setComparacao(null);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/proprietario/publicacoes?id=${deployId}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível abrir a publicação.");
      setDetail(result.deploy);
      setComparacao(result.comparacao || null);
    } catch (detailError) {
      setError((detailError as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Trocar de publicação limpa os campos de decisão, para o motivo digitado
  // para uma publicação não vazar para outra. As chamadas ficam dentro do
  // setTimeout por causa da regra de lint do projeto contra setState síncrono
  // em efeito (mesmo padrão já adotado em ThemeControl e DayThreadWorkspace).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMotivoAprovacao("");
      setMotivoRollback("");
      setConfirmandoRollback(false);
      setLogsAbertos("");
      void openDetail(selectedId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedId, openDetail]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!selectedId) return;
    setSaving(true);
    setError("");
    setAviso("");
    try {
      const response = await fetch("/api/proprietario/publicacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, action, ...extra }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível aplicar a ação.");
      if (result.id && action === "ROLLBACK") {
        setAviso(
          `Reversão registrada para a versão ${result.versaoAlvo}. O CI precisa executar e reportar as etapas desta reversão.`,
        );
        setSelectedId(Number(result.id));
      } else {
        await openDetail(selectedId);
      }
      await load();
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const registrar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/proprietario/publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível registrar a publicação.");
      setForm(FORMULARIO_VAZIO);
      setShowForm(false);
      setSelectedId(Number(result.id) || 0);
      await load();
    } catch (registerError) {
      setError((registerError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // A trilha tem sempre as 9 etapas: as que o CI ainda não reportou aparecem
  // como pendentes, nunca como concluídas por suposição.
  const trilha = useMemo(() => {
    const registradas = new Map(
      (detail?.etapas || []).map((etapa) => [etapa.etapa, etapa]),
    );
    return ETAPAS_PIPELINE.map((definicao) => {
      const registro = registradas.get(definicao.chave);
      return {
        chave: definicao.chave,
        rotulo: definicao.rotulo,
        descricao: definicao.descricao,
        critica: definicao.critica,
        ordem: definicao.ordem,
        status: registro?.status || "PENDENTE",
        duracaoMs: registro?.duracaoMs || 0,
        resultado: registro?.resultado || "",
        logs: registro?.logs || "",
        iniciadoEm: registro?.iniciadoEm || null,
        concluidoEm: registro?.concluidoEm || null,
      };
    });
  }, [detail]);

  const testes = trilha.find((etapa) => etapa.chave === "TESTES");
  const saude = detail?.avaliacaoSaude || null;
  const aguardando = detail?.status === "AGUARDANDO_APROVACAO";
  const producaoSemAprovacao =
    detail?.ambiente === "PRODUCAO" && detail?.aprovacaoStatus !== "APROVADO";

  return (
    <section className="owner-directory-panel release-workspace" aria-label="Publicações">
      <header className="owner-directory-header">
        <div>
          <p className="pilot-kicker">PUBLICAÇÕES</p>
          <strong>Pipeline de publicação com aprovação e reversão</strong>
          <span>
            Este painel registra e governa as publicações: quem aprovou, o que
            rodou, quanto demorou e o que precisa voltar atrás. A execução de
            build, testes e deploy é do CI/hospedagem, que reporta cada etapa
            por esta API — nada aqui é presumido.
          </span>
        </div>
        <div className="release-actions">
          <button onClick={() => setShowForm((atual) => !atual)}>
            {showForm ? "Cancelar registro" : "Registrar publicação"}
          </button>
          <button onClick={() => void load()} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {error && (
        <p className="operations-feedback error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="operations-feedback" role="status">
          {aviso}
        </p>
      )}

      {summary && (
        <div className="release-indicators" aria-label="Indicadores de publicação">
          <article>
            <strong>{summary.ultimaPublicada?.versao || "—"}</strong>
            <span>Última publicada</span>
            <small>
              {summary.ultimaPublicada
                ? `${rotularPublicacao("ambiente", summary.ultimaPublicada.ambiente)} · ${formatarData(summary.ultimaPublicada.concluidoEm)}`
                : "Nenhuma publicação concluída"}
            </small>
          </article>
          <article className={summary.aguardandoAprovacao ? "waiting" : ""}>
            <strong>{summary.aguardandoAprovacao}</strong>
            <span>Aguardando aprovação</span>
            <small>Paradas até uma decisão humana</small>
          </article>
          <article className={summary.falhasRecentes ? "critical" : ""}>
            <strong>{summary.falhasRecentes}</strong>
            <span>Falhas em 30 dias</span>
            <small>Publicações que falharam ou foram revertidas</small>
          </article>
          <article className={summary.reversoesAutomaticas ? "critical" : ""}>
            <strong>{summary.reversoesAutomaticas}</strong>
            <span>Reversões automáticas</span>
            <small>Disparadas por falha crítica pós-publicação</small>
          </article>
        </div>
      )}

      {showForm && (
        <form className="release-form" onSubmit={registrar}>
          <label>
            Versão
            <input
              value={form.versao}
              onChange={(event) => setForm({ ...form, versao: event.target.value })}
              placeholder="1.4.0"
              maxLength={40}
              required
            />
          </label>
          <label>
            Commit
            <input
              value={form.commitSha}
              onChange={(event) =>
                setForm({ ...form, commitSha: event.target.value })
              }
              placeholder="a1b2c3d"
              maxLength={60}
              required
            />
          </label>
          <label>
            Branch
            <input
              value={form.branch}
              onChange={(event) => setForm({ ...form, branch: event.target.value })}
              maxLength={120}
              required
            />
          </label>
          <label>
            Autor
            <input
              value={form.autor}
              onChange={(event) => setForm({ ...form, autor: event.target.value })}
              maxLength={120}
              required
            />
          </label>
          <label>
            Ambiente
            <select
              value={form.ambiente}
              onChange={(event) => setForm({ ...form, ambiente: event.target.value })}
            >
              {AMBIENTES.map((ambiente) => (
                <option key={ambiente} value={ambiente}>
                  {rotularPublicacao("ambiente", ambiente)}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            Mensagem do commit
            <input
              value={form.mensagem}
              onChange={(event) => setForm({ ...form, mensagem: event.target.value })}
              maxLength={500}
            />
          </label>
          <div className="full release-actions">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Registrando…" : "Registrar publicação"}
            </button>
            <small>
              As nove etapas são criadas como pendentes. O CI as move conforme
              executa.
            </small>
          </div>
        </form>
      )}

      <div className="release-filters">
        <label>
          Ambiente
          <select
            value={filters.ambiente}
            onChange={(event) =>
              setFilters({ ...filters, ambiente: event.target.value })
            }
          >
            <option value="">Todos</option>
            {AMBIENTES.map((ambiente) => (
              <option key={ambiente} value={ambiente}>
                {rotularPublicacao("ambiente", ambiente)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Situação
          <select
            value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          >
            <option value="">Todas</option>
            <option value="ATIVAS">Em curso</option>
            {STATUS.map((status) => (
              <option key={status} value={status}>
                {rotularPublicacao("status", status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Período
          <select
            value={filters.periodo}
            onChange={(event) =>
              setFilters({ ...filters, periodo: event.target.value })
            }
          >
            <option value="">Desde o início</option>
            <option value="24h">Últimas 24 horas</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="release-loading" role="status">
          <span className="pilot-loader" />
          <p>Carregando publicações registradas…</p>
        </div>
      ) : deploys.length === 0 ? (
        <div className="owner-empty" role="status">
          <span>◌</span>
          <strong>Nenhuma publicação registrada</strong>
          <p>
            O registro está pronto para receber publicações. Quem reporta as
            etapas é o CI/hospedagem, chamando{" "}
            <code>/api/proprietario/publicacoes</code>: um POST abre a
            publicação com as nove etapas pendentes, e cada etapa é movida por
            PATCH (START_STAGE, FINISH_STAGE, HEALTH_CHECK). A aprovação de
            produção é dada aqui, por uma pessoa — sem ela a publicação não
            avança.
          </p>
        </div>
      ) : (
        <>
          {detail && (
            <article
              className={`release-current status-${detail.status}${
                detail.rollbackAutomatico ? " auto-rollback" : ""
              }`}
            >
              <header className="release-current-head">
                <div>
                  <p className="pilot-kicker">
                    {rotularPublicacao("ambiente", detail.ambiente)} ·{" "}
                    {rotularPublicacao("status", detail.status)}
                  </p>
                  <strong>Versão {detail.versao}</strong>
                  <span>{detail.mensagem || "Sem mensagem de commit registrada."}</span>
                </div>
                <dl className="release-meta">
                  <div>
                    <dt>Commit</dt>
                    <dd>
                      <code>{detail.commitSha.slice(0, 10) || "—"}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Branch</dt>
                    <dd>{detail.branch || "—"}</dd>
                  </div>
                  <div>
                    <dt>Autor</dt>
                    <dd>{detail.autor || "—"}</dd>
                  </div>
                  <div>
                    <dt>Início</dt>
                    <dd>{formatarData(detail.iniciadoEm)}</dd>
                  </div>
                  <div>
                    <dt>Duração</dt>
                    <dd>{formatarDuracao(detail.resumo.duracaoMs)}</dd>
                  </div>
                  <div>
                    <dt>Progresso</dt>
                    <dd>
                      {detail.resumo.concluidas} de {detail.resumo.total} etapas
                    </dd>
                  </div>
                </dl>
              </header>

              {detail.rollbackAutomatico && (
                <p className="release-alert" role="alert">
                  Reversão automática exigida: uma etapa crítica falhou depois da
                  publicação ou o health check reprovou de forma crítica.
                </p>
              )}
              {detail.rollbackDeId && (
                <p className="release-alert rollback">
                  Esta publicação é uma reversão da versão{" "}
                  {detail.rollbackDeVersao || `#${detail.rollbackDeId}`}
                  {detail.rollbackMotivo ? ` — ${detail.rollbackMotivo}` : ""}
                </p>
              )}

              <ol className="release-track" aria-label="Etapas do pipeline">
                {trilha.map((etapa) => (
                  <li
                    key={etapa.chave}
                    className={`release-step step-${etapa.status}${
                      detail.etapaAtual === etapa.chave ? " current" : ""
                    }`}
                  >
                    <span className="release-step-order">{etapa.ordem}</span>
                    <div className="release-step-body">
                      <strong>{etapa.rotulo}</strong>
                      <small>
                        {rotularPublicacao("statusEtapa", etapa.status)} ·{" "}
                        {formatarDuracao(etapa.duracaoMs)}
                      </small>
                      {etapa.critica && <em>crítica</em>}
                      {(etapa.logs || etapa.resultado) && (
                        <button
                          type="button"
                          className="release-log-toggle"
                          aria-expanded={logsAbertos === etapa.chave}
                          onClick={() =>
                            setLogsAbertos(
                              logsAbertos === etapa.chave ? "" : etapa.chave,
                            )
                          }
                        >
                          {logsAbertos === etapa.chave ? "Fechar logs" : "Ver logs"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {logsAbertos && (
                <div className="release-logs">
                  <h3>
                    Logs reportados —{" "}
                    {rotularPublicacao("etapa", logsAbertos)}
                  </h3>
                  <p>
                    {trilha.find((etapa) => etapa.chave === logsAbertos)?.resultado ||
                      "Sem resultado reportado."}
                  </p>
                  <pre>
                    {trilha.find((etapa) => etapa.chave === logsAbertos)?.logs ||
                      "Nenhum log enviado pelo CI para esta etapa."}
                  </pre>
                </div>
              )}

              {aguardando && (
                <div className="release-approval" role="region" aria-label="Aprovação">
                  <strong>Esta publicação está parada esperando sua decisão</strong>
                  <p>
                    {detail.ambiente === "PRODUCAO"
                      ? "Publicação em produção só vai ao ar com aprovação explícita registrada. Sem ela, a etapa de publicação é recusada pelo servidor."
                      : "Registre a decisão para liberar o prosseguimento."}
                  </p>
                  <label>
                    Motivo (obrigatório para recusar)
                    <textarea
                      value={motivoAprovacao}
                      onChange={(event) => setMotivoAprovacao(event.target.value)}
                      maxLength={1000}
                      placeholder="O que sustenta esta decisão?"
                    />
                  </label>
                  <div className="release-actions">
                    <button
                      className="primary"
                      disabled={saving}
                      onClick={() => void act("APPROVE", { motivo: motivoAprovacao })}
                    >
                      Aprovar publicação
                    </button>
                    <button
                      className="danger"
                      disabled={saving || motivoAprovacao.trim().length < 5}
                      onClick={() => void act("REJECT", { motivo: motivoAprovacao })}
                    >
                      Recusar
                    </button>
                  </div>
                </div>
              )}

              {detail.aprovacaoStatus !== "PENDENTE" && (
                <p className="release-approved">
                  {rotularPublicacao("aprovacao", detail.aprovacaoStatus)}
                  {detail.aprovadoPor ? ` por ${detail.aprovadoPor}` : ""} em{" "}
                  {formatarData(detail.aprovadoEm)}
                  {detail.aprovacaoMotivo ? ` — ${detail.aprovacaoMotivo}` : ""}
                </p>
              )}

              <div className="release-panels">
                <section>
                  <h3>Resultado dos testes</h3>
                  {testes && testes.status !== "PENDENTE" ? (
                    <>
                      <p className={`release-badge st-${testes.status}`}>
                        {rotularPublicacao("statusEtapa", testes.status)} ·{" "}
                        {formatarDuracao(testes.duracaoMs)}
                      </p>
                      <p>{testes.resultado || "Sem resumo reportado pelo CI."}</p>
                    </>
                  ) : (
                    <p className="release-unreported">
                      O CI ainda não reportou a etapa de testes desta publicação.
                    </p>
                  )}
                </section>
                <section>
                  <h3>Verificação de saúde</h3>
                  {saude && saude.gravidade !== "DESCONHECIDA" ? (
                    <>
                      <p className={`release-badge health-${saude.gravidade}`}>
                        {saude.saudavel ? "Saudável" : "Reprovado"} ·{" "}
                        {saude.verificadas} verificaç
                        {saude.verificadas === 1 ? "ão" : "ões"}
                        {saude.taxaErro !== null
                          ? ` · erro ${saude.taxaErro}% (limite ${saude.limiteErro}%)`
                          : ""}
                      </p>
                      <p>{saude.motivo}</p>
                      {saude.falhas.length > 0 && (
                        <ul className="release-failures">
                          {saude.falhas.map((falha) => (
                            <li key={falha.chave}>
                              {falha.rotulo}
                              {falha.critica ? " (crítica)" : ""}
                              {falha.detalhe ? ` — ${falha.detalhe}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="release-unreported">
                      Nenhuma verificação de saúde reportada pela hospedagem.
                    </p>
                  )}
                </section>
              </div>

              {comparacao && (
                <p className="release-compare">
                  Versão anterior no ar neste ambiente:{" "}
                  <strong>{comparacao.versaoAnterior}</strong> (
                  {formatarData(comparacao.publicadaEm)}) —{" "}
                  {comparacao.ordem > 0
                    ? "esta publicação avança a versão."
                    : comparacao.ordem < 0
                      ? "atenção: esta publicação leva a uma versão anterior."
                      : "mesma versão."}
                </p>
              )}

              <div className="release-actions release-controls">
                <button
                  disabled={saving || !producaoSemAprovacao ? saving : saving}
                  onClick={() => void act("PUBLISH")}
                  title={
                    producaoSemAprovacao
                      ? "Produção exige aprovação registrada — o servidor recusa sem ela."
                      : "Libera a etapa de publicação"
                  }
                >
                  Liberar publicação
                </button>
                <button
                  disabled={saving}
                  onClick={() => void act("CANCEL", { motivo: motivoAprovacao })}
                >
                  Cancelar publicação
                </button>
                <button
                  className="danger"
                  disabled={saving}
                  onClick={() => setConfirmandoRollback((atual) => !atual)}
                >
                  {confirmandoRollback ? "Fechar reversão" : "Reverter publicação"}
                </button>
              </div>

              {confirmandoRollback && (
                <div className="release-rollback" role="region" aria-label="Reversão">
                  <strong>Reverter a versão {detail.versao}</strong>
                  <p>
                    A reversão cria uma nova publicação apontando para esta,
                    marca esta como revertida e fica pendente até o CI executar
                    e reportar as etapas. O motivo é obrigatório e fica na
                    auditoria.
                  </p>
                  <label>
                    Motivo da reversão
                    <textarea
                      value={motivoRollback}
                      onChange={(event) => setMotivoRollback(event.target.value)}
                      maxLength={1000}
                      placeholder="O que aconteceu para justificar voltar atrás?"
                    />
                  </label>
                  <div className="release-actions">
                    <button
                      className="danger"
                      disabled={saving || motivoRollback.trim().length < 5}
                      onClick={() => void act("ROLLBACK", { motivo: motivoRollback })}
                    >
                      Confirmar reversão
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => setConfirmandoRollback(false)}
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </article>
          )}

          {detailLoading && !detail && <p role="status">Carregando publicação…</p>}

          <div className="release-table-wrap">
            <table className="release-table">
              <thead>
                <tr>
                  <th>Versão</th>
                  <th>Ambiente</th>
                  <th>Situação</th>
                  <th>Commit</th>
                  <th>Autor</th>
                  <th>Início</th>
                  <th>Duração</th>
                  <th>Etapas</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {deploys.map((item) => (
                  <tr
                    key={item.id}
                    className={`release-row st-${item.status}${
                      selectedId === item.id ? " selected" : ""
                    }${item.rollbackAutomatico ? " auto-rollback" : ""}`}
                  >
                    <td data-label="Versão">
                      <button onClick={() => setSelectedId(item.id)}>
                        {item.versao}
                      </button>
                      {item.rollbackDeId && (
                        <span className="release-tag rollback">reversão</span>
                      )}
                      {item.rollbackAutomatico && (
                        <span className="release-tag auto">automática</span>
                      )}
                    </td>
                    <td data-label="Ambiente">
                      {rotularPublicacao("ambiente", item.ambiente)}
                    </td>
                    <td data-label="Situação">
                      <span className={`release-tag st-${item.status}`}>
                        {rotularPublicacao("status", item.status)}
                      </span>
                    </td>
                    <td data-label="Commit">
                      <code>{item.commitSha.slice(0, 8) || "—"}</code>
                    </td>
                    <td data-label="Autor">{item.autor || "—"}</td>
                    <td data-label="Início">{formatarData(item.iniciadoEm)}</td>
                    <td data-label="Duração">
                      {formatarDuracao(item.resumo.duracaoMs)}
                    </td>
                    <td data-label="Etapas">
                      {item.resumo.concluidas}/{item.resumo.total}
                      {item.resumo.primeiraFalha && (
                        <small> falhou em {item.resumo.primeiraFalhaRotulo}</small>
                      )}
                    </td>
                    <td data-label="Ações">
                      <button onClick={() => setSelectedId(item.id)}>
                        {selectedId === item.id ? "Selecionada" : "Abrir"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {historico.length > 0 && (
            <section className="release-history">
              <h3>Comparação entre versões publicadas</h3>
              <p>
                Ordenado por versão (semver), não por data — para enxergar quando
                uma publicação levou o ambiente a uma versão anterior.
              </p>
              <ul>
                {historico.map((item) => (
                  <li key={item.id}>
                    <strong>{item.versao}</strong>
                    <span>{rotularPublicacao("ambiente", item.ambiente)}</span>
                    <span className={`release-tag st-${item.status}`}>
                      {rotularPublicacao("status", item.status)}
                    </span>
                    <code>{item.commitSha.slice(0, 8) || "—"}</code>
                    <time>{formatarData(item.concluidoEm)}</time>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
