"use client";
import SafeImage from "./SafeImage";


import TransientFeedback from "./TransientFeedback";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { PilotFeatureState } from "../lib/pilot-data";
import { useTransientMessage } from "../lib/use-transient-message";
import GlobalVisualEditor from "./GlobalVisualEditorLazy";
import dynamic from "next/dynamic";
import OwnerConsoleShell, { OwnerDecisionQueue, formatConsoleDate } from "./OwnerConsoleShell";
const PlatformControlsWorkspace = dynamic(() => import("./PlatformControlsWorkspace"), { loading: () => <p className="oc-loading" role="status">Carregando área…</p> });
const EditorialAutomationWorkspace = dynamic(() => import("./EditorialAutomationWorkspace"), { loading: () => <p className="oc-loading" role="status">Carregando área…</p> });
const StatisticsWorkspace = dynamic(() => import("./StatisticsWorkspace"), { loading: () => <p className="oc-loading" role="status">Carregando área…</p> });
const PlatformOptimizerWorkspace = dynamic(() => import("./PlatformOptimizerWorkspace"), { loading: () => <p className="oc-loading" role="status">Carregando área…</p> });
const OwnerLaboratoryWorkspace = dynamic(() => import("./OwnerLaboratoryWorkspace"), { loading: () => <p className="oc-loading" role="status">Carregando área…</p> });
const OwnerAppearanceWorkspace = dynamic(() => import("./OwnerAppearanceWorkspace"), { loading: () => <p className="oc-loading" role="status">Carregando área…</p> });
const PlatformPlansWorkspace = dynamic(() => import("./CommercialPlansWorkspace"), { loading: () => <p className="oc-loading" role="status">Carregando área…</p> });
const OwnerOnboardingWorkspace = dynamic(() => import('./OwnerOnboardingWorkspace'));
const OwnerResetWorkspace = dynamic(() => import('./OwnerResetWorkspace'));
import type { OwnerOperationsScreen } from "./OwnerOperationsWorkspace";
const OwnerOperationsWorkspace = dynamic(() => import("./OwnerOperationsWorkspace"), { loading: () => <p role="status">Carregando área…</p> });
const OwnerIntegrationsWorkspace = dynamic(() => import("./OwnerIntegrationsWorkspace"), { loading: () => <p role="status">Carregando integrações…</p> });
import {
  COMMUNITY_MODULES,
  normalizeCommunityModules,
  toggleCommunityModule,
  type CommunityModuleKey,
} from "../lib/community-modules";

