"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import type { PilotFeatureState } from "../lib/pilot-data";
import GlobalVisualEditor from "./GlobalVisualEditor";
import PilotNotificationCenter from "./PilotNotificationCenter";
import VerifiedOwnerName from "./VerifiedOwnerName";
import PlatformControlsWorkspace from "./PlatformControlsWorkspace";
import EditorialAutomationWorkspace from "./EditorialAutomationWorkspace";
import StatisticsWorkspace from "./StatisticsWorkspace";
import PlatformOptimizerWorkspace from "./PlatformOptimizerWorkspace";
import Link from "./StableLink";
import ThemeControl from "./ThemeControl";
import {
  COMMUNITY_MODULES,
  normalizeCommunityModules,
  toggleCommunityModule,
  type CommunityModuleKey,
} from "../lib/community-modules";

type OwnerData = {
  owner: { id: number; nome: string; email: string };
  metrics: Record<string, number>;
  requests: Record<string, unknown>[];
  communities: Record<string, unknown>[];
  users: Record<string, unknown>[];
  audit: Record<string, unknown>[];
  feedback: Record<string, unknown>[];
  auditRetention?: { days: number; visibleLimit: number };
  ownerLayout?: { gridPreset?: OwnerGridPreset; metricOrder?: OwnerMetricKey[] };
};

type OwnerTab =
  | "overview"
  | "requests"
  | "communities"
  | "users"
  | "audit"
  | "feedback"
  | "editorial"
  | "statistics"
  | "optimization"
  | "controls";
type OwnerGridPreset = "2x2" | "2x4" | "4x2" | "4x4";
type OwnerMetricKey =
  | "comunidades_ativas"
  | "usuarios_ativos"
  | "ministerios_ativos"
  | "solicitacoes_pendentes"
  | "eventos_futuros"
  | "conversas_mes";

const TABS: { id: OwnerTab; label: string; icon: string }[] = [
  { id: "overview", label: "Painel geral", icon: "▦" },
  { id: "requests", label: "Solicitações", icon: "◫" },
  { id: "communities", label: "Comunidades", icon: "◇" },
  { id: "users", label: "Pessoas", icon: "◎" },
  { id: "audit", label: "Segurança e auditoria", icon: "✓" },
  { id: "feedback", label: "Feedback e denúncias", icon: "!" },
  { id: "editorial", label: "IA Editorial", icon: "✦" },
  { id: "statistics", label: "Estatísticas", icon: "▥" },
  { id: "optimization", label: "Otimização", icon: "↻" },
  { id: "controls", label: "Configurações", icon: "⚙" },
];

const OWNER_METRICS: {
  key: OwnerMetricKey;
  label: string;
  detail: string;
  emphasis?: boolean;
}[] = [
  { key: "comunidades_ativas", label: "Comunidades ativas", detail: "Todos os espaços ativos" },
  { key: "usuarios_ativos", label: "Usuários ativos", detail: "Cadastro único da plataforma" },
  { key: "ministerios_ativos", label: "Ministérios ativos", detail: "Todas as comunidades" },
  { key: "solicitacoes_pendentes", label: "Solicitações pendentes", detail: "Exigem sua decisão", emphasis: true },
  { key: "eventos_futuros", label: "Eventos futuros", detail: "Agenda consolidada" },
  { key: "conversas_mes", label: "Conversas no mês", detail: "Metadados operacionais" },
];

