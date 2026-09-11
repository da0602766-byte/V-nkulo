"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type LifecycleRequest = {
  id: number;
  communityId: number;
  communityName: string;
  communityStatus: string;
  type: string;
  status: string;
  decision: string;
  reason: string;
  category: string;
  description: string;
  evidence: string[];
  evidenceRequired: boolean;
  mfaStatus: string;
  requesterName: string;
  analystName: string | null;
  reviewReason: string | null;
  blockers: string[];
  requestedAt: string;
};

type LifecycleData = {
  community: { id: number; name: string; status: string };
  requests: LifecycleRequest[];
  protection: {
    communityStatus: string;
    recentRecords: number;
    activeLegalHolds: number;
    protectedData: string[];
    permanentDeletionBlocked: boolean;
  };
  canRequest: boolean;
  canReview: boolean;
  permanentDeletionAvailable: boolean;
  mfa: { required: boolean; available: boolean; dependency: string };
};

const STATUS_LABELS: Record<string, string> = {
  ATIVA: "Ativa",
  CANCELAMENTO_SOLICITADO: "Cancelamento solicitado",
  EM_ANALISE: "Em análise",
  DESATIVADA_SOLICITADA: "Desativação solicitada",
  DESATIVADA_POR_INATIVIDADE: "Desativada por inatividade",
  REATIVACAO_SOLICITADA: "Reativação solicitada",
  REATIVADA: "Reativada",
  SUSPENSA: "Suspensa",
};

const CATEGORY_OPTIONS = [
  ["SEM_USO", "Comunidade sem uso"],
  ["MUDANCA_ORGANIZACIONAL", "Mudança organizacional"],
  ["DUPLICIDADE", "Cadastro duplicado"],
  ["PROBLEMA_TECNICO", "Problema técnico"],
  ["SEGURANCA", "Segurança — evidência obrigatória"],
  ["DENUNCIA", "Denúncia — evidência obrigatória"],
  ["RETENCAO_LEGAL", "Questão legal — evidência obrigatória"],
] as const;