import { TABS, OwnerTabIcon, type OwnerData, type OwnerTab, type OwnerGridPreset, type OwnerMetricKey } from "../lib/owner-console";

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
  { key: "conversas_semana", label: "Conversas na semana", detail: "Metadados operacionais" },
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
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<OwnerTab>("overview");
  const [data, setData] = useState<OwnerData | null>(null);
  useEffect(() => {
    const requested = searchParams.get("tab");
    if (!TABS.some(item => item.id === requested)) return;
    const frame = window.requestAnimationFrame(() => setTab(requested as OwnerTab));
    return () => window.cancelAnimationFrame(frame);
  }, [searchParams]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<number | null>(null);
  const [message, setMessage] = useTransientMessage();
  const [loadError, setLoadError] = useState("");
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
  const requestController = useRef<AbortController | null>(null);
  const dataSection = ["communities", "users", "requests", "feedback", "audit"].includes(tab) ? tab : tab === "deleted" ? "users" : "overview";

  const load = useCallback(async (quiet = false) => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    if (!quiet) setLoading(true);
    if (!quiet) setData(null);
    setLoadError("");
    try {
      const readSection = async (section: string) => {
        const response = await fetch(`/api/proprietario?section=${section}`, { cache: "no-store", signal: controller.signal });
        if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("O servidor não retornou os dados administrativos. Tente atualizar a página.");
        const result = await response.json() as OwnerData & { error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar a área do proprietário.");
        return result;
      };
      const [summary, detail] = await Promise.all([readSection("overview"), dataSection === "overview" ? Promise.resolve(null) : readSection(dataSection)]);
      if (controller.signal.aborted) return;
      const result = { ...summary, ...detail, users: detail?.users || [] };
      setData(result);
      if (["2x2", "2x4", "4x2", "4x4"].includes(String(result.ownerLayout?.gridPreset))) {
        setGridPreset(result.ownerLayout?.gridPreset as OwnerGridPreset);
      }
      if (Array.isArray(result.ownerLayout?.metricOrder)) {
        setMetricOrder(normalizeMetricOrder(result.ownerLayout.metricOrder));
      }
      if (!quiet) setMessage("");
    } catch (error) {
      if (!controller.signal.aborted) setLoadError((error as Error).message);
    } finally {
      if (!quiet && !controller.signal.aborted) setLoading(false);
    }
  }, [dataSection, setMessage]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(timer); requestController.current?.abort(); };
  }, [load]);

  const pending = useMemo(
    () => (data?.requests || []).filter((item) => ["PENDENTE", "EM_ANALISE"].includes(String(item.status))),
    [data?.requests],
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
      `Exclusão definitiva de ${name}. A conta, seus vínculos e registros pessoais serão removidos. Os líderes serão avisados. Esta ação não pode ser desfeita. Digite EXCLUIR para confirmar.`,
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
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir a conta.");
      setMessage("Conta excluída definitivamente. Avisos registrados para os líderes vinculados.");
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

  function selectTab(next: OwnerTab) {
    setTab(next);
    setDirectoryPage(0);
    setSearch("");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }

  return (
    <main className="owner-area owner-area-v3 owner-console" data-ui-version="owner-console" data-visual-editor-root data-editor-key="area-proprietario">
      <OwnerConsoleShell tab={tab} onSelect={selectTab} onSearchDirectory={(next, query) => { selectTab(next); setSearch(query); }} data={data} ownerName={ownerName} ownerPhoto={ownerPhoto} brandName={brandName} brandLogo={brandLogo}>
        <header className="oc-page-head">
          <div><p className="oc-eyebrow">Console do proprietário · Escopo global</p><h1>{tabLabel(tab)}</h1><p>{tabDescription(tab)}</p></div>
          <div className="oc-head-actions">{!["plans", "appearance", "editorial", "statistics", "optimization", "controls", "laboratory"].includes(tab) && <button type="button" className="oc-button" disabled={loading || working !== null} onClick={() => void load()}>Atualizar dados</button>}{tab === "overview" && <button type="button" className="oc-button primary" onClick={() => selectTab("decisions")}>Revisar pendências</button>}</div>
        </header>
        {(["audit", "passwords", "deleted"] as OwnerTab[]).includes(tab) && <nav className="oc-subnav" aria-label="Segurança e auditoria">{(["audit", "passwords", "deleted"] as OwnerTab[]).map(id => <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => selectTab(id)}><OwnerTabIcon tab={id} />{tabLabel(id)}</button>)}</nav>}
        {(["performance", "incidents", "realtime"] as OwnerTab[]).includes(tab) && <nav className="oc-subnav" aria-label="Confiabilidade">{(["performance", "incidents", "realtime"] as OwnerTab[]).map(id => <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => selectTab(id)}><OwnerTabIcon tab={id} />{tabLabel(id)}</button>)}</nav>}
        {(["decisions", "requests", "feedback"] as OwnerTab[]).includes(tab) && <nav className="oc-subnav" aria-label="Pendências e históricos">{(["decisions", "requests", "feedback"] as OwnerTab[]).map(id => <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => selectTab(id)}>{tabLabel(id)}</button>)}</nav>}
        {tab === "decisions" && data && <OwnerDecisionQueue data={data} onSelect={selectTab} />}
          {message && <TransientFeedback className="operations-feedback" role="status">{message}</TransientFeedback>}
          {loadError && <div className="owner-load-error"><TransientFeedback className="operations-feedback error" role="alert">{loadError}</TransientFeedback><button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
          {loading && !data ? <div className="owner-loading">Carregando controles globais…</div> : null}

          {tab === "overview" && data && <OwnerExecutiveOverview data={data} gridPreset={gridPreset} metricOrder={metricOrder} draggingMetric={draggingMetric} onSelectTab={selectTab} onOpenCommunity={openCommunity} onSaveLayout={saveOwnerLayout} onDragStart={setDraggingMetric} onDragEnd={() => setDraggingMetric(null)} onDropMetric={reorderMetric} onMoveMetric={moveMetric} />}
          {tab === "laboratory" && <OwnerLaboratoryWorkspace />}
          {data && tab === "integrations" && <OwnerIntegrationsWorkspace />}
          {data && (["passwords", "deleted", "finance", "realtime", "performance", "publication", "incidents"] as OwnerOperationsScreen[]).includes(tab as OwnerOperationsScreen) && <OwnerOperationsWorkspace screen={tab as OwnerOperationsScreen} data={data} />}

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
              <label><span>⌕</span><input type="search" aria-label={tab === "communities" ? "Pesquisar comunidades" : "Pesquisar pessoas"} value={search} onChange={(event) => { setSearch(event.target.value); setDirectoryPage(0); }} placeholder={tab === "communities" ? "Pesquisar comunidade, cidade ou responsável" : "Pesquisar nome, telefone, e-mail ou comunidade"} /></label>
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
                        <div><h2>{String(item.nome)}</h2><p>{String(item.cidade_publica || "Localização não informada")}</p><small className="oc-community-counts">{Number(item.membros || 0)} membros · {Number(item.ministerios || 0)} ministérios</small></div>
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
                        return <details key={id}><summary><OwnerAvatar image={String(item.foto_perfil || "")} name={name} /><div><h2>{name}</h2><small>{String(item.telefone || item.email || "Contato não informado")}</small></div><b className={active ? "active" : "inactive"}>{active ? "ATIVO" : "INATIVO"}</b><i aria-hidden="true">⌄</i></summary><div className="owner-user-details"><span><small>E-mail</small><strong>{String(item.email || "Não informado")}</strong></span><span><small>Telefone</small><strong>{String(item.telefone || "Não informado")}</strong></span><span><small>Comunidades</small><strong>{String(item.comunidades_nomes || "Sem vínculo")}</strong></span><span><small>Perfil global</small><strong>{String(item.perfil || "MEMBRO")}</strong></span><div className="owner-user-actions"><button type="button" disabled={working === id || id === data.owner.id || Number(item.system_owner) === 1} onClick={() => void changeUserStatus(id, name, !active)}>{active ? "Desativar conta" : "Reativar conta"}</button><button type="button" className="danger" disabled={working === id || id === data.owner.id || Number(item.system_owner) === 1} onClick={() => void deleteUserPermanently(id, name)}>Excluir definitivamente</button></div><p>{id === data.owner.id || Number(item.system_owner) === 1 ? "Conta do proprietário protegida: desativação e exclusão não são permitidas." : "O proprietário pode excluir contas com vínculos. Os líderes são avisados; a conta, os vínculos e registros pessoais são removidos. Dados compartilhados da comunidade permanecem."}</p></div></details>;
                      })}
                      {!visibleDirectoryRows.length && <Empty title="Nenhuma pessoa encontrada" text="Ajuste a pesquisa para ver outros resultados." />}
                    </div>
                  </div>
                </div>
              ) : null}
              {directoryOpen && directoryRows.length > 6 ? <nav className="owner-directory-pagination" aria-label="Paginação da lista"><button type="button" disabled={safeDirectoryPage === 0} onClick={() => setDirectoryPage(Math.max(0, safeDirectoryPage - 1))}>← Anterior</button><span>Página {safeDirectoryPage + 1} de {directoryPageCount}</span><button type="button" disabled={safeDirectoryPage >= directoryPageCount - 1} onClick={() => setDirectoryPage(Math.min(directoryPageCount - 1, safeDirectoryPage + 1))}>Próxima →</button></nav> : null}
            </section>
          )}

          {tab === "audit" && data && <section className="owner-audit-panel"><header><div><h2>Trilha de auditoria</h2><p>Pesquise e abra um registro para conferir os detalhes preservados.</p></div><div className="owner-audit-filters"><input type="search" aria-label="Pesquisar auditoria" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Pesquisar ação, pessoa ou comunidade" /><select value={auditResult} onChange={(event) => setAuditResult(event.target.value)} aria-label="Filtrar por resultado"><option value="TODOS">Todos os resultados</option><option value="SUCESSO">Sucesso</option><option value="NEGADO">Negado</option><option value="ERRO">Erro</option></select></div></header><p className="owner-audit-retention" role="note">Retenção automática: registros com mais de {data.auditRetention?.days || 14} dias são excluídos. Esta tela mostra somente as {data.auditRetention?.visibleLimit || 20} ações mais recentes.</p><div className="owner-audit-list">{filteredAudit.map((item) => <details key={Number(item.id)}><summary><span>{String(item.resultado) === "SUCESSO" ? "✓" : "!"}</span><div><strong>{humanize(String(item.evento))}</strong><p>{String(item.comunidade_nome || "Plataforma")} · {String(item.usuario_nome || "Sistema")}</p></div><time>{formatDate(String(item.criado_em))}</time></summary><div className="owner-audit-detail"><span><small>Resultado</small><strong>{String(item.resultado || "NÃO INFORMADO")}</strong></span><span><small>Registro</small><strong>#{Number(item.id)}</strong></span><span><small>Responsável</small><strong>{String(item.usuario_nome || "Sistema")}</strong></span><span><small>Contexto</small><strong>{String(item.comunidade_nome || "Plataforma")}</strong></span><AuditMetadata value={item.metadados} /></div></details>)}{!filteredAudit.length && <Empty title="Nenhum registro encontrado" text="Ajuste a pesquisa ou o filtro de resultado." />}</div></section>}
          {tab === "feedback" && data && <FeedbackRepository items={data.feedback || []} working={working} onAction={feedbackAction} onOpenPost={(communityId, postId) => openCommunity(communityId, postId)} />}
          {tab === "editorial" && <EditorialAutomationWorkspace />}
          {tab === "statistics" && <StatisticsWorkspace />}
          {tab === "optimization" && <PlatformOptimizerWorkspace />}
          {tab === "appearance" && <OwnerAppearanceWorkspace />}
          {tab === "plans" && <PlatformPlansWorkspace />}
          {tab === 'onboarding' && <OwnerOnboardingWorkspace />}
          {tab === 'reset' && <OwnerResetWorkspace onReset={() => void load(true)} />}
          {tab === "controls" && <PlatformControlsWorkspace features={features} currentCommunityId={currentCommunityId} />}
      </OwnerConsoleShell>
      <GlobalVisualEditor canEdit communityName="Área do Proprietário" screenId={`owner:${tab}`} rootSelector=".owner-console" />
    </main>
  );
}