export default function OwnerWorkspace({
  ownerName,
  ownerPhoto,
  brandName,
  brandLogo,
  features,
  currentCommunityId,
}: {
  ownerName: string;
  ownerPhoto: string;
  brandName: string;
  brandLogo: string;
  features: PilotFeatureState;
  currentCommunityId: number;
}) {
  const [tab, setTab] = useState<OwnerTab>("overview");
  const [data, setData] = useState<OwnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const [directoryPage, setDirectoryPage] = useState(0);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditResult, setAuditResult] = useState("TODOS");
  const [gridPreset, setGridPreset] = useState<OwnerGridPreset>("2x2");
  const [metricOrder, setMetricOrder] = useState<OwnerMetricKey[]>(
    OWNER_METRICS.map((metric) => metric.key),
  );
  const [draggingMetric, setDraggingMetric] = useState<OwnerMetricKey | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/proprietario", { cache: "no-store" });
      const result = (await response.json()) as OwnerData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar a área do proprietário.");
      setData(result);
      if (["2x2", "2x4", "4x2", "4x4"].includes(String(result.ownerLayout?.gridPreset))) {
        setGridPreset(result.ownerLayout?.gridPreset as OwnerGridPreset);
      }
      if (Array.isArray(result.ownerLayout?.metricOrder)) {
        setMetricOrder(normalizeMetricOrder(result.ownerLayout.metricOrder));
      }
      if (!quiet) setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pending = useMemo(
    () => (data?.requests || []).filter((item) => ["PENDENTE", "EM_ANALISE"].includes(String(item.status))),
    [data?.requests],
  );
  const pendingFeedback = useMemo(
    () => (data?.feedback || []).filter((item) => String(item.status) === "PENDENTE"),
    [data?.feedback],
  );
  const filteredCommunities = useMemo(() => filterRows(data?.communities || [], search, ["nome", "cidade_publica", "proprietario_nome", "status"]), [data?.communities, search]);
  const filteredUsers = useMemo(() => filterRows(data?.users || [], search, ["nome", "email", "telefone", "perfil", "titulo_eclesiastico", "comunidades_nomes"]), [data?.users, search]);
  const directoryRows = tab === "communities" ? filteredCommunities : filteredUsers;
  const directoryPageCount = Math.max(1, Math.ceil(directoryRows.length / 6));
  const safeDirectoryPage = Math.min(directoryPage, directoryPageCount - 1);
  const visibleDirectoryRows = directoryRows.slice(safeDirectoryPage * 6, safeDirectoryPage * 6 + 6);
  const filteredAudit = useMemo(() => {
    const rows = filterRows(data?.audit || [], auditSearch, ["evento", "resultado", "usuario_nome", "comunidade_nome", "metadados"]);
    return auditResult === "TODOS"
      ? rows
      : rows.filter((item) => String(item.resultado) === auditResult);
  }, [auditResult, auditSearch, data?.audit]);

  async function decideRequest(formElement: HTMLFormElement, requestId: number, action: "ANALISAR" | "APROVAR" | "RECUSAR") {
    setWorking(requestId);
    setMessage("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/proprietario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action,
          nome: form.get("nome"),
          cidade: form.get("cidade"),
          descricao: form.get("descricao"),
          note: form.get("note"),
          modules: form.getAll("modules"),
        }),
      });
      const result = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir a análise.");
      setMessage(
        action === "APROVAR"
          ? "Comunidade criada e ativada pelo proprietário."
          : action === "RECUSAR"
            ? "Solicitação recusada e registrada na auditoria."
            : "Solicitação marcada como em análise.",
      );
      await load(true);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function openCommunity(id: number, postId?: number) {
    setWorking(id);
    setMessage("");
    try {
      const response = await fetch("/api/pilot/comunidade-ativa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comunidadeId: id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível abrir a comunidade.");
      window.location.assign(`/painel?view=inicio${postId ? `#publicacao-${postId}` : ""}`);
    } catch (error) {
      setMessage((error as Error).message);
      setWorking(null);
    }
  }

  async function changeCommunityStatus(id: number, status: "ATIVA" | "SUSPENSA") {
    setWorking(id);
    setMessage("");
    try {
      const response = await fetch("/api/proprietario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ALTERAR_STATUS_COMUNIDADE",
          communityId: id,
          status,
        }),
      });
      const result = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar a comunidade.");
      setMessage(status === "ATIVA" ? "Comunidade restaurada e ativada." : "Comunidade suspensa com registro na auditoria.");
      await load(true);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function changeUserStatus(id: number, name: string, active: boolean) {
    if (!window.confirm(`${active ? "Reativar" : "Desativar"} a conta de ${name}?`)) return;
    setWorking(id);
    setMessage("");
    try {
      const response = await fetch("/api/proprietario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ALTERAR_STATUS_USUARIO",
          userId: id,
          ativo: active,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar a conta.");
      setMessage(active ? "Conta reativada." : "Conta desativada e sessões encerradas.");
      await load(true);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function deleteUserPermanently(id: number, name: string) {
    const confirmation = window.prompt(
      `Exclusão definitiva de ${name}. Esta ação só funciona para contas sem vínculos. Digite EXCLUIR para confirmar.`,
    );
    if (confirmation !== "EXCLUIR") return;
    setWorking(id);
    setMessage("");
    try {
      const response = await fetch("/api/proprietario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EXCLUIR_USUARIO_DEFINITIVO",
          userId: id,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir a conta.");
      setMessage("Conta de teste excluída definitivamente.");
      await load(true);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function saveOwnerLayout(
    preset: OwnerGridPreset,
    order: OwnerMetricKey[],
    successMessage: string,
  ) {
    const previous = gridPreset;
    const previousOrder = metricOrder;
    setGridPreset(preset);
    setMetricOrder(order);
    setMessage("");
    try {
      const response = await fetch("/api/proprietario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ATUALIZAR_LAYOUT_PROPRIETARIO",
          gridPreset: preset,
          metricOrder: order,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a organização dos cartões.");
      setMessage(successMessage);
    } catch (error) {
      setGridPreset(previous);
      setMetricOrder(previousOrder);
      setMessage((error as Error).message);
    }
  }

  async function feedbackAction(
    feedbackId: number,
    action: "FEEDBACK_EM_ANALISE" | "FEEDBACK_RESPONDER" | "FEEDBACK_ARQUIVAR" | "FEEDBACK_REABRIR" | "FEEDBACK_EXCLUIR",
    resposta = "",
  ) {
    if (action === "FEEDBACK_EXCLUIR" && !window.confirm("Excluir definitivamente esta mensagem e a foto anexada?")) return;
    setWorking(feedbackId);
    setMessage("");
    try {
      const response = await fetch("/api/proprietario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, feedbackId, resposta }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar a mensagem.");
      await load(true);
      setMessage(action === "FEEDBACK_RESPONDER" ? "Resposta enviada ao usuário." : action === "FEEDBACK_EXCLUIR" ? "Mensagem excluída." : "Mensagem atualizada.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(null);
    }
  }

  function reorderMetric(target: OwnerMetricKey) {
    if (!draggingMetric || draggingMetric === target) return;
    const next = [...metricOrder];
    const sourceIndex = next.indexOf(draggingMetric);
    const targetIndex = next.indexOf(target);
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, draggingMetric);
    setDraggingMetric(null);
    void saveOwnerLayout(
      gridPreset,
      next,
      "Ordem dos cartões salva para sua área de proprietário.",
    );
  }

  function moveMetric(metric: OwnerMetricKey, direction: -1 | 1) {
    const sourceIndex = metricOrder.indexOf(metric);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= metricOrder.length) return;
    const next = [...metricOrder];
    [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
    void saveOwnerLayout(
      gridPreset,
      next,
      "Ordem dos cartões salva para sua área de proprietário.",
    );
  }

  return (
    <main className="owner-area" data-ui-version="v2" data-visual-editor-root data-editor-key="area-proprietario">
      <header className="owner-topbar" data-editor-key="cabecalho-proprietario" data-smart-scroll-header>
        <Link href="/" className="owner-brand"><span>{brandLogo ? <img loading="lazy" src={brandLogo} alt="" /> : brandName.slice(0, 1)}</span><div><strong>{brandName}</strong><small>Propriedade do sistema</small></div></Link>
        <div className="owner-top-actions">
          <ThemeControl compact />
          <PilotNotificationCenter />
          <span id="global-editor-toolbar-slot" className="global-editor-toolbar-slot" aria-label="Aparência" />
          <Link href="/painel?view=conta" className="owner-profile-link" showLoading loadingLabel="Abrindo seu perfil…">
            <span>{ownerPhoto ? <img loading="lazy" src={ownerPhoto} alt="" /> : initials(ownerName)}</span>
            <div><VerifiedOwnerName name={ownerName} verified /><small>Proprietário global</small></div>
          </Link>
        </div>
      </header>

      <div className="owner-layout">
        <aside className="owner-sidebar">
          <div className="owner-identity-card"><span>DA</span><div><small>ACESSO INTEGRAL</small><VerifiedOwnerName name={ownerName} verified /><p>Todas as comunidades, usuários, módulos e configurações.</p></div></div>
          <nav aria-label="Menu do proprietário">
            {TABS.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setDirectoryPage(0); }}><span>{item.icon}</span>{item.label}{item.id === "requests" && pending.length > 0 ? <b>{pending.length}</b> : item.id === "feedback" && pendingFeedback.length > 0 ? <b>{pendingFeedback.length}</b> : null}</button>)}
          </nav>
          <Link href="/painel" showLoading loadingLabel="Abrindo sua comunidade…">Abrir painel de comunidade →</Link>
          <Link href="/comunidades" showLoading loadingLabel="Abrindo o diretório público…">Ver diretório público →</Link>
        </aside>

        <section className="owner-workspace">
          <header className="owner-page-heading owner-page-heading-v97">
            <div><p className="pilot-kicker">CENTRAL DO PROPRIETÁRIO</p><h1>{tabLabel(tab)}</h1><p>{tabDescription(tab)}</p></div>
            <div className="owner-page-quick-actions">
              <button type="button" onClick={() => setTab("requests")}><span>◫</span> Revisar solicitações {pending.length > 0 && <b>{pending.length}</b>}</button>
              <button type="button" onClick={() => setTab("feedback")}><span>!</span> Feedback {pendingFeedback.length > 0 && <b>{pendingFeedback.length}</b>}</button>
              <button type="button" onClick={() => setTab("communities")}><span>◇</span> Abrir comunidades</button>
            </div>
          </header>
          {/* A nota de escopo vivia dentro de um <details> fechado: era preciso
              clicar para descobrir que se está agindo sobre a plataforma
              inteira. Aqui ela é permanente, porque saber em que camada a ação
              cai não é detalhe opcional. */}
          <p className="owner-scope-banner-v5" role="note">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2.8 19.4 6v5.9c0 4.5-3 8.2-7.4 9.3-4.4-1.1-7.4-4.8-7.4-9.3V6L12 2.8Z" />
                <path d="m8.9 11.9 2.2 2.2 4.2-4.3" />
              </svg>
            </span>
            <b>Escopo global</b>
            Tudo aqui alcança a plataforma inteira, fora do contexto de qualquer
            comunidade, e fica registrado na auditoria com o seu nome.
          </p>
          {message && <p className="operations-feedback" role="status">{message}</p>}
          {loading && !data ? <div className="owner-loading">Carregando controles globais…</div> : null}

          {tab === "overview" && data && (
            <>
              <section className="owner-command-hero">
                <div>
                  <p className="pilot-kicker">CONTROLE DA PLATAFORMA</p>
                  <h2>Olá, {ownerName.split(" ")[0]}. A operação está centralizada.</h2>
                  <p>Acompanhe comunidades, pessoas, permissões e decisões sem perder o contexto de segurança.</p>
                </div>
                <div className="owner-command-summary">
                  <span><small>Decisões pendentes</small><strong>{pending.length}</strong></span>
                  <span><small>Comunidades ativas</small><strong>{Number(data.metrics.comunidades_ativas || 0)}</strong></span>
                  <span><small>Pessoas ativas</small><strong>{Number(data.metrics.usuarios_ativos || 0)}</strong></span>
                </div>
              </section>
              <div className="owner-grid-toolbar" aria-label="Organização dos cartões">
                <div><strong>Organização dos cartões</strong><small>Escolha a densidade do seu painel.</small></div>
                <div>{(["2x2", "2x4", "4x2", "4x4"] as OwnerGridPreset[]).map((preset) => <button type="button" key={preset} className={gridPreset === preset ? "active" : ""} onClick={() => void saveOwnerLayout(preset, metricOrder, `Organização ${preset} salva para sua área de proprietário.`)} aria-pressed={gridPreset === preset}>{preset}</button>)}</div>
              </div>
              <div className="owner-metric-grid" data-grid-preset={gridPreset}>
                {metricOrder.map((key, index) => {
                  const metric = OWNER_METRICS.find((item) => item.key === key)!;
                  return <Metric
                    key={key}
                    label={metric.label}
                    value={data.metrics[key]}
                    detail={metric.detail}
                    emphasis={metric.emphasis}
                    draggable
                    dragging={draggingMetric === key}
                    onDragStart={() => setDraggingMetric(key)}
                    onDragEnd={() => setDraggingMetric(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => reorderMetric(key)}
                    onMoveUp={index > 0 ? () => moveMetric(key, -1) : undefined}
                    onMoveDown={index < metricOrder.length - 1 ? () => moveMetric(key, 1) : undefined}
                  />;
                })}
              </div>
              <OwnerInsights metrics={data.metrics} />
              <section className="owner-focus-panel"><div><p className="pilot-kicker">PRÓXIMA AÇÃO</p><h2>Solicitações aguardando análise</h2><p>Nenhuma comunidade é criada sem sua aprovação explícita.</p></div><button onClick={() => setTab("requests")}>Revisar {pending.length} solicitações</button></section>
              <section className="owner-recent-grid"><div><header><h2>Comunidades recentes</h2><button type="button" onClick={() => setTab("communities")}>Ver todas</button></header>{data.communities.slice(0, 5).map((item) => <button key={Number(item.id)} onClick={() => void openCommunity(Number(item.id))}><OwnerAvatar image={communityLogo(item)} name={String(item.nome)} /><div><strong>{String(item.nome)}</strong><small>{String(item.cidade_publica || "Localização não informada")}</small></div><em>Abrir →</em></button>)}</div><div><header><h2>Atividade auditada</h2><button type="button" onClick={() => setTab("audit")}>Ver auditoria</button></header>{data.audit.slice(0, 6).map((item) => <article key={Number(item.id)}><span>✓</span><div><strong>{humanize(String(item.evento))}</strong><small>{String(item.usuario_nome || "Sistema")} · {formatDate(String(item.criado_em))}</small></div></article>)}</div></section>
            </>
          )}

          {tab === "requests" && data && (
            <section className="owner-request-board">
              <header><div><h2>Solicitações de novas comunidades</h2><p>Cada comunidade aparece como um perfil. Toque no cartão para revisar seus próprios dados.</p></div><span>{pending.length} aguardando decisão</span></header>
              <div>{data.requests.map((item) => <RequestCard key={Number(item.id)} item={item} working={working === Number(item.id)} onDecide={decideRequest} />)}</div>
              {!data.requests.length && <Empty title="Nenhuma solicitação" text="Novas fichas aparecerão aqui." />}
            </section>
          )}

          {(tab === "communities" || tab === "users") && data && (
            <section className="owner-directory-panel">
              <header className="owner-directory-header">
                <div>
                  <strong>{tab === "communities" ? "Comunidades da plataforma" : "Pessoas cadastradas"}</strong>
                  <span>{directoryRows.length} {directoryRows.length === 1 ? "resultado" : "resultados"}</span>
                </div>
                <button type="button" onClick={() => setDirectoryOpen((value) => !value)}>
                  {directoryOpen ? "Recolher lista" : "Exibir lista"}
                </button>
              </header>
              <label><span>⌕</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setDirectoryPage(0); }} placeholder={tab === "communities" ? "Pesquisar comunidade, cidade ou responsável" : "Pesquisar nome, telefone, e-mail ou comunidade"} /></label>
              {directoryOpen && tab === "communities" ? (
                <div className="owner-community-list">
                  {visibleDirectoryRows.map((item) => {
                    const id = Number(item.id);
                    const status = String(item.status || "").toUpperCase();
                    const active = status === "ATIVA";
                    const restorable = ["ARQUIVADA", "SUSPENSA"].includes(status);
                    return <details className="owner-community-profile" key={id}>
                      <summary>
                        <OwnerAvatar image={communityLogo(item)} name={String(item.nome)} />
                        <div><h2>{String(item.nome)}</h2><p>{String(item.cidade_publica || "Localização não informada")}</p></div>
                        <b className={active ? "active" : "inactive"}>{status.replaceAll("_", " ")}</b>
                        <i aria-hidden="true">⌄</i>
                      </summary>
                      <div className="owner-community-profile-detail">
                        <p>{String(item.descricao_publica || "Descrição pública não informada.")}</p>
                        <dl>
                          <div><dt>Responsável</dt><dd>{String(item.proprietario_nome || "Não definido")}</dd></div>
                          <div><dt>Membros</dt><dd>{Number(item.membros || 0)}</dd></div>
                          <div><dt>Ministérios</dt><dd>{Number(item.ministerios || 0)}</dd></div>
                          <div><dt>Criada em</dt><dd>{formatDate(String(item.criado_em))}</dd></div>
                        </dl>
                        <div className="owner-community-actions">
                          <button disabled={!active || working === id} onClick={() => void openCommunity(id)}>Abrir com acesso integral</button>
                          {active ? <button className="secondary" disabled={working === id} onClick={() => void changeCommunityStatus(id, "SUSPENSA")}>Suspender</button> : restorable ? <button disabled={working === id} onClick={() => void changeCommunityStatus(id, "ATIVA")}>{status === "ARQUIVADA" ? "Restaurar e ativar" : "Ativar"}</button> : <button className="secondary" disabled>Fluxo protegido</button>}
                        </div>
                      </div>
                    </details>;
                  })}
                  {!visibleDirectoryRows.length && <Empty title="Nenhuma comunidade encontrada" text="Ajuste a pesquisa para ver outros resultados." />}
                </div>
              ) : null}
              {directoryOpen && tab === "users" ? (
                <div className="owner-people-layout">
                  <aside className="owner-linked-people">
                    <header><strong>Com comunidades</strong><small>Vínculos ativos por pessoa</small></header>
                    <div>
                      {filteredUsers.filter((item) => Number(item.comunidades || 0) > 0).map((item) => <article key={Number(item.id)}><OwnerAvatar image={String(item.foto_perfil || "")} name={String(item.nome)} /><span><strong>{String(item.nome)}</strong><small>{String(item.comunidades_nomes || "Comunidade não identificada")}</small></span></article>)}
                      {!filteredUsers.some((item) => Number(item.comunidades || 0) > 0) && <p>Nenhum vínculo encontrado.</p>}
                    </div>
                  </aside>
                  <div className="owner-user-directory">
                    <header><strong>Pessoas cadastradas</strong><small>Contato, perfil e gestão da conta</small></header>
                    <div className="owner-user-list">
                      {visibleDirectoryRows.map((item) => {
                        const id = Number(item.id);
                        const active = Number(item.ativo) === 1;
                        const name = String(item.nome);
                        return <details key={id}><summary><OwnerAvatar image={String(item.foto_perfil || "")} name={name} /><div><h2>{name}</h2><small>{String(item.telefone || item.email || "Contato não informado")}</small></div><b className={active ? "active" : "inactive"}>{active ? "ATIVO" : "INATIVO"}</b><i aria-hidden="true">⌄</i></summary><div className="owner-user-details"><span><small>E-mail</small><strong>{String(item.email || "Não informado")}</strong></span><span><small>Telefone</small><strong>{String(item.telefone || "Não informado")}</strong></span><span><small>Comunidades</small><strong>{String(item.comunidades_nomes || "Sem vínculo")}</strong></span><span><small>Perfil global</small><strong>{String(item.perfil || "MEMBRO")}</strong></span><div className="owner-user-actions"><button type="button" disabled={working === id} onClick={() => void changeUserStatus(id, name, !active)}>{active ? "Desativar conta" : "Reativar conta"}</button><button type="button" className="danger" disabled={working === id} onClick={() => void deleteUserPermanently(id, name)}>Excluir definitivamente</button></div><p>A exclusão definitiva é aceita somente para contas sem vínculos. Contas com histórico devem ser desativadas.</p></div></details>;
                      })}
                      {!visibleDirectoryRows.length && <Empty title="Nenhuma pessoa encontrada" text="Ajuste a pesquisa para ver outros resultados." />}
                    </div>
                  </div>
                </div>
              ) : null}
              {directoryOpen && directoryRows.length > 6 ? <nav className="owner-directory-pagination" aria-label="Paginação da lista"><button type="button" disabled={safeDirectoryPage === 0} onClick={() => setDirectoryPage(Math.max(0, safeDirectoryPage - 1))}>← Anterior</button><span>Página {safeDirectoryPage + 1} de {directoryPageCount}</span><button type="button" disabled={safeDirectoryPage >= directoryPageCount - 1} onClick={() => setDirectoryPage(Math.min(directoryPageCount - 1, safeDirectoryPage + 1))}>Próxima →</button></nav> : null}
            </section>
          )}

          {tab === "audit" && data && <section className="owner-audit-panel"><header><div><h2>Trilha de auditoria</h2><p>Pesquise e abra um registro para conferir os detalhes preservados.</p></div><div className="owner-audit-filters"><input type="search" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Pesquisar ação, pessoa ou comunidade" /><select value={auditResult} onChange={(event) => setAuditResult(event.target.value)} aria-label="Filtrar por resultado"><option value="TODOS">Todos os resultados</option><option value="SUCESSO">Sucesso</option><option value="NEGADO">Negado</option><option value="ERRO">Erro</option></select></div></header><p className="owner-audit-retention" role="note">Retenção automática: registros com mais de {data.auditRetention?.days || 14} dias são excluídos. Esta tela mostra somente as {data.auditRetention?.visibleLimit || 20} ações mais recentes.</p><div className="owner-audit-list">{filteredAudit.map((item) => <details key={Number(item.id)}><summary><span>{String(item.resultado) === "SUCESSO" ? "✓" : "!"}</span><div><strong>{humanize(String(item.evento))}</strong><p>{String(item.comunidade_nome || "Plataforma")} · {String(item.usuario_nome || "Sistema")}</p></div><time>{formatDate(String(item.criado_em))}</time></summary><div className="owner-audit-detail"><span><small>Resultado</small><strong>{String(item.resultado || "NÃO INFORMADO")}</strong></span><span><small>Registro</small><strong>#{Number(item.id)}</strong></span><span><small>Responsável</small><strong>{String(item.usuario_nome || "Sistema")}</strong></span><span><small>Contexto</small><strong>{String(item.comunidade_nome || "Plataforma")}</strong></span><AuditMetadata value={item.metadados} /></div></details>)}{!filteredAudit.length && <Empty title="Nenhum registro encontrado" text="Ajuste a pesquisa ou o filtro de resultado." />}</div></section>}
          {tab === "feedback" && data && <FeedbackRepository items={data.feedback || []} working={working} onAction={feedbackAction} onOpenPost={(communityId, postId) => openCommunity(communityId, postId)} />}
          {tab === "editorial" && <EditorialAutomationWorkspace />}
          {tab === "statistics" && <StatisticsWorkspace />}
          {tab === "optimization" && <PlatformOptimizerWorkspace />}
          {tab === "controls" && <PlatformControlsWorkspace features={features} currentCommunityId={currentCommunityId} />}
        </section>
      </div>
      <GlobalVisualEditor canEdit communityName="Área do Proprietário" screenId={`owner:${tab}`} rootSelector=".owner-area" />
    </main>
  );
}

function RequestCard({ item, working, onDecide }: { item: Record<string, unknown>; working: boolean; onDecide: (form: HTMLFormElement, id: number, action: "ANALISAR" | "APROVAR" | "RECUSAR") => Promise<void> }) {
  const id = Number(item.id);
  const actionable = ["PENDENTE", "EM_ANALISE"].includes(String(item.status));
  const sheet = safeObject(item.ficha_criacao);
  const answers = safeRequestAnswers(sheet.respostas);
  const [modules, setModules] = useState<CommunityModuleKey[]>(() =>
    normalizeCommunityModules(
      sheet.modules,
      COMMUNITY_MODULES.map((module) => module.key),
    ),
  );
  return (
    <details className="owner-request-card owner-request-card-v98">
      <summary>
        <OwnerAvatar name={String(item.nome)} />
        <div><small>COMUNIDADE SOLICITADA</small><strong>{String(item.nome || "Sem nome")}</strong><p>{String(item.solicitante_nome)} · {String(item.solicitante_email)}</p></div>
        <b className={`status-${String(item.status).toLowerCase()}`}>{String(item.status).replace("_", " ")}</b>
        <i aria-hidden="true">⌄</i>
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onDecide(event.currentTarget, id, "APROVAR");
        }}
      >
        <div className="owner-request-fields">
          <label>Nome da comunidade<input name="nome" defaultValue={String(item.nome)} required minLength={3} maxLength={120} disabled={!actionable} /></label>
          <label>Cidade e estado<input name="cidade" defaultValue={String(item.cidade)} required minLength={2} maxLength={120} disabled={!actionable} /></label>
          <label className="wide">Descrição<textarea name="descricao" defaultValue={String(item.descricao)} required minLength={20} maxLength={600} rows={4} disabled={!actionable} /></label>
          {answers.length > 0 && (
            <section className="owner-request-answers wide" aria-label="Informações enviadas na ficha">
              <header><strong>Informações institucionais</strong><small>Dados fornecidos pelo solicitante</small></header>
              <dl>{answers.map(([key, answer]) => <div key={key}><dt>{answer.label}</dt><dd>{answer.value}</dd></div>)}</dl>
            </section>
          )}
          <fieldset className="owner-request-modules wide">
            <legend>Abas solicitadas</legend>
            <p>Você pode alterar a seleção. Ao marcar uma aba, suas dependências são incluídas automaticamente.</p>
            <div>
              {COMMUNITY_MODULES.map((module) => {
                const checked = modules.includes(module.key);
                return (
                  <label key={module.key} className={checked ? "selected" : ""}>
                    <input
                      type="checkbox"
                      name="modules"
                      value={module.key}
                      checked={checked}
                      disabled={!actionable}
                      onChange={(event) =>
                        setModules((current) =>
                          toggleCommunityModule(current, module.key, event.target.checked),
                        )
                      }
                    />
                    <span><strong>{module.label}</strong><small>{module.description}</small></span>
                    <i>{checked ? "✓" : "+"}</i>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="wide owner-decision-note">Mensagem ao solicitante / motivo da decisão<textarea name="note" defaultValue={String(item.observacao_proprietario || "")} maxLength={800} rows={3} disabled={!actionable} onInput={(event) => event.currentTarget.setCustomValidity("")} /><small>Obrigatória ao recusar. O solicitante receberá esta mensagem nas notificações.</small></label>
        </div>
        <footer>
          <small>Solicitada em {formatDate(String(item.criado_em))}</small>
          {actionable ? (
            <div>
              <button type="button" className="secondary" disabled={working} onClick={(event) => event.currentTarget.form && void onDecide(event.currentTarget.form, id, "ANALISAR")}>Marcar em análise</button>
              <button type="button" className="danger" disabled={working} onClick={(event) => {
                const form = event.currentTarget.form;
                const note = form?.elements.namedItem("note") as HTMLTextAreaElement | null;
                if (!form || !note) return;
                if (note.value.trim().length < 5) {
                  note.setCustomValidity("Informe ao menos 5 caracteres para explicar a recusa.");
                  note.reportValidity();
                  note.focus();
                  return;
                }
                void onDecide(form, id, "RECUSAR");
              }}>Recusar e avisar</button>
              <button disabled={working || modules.length === 0}>{working ? "Processando…" : "Aprovar, configurar e ativar"}</button>
            </div>
          ) : <span>Decisão concluída</span>}
        </footer>
      </form>
    </details>
  );
}

function FeedbackRepository({
  items,
  working,
  onAction,
  onOpenPost,
}: {
  items: Record<string, unknown>[];
  working: number | null;
  onAction: (
    id: number,
    action: "FEEDBACK_EM_ANALISE" | "FEEDBACK_RESPONDER" | "FEEDBACK_ARQUIVAR" | "FEEDBACK_REABRIR" | "FEEDBACK_EXCLUIR",
    resposta?: string,
  ) => Promise<void>;
  onOpenPost: (communityId: number, postId: number) => Promise<void>;
}) {
  const [status, setStatus] = useState("ATIVOS");
  const [type, setType] = useState("TODOS");
  const [search, setSearch] = useState("");
  const visible = useMemo(() => items.filter((item) => {
    const currentStatus = String(item.status || "");
    if (status === "ATIVOS" && currentStatus === "ARQUIVADO") return false;
    if (status !== "ATIVOS" && status !== "TODOS" && currentStatus !== status) return false;
    if (type !== "TODOS" && String(item.tipo) !== type) return false;
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return !term || [item.usuario_nome, item.usuario_email, item.mensagem, item.categoria, item.comunidade_nome, item.pagina]
      .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
  }), [items, search, status, type]);
  const pending = items.filter((item) => String(item.status) === "PENDENTE").length;

  return <section className="owner-feedback-panel">
    <header><div><p className="pilot-kicker">REPOSITÓRIO CENTRAL</p><h2>Feedback, melhorias e denúncias</h2><p>Mensagens identificadas pela conta, página e comunidade de origem.</p></div><span>{pending} pendente{pending === 1 ? "" : "s"}</span></header>
    <div className="owner-feedback-filters">
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar pessoa, texto, categoria ou página" />
      <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filtrar por tipo"><option value="TODOS">Todos os tipos</option><option value="PROBLEMA">Problemas</option><option value="SUGESTAO">Sugestões</option><option value="MELHORIA">Melhorias</option><option value="DENUNCIA">Denúncias</option></select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por situação"><option value="ATIVOS">Pendentes e ativos</option><option value="PENDENTE">Pendentes</option><option value="EM_ANALISE">Em análise</option><option value="RESPONDIDO">Respondidos</option><option value="ARQUIVADO">Arquivados</option><option value="TODOS">Todos</option></select>
    </div>
    <div className="owner-feedback-list">
      {visible.map((item) => {
        const id = Number(item.id);
        const currentStatus = String(item.status || "PENDENTE");
        const hasImage = Boolean(String(item.imagem_chave || ""));
        return <details key={id} className={`owner-feedback-card status-${currentStatus.toLowerCase()}`}>
          <summary><span className={`owner-feedback-type type-${String(item.tipo).toLowerCase()}`}>{String(item.tipo) === "PROBLEMA" ? "!" : String(item.tipo) === "SUGESTAO" ? "✦" : String(item.tipo) === "MELHORIA" ? "↗" : "⚑"}</span><div><small>{humanize(String(item.tipo))} · {humanize(String(item.categoria))}</small><strong>{String(item.usuario_nome || "Usuário")}</strong><p>{String(item.mensagem || "")}</p></div><b>{humanize(currentStatus)}</b><i aria-hidden="true">⌄</i></summary>
          <div className="owner-feedback-detail">
            <dl><div><dt>Usuário</dt><dd>{String(item.usuario_nome || "—")}<small>{String(item.usuario_email || "")}</small></dd></div><div><dt>Origem</dt><dd>{String(item.comunidade_nome || "Plataforma")}<small>{String(item.pagina || "/")}</small></dd></div><div><dt>Enviado</dt><dd>{formatDate(String(item.criado_em || ""))}</dd></div>{Number(item.entidade_id || 0) > 0 ? <div><dt>Publicação denunciada</dt><dd><button type="button" className="owner-reported-post-link" onClick={() => void onOpenPost(Number(item.comunidade_id || 0), Number(item.entidade_id))}>Abrir somente a publicação #{Number(item.entidade_id)} →</button></dd></div> : null}</dl>
            <article><h3>Mensagem</h3><p>{String(item.mensagem || "")}</p>{hasImage && <a href={`/api/feedback/${id}/imagem`} target="_blank" rel="noreferrer"><img loading="lazy" src={`/api/feedback/${id}/imagem`} alt={`Foto anexada por ${String(item.usuario_nome || "usuário")}`} /><span>Ampliar foto</span></a>}</article>
            {Boolean(item.resposta_proprietario) && <aside><strong>Resposta enviada</strong><p>{String(item.resposta_proprietario)}</p><small>{String(item.respondido_por_nome || "Proprietário")} · {formatDate(String(item.respondido_em || item.atualizado_em || ""))}</small></aside>}
            <form onSubmit={(event) => { event.preventDefault(); const resposta = String(new FormData(event.currentTarget).get("resposta") || ""); void onAction(id, "FEEDBACK_RESPONDER", resposta); }}><label>Responder ao usuário<textarea name="resposta" rows={3} maxLength={2000} required defaultValue={String(item.resposta_proprietario || "")} placeholder="Escreva a resposta que será enviada nas notificações" /></label><button disabled={working === id}>Responder</button></form>
            <footer>{currentStatus === "PENDENTE" && <button type="button" disabled={working === id} onClick={() => void onAction(id, "FEEDBACK_EM_ANALISE")}>Marcar em análise</button>}{currentStatus === "ARQUIVADO" ? <button type="button" disabled={working === id} onClick={() => void onAction(id, "FEEDBACK_REABRIR")}>Reabrir</button> : <button type="button" disabled={working === id} onClick={() => void onAction(id, "FEEDBACK_ARQUIVAR")}>Arquivar</button>}<button type="button" className="danger" disabled={working === id} onClick={() => void onAction(id, "FEEDBACK_EXCLUIR")}>Excluir</button></footer>
          </div>
        </details>;
      })}
      {!visible.length && <Empty title="Nenhuma mensagem encontrada" text="Ajuste os filtros ou aguarde novos envios." />}
    </div>
  </section>;
}

function OwnerInsights({ metrics }: { metrics: Record<string, number> }) {
  const rows = OWNER_METRICS.map((metric) => ({
    ...metric,
    value: Number(metrics[metric.key] || 0),
  }));
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className="owner-insights-grid" aria-label="Indicadores e permissões da plataforma">
      <article className="owner-volume-chart">
        <header><div><p className="pilot-kicker">DISTRIBUIÇÃO ATUAL</p><h2>Visão operacional</h2></div><span>Dados em tempo real</span></header>
        <div>
          {rows.map((row) => (
            <div key={row.key}>
              <span><strong>{row.label}</strong><b>{row.value}</b></span>
              <i aria-hidden="true"><b style={{ width: `${Math.max(row.value ? 7 : 0, (row.value / maximum) * 100)}%` }} /></i>
            </div>
          ))}
        </div>
      </article>
      <article className="owner-governance-card">
        <header><div><p className="pilot-kicker">PERMISSÕES</p><h2>Governança por função</h2></div><span>Servidor protegido</span></header>
        <div>
          {[
            ["Proprietário", "Plataforma, auditoria e aprovação", "Integral"],
            ["Admin da comunidade", "Somente a comunidade vinculada", "Administrativo"],
            ["Líder", "Ministérios sob responsabilidade", "Operacional"],
            ["Membro", "Perfil, feed e próprias escalas", "Pessoal"],
          ].map(([role, scope, level]) => (
            <span key={role}><i aria-hidden="true">✓</i><div><strong>{role}</strong><small>{scope}</small></div><b>{level}</b></span>
          ))}
        </div>
        <footer>Menus orientam a navegação; APIs continuam validando função, comunidade e recurso.</footer>
      </article>
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  emphasis = false,
  draggable = false,
  dragging = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMoveUp,
  onMoveDown,
}: {
  label: string;
  value: number;
  detail: string;
  emphasis?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return <article
    className={`${emphasis ? "emphasis" : ""} ${dragging ? "dragging" : ""}`.trim()}
    draggable={draggable}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    onDragOver={onDragOver}
    onDrop={onDrop}
  ><span className="owner-metric-grip" aria-hidden="true">⋮⋮</span><div className="owner-metric-touch-actions" aria-label={`Reordenar ${label}`}><button type="button" onClick={onMoveUp} disabled={!onMoveUp} aria-label={`Mover ${label} para cima`}>↑</button><button type="button" onClick={onMoveDown} disabled={!onMoveDown} aria-label={`Mover ${label} para baixo`}>↓</button></div><small>{label}</small><strong>{Number(value || 0)}</strong><p>{detail}</p></article>;
}
function Empty({ title, text }: { title: string; text: string }) { return <div className="owner-empty"><span>◇</span><strong>{title}</strong><p>{text}</p></div>; }
function OwnerAvatar({ image = "", name }: { image?: string; name: string }) {
  return <span className="owner-profile-avatar">{image ? <img loading="lazy" src={image} alt="" /> : initials(name)}</span>;
}
function communityLogo(item: Record<string, unknown>) {
  const theme = safeObject(item.tema);
  return String(theme.logoUrl || theme.logo_url || "");
}
function tabLabel(tab: OwnerTab) { return TABS.find((item) => item.id === tab)?.label || "Visão geral"; }
function tabDescription(tab: OwnerTab) {
  return {
    overview: "Indicadores, decisões e governança em uma visão clara.",
    requests: "Revise os dados e as abas antes de criar cada comunidade.",
    communities: "Acompanhe status, responsáveis, membros e acesso integral.",
    users: "Consulte pessoas, vínculos e perfis globais.",
    audit: "Investigue ações, resultados e contexto de segurança.",
    feedback: "Analise problemas, sugestões, melhorias e denúncias enviadas em todo o sistema.",
    editorial: "Revise e programe conteúdos da plataforma fora do contexto comunitário.",
    statistics: "Consulte indicadores globais sem expor ferramentas da plataforma nos menus comunitários.",
    optimization: "Diagnostique e execute retenções seguras sem remover dados ativos.",
    controls: "Configure identidade, módulos e regras globais da plataforma.",
  }[tab];
}
function initials(value: string) { return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "V"; }
function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(`${value.replace(" ", "T")}Z`)); } catch { return value; } }
function filterRows(rows: Record<string, unknown>[], search: string, fields: string[]) { const term = search.trim().toLocaleLowerCase("pt-BR"); if (!term) return rows; return rows.filter((row) => fields.some((field) => String(row[field] || "").toLocaleLowerCase("pt-BR").includes(term))); }

function normalizeMetricOrder(value: OwnerMetricKey[]) {
  const allowed = new Set(OWNER_METRICS.map((metric) => metric.key));
  const unique = value.filter((key, index) => allowed.has(key) && value.indexOf(key) === index);
  return [...unique, ...OWNER_METRICS.map((metric) => metric.key).filter((key) => !unique.includes(key))];
}

function AuditMetadata({ value }: { value: unknown }) {
  const entries = safeMetadataEntries(value);
  if (!entries.length) return <p className="owner-audit-no-metadata">Sem metadados adicionais.</p>;
  return <dl>{entries.map(([key, content]) => <div key={key}><dt>{humanize(key)}</dt><dd>{content}</dd></div>)}</dl>;
}

function safeMetadataEntries(value: unknown) {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { parsed = null; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [] as [string, string][];
  const blocked = /senha|password|token|secret|segredo|hash|salt|cookie|authorization/i;
  return Object.entries(parsed as Record<string, unknown>)
    .filter(([key]) => !blocked.test(key))
    .slice(0, 12)
    .map(([key, content]) => {
      const text = typeof content === "string" ? content : JSON.stringify(content);
      return [key, String(text || "—").slice(0, 500)] as [string, string];
    });
}

function safeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function safeRequestAnswers(value: unknown) {
  const source = safeObject(value);
  return Object.entries(source).flatMap(([key, raw]) => {
    const answer = safeObject(raw);
    const label = String(answer.label || "").trim();
    const content = String(answer.value || "").trim();
    return label && content ? [[key, { label, value: content }] as const] : [];
  });
}