export default function CommunityLifecycleWorkspace({
  mode = "community",
  currentCommunityId,
}: {
  mode?: "community" | "support";
  currentCommunityId: number;
}) {
  const [data, setData] = useState<LifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [requestType, setRequestType] = useState("CANCELAMENTO");
  const [category, setCategory] = useState("SEM_USO");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pilot/continuidade", {
        cache: "no-store",
      });
      const result = (await response.json()) as LifecycleData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o fluxo.");
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

  const visibleRequests = useMemo(() => {
    if (!data) return [];
    return mode === "support"
      ? data.requests
      : data.requests.filter((item) => item.communityId === currentCommunityId);
  }, [currentCommunityId, data, mode]);
  const evidenceRequired = ["SEGURANCA", "DENUNCIA", "RETENCAO_LEGAL"].includes(
    category,
  );

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setFeedback("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/pilot/continuidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CRIAR_SOLICITACAO",
          type: requestType,
          category,
          reason: form.get("reason"),
          description: form.get("description"),
          evidence: form.get("evidence"),
          confirmation: form.get("confirmation"),
          password: form.get("password"),
        }),
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar.");
      setFeedback(result.message || "Solicitação enviada para análise.");
      event.currentTarget.reset();
      setRequestType("CANCELAMENTO");
      setCategory("SEM_USO");
      await load();
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function review(
    requestId: number,
    action: "INICIAR_ANALISE" | "RECUSAR" | "APROVAR",
  ) {
    const prompt =
      action === "RECUSAR"
        ? "Explique por que a solicitação será recusada:"
        : action === "APROVAR"
          ? "Informe a justificativa da aprovação:"
          : "Informe a observação inicial da análise:";
    const reviewReason = window.prompt(prompt);
    if (!reviewReason) return;
    setWorking(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/pilot/continuidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, requestId, reviewReason }),
      });
      const result = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) throw new Error(result.error || "A análise não foi atualizada.");
      setFeedback(
        action === "INICIAR_ANALISE"
          ? "Solicitação movida para análise."
          : "Solicitação recusada e solicitante notificado.",
      );
      await load();
    } catch (reviewError) {
      setError((reviewError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <section className="lifecycle-workspace lifecycle-loading">
        <span className="pilot-loader" />
        <p>Carregando proteções e solicitações…</p>
      </section>
    );
  }
  if (!data) {
    return <p className="operations-feedback error">{error || "Fluxo indisponível."}</p>;
  }

  return (
    <section className={`lifecycle-workspace lifecycle-${mode}`}>
      <header className="lifecycle-hero">
        <div>
          <p className="pilot-kicker">
            {mode === "support" ? "CENTRAL DE CONTINUIDADE" : "CONTINUIDADE DA COMUNIDADE"}
          </p>
          <h2>
            {mode === "support"
              ? "Solicitações com análise protegida"
              : "Cancelar não significa apagar"}
          </h2>
          <p>
            {mode === "support"
              ? "Acompanhe cada etapa sem permitir autoaprovação ou exclusão direta."
              : "Envie uma solicitação ao suporte. Configurações e histórico permanecem preservados."}
          </p>
        </div>
        <span className={`lifecycle-status status-${data.protection.communityStatus.toLowerCase()}`}>
          <i />
          {STATUS_LABELS[data.protection.communityStatus] || data.protection.communityStatus}
        </span>
      </header>

      <div className="lifecycle-flow" aria-label="Etapas do processo">
        {[
          ["01", "Solicitação", "Motivo, descrição e senha"],
          ["02", "Análise", "Equipe diferente do solicitante"],
          ["03", "MFA", "Validação crítica externa"],
          ["04", "Preservação", "Sem exclusão automática"],
        ].map(([number, title, detail]) => (
          <article key={number}>
            <span>{number}</span>
            <div><strong>{title}</strong><small>{detail}</small></div>
          </article>
        ))}
      </div>

      <div className="lifecycle-protection-grid">
        <article>
          <span className="lifecycle-icon shield">✓</span>
          <div>
            <small>Últimos 12 meses</small>
            <strong>{data.protection.recentRecords} registros protegidos</strong>
            <p>Esse período bloqueia exclusão definitiva.</p>
          </div>
        </article>
        <article>
          <span className="lifecycle-icon lock">⌁</span>
          <div>
            <small>Retenção legal</small>
            <strong>{data.protection.activeLegalHolds} retenções ativas</strong>
            <p>Denúncias, evidências e auditorias são preservadas.</p>
          </div>
        </article>
        <article>
          <span className="lifecycle-icon archive">□</span>
          <div>
            <small>Exclusão definitiva</small>
            <strong>Indisponível</strong>
            <p>Comunidade sem uso é desativada, nunca apagada aqui.</p>
          </div>
        </article>
      </div>

      {mode === "community" && data.canRequest && (
        <div className="lifecycle-request-layout">
          <form className="lifecycle-request-form" onSubmit={createRequest}>
            <div className="lifecycle-section-title">
              <span>1</span>
              <div>
                <h3>Nova solicitação</h3>
                <p>Somente o suporte pode concluir a ação.</p>
              </div>
            </div>
            <fieldset className="lifecycle-type-selector">
              <legend>O que você precisa?</legend>
              {[
                ["CANCELAMENTO", "Cancelar", "Encerrar o uso da plataforma"],
                ["DESATIVACAO", "Desativar", "Pausar uma comunidade sem uso"],
                ["REATIVACAO", "Reativar", "Pedir restauração do estado anterior"],
              ].map(([value, label, detail]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="type"
                    value={value}
                    checked={requestType === value}
                    onChange={() => setRequestType(value)}
                  />
                  <span><strong>{label}</strong><small>{detail}</small></span>
                </label>
              ))}
            </fieldset>
            <div className="lifecycle-form-grid">
              <label>
                Categoria
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {CATEGORY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Motivo resumido
                <input name="reason" required minLength={5} maxLength={160} />
              </label>
              <label className="lifecycle-wide">
                Descrição completa
                <textarea
                  name="description"
                  required
                  minLength={20}
                  maxLength={1600}
                  rows={4}
                  placeholder="Explique o contexto e o resultado esperado."
                />
              </label>
              <label className="lifecycle-wide">
                Referência de evidência {evidenceRequired ? "(obrigatória)" : "(opcional)"}
                <textarea
                  name="evidence"
                  required={evidenceRequired}
                  rows={2}
                  maxLength={900}
                  placeholder="Informe uma referência ou protocolo. Arquivos privados exigem armazenamento externo."
                />
              </label>
            </div>
            <div className="lifecycle-critical-confirmation">
              <div>
                <strong>Confirmação protegida</strong>
                <small>Isso cria uma solicitação; não desativa nem apaga a comunidade.</small>
              </div>
              <label>Digite SOLICITAR<input name="confirmation" required autoComplete="off" /></label>
              <label>Senha atual<input name="password" type="password" required autoComplete="current-password" /></label>
            </div>
            <button className="lifecycle-primary" disabled={working}>
              {working ? "Validando…" : "Enviar para o suporte"}
            </button>
          </form>
          <aside className="lifecycle-side-note">
            <span>!</span>
            <h3>O pastor não exclui comunidades</h3>
            <p>Não existe botão nem rota de exclusão para o perfil pastoral.</p>
            <ul>
              <li>Senha reconfirmada no servidor</li>
              <li>Solicitante não aprova o próprio pedido</li>
              <li>MFA obrigatório antes da decisão crítica</li>
              <li>Configuração anterior preservada</li>
            </ul>
          </aside>
        </div>
      )}

      <div className="lifecycle-requests">
        <div className="lifecycle-section-title">
          <span>{mode === "support" ? "S" : "2"}</span>
          <div>
            <h3>{mode === "support" ? "Fila do suporte" : "Acompanhamento"}</h3>
            <p>{visibleRequests.length} solicitação(ões) visível(is).</p>
          </div>
        </div>
        {!visibleRequests.length ? (
          <div className="lifecycle-empty">
            <span>✓</span>
            <strong>Nenhuma solicitação pendente</strong>
            <p>Quando houver uma solicitação, a linha do tempo aparecerá aqui.</p>
          </div>
        ) : (
          <div className="lifecycle-request-list">
            {visibleRequests.map((item) => (
              <article key={item.id}>
                <header>
                  <div>
                    <small>#{item.id} · {item.communityName}</small>
                    <h4>{STATUS_LABELS[item.status] || item.status}</h4>
                  </div>
                  <span className={`lifecycle-decision decision-${item.decision.toLowerCase()}`}>
                    {item.decision}
                  </span>
                </header>
                <dl>
                  <div><dt>Tipo</dt><dd>{item.type}</dd></div>
                  <div><dt>Solicitante</dt><dd>{item.requesterName}</dd></div>
                  <div><dt>Motivo</dt><dd>{item.reason}</dd></div>
                  <div><dt>Data</dt><dd>{formatDate(item.requestedAt)}</dd></div>
                </dl>
                <p>{item.description}</p>
                {item.blockers.length > 0 && (
                  <ul className="lifecycle-blockers">
                    {item.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                  </ul>
                )}
                <footer>
                  <span>
                    MFA: <strong>{item.mfaStatus === "PENDENTE_EXTERNO" ? "dependência externa" : item.mfaStatus}</strong>
                  </span>
                  {mode === "support" && item.decision === "PENDENTE" && (
                    <div>
                      {item.status !== "EM_ANALISE" && (
                        <button
                          disabled={working}
                          onClick={() => review(item.id, "INICIAR_ANALISE")}
                        >
                          Iniciar análise
                        </button>
                      )}
                      <button
                        disabled={working}
                        onClick={() => review(item.id, "RECUSAR")}
                      >
                        Recusar
                      </button>
                      <button
                        className="lifecycle-approval"
                        disabled={working}
                        onClick={() => review(item.id, "APROVAR")}
                        title="A aprovação será bloqueada até a integração de MFA."
                      >
                        Aprovar com MFA
                      </button>
                    </div>
                  )}
                </footer>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="lifecycle-external-note">
        <span>EXTERNO</span>
        <div>
          <strong>MFA e arquivos de evidência</strong>
          <p>{data.mfa.dependency} A aprovação final permanece bloqueada até essa integração.</p>
        </div>
      </div>
      {feedback && <p className="operations-feedback" role="status">{feedback}</p>}
      {error && <p className="operations-feedback error" role="alert">{error}</p>}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
