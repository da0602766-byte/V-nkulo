"use client";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./community-central.css";
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

export default function CommunityLifecycleWorkspace({ mode = "community", currentCommunityId }: { mode?: "community" | "support"; currentCommunityId: number }) {
  const [data, setData] = useState<LifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [requestType, setRequestType] = useState("");
  const [category, setCategory] = useState("SEM_USO");
  const [formOpen, setFormOpen] = useState(false);
  const [draftChanged, setDraftChanged] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const mutationRef = useRef(false);
  const fetchData = useCallback(async () => {
    requestRef.current?.abort(); const controller = new AbortController(); requestRef.current = controller;
    return fetch("/api/pilot/continuidade", { cache: "no-store", signal: controller.signal }).then(async response=>{
      const result = await response.json();
      if (!response.ok || !result.protection || !Array.isArray(result.requests)) throw new Error(result.error || "Não foi possível consultar a continuidade.");
      if (!controller.signal.aborted) setData(result);
    }).catch(cause=>{ if (!controller.signal.aborted) setLoadError((cause as Error).message); }).finally(()=>{ if (!controller.signal.aborted) setLoading(false); });},[]);
  const load=useCallback(()=>{setLoading(true); setLoadError("");return fetchData();},[fetchData]);
 useEffect(() => { void fetchData(); return () => requestRef.current?.abort(); }, [fetchData]);
  const visibleRequests = useMemo(() => data?.requests.filter(r => mode === "support" || r.communityId === currentCommunityId) || [], [data, currentCommunityId, mode]);
  const evidenceRequired = ["SEGURANCA", "DENUNCIA", "RETENCAO_LEGAL"].includes(category);

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationRef.current || !data?.canRequest || !requestType) return;
    const formElement = event.currentTarget; const form = new FormData(formElement);
    mutationRef.current = true; setWorking(true); setError(""); setFeedback("");
    try {
      const response = await fetch("/api/pilot/continuidade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CRIAR_SOLICITACAO", type: requestType, category, reason: form.get("reason"), description: form.get("description"), evidence: form.get("evidence"), confirmation: form.get("confirmation"), password: form.get("password") }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível enviar a solicitação.");
      formElement.reset(); setRequestType(""); setCategory("SEM_USO"); setFormOpen(false); setDraftChanged(false);
      setFeedback(result.message || "Solicitação enviada. Acompanhe a análise abaixo."); await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { mutationRef.current = false; setWorking(false); }
  }
  async function review(requestId: number, action: "INICIAR_ANALISE" | "RECUSAR" | "APROVAR") {
    if (mutationRef.current || !data?.canReview) return;
    const reviewReason = window.prompt("Informe a justificativa desta análise:"); if (!reviewReason?.trim()) return;
    mutationRef.current = true; setWorking(true); setError(""); setFeedback("");
    try {
      const response = await fetch("/api/pilot/continuidade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, requestId, reviewReason }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível atualizar a análise.");
      setFeedback(action === "INICIAR_ANALISE" ? "Análise iniciada." : action === "APROVAR" ? "Solicitação aprovada." : "Solicitação recusada."); await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { mutationRef.current = false; setWorking(false); }
  }
  return <section className="central-dashboard central-continuity" aria-busy={loading}>
    <header className="central-page-heading"><div><h2>{mode === "support" ? "Análise das solicitações" : "Situação e continuidade"}</h2><p>Acompanhe solicitações de pausa, reativação ou encerramento do uso.</p></div><button type="button" disabled={loading || working} onClick={() => void load()}>Atualizar</button></header>
    {loading && !data && <p className="central-empty" role="status">Consultando a situação da comunidade…</p>}
    {loadError && <div className="central-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
    {feedback && <p className="central-status" role="status">{feedback}</p>}
    {error && !formOpen && <p className="central-error" role="alert">{error}</p>}
    {data && <>
      <ol className="continuity-steps" aria-label="Etapas da continuidade">
        <li><strong>1. Situação atual</strong><small>{STATUS_LABELS[data.protection.communityStatus] || data.protection.communityStatus}</small></li>
        <li aria-current={!visibleRequests.some(item => item.decision === "PENDENTE") ? "step" : undefined}><strong>2. Solicitação</strong><small>{data.canRequest ? "Descreva o que precisa e confirme sua identidade." : "Consulte os pedidos disponíveis para seu perfil."}</small></li>
        <li aria-current={visibleRequests.some(item => item.decision === "PENDENTE") ? "step" : undefined}><strong>3. Análise</strong><small>A equipe de suporte avalia o pedido e informa a decisão.</small></li>
        <li><strong>4. Conclusão</strong><small>Consulte o resultado e a justificativa no histórico abaixo.</small></li>
      </ol>
      <dl className="central-metric-line"><div><dt>Situação atual</dt><dd className="central-text-value">{STATUS_LABELS[data.protection.communityStatus] || data.protection.communityStatus}</dd><small>Comunidade ativa selecionada</small></div><div><dt>Solicitações em acompanhamento</dt><dd>{visibleRequests.filter(r => r.decision === "PENDENTE").length}</dd><small>Pedidos que aguardam conclusão</small></div><div><dt>Preservação do histórico</dt><dd className="central-text-value">Protegido</dd><small>{data.protection.recentRecords} registros nos últimos 12 meses</small></div></dl>
      <section className="central-section"><div className="central-section-heading"><div><h3>Acompanhamento das solicitações</h3><p>Consulte o andamento antes de abrir um novo pedido.</p></div>{mode === "community" && data.canRequest && <button type="button" onClick={() => setFormOpen(value => !value)} aria-expanded={formOpen}>{formOpen ? "Fechar nova solicitação" : "Nova solicitação"}</button>}</div>
        {!visibleRequests.length && <p className="central-empty">Nenhuma solicitação registrada. A comunidade continua com a situação indicada acima.</p>}
        {visibleRequests.map(item => <details className="central-cell-report" key={item.id}><summary><span><strong>{TYPE_LABELS[item.type] || item.type} · #{item.id}</strong><small>{formatDate(item.requestedAt)} · {item.requesterName}</small></span><span>{DECISION_LABELS[item.decision] || STATUS_LABELS[item.status] || item.status}</span></summary><p className="workspace-form-state">Responsável: {item.analystName || "Aguardando atribuição pelo suporte"} · {item.decision === "PENDENTE" ? "Próximo passo: análise do suporte" : "Análise concluída — consulte o retorno abaixo"}</p><p><strong>{item.reason}</strong></p><p>{item.description}</p>{item.reviewReason && <p>Retorno da análise: {item.reviewReason}</p>}{item.blockers.length > 0 && <ul>{item.blockers.map(b => <li key={b}>{b}</li>)}</ul>}{mode === "support" && data.canReview && item.decision === "PENDENTE" && <div className="central-export-actions">{item.status !== "EM_ANALISE" && <button disabled={working} onClick={() => void review(item.id, "INICIAR_ANALISE")}>Iniciar análise</button>}<button disabled={working} onClick={() => void review(item.id, "RECUSAR")}>Recusar</button><button disabled={working || !data.mfa.available} onClick={() => void review(item.id, "APROVAR")}>Aprovar com verificação</button></div>}</details>)}
      </section>
      {formOpen && mode === "community" && data.canRequest && <form className="central-lifecycle-form" onSubmit={createRequest} onChange={() => setDraftChanged(true)}>
        <h3>Nova solicitação administrativa</h3><p>O envio abre uma análise pelo suporte. Nenhuma mudança de situação acontece imediatamente.</p>
        <p className="workspace-form-state" data-dirty={draftChanged} role="status">{working ? "Enviando solicitação…" : draftChanged ? "Preenchimento em andamento. A solicitação ainda não foi enviada." : "Preencha os campos abaixo para solicitar a análise."}</p>
        <fieldset disabled={working}><legend>O que você precisa?</legend><div className="central-lifecycle-options">{[["DESATIVACAO","Pausar a comunidade","Interromper temporariamente o uso"],["REATIVACAO","Reativar a comunidade","Solicitar a retomada do uso"],["CANCELAMENTO","Encerrar o uso","Solicitar cancelamento ao suporte"]].map(([value,label,detail]) => <label key={value}><input type="radio" name="type" required checked={requestType === value} value={value} onChange={() => setRequestType(value)} /><span><strong>{label}</strong><small>{detail}</small></span></label>)}</div>
        <div className="central-lifecycle-fields"><label>Categoria<select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORY_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Motivo resumido<input name="reason" required minLength={5} maxLength={160} /></label><label className="wide">Descrição completa<textarea name="description" required minLength={20} maxLength={1600} rows={4} placeholder="Explique o contexto e o resultado esperado." /></label><label className="wide">Referência de evidência {evidenceRequired ? "(obrigatória)" : "(opcional)"}<textarea name="evidence" required={evidenceRequired} rows={2} maxLength={900} placeholder="Referência ou protocolo para o suporte." /></label><label>Digite SOLICITAR<input name="confirmation" required autoComplete="off" /></label><label>Senha atual<input type="password" name="password" required autoComplete="current-password" /></label></div>
        <p className="central-note">A senha confirma sua identidade. O histórico da comunidade permanece preservado.</p><button disabled={working || !requestType}>{working ? "Enviando…" : "Enviar solicitação ao suporte"}</button></fieldset>
        {error && <p className="central-error" role="alert">{error} O preenchimento foi mantido.</p>}
      </form>}
      <details className="central-disclosure"><summary>Como funciona a preservação dos dados</summary><p>O solicitante não aprova o próprio pedido. A exclusão definitiva não está disponível nesta tela.</p><p>{data.protection.activeLegalHolds} retenção(ões) ativa(s). Registros, evidências e auditorias seguem preservados.</p>{data.mfa.required && !data.mfa.available && <p>A decisão final depende de verificação adicional pelo suporte, ainda indisponível nesta integração. Você pode enviar e acompanhar uma solicitação.</p>}</details>
    </>}
  </section>;
}
const TYPE_LABELS: Record<string,string> = { CANCELAMENTO:"Encerramento do uso", DESATIVACAO:"Pausa da comunidade", REATIVACAO:"Reativação" };
const DECISION_LABELS: Record<string,string> = { PENDENTE:"Aguardando análise", APROVADA:"Aprovada", RECUSADA:"Recusada", APROVADO:"Aprovado", RECUSADO:"Recusado" };
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z")); }