function OwnerExecutiveOverview({ data, gridPreset, metricOrder, draggingMetric, onSelectTab, onOpenCommunity, onSaveLayout, onDragStart, onDragEnd, onDropMetric, onMoveMetric }: {
  data: OwnerData; gridPreset: OwnerGridPreset; metricOrder: OwnerMetricKey[]; draggingMetric: OwnerMetricKey | null;
  onSelectTab: (tab: OwnerTab) => void; onOpenCommunity: (id: number) => Promise<void>;
  onSaveLayout: (preset: OwnerGridPreset, order: OwnerMetricKey[], message: string) => Promise<void>;
  onDragStart: (key: OwnerMetricKey) => void; onDragEnd: () => void; onDropMetric: (key: OwnerMetricKey) => void;
  onMoveMetric: (key: OwnerMetricKey, direction: -1 | 1) => void;
}) {
  const [organizing, setOrganizing] = useState(false);
  const failures = data.audit.filter(row => ["ERRO", "NEGADO", "FALHA"].includes(String(row.resultado).toUpperCase()));
  const compact = ["4x2", "4x4"].includes(gridPreset);
  return <div className="oc-overview">
    <section aria-label="Indicadores da plataforma" className="oc-status-rail" data-reorder={organizing}>
      {metricOrder.map((key, index) => { const metric = OWNER_METRICS.find(item => item.key === key)!; return <Metric key={key} label={metric.label} value={data.metrics[key]} detail={compact ? "" : metric.detail} emphasis={metric.emphasis} draggable dragging={draggingMetric === key} onDragStart={() => onDragStart(key)} onDragEnd={onDragEnd} onDragOver={event => event.preventDefault()} onDrop={() => onDropMetric(key)} onMoveUp={index > 0 ? () => onMoveMetric(key, -1) : undefined} onMoveDown={index < metricOrder.length - 1 ? () => onMoveMetric(key, 1) : undefined} />; })}
    </section>
    <div className="oc-source-line"><span>Fonte: base operacional{data.generatedAt && <> · <time dateTime={data.generatedAt}>Atualizado em {formatConsoleDate(data.generatedAt)}</time></>}</span><div role="group" aria-label="Densidade dos indicadores"><button type="button" aria-pressed={organizing} onClick={() => setOrganizing(value => !value)}>Organizar</button><button type="button" aria-pressed={compact} onClick={() => void onSaveLayout("4x2", metricOrder, "Visão enxuta salva.")}>Enxuto</button><button type="button" aria-pressed={!compact} onClick={() => void onSaveLayout("2x2", metricOrder, "Visão detalhada salva.")}>Detalhado</button></div></div>
    <div className="oc-executive-grid">
      <OwnerDecisionQueue data={data} onSelect={onSelectTab} compact />
      <section className="oc-panel oc-health"><header className="oc-panel-head"><div><h2>Saúde da plataforma</h2><p>Evidências disponíveis na auditoria</p></div><OwnerTabIcon tab="performance" /></header><div className="oc-health-summary"><span className="oc-health-symbol"><OwnerTabIcon tab="audit" /></span><div><strong>{failures.length ? "Registros para investigar" : "Sem falhas na amostra"}</strong><p>{data.audit.length} eventos recentes consultados. Isso não comprova disponibilidade ou ausência de incidentes.</p></div></div><dl><div><dt>Erros e acessos negados</dt><dd>{failures.length}</dd></div><div><dt>Latência e disponibilidade</dt><dd>Não integradas</dd></div><div><dt>Retenção da auditoria</dt><dd>{data.auditRetention?.days ? `${data.auditRetention.days} dias` : "Não informada"}</dd></div></dl><footer className="oc-panel-foot"><button type="button" className="oc-text-button" onClick={() => onSelectTab("performance")}>Investigar saúde & incidentes →</button></footer></section>
    </div>
    <div className="oc-lower-grid">
      <section className="oc-panel"><header className="oc-panel-head"><div><h2>Comunidades</h2><p>Operação, responsáveis e situação atual</p></div><button type="button" className="oc-text-button" onClick={() => onSelectTab("communities")}>Ver todas →</button></header><div className="oc-table-scroll" role="region" aria-label="Comunidades da plataforma" tabIndex={0}><table className="oc-table"><caption className="oc-sr-only">Comunidades da plataforma na consulta atual</caption><thead><tr><th scope="col">Comunidade</th><th scope="col">Membros</th><th scope="col">Status</th><th scope="col"><span className="oc-sr-only">Ação</span></th></tr></thead><tbody>{data.communities.slice(0, 5).map(item => <tr key={Number(item.id)}><td><div className="oc-name-cell"><OwnerAvatar image={communityLogo(item)} name={String(item.nome)} /><div><strong>{String(item.nome)}</strong><small>{String(item.proprietario_nome || "Responsável não definido")}</small></div></div></td><td>{Number(item.membros).toLocaleString("pt-BR")}</td><td><span className="oc-status" data-tone={item.status === "ATIVA" ? "success" : "neutral"}>{humanize(String(item.status))}</span></td><td><button type="button" className="oc-text-button" disabled={item.status !== "ATIVA"} onClick={() => void onOpenCommunity(Number(item.id))} aria-label={`Abrir ${item.nome}`}>Abrir ↗</button></td></tr>)}</tbody></table></div>{!data.communities.length && <div className="oc-empty"><h3>Nenhuma comunidade disponível</h3><p>As comunidades aprovadas aparecerão aqui.</p></div>}</section>
      <section className="oc-panel"><header className="oc-panel-head"><div><h2>Atividade recente</h2><p>Trilha de ações administrativas</p></div><button type="button" className="oc-text-button" onClick={() => onSelectTab("audit")}>Ver auditoria →</button></header><ol className="oc-activity">{data.audit.slice(0, 5).map(item => <li key={Number(item.id)}><span className="oc-activity-icon"><OwnerTabIcon tab="audit" /></span><div><strong>{humanize(String(item.evento))}</strong><small>{String(item.usuario_nome || "Sistema")} · {humanize(String(item.resultado))}</small></div><time dateTime={String(item.criado_em)}>{formatConsoleDate(String(item.criado_em))}</time></li>)}</ol>{!data.audit.length && <div className="oc-empty"><h3>Nenhum evento recente</h3><p>Não há registros na janela disponível.</p></div>}</section>
    </div>
  </div>;
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
          <label>Nome da comunidade<input type="text" name="nome" defaultValue={String(item.nome)} required minLength={3} maxLength={120} disabled={!actionable} /></label>
          <label>Cidade e estado<input type="text" name="cidade" defaultValue={String(item.cidade)} required minLength={2} maxLength={120} disabled={!actionable} /></label>
          <label className="wide">E-mail institucional<input type="email" value={String(item.email_institucional || "")} readOnly placeholder="Não informado pelo solicitante" /></label>
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
            <article><h3>Mensagem</h3><p>{String(item.mensagem || "")}</p>{hasImage && <a href={`/api/feedback/${id}/imagem`} target="_blank" rel="noreferrer"><SafeImage loading="lazy" src={`/api/feedback/${id}/imagem`} alt={`Foto anexada por ${String(item.usuario_nome || "usuário")}`} /><span>Ampliar foto</span></a>}</article>
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
  ><span className="owner-metric-grip" aria-hidden="true">⋮⋮</span><div className="owner-metric-touch-actions" aria-label={`Reordenar ${label}`}><button type="button" onClick={onMoveUp} disabled={!onMoveUp} aria-label={`Mover ${label} para cima`}>↑</button><button type="button" onClick={onMoveDown} disabled={!onMoveDown} aria-label={`Mover ${label} para baixo`}>↓</button></div><small>{label}</small><strong>{Number.isFinite(Number(value)) ? Number(value).toLocaleString("pt-BR") : "Sem dados"}</strong><p>{detail}</p></article>;
}
function Empty({ title, text }: { title: string; text: string }) { return <div className="owner-empty"><span>◇</span><strong>{title}</strong><p>{text}</p></div>; }
function OwnerImage({ src, fallback }: { src?: string | null; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return <SafeImage loading="lazy" src={src} alt="" onError={() => setFailed(true)} />;
}
function OwnerAvatar({ image = "", name }: { image?: string; name: string }) {
  return <span className="owner-profile-avatar"><OwnerImage src={image} fallback={initials(name)} /></span>;
}
function communityLogo(item: Record<string, unknown>) {
  const theme = safeObject(item.tema);
  return String(theme.logoUrl || theme.logo_url || "");
}
function tabLabel(tab: OwnerTab) { return TABS.find((item) => item.id === tab)?.label || "Visão geral"; }
function tabDescription(tab: OwnerTab) {
  return {
    decisions: "Solicitações e mensagens abertas em uma única fila, com origem e data reais.",
    overview: "Indicadores, decisões e governança em uma visão clara.",
    requests: "Revise os dados e as abas antes de criar cada comunidade.",
    onboarding: 'Analise solicitações LOG1, propostas e ativações de comunidades.',
    reset: 'Reinicie os dados operacionais, preservando seu acesso de Proprietário.',
    communities: "Acompanhe status, responsáveis, membros e acesso integral.",
    users: "Consulte pessoas, vínculos e perfis globais.",
    audit: "Investigue ações, resultados e contexto de segurança.",
    feedback: "Analise problemas, sugestões, melhorias e denúncias enviadas em todo o sistema.",
    editorial: "Revise e programe conteúdos da plataforma fora do contexto comunitário.",
    statistics: "Consulte indicadores globais sem expor ferramentas da plataforma nos menus comunitários.",
    optimization: "Diagnostique e execute retenções seguras sem remover dados ativos.",
    appearance: "Aplique paleta, logotipo, banner e papel de parede a uma comunidade ou a todas de uma vez.",
    plans: 'Configure valores, recursos, limites e assinaturas das comunidades.',
    laboratory: "Crie e valide protótipos isolados, sem modificar páginas ou dados reais.",
    passwords: "Consulte os eventos de credenciais disponíveis na auditoria.",
    deleted: "Confira cadastros inativos e eventos de desativação disponíveis.",
    finance: "Confira a disponibilidade da integração financeira.",
    realtime: "Consulte o último retrato administrativo disponível.",
    performance: "Investigue falhas, incidentes e lacunas de observabilidade.",
    publication: "Consulte eventos de publicação registrados na auditoria.",
    integrations: "Configure conexões e acompanhe os diagnósticos dos serviços integrados.",
    incidents: "Investigue os resultados com falha na auditoria disponível.",
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
