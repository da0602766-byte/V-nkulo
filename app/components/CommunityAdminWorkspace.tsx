"use client";

import TransientFeedback from "./TransientFeedback";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./community-settings.css";
import { useAndroidOfflineEnabled } from "./useAndroidOfflineEnabled";
import { matchesDirectorySearch } from "../lib/directory-search";
import CommunityThemeEditor from "./CommunityThemeEditor";
import MemberRegistrationLinkManager from "./MemberRegistrationLinkManager";

type JoinRequest = {
  id: number;
  usuario_id: number;
  nome: string;
  email: string;
  mensagem: string;
  status: "PENDENTE" | "APROVADA" | "RECUSADA";
  solicitado_em: string;
};

export type CommunityManagementView =
  | "membro"
  | "lider"
  | "pessoas"
  | "continuidade";

type ManagementItem = {
  id: CommunityManagementView;
  label: string;
  description: string;
};

export default function CommunityAdminWorkspace({
  managementItems,
  hideManagementHub = false,
  onOpenManagementView,
  canManageCommunity = false,
  canManageRequests = false,
  canConfigureParking = false,
  canManageRegistrationLinks = false,
  accessSlot = null,
  contentSlot = null,
  deviceSlot = null,
}: {
  managementItems: ManagementItem[];
  hideManagementHub?: boolean;
  onOpenManagementView: (view: CommunityManagementView) => void;
  canManageCommunity?: boolean;
  canManageRequests?: boolean;
  canConfigureParking?: boolean;
  canManageRegistrationLinks?: boolean;
  accessSlot?: React.ReactNode;
  contentSlot?: React.ReactNode;
  deviceSlot?: React.ReactNode;
}) {
  const offlineEnabled = useAndroidOfflineEnabled();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [parkingActive, setParkingActive] = useState(false);
  const [parkingName, setParkingName] = useState("Estacionamento");
  const [parkingColor, setParkingColor] = useState("#d99a32");
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [parkingLoading, setParkingLoading] = useState(true);
  const [requestsLoadError, setRequestsLoadError] = useState("");
  const [parkingLoadError, setParkingLoadError] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const [visitedSections, setVisitedSections] = useState<string[]>(["atalhos", ...(contentSlot ? ["conteudo"] : []), ...(hideManagementHub && canManageCommunity ? ["aparencia"] : [])]);
  const mutationRef = useRef(false);
  const [working, setWorking] = useState<number | "config" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const loadRequests = useCallback(async (signal?: AbortSignal) => {
    if (!canManageRequests) { setRequestsLoading(false); return; }
    setRequestsLoading(true); setRequestsLoadError("");
    try {
      const response = await fetch("/api/pilot/solicitacoes-entrada", { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as solicitações.");
      if (!Array.isArray(result.solicitacoes)) throw new Error("Não foi possível ler as solicitações.");
      if (!signal?.aborted) setRequests(result.solicitacoes);
    } catch (cause) {
      if (!signal?.aborted) setRequestsLoadError((cause as Error).message);
    } finally {
      if (!signal?.aborted) setRequestsLoading(false);
    }
  }, [canManageRequests]);

  const loadParking = useCallback(async (signal?: AbortSignal) => {
    if (!canConfigureParking) { setParkingLoading(false); return; }
    setParkingLoading(true); setParkingLoadError("");
    try {
      const response = await fetch("/api/pilot/estacionamento/configuracao", { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o módulo.");
      if (typeof result.ativo !== "boolean" && result.ativo !== 0 && result.ativo !== 1) throw new Error("Não foi possível ler a configuração do módulo.");
      if (!signal?.aborted) {
        setParkingActive(Boolean(result.ativo));
        setParkingName(String(result.nomeModulo || "Estacionamento"));
        setParkingColor(String(result.corDestaque || "#d99a32"));
      }
    } catch (cause) {
      if (!signal?.aborted) setParkingLoadError((cause as Error).message);
    } finally {
      if (!signal?.aborted) setParkingLoading(false);
    }
  }, [canConfigureParking]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadRequests(controller.signal); void loadParking(controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadRequests, loadParking]);

  async function updateRequest(id: number, acao: "APROVAR" | "RECUSAR") {
    if (mutationRef.current || requestsLoading || requestsLoadError) return;
    mutationRef.current = true;
    setWorking(id);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(`/api/pilot/solicitacoes-entrada/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível analisar.");
      }
      setFeedback(
        acao === "APROVAR"
          ? "Solicitação aprovada e vínculo de membro criado."
          : "Solicitação recusada.",
      );
      await loadRequests();
    } catch (updateError) {
      setError((updateError as Error).message);
    } finally {
      mutationRef.current = false;
      setWorking(null);
    }
  }

  async function updateParkingConfig(enabled: boolean) {
    if (mutationRef.current || parkingLoading || parkingLoadError) return;
    mutationRef.current = true;
    setWorking("config");
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/pilot/estacionamento/configuracao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativo: enabled,
          nomeModulo: parkingName,
          corDestaque: parkingColor,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível atualizar o módulo.");
      }
      setParkingActive(Boolean(result.ativo));
      setFeedback(
        enabled
          ? "Estacionamento ativado nesta comunidade."
          : "Estacionamento desativado sem apagar o histórico.",
      );
      window.setTimeout(() => window.location.reload(), 500);
    } catch (updateError) {
      setError((updateError as Error).message);
    } finally {
      mutationRef.current = false;
      setWorking(null);
    }
  }

  // Configurações era uma página só, com convite, atalhos, aparência,
  // privacidade, módulos e solicitações empilhados. Agora cada assunto é uma
  // seção própria: quem vem resolver uma coisa não rola por todas as outras.
  const secoes = useMemo(
    () =>
      [
        { id: "atalhos" as const, label: "Áreas da comunidade", visivel: !hideManagementHub },
        { id: "conteudo" as const, label: "Mensagens e imagens", visivel: Boolean(contentSlot) },
        { id: "aparencia" as const, label: "Aparência", visivel: canManageCommunity },
        { id: "acessos" as const, label: "Acessos", visivel: canManageRegistrationLinks || Boolean(accessSlot) },
        { id: "modulos" as const, label: "Módulos", visivel: canConfigureParking },
        { id: "privacidade" as const, label: "Privacidade", visivel: canManageCommunity },
        { id: "aparelho" as const, label: "Modo offline", visivel: Boolean(deviceSlot) && offlineEnabled },
        {
          id: "solicitacoes" as const,
          label: "Solicitações de entrada",
          visivel: canManageRequests,
          contador: requestsLoading || requestsLoadError ? undefined : requests.filter((item) => item.status === "PENDENTE").length,
        },
      ].filter((secao) => secao.visivel),
    [contentSlot, deviceSlot, offlineEnabled, hideManagementHub, accessSlot, canConfigureParking, canManageCommunity, canManageRegistrationLinks, canManageRequests, requests, requestsLoading, requestsLoadError],
  );
  const [secao, setSecao] = useState<string>(contentSlot ? "conteudo" : hideManagementHub ? canManageCommunity ? "aparencia" : canManageRegistrationLinks || accessSlot ? "acessos" : canConfigureParking ? "modulos" : "solicitacoes" : "atalhos");
  const secaoAtiva = secoes.some((item) => item.id === secao) ? secao : secoes[0]?.id || "";

  const visibleRequests = requests.filter((item) => (!requestStatus || item.status === requestStatus) && matchesDirectorySearch(requestSearch, item.nome, item.email));

  return (
    <div className="community-admin-extra">
      {!secoes.length && <p className="central-empty">Seu perfil não possui configurações administrativas. Seus dados pessoais estão em Perfil e conta.</p>}
      {secoes.length>0&&<label className="settings-mobile-subject">Assunto<select value={secaoAtiva} onChange={event=>{const id=event.target.value;setSecao(id);setVisitedSections(current=>current.includes(id)?current:[...current,id]);}}>{secoes.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <nav className="community-settings-nav-v5" aria-label="Assuntos das configurações">
        {secoes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={secaoAtiva === item.id ? "active" : ""}
            aria-pressed={secaoAtiva === item.id}
            onClick={() => { setSecao(item.id); setVisitedSections((current) => current.includes(item.id) ? current : [...current, item.id]); }}
          >
            {item.label}
            {typeof item.contador === "number" && item.contador > 0 && (
              <span>{item.contador}</span>
            )}
          </button>
        ))}
      </nav>

      {secaoAtiva === "atalhos" && (
      <section className="community-management-hub" aria-labelledby="community-management-title">
        <header>
          <div>
            <p className="pilot-kicker">CENTRAL DA COMUNIDADE</p>
            <h2 id="community-management-title">Tudo da comunidade em um só lugar</h2>
            <p>Os atalhos respeitam seu perfil e as permissões da comunidade ativa.</p>
          </div>
          <span>{managementItems.length} áreas disponíveis</span>
        </header>
        <div className="community-management-grid">
          {managementItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenManagementView(item.id)}
              aria-label={`Abrir ${item.label}`}
            >
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </div>
              <b aria-hidden="true">→</b>
            </button>
          ))}
        </div>
      </section>
      )}

      {offlineEnabled && deviceSlot && secaoAtiva === "aparelho" && <div className="community-settings-section">{deviceSlot}</div>}
      {contentSlot && <div className="community-settings-section" hidden={secaoAtiva !== "conteudo"}>{contentSlot}</div>}
      {visitedSections.includes("aparencia") && canManageCommunity && <div className="community-settings-section" hidden={secaoAtiva !== "aparencia"}><CommunityThemeEditor active={secaoAtiva === "aparencia"} /></div>}

      {secaoAtiva === "privacidade" && canManageCommunity && (
        <>
          <section className="community-privacy-control">
            <div>
              <p className="pilot-kicker">PRIVACIDADE DA COMUNIDADE</p>
              <h2>Conteúdo interno protegido</h2>
              <p>
                Publicações, comentários, membros, células e escalas não são
                enviados a um feed público. A página institucional exibe somente
                informações e eventos que foram definidos como públicos.
              </p>
            </div>
            <span className="privacy-locked-badge">Proteção obrigatória</span>
          </section>
        </>
      )}

      {visitedSections.includes("acessos") && (
        <div className="community-settings-section" hidden={secaoAtiva !== "acessos"}>
          {accessSlot}
          {canManageRegistrationLinks && <MemberRegistrationLinkManager />}
        </div>
      )}

      {secaoAtiva === "modulos" && canConfigureParking && (
        <section className="community-privacy-control parking-module-control" aria-busy={parkingLoading}>
          <div>
            <p className="pilot-kicker">MÓDULO OFICIAL</p>
            <h2>{parkingName}</h2>
            <p>
              A ativação vale somente para esta comunidade. Ao desativar, os
              dados e a auditoria são preservados.
            </p>
          </div>
          {parkingLoading ? <p role="status">Carregando configuração do módulo…</p> : parkingLoadError ? <div className="community-settings-error"><p role="alert">{parkingLoadError}</p><button type="button" onClick={() => void loadParking()}>Tentar novamente</button></div> : <label>
            <input
              type="checkbox"
              checked={parkingActive}
              disabled={working !== null}
              onChange={(event) => updateParkingConfig(event.target.checked)}
            />
            <span>{working === "config" ? "Salvando alteração…" : parkingActive ? "Módulo ativo" : "Módulo desativado"}</span>
          </label>}
          {!parkingLoading && !parkingLoadError && <small>A alteração é salva assim que você toca no controle.</small>}
        </section>
      )}

      {(feedback || error) && (
        <TransientFeedback className={`operations-feedback ${error ? "error" : ""}`} role="status">
          {error || feedback}
        </TransientFeedback>
      )}

      {secaoAtiva === "solicitacoes" && canManageRequests && <section className="join-requests-panel" aria-busy={requestsLoading}>
        <header>
          <div>
            <p className="pilot-kicker">SOLICITAÇÕES DE ENTRADA</p>
            <h2>Análise pela comunidade</h2>
            <p className="join-request-retention">
              Pedidos analisados permanecem visíveis por 24 horas antes da limpeza automática.
            </p>
          </div>
          <span>{requestsLoading ? "Carregando…" : requestsLoadError ? "Consulta indisponível" : `${requests.length} ${requests.length === 1 ? "registro" : "registros"}`}</span>
        </header>
        <div className="community-request-filters">
          <label>Buscar pessoa ou e-mail<input type="search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Nome ou e-mail" /></label>
          <label>Situação<select name="situacao" value={requestStatus} onChange={(event) => setRequestStatus(event.target.value)}><option value="">Todas</option><option value="PENDENTE">Aguardando análise</option><option value="APROVADA">Aprovadas</option><option value="RECUSADA">Recusadas</option></select></label>
          {(requestSearch || requestStatus) && <button type="button" onClick={() => { setRequestSearch(""); setRequestStatus(""); }}>Limpar filtros</button>}
        </div>
        {requestsLoading ? <p role="status">Carregando solicitações…</p> : requestsLoadError ? <div className="community-settings-error"><p role="alert">{requestsLoadError}</p><button type="button" onClick={() => void loadRequests()}>Tentar novamente</button></div> : <>
        <p className="community-request-count" role="status">{visibleRequests.length} de {requests.length} solicitações</p>
        <div className="join-request-list">
          {visibleRequests.length ? (
            visibleRequests.map((item) => (
              <article key={item.id}>
                <span>{item.nome.slice(0, 1)}</span>
                <div>
                  <strong>{item.nome}</strong>
                  <small>{item.email}</small>
                  <details><summary>Detalhes da solicitação</summary>{item.mensagem && <p>{item.mensagem}</p>}<time dateTime={item.solicitado_em}>{formatDate(item.solicitado_em)}</time></details>
                </div>
                <div>
                  <span className={`request-status status-${item.status.toLowerCase()}`}>
                    {{ PENDENTE: "Aguardando análise", APROVADA: "Aprovada", RECUSADA: "Recusada" }[item.status]}
                  </span>
                  {item.status === "PENDENTE" && (
                    <>
                      <button
                        type="button"
                        aria-label={`Aprovar entrada de ${item.nome}`}
                        disabled={working !== null}
                        onClick={() => updateRequest(item.id, "APROVAR")}
                      >
                        Aprovar
                      </button>
                      <button
                        className="request-reject"
                        type="button"
                        aria-label={`Recusar entrada de ${item.nome}`}
                        disabled={working !== null}
                        onClick={() => updateRequest(item.id, "RECUSAR")}
                      >
                        Recusar
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="pilot-empty-state">
              <strong>{requests.length ? "Nenhuma solicitação para estes filtros" : "Nenhuma solicitação recebida"}</strong>
              <p>{requests.length ? "Ajuste a busca ou use Limpar filtros para ampliar a consulta." : "Os pedidos de entrada desta comunidade aparecerão aqui."}</p>
            </div>
          )}
        </div>
        </>}
      </section>}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
