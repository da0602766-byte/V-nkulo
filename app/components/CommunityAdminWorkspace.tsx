"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  onOpenManagementView,
  canManageCommunity = false,
  canManageRequests = false,
  canConfigureParking = false,
  canManageRegistrationLinks = false,
  accessSlot = null,
}: {
  managementItems: ManagementItem[];
  onOpenManagementView: (view: CommunityManagementView) => void;
  canManageCommunity?: boolean;
  canManageRequests?: boolean;
  canConfigureParking?: boolean;
  canManageRegistrationLinks?: boolean;
  accessSlot?: React.ReactNode;
}) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [parkingActive, setParkingActive] = useState(false);
  const [parkingName, setParkingName] = useState("Estacionamento");
  const [parkingColor, setParkingColor] = useState("#d99a32");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<number | "config" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canManageRequests && !canConfigureParking) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [requestsResponse, parkingResponse] = await Promise.all([
        canManageRequests
          ? fetch("/api/pilot/solicitacoes-entrada", { cache: "no-store" })
          : Promise.resolve(null),
        canConfigureParking
          ? fetch("/api/pilot/estacionamento/configuracao", {
              cache: "no-store",
            })
          : Promise.resolve(null),
      ]);
      const requestsResult = requestsResponse
        ? await requestsResponse.json()
        : null;
      const parkingResult = parkingResponse
        ? await parkingResponse.json()
        : null;
      if (requestsResponse && !requestsResponse.ok) {
        throw new Error(
          requestsResult.error || "Não foi possível carregar solicitações.",
        );
      }
      if (parkingResponse && !parkingResponse.ok) {
        throw new Error(
          parkingResult?.error || "Não foi possível carregar o estacionamento.",
        );
      }
      if (requestsResult) {
        setRequests(requestsResult.solicitacoes || []);
      }
      if (parkingResult) {
        setParkingActive(Boolean(parkingResult.ativo));
        setParkingName(String(parkingResult.nomeModulo || "Estacionamento"));
        setParkingColor(String(parkingResult.corDestaque || "#d99a32"));
      }
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canConfigureParking, canManageRequests]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updateRequest(id: number, acao: "APROVAR" | "RECUSAR") {
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
      await load();
    } catch (updateError) {
      setError((updateError as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function updateParkingConfig(enabled: boolean) {
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
      setWorking(null);
    }
  }

  // Configurações era uma página só, com convite, atalhos, aparência,
  // privacidade, módulos e solicitações empilhados. Agora cada assunto é uma
  // seção própria: quem vem resolver uma coisa não rola por todas as outras.
  const secoes = useMemo(
    () =>
      [
        { id: "atalhos" as const, label: "Áreas da comunidade", visivel: true },
        { id: "aparencia" as const, label: "Aparência", visivel: canManageCommunity },
        { id: "acessos" as const, label: "Acessos", visivel: canManageRegistrationLinks || Boolean(accessSlot) },
        { id: "modulos" as const, label: "Módulos", visivel: canConfigureParking },
        { id: "privacidade" as const, label: "Privacidade", visivel: canManageCommunity },
        {
          id: "solicitacoes" as const,
          label: "Solicitações de entrada",
          visivel: canManageRequests,
          contador: requests.filter((item) => item.status === "PENDENTE").length,
        },
      ].filter((secao) => secao.visivel),
    [accessSlot, canConfigureParking, canManageCommunity, canManageRegistrationLinks, canManageRequests, requests],
  );
  const [secao, setSecao] = useState<string>("atalhos");
  const secaoAtiva = secoes.some((item) => item.id === secao) ? secao : "atalhos";

  return (
    <div className="community-admin-extra">
      <nav className="community-settings-nav-v5" aria-label="Assuntos das configurações">
        {secoes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={secaoAtiva === item.id ? "active" : ""}
            aria-current={secaoAtiva === item.id ? "page" : undefined}
            onClick={() => setSecao(item.id)}
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

      {secaoAtiva === "aparencia" && canManageCommunity && <CommunityThemeEditor />}

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

      {secaoAtiva === "acessos" && (
        <>
          {accessSlot}
          {canManageRegistrationLinks && <MemberRegistrationLinkManager />}
        </>
      )}

      {secaoAtiva === "modulos" && canConfigureParking && (
        <section className="community-privacy-control parking-module-control">
          <div>
            <p className="pilot-kicker">MÓDULO OFICIAL</p>
            <h2>{parkingName}</h2>
            <p>
              A ativação vale somente para esta comunidade. Ao desativar, os
              dados e a auditoria são preservados.
            </p>
          </div>
          <label>
            <input
              type="checkbox"
              checked={parkingActive}
              disabled={working === "config"}
              onChange={(event) => updateParkingConfig(event.target.checked)}
            />
            <span>{parkingActive ? "Módulo ativo" : "Módulo desativado"}</span>
          </label>
        </section>
      )}

      {(feedback || error) && (
        <p className={`operations-feedback ${error ? "error" : ""}`} role="status">
          {error || feedback}
        </p>
      )}

      {secaoAtiva === "solicitacoes" && canManageRequests && <section className="join-requests-panel">
        <header>
          <div>
            <p className="pilot-kicker">SOLICITAÇÕES DE ENTRADA</p>
            <h2>Análise pela comunidade</h2>
            <p className="join-request-retention">
              Pedidos analisados permanecem visíveis por 24 horas antes da limpeza automática.
            </p>
          </div>
          <span>{loading ? "Carregando…" : `${requests.length} registros`}</span>
        </header>
        <div className="join-request-list">
          {requests.length ? (
            requests.map((item) => (
              <article key={item.id}>
                <span>{item.nome.slice(0, 1)}</span>
                <div>
                  <strong>{item.nome}</strong>
                  <small>{item.email}</small>
                  <p>{item.mensagem || "Nenhuma mensagem informada."}</p>
                  <time dateTime={item.solicitado_em}>
                    {formatDate(item.solicitado_em)}
                  </time>
                </div>
                <div>
                  <span className={`request-status status-${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                  {item.status === "PENDENTE" && (
                    <>
                      <button
                        disabled={working === item.id}
                        onClick={() => updateRequest(item.id, "APROVAR")}
                      >
                        Aprovar
                      </button>
                      <button
                        className="request-reject"
                        disabled={working === item.id}
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
              <strong>Nenhuma solicitação recebida</strong>
              <p>Novos pedidos aparecerão aqui sem misturar comunidades.</p>
            </div>
          )}
        </div>
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
