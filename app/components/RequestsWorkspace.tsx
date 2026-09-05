"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type RequestType = "ORACAO" | "VISITA" | "ACONSELHAMENTO" | "APOIO" | "MINISTERIO" | "OUTRO" | "INFORMACAO";
type RequestStatus = "ABERTA" | "EM_ANALISE" | "CONCLUIDA";
type RepositoryStatus = "ABERTO" | "EM_ORACAO" | "EM_ACOMPANHAMENTO" | "AGUARDANDO_CONTATO" | "AGUARDANDO_RETORNO" | "EM_PROCESSO" | "VISITA_AGENDADA" | "VISITA_REALIZADA" | "FINALIZADO" | "ORACAO_ATENDIDA" | "VISITA_CONCLUIDA" | "NOVA_VISITA";

type CommunityRequest = {
  id: number; tipo: RequestType; titulo: string; descricao: string;
  visibilidade: "PASTORAL" | "GESTORES" | "PRIVADA"; status: RequestStatus;
  criado_em: string; atualizado_em: string; solicitante_nome: string; solicitante_foto: string;
  solicitante_papel: string; publico_resumo: string; is_mine: number;
  repositorio_item_id: number | null; operacional_status: RepositoryStatus | null;
  prioridade: "NORMAL" | "URGENTE"; responsavel_nome: string; responsavel_usuario_id: number | null;
  responsavel_atribuido_em: string | null; primeiro_contato_em: string | null;
  proximo_retorno_em: string | null; visita_agendada_em: string | null; finalizado_em: string | null;
  mensagem_atendimento: string; ultima_atualizacao: string; resultado: string;
  preferencia_contato: string; disponibilidade: string; data_preferencial: string | null; contato_autorizado: number;
};
type AudienceOptions = {
  usuarios: Array<{ id: number; nome: string; papel: string }>;
  ministerios: Array<{ id: number; nome: string }>;
  papeis: string[]; allowAllMembers: boolean;
};
type RequestEvent = {
  id: number; tipo: string; mensagem: string; visivel_membro: number;
  criado_em: string; autor_nome: string;
};
type RepositoryItem = {
  id: number; solicitacao_id: number; repositorio_id: number; tipo: "ORACAO" | "VISITA";
  item_status: RepositoryStatus; titulo: string; descricao: string;
  solicitante_nome: string; solicitante_foto: string; solicitante_papel: string;
  solicitante_telefone: string; criado_em: string; atualizado_em: string;
  responsavel_usuario_id: number | null; responsavel_nome: string; responsavel_funcao: string;
  responsavel_atribuido_em: string | null; primeiro_contato_em: string | null;
  proximo_retorno_em: string | null; visita_agendada_em: string | null;
  prioridade: "NORMAL" | "URGENTE"; resultado: string; retorno_atrasado: number;
  mensagem_atendimento: string; testemunho: string; testemunho_compartilhavel: number;
  testemunho_publicado_em: string | null; finalizado_em: string | null;
  preferencia_contato: string; disponibilidade: string; data_preferencial: string | null; contato_autorizado: number;
  eventos: RequestEvent[];
};
type Repository = {
  id: number; tipo: "ORACAO" | "VISITA"; nome: string; status: "SUGERIDO" | "ATIVO";
  ministerio_id: number | null; ministerio_nome: string; items: RepositoryItem[];
};
type PastorContact = { id: number; nome: string; foto: string; whatsappUrl: string };
type Assignee = { id: number; nome: string; funcao: string };
type CentralData = {
  canManageRepositories: boolean; canOperate: boolean;
  currentActor: { id: number; nome: string };
  whatsappPreference: { canConfigure: boolean; enabled: boolean; hasPhone: boolean };
  pastoresContato: PastorContact[]; ministries: Array<{ id: number; nome: string }>;
  assignees: Assignee[]; repositories: Repository[];
};
type OperationalRow = {
  key: string; source: "repository" | "general"; requestId: number; category: RequestType;
  title: string; description: string; person: string; photo: string; role: string;
  owner: string; date: string; status: string; priority: string; note: string;
  overdue: boolean; final: boolean; repositoryItem?: RepositoryItem; generalItem?: CommunityRequest;
};

const CATEGORIES: Array<{ value: Exclude<RequestType, "INFORMACAO">; label: string }> = [
  { value: "ORACAO", label: "Oração" }, { value: "VISITA", label: "Visita" },
  { value: "ACONSELHAMENTO", label: "Aconselhamento" }, { value: "APOIO", label: "Apoio" },
  { value: "MINISTERIO", label: "Ministério" }, { value: "OUTRO", label: "Outro" },
];
const EMPTY_CENTRAL: CentralData = {
  canManageRepositories: false, canOperate: false, currentActor: { id: 0, nome: "" },
  whatsappPreference: { canConfigure: false, enabled: false, hasPhone: false },
  pastoresContato: [], ministries: [], assignees: [], repositories: [],
};

export default function RequestsWorkspace({ communityName }: { communityName: string }) {
  const [items, setItems] = useState<CommunityRequest[]>([]);
  const [central, setCentral] = useState<CentralData>(EMPTY_CENTRAL);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"member" | "operations">("member");
  const [formOpen, setFormOpen] = useState(false);
  const [moreCategories, setMoreCategories] = useState(false);
  const [requestCategory, setRequestCategory] = useState<Exclude<RequestType, "INFORMACAO">>("ORACAO");
  const [selectedAudience, setSelectedAudience] = useState<string[]>([]);
  const [audienceOptions, setAudienceOptions] = useState<AudienceOptions>({ usuarios: [], ministerios: [], papeis: [], allowAllMembers: false });
  const [personSearch, setPersonSearch] = useState("");
  const [memberDetail, setMemberDetail] = useState<CommunityRequest | null>(null);
  const [pendingPastor, setPendingPastor] = useState<PastorContact | null>(null);
  const [selectedRow, setSelectedRow] = useState<OperationalRow | null>(null);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState("TODOS");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedStatus, setAdvancedStatus] = useState("");
  const [advancedOwner, setAdvancedOwner] = useState("");
  const [advancedPeriod, setAdvancedPeriod] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<RepositoryStatus>("ABERTO");
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [workflowTestimony, setWorkflowTestimony] = useState("");
  const [testimonyPermission, setTestimonyPermission] = useState<"" | "PERMITIR" | "NAO_PERMITIR">("");
  const [priority, setPriority] = useState<"NORMAL" | "URGENTE">("NORMAL");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [scheduledVisit, setScheduledVisit] = useState("");
  const [result, setResult] = useState("");
  const [eventType, setEventType] = useState("NOTA_INTERNA");
  const [eventMessage, setEventMessage] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [repositoryMinistries, setRepositoryMinistries] = useState<Record<number, string>>({});
  const formRef = useRef<(HTMLFormElement & { open: boolean })>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [requestsResponse, centralResponse] = await Promise.all([
        fetch("/api/pilot/solicitacoes", { cache: "no-store" }),
        fetch("/api/pilot/solicitacoes/central", { cache: "no-store" }),
      ]);
      const requestsPayload = await requestsResponse.json() as { solicitacoes?: CommunityRequest[]; canManage?: boolean; audienceOptions?: AudienceOptions; error?: string };
      const centralPayload = await centralResponse.json() as CentralData & { error?: string };
      if (!requestsResponse.ok) throw new Error(requestsPayload.error || "Não foi possível carregar os pedidos. Tente novamente.");
      if (!centralResponse.ok) throw new Error(centralPayload.error || "Não foi possível carregar os pedidos. Tente novamente.");
      setItems(requestsPayload.solicitacoes || []);
      setCanManage(Boolean(requestsPayload.canManage));
      setAudienceOptions(requestsPayload.audienceOptions || { usuarios: [], ministerios: [], papeis: [], allowAllMembers: false });
      setCentral(centralPayload);
      setRepositoryMinistries((current) => {
        const next = { ...current };
        for (const repository of centralPayload.repositories || []) if (repository.ministerio_id && !next[repository.id]) next[repository.id] = String(repository.ministerio_id);
        return next;
      });
    } catch (caught) { setError((caught as Error).message); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const open = () => { setMode("member"); openCreate("ORACAO"); };
    window.addEventListener("vinkulo:new-request", open);
    return () => window.removeEventListener("vinkulo:new-request", open);
  }, []);

  const myRequests = useMemo(() => items.filter((item) => Boolean(item.is_mine)), [items]);
  const operationalRows = useMemo<OperationalRow[]>(() => {
    const repositoryRows = central.repositories.flatMap((repository) => repository.items.map((item) => ({
      key: `repository-${item.id}`, source: "repository" as const, requestId: item.solicitacao_id,
      category: repository.tipo, title: item.titulo, description: item.descricao,
      person: item.solicitante_nome, photo: item.solicitante_foto, role: item.solicitante_papel,
      owner: item.responsavel_nome, date: item.criado_em, status: item.item_status,
      priority: item.prioridade, note: item.resultado || item.mensagem_atendimento,
      overdue: Boolean(item.retorno_atrasado), final: Boolean(item.finalizado_em), repositoryItem: item,
    })));
    const generalRows = items.filter((item) => item.tipo !== "ORACAO" && item.tipo !== "VISITA").map((item) => ({
      key: `general-${item.id}`, source: "general" as const, requestId: item.id, category: item.tipo,
      title: item.titulo, description: item.descricao, person: item.solicitante_nome,
      photo: item.solicitante_foto, role: item.solicitante_papel, owner: item.responsavel_nome,
      date: item.criado_em, status: item.status, priority: item.prioridade || "NORMAL",
      note: item.ultima_atualizacao || item.descricao, overdue: false,
      final: item.status === "CONCLUIDA", generalItem: item,
    }));
    return [...repositoryRows, ...generalRows].sort((a, b) => {
      if (a.final !== b.final) return a.final ? 1 : -1;
      if ((a.priority === "URGENTE") !== (b.priority === "URGENTE")) return a.priority === "URGENTE" ? -1 : 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [central.repositories, items]);
  const metrics = useMemo(() => ({
    open: operationalRows.filter((item) => !item.final).length,
    urgent: operationalRows.filter((item) => !item.final && item.priority === "URGENTE").length,
    visits: operationalRows.filter((item) => item.category === "VISITA" && !item.final).length,
    today: operationalRows.filter((item) => item.final && isToday(item.repositoryItem?.finalizado_em || item.generalItem?.atualizado_em || "")).length,
  }), [operationalRows]);
  const filteredRows = useMemo(() => operationalRows.filter((row) => {
    const query = normalize(search);
    if (query && !normalize([row.person, row.title, requestType(row.category), row.owner, row.note, statusLabel(row)].join(" ")).includes(query)) return false;
    if (quickFilter === "ORACAO" && row.category !== "ORACAO") return false;
    if (quickFilter === "VISITA" && row.category !== "VISITA") return false;
    if (quickFilter === "URGENTES" && row.priority !== "URGENTE") return false;
    if (quickFilter === "PENDENTES" && row.final) return false;
    if (quickFilter === "ACOMPANHAMENTO" && !["EM_ANALISE", "EM_ACOMPANHAMENTO", "EM_ORACAO", "EM_PROCESSO"].includes(row.status)) return false;
    if (quickFilter === "RETORNO" && !row.overdue && row.status !== "AGUARDANDO_RETORNO") return false;
    if (quickFilter === "CONCLUIDOS" && !row.final) return false;
    if (advancedStatus && row.status !== advancedStatus) return false;
    if (advancedOwner && String(row.repositoryItem?.responsavel_usuario_id || "") !== advancedOwner) return false;
    if (onlyUnassigned && row.owner) return false;
    if (advancedPeriod && new Date(row.date) < new Date(`${advancedPeriod}T00:00:00`)) return false;
    return true;
  }), [advancedOwner, advancedPeriod, advancedStatus, onlyUnassigned, operationalRows, quickFilter, search]);

  function openCreate(category: Exclude<RequestType, "INFORMACAO">) {
    setRequestCategory(category); setFormOpen(true); setError(""); setFeedback("");
    window.setTimeout(() => {
      if (!formRef.current) return;
      formRef.current.open = true;
      formRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 20);
  }
  function clearMessages() { setFeedback(""); setError(""); }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const category = String(data.get("tipo") || "") as RequestType;
    const goesToRepository = category === "ORACAO" || category === "VISITA";
    if (!goesToRepository && !selectedAudience.length) { setError("Selecione pelo menos uma pessoa, ministério ou função autorizada."); return; }
    setBusy("create"); clearMessages();
    try {
      const response = await fetch("/api/pilot/solicitacoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(data.entries()), visibilidade: "PRIVADA",
          contatoAutorizado: data.get("contatoAutorizado") === "on",
          audience: goesToRepository ? undefined : selectedAudience.map(parseAudienceKey) }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível enviar seu pedido.");
      form.reset(); setSelectedAudience([]); setFormOpen(false);
      setFeedback("Seu pedido foi recebido 💜 Uma pessoa responsável poderá acompanhar sua solicitação por aqui.");
      await load(true);
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(""); }
  }

  async function updateGeneral(item: CommunityRequest, status: RequestStatus) {
    await requestAction(`general-${item.id}`, "/api/pilot/solicitacoes", { id: item.id, status }, "Situação atualizada e solicitante notificado.");
    setSelectedRow(null);
  }
  async function requestAction(key: string, endpoint: string, payload: Record<string, unknown>, successMessage: string) {
    setBusy(key); clearMessages();
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const responsePayload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(responsePayload.error || "Não foi possível concluir a ação.");
      setFeedback(successMessage); await load(true); return true;
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(""); }
    return false;
  }
  function openOperationalDetail(row: OperationalRow) {
    setSelectedRow(row); setEventMessage(""); setTargetUser("");
    if (row.repositoryItem) {
      const item = row.repositoryItem;
      setWorkflowStatus(item.item_status); setWorkflowMessage(item.mensagem_atendimento || "");
      setWorkflowTestimony(item.testemunho || "");
      setTestimonyPermission(item.testemunho_compartilhavel === 1 ? "PERMITIR" : item.testemunho_compartilhavel === 0 ? "NAO_PERMITIR" : "");
      setPriority(item.prioridade || "NORMAL"); setNextFollowUp(toLocalInput(item.proximo_retorno_em));
      setScheduledVisit(toLocalInput(item.visita_agendada_em)); setResult(item.resultado || "");
    }
  }
  async function saveRepositoryWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const item = selectedRow?.repositoryItem;
    if (!item) return;
    if (workflowTestimony.trim() && !testimonyPermission) { setError("Escolha se o testemunho pode ou não ser compartilhado."); return; }
    const ok = await requestAction(`workflow-${item.id}`, "/api/pilot/solicitacoes/central", {
      action: "ATUALIZAR_ITEM", itemId: item.id, status: workflowStatus,
      mensagemAtendimento: workflowMessage, testemunho: workflowTestimony,
      testemunhoPermissao: workflowTestimony.trim() ? testimonyPermission : "NAO_INFORMADO",
      prioridade: priority, proximoRetornoEm: nextFollowUp, visitaAgendadaEm: scheduledVisit, resultado: result,
    }, "Atendimento atualizado e solicitante notificado.");
    if (ok) setSelectedRow(null);
  }
  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const item = selectedRow?.repositoryItem; if (!item) return;
    const ok = await requestAction(`event-${item.id}`, "/api/pilot/solicitacoes/central", { action: "ADICIONAR_EVENTO", itemId: item.id, tipo: eventType, mensagem: eventMessage }, eventType === "NOTA_INTERNA" ? "Nota interna adicionada." : "Registro adicionado ao histórico.");
    if (ok) setSelectedRow(null);
  }
  async function responsibilityAction(action: "ASSUMIR_ITEM" | "TRANSFERIR_ITEM" | "ADICIONAR_PARTICIPANTE") {
    const item = selectedRow?.repositoryItem; if (!item) return;
    const ok = await requestAction(`${action}-${item.id}`, "/api/pilot/solicitacoes/central", { action, itemId: item.id, userId: Number(targetUser) || undefined }, action === "ASSUMIR_ITEM" ? "Pedido atribuído a você." : action === "TRANSFERIR_ITEM" ? "Atendimento transferido." : "Participante adicionado.");
    if (ok) setSelectedRow(null);
  }
  async function shareTestimony() {
    const item = selectedRow?.repositoryItem; if (!item) return;
    const ok = await requestAction(`testimony-${item.id}`, "/api/pilot/solicitacoes/central", { action: "PUBLICAR_TESTEMUNHO", itemId: item.id }, "Testemunho compartilhado no feed da comunidade.");
    if (ok) setSelectedRow(null);
  }
  async function confirmAnsweredPrayer(item: CommunityRequest, testimony: string, permission: string) {
    const ok = await requestAction(`answered-${item.id}`, "/api/pilot/solicitacoes", { action: "CONFIRMAR_ORACAO_ATENDIDA", id: item.id, testemunho: testimony, testemunhoPermissao: permission }, "Que alegria! Sua confirmação foi registrada.");
    if (ok) setMemberDetail(null);
  }

  if (loading) return <section className="requests-workspace request-care-v213"><div className="request-care-skeleton" aria-label="Carregando pedidos"><span /><span /><span /></div></section>;

  return <section className="requests-workspace request-care-v213">
    <header className="request-care-heading">
      <div className="request-heading-icon" aria-hidden="true"><RequestIcon type="heart" /></div>
      <div><p className="pilot-kicker">CUIDADO E COMUNHÃO · {communityName}</p><h1>Pedidos</h1><p>Compartilhe o que está no seu coração. Estamos aqui para caminhar com você.</p></div>
      {central.canOperate && <nav className="request-mode-switch" aria-label="Escolher visão">
        <button type="button" className={mode === "member" ? "active" : ""} onClick={() => setMode("member")}>Meu espaço</button>
        <button type="button" className={mode === "operations" ? "active" : ""} onClick={() => setMode("operations")}>Atendimento</button>
      </nav>}
    </header>

    {(feedback || error) && <p className={`operations-feedback request-global-feedback ${error ? "error" : ""}`} role="status">{error || feedback}</p>}

    {mode === "member" ? <div className="request-member-view">
      <section className="request-welcome" data-guide="request-start-guide" aria-labelledby="request-welcome-title">
        <div><span className="request-welcome-mark" aria-hidden="true"><RequestIcon type="heart" /></span><p className="pilot-kicker">Comece por aqui · UM ESPAÇO SEGURO</p><h2 id="request-welcome-title">Estamos com você</h2><p>Sua vida importa. Aqui você encontra uma comunidade que ora, acolhe e caminha junto com você.</p></div>
        <div className="request-welcome-art" aria-hidden="true"><span /><i>Juntos em oração</i></div>
      </section>
      <section className="request-primary-actions" aria-label="Criar um pedido">
        <button type="button" onClick={() => openCreate("ORACAO")}><span><RequestIcon type="prayer" /></span><div><strong>Pedido de oração</strong><small>Compartilhe sua intenção. Vamos orar por você.</small></div><b aria-hidden="true">›</b></button>
        <button type="button" onClick={() => openCreate("VISITA")}><span><RequestIcon type="people" /></span><div><strong>Solicitar visita</strong><small>Receba uma visita ou acompanhamento da sua comunidade.</small></div><b aria-hidden="true">›</b></button>
      </section>
      <button className="request-more-options" type="button" aria-expanded={moreCategories} onClick={() => setMoreCategories((value) => !value)}>Mais opções <span aria-hidden="true">{moreCategories ? "−" : "+"}</span></button>
      {moreCategories && <div className="request-secondary-actions">{CATEGORIES.slice(2).map((category) => <button type="button" key={category.value} onClick={() => openCreate(category.value)}>{category.label}</button>)}</div>}

      {formOpen && <form ref={formRef} className="request-member-form" onSubmit={create}>
        <header><div><span aria-hidden="true"><RequestIcon type={requestCategory === "VISITA" ? "people" : "prayer"} /></span><div><p className="pilot-kicker">NOVO PEDIDO</p><h2>{requestType(requestCategory)}</h2></div></div><button type="button" aria-label="Fechar formulário" onClick={() => setFormOpen(false)}>×</button></header>
        <input type="hidden" name="tipo" value={requestCategory} />
        <label>Título*<input name="titulo" required minLength={3} maxLength={120} placeholder={requestCategory === "ORACAO" ? "Ex.: Oração pela minha família" : "Resuma seu pedido"} /></label>
        <label className="request-member-wide">Conte o que está em seu coração*<textarea name="descricao" required minLength={10} maxLength={2000} rows={5} placeholder="Conte aqui o que está em seu coração…" /></label>
        {requestCategory === "VISITA" && <>
          <label>Preferência de contato<select name="preferenciaContato" defaultValue="SISTEMA"><option value="SISTEMA">Pelo Vínkulo</option><option value="WHATSAPP">WhatsApp</option><option value="TELEFONE">Telefone</option></select></label>
          <label>Data preferencial<input name="dataPreferencial" type="datetime-local" /></label>
          <label className="request-member-wide">Melhor período ou disponibilidade<input name="disponibilidade" maxLength={240} placeholder="Ex.: terças à noite ou sábado pela manhã" /></label>
          <label className="request-contact-consent request-member-wide"><input type="checkbox" name="contatoAutorizado" /><span>Autorizo a equipe responsável a consultar meu telefone cadastrado para este atendimento.</span></label>
        </>}
        {!["ORACAO", "VISITA"].includes(requestCategory) && <fieldset className="request-audience request-member-wide"><legend>Quem pode receber este pedido?*</legend><p>A visibilidade escolhida limita o pedido aos públicos selecionados.</p><label className="request-person-search"><span>Pesquisar pessoa</span><input type="search" value={personSearch} onChange={(event) => setPersonSearch(event.target.value)} placeholder="Digite um nome" /></label><div className="request-audience-grid"><AudienceGroup title="Pessoas" items={audienceOptions.usuarios.filter((item) => normalize(item.nome).includes(normalize(personSearch))).map((item) => ({ key: `USUARIO:${item.id}`, label: item.nome, detail: roleLabel(item.papel) }))} selected={selectedAudience} onChange={setSelectedAudience} /><AudienceGroup title="Ministérios" items={audienceOptions.ministerios.map((item) => ({ key: `MINISTERIO:${item.id}`, label: item.nome }))} selected={selectedAudience} onChange={setSelectedAudience} /><AudienceGroup title="Funções" items={audienceOptions.papeis.map((role) => ({ key: `PAPEL:${role}`, label: roleLabel(role) }))} selected={selectedAudience} onChange={setSelectedAudience} />{audienceOptions.allowAllMembers && <AudienceGroup title="Comunidade" items={[{ key: "TODOS_MEMBROS:*", label: "Todos os membros ativos" }]} selected={selectedAudience} onChange={setSelectedAudience} />}</div></fieldset>}
        <div className="request-form-privacy request-member-wide"><RequestIcon type="lock" /><span><strong>Seu pedido é protegido</strong><small>Somente você e as pessoas autorizadas para o atendimento terão acesso. Envio direto ao repositório responsável para oração e visita.</small></span></div>
        <button className="request-submit" disabled={busy === "create"}>{busy === "create" ? "Enviando…" : "Enviar pedido"}</button>
      </form>}

      <section className="request-my-section" aria-labelledby="my-requests-title"><header><div><p className="pilot-kicker">ACOMPANHAMENTO</p><h2 id="my-requests-title">Meus pedidos</h2><p>Acompanhe por aqui suas solicitações.</p></div><span>{myRequests.length}</span></header>
        {myRequests.length ? <div className="request-my-list">{myRequests.map((item) => <button type="button" key={item.id} onClick={() => setMemberDetail(item)}><span className={`request-kind kind-${item.tipo.toLowerCase()}`}><RequestIcon type={item.tipo === "VISITA" ? "people" : "prayer"} /></span><div><strong>{item.titulo}</strong><small>{formatDate(item.criado_em)}</small></div><StatusChip label={memberStatusLabel(item)} tone={statusTone(item.operacional_status || item.status, item.prioridade)} /><b aria-hidden="true">›</b></button>)}</div> : <div className="request-empty-member"><RequestIcon type="heart" /><strong>Você ainda não possui pedidos.</strong><p>Quando precisar, este espaço estará aqui para acolher você.</p></div>}
      </section>

      {(central.pastoresContato.length > 0 || central.whatsappPreference.canConfigure) && <section className="request-contact-panel"><div><p className="pilot-kicker">CONTATO PASTORAL</p><h2>Fale com um pastor</h2><p>O WhatsApp só abre depois da sua confirmação.</p></div>{central.pastoresContato.length > 0 && <div className="request-contact-strip">{central.pastoresContato.map((pastor) => <button key={pastor.id} type="button" onClick={() => setPendingPastor(pastor)}><Avatar name={pastor.nome} photo={pastor.foto} /><span>{pastor.nome}</span><small>WhatsApp</small></button>)}</div>}{central.whatsappPreference.canConfigure && <label className="request-whatsapp-toggle"><input type="checkbox" checked={central.whatsappPreference.enabled} disabled={busy === "whatsapp" || !central.whatsappPreference.hasPhone} onChange={(event) => void requestAction("whatsapp", "/api/pilot/solicitacoes/central", { action: "TOGGLE_WHATSAPP", enabled: event.target.checked }, event.target.checked ? "Seu WhatsApp agora está disponível aos membros ativos." : "Seu WhatsApp deixou de aparecer aos membros.")} /><span>Disponibilizar meu WhatsApp<small>{central.whatsappPreference.hasPhone ? "Você pode desativar quando quiser." : "Cadastre um telefone válido no perfil para ativar."}</small></span></label>}</section>}
    </div> : <div className="request-operations-view">
      <header className="request-operations-heading"><div><p className="pilot-kicker">PAINEL DOS OFICIAIS</p><h2>Painel de atendimento</h2><p>Organize, acompanhe e cuide de cada solicitação.</p></div><span>Acesso validado no servidor</span></header>
      <section className="request-dashboard" aria-label="Resumo operacional"><Metric icon="inbox" label="Total em aberto" value={metrics.open} tone="violet" /><Metric icon="alert" label="Urgentes" value={metrics.urgent} tone="rose" /><Metric icon="calendar" label="Visitas pendentes" value={metrics.visits} tone="blue" /><Metric icon="check" label="Atendidos hoje" value={metrics.today} tone="green" /></section>
      <nav className="request-category-tabs" aria-label="Filtros rápidos">{[
        ["TODOS", "Todos", operationalRows.length], ["ORACAO", "Orações", operationalRows.filter((r) => r.category === "ORACAO").length],
        ["VISITA", "Visitas", operationalRows.filter((r) => r.category === "VISITA").length], ["URGENTES", "Urgentes", metrics.urgent],
        ["PENDENTES", "Pendentes", metrics.open], ["ACOMPANHAMENTO", "Em acompanhamento", operationalRows.filter((r) => ["EM_ANALISE", "EM_ACOMPANHAMENTO", "EM_ORACAO", "EM_PROCESSO"].includes(r.status)).length],
        ["RETORNO", "Aguardando retorno", operationalRows.filter((r) => r.overdue || r.status === "AGUARDANDO_RETORNO").length], ["CONCLUIDOS", "Já atendidos", operationalRows.filter((r) => r.final).length],
      ].map(([value, label, count]) => <button key={String(value)} type="button" className={quickFilter === value ? "active" : ""} onClick={() => setQuickFilter(String(value))}>{label} <span>{count}</span></button>)}</nav>
      <div className="request-operations-toolbar"><label><RequestIcon type="search" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, pedido ou observação…" /></label><button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((value) => !value)}><RequestIcon type="filter" />Filtros</button></div>
      {advancedOpen && <section className="request-advanced-filters" aria-label="Filtros avançados"><label>Status<select value={advancedStatus} onChange={(event) => setAdvancedStatus(event.target.value)}><option value="">Todos</option>{allOperationalStatuses.map((status) => <option key={status} value={status}>{statusLabel({ status } as OperationalRow)}</option>)}</select></label><label>Responsável<select value={advancedOwner} onChange={(event) => setAdvancedOwner(event.target.value)}><option value="">Todos</option>{central.assignees.map((person) => <option key={person.id} value={person.id}>{person.nome}</option>)}</select></label><label>Recebidos desde<input type="date" value={advancedPeriod} onChange={(event) => setAdvancedPeriod(event.target.value)} /></label><label className="request-filter-check"><input type="checkbox" checked={onlyUnassigned} onChange={(event) => setOnlyUnassigned(event.target.checked)} />Sem responsável</label><button type="button" onClick={() => { setAdvancedStatus(""); setAdvancedOwner(""); setAdvancedPeriod(""); setOnlyUnassigned(false); }}>Limpar filtros</button></section>}

      {filteredRows.length ? <><div className="request-operations-table" role="region" aria-label="Pedidos para atendimento"><table><thead><tr><th>Pessoa</th><th>Categoria</th><th>Responsável</th><th>Data</th><th>Status</th><th>Observação</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.key} className={row.priority === "URGENTE" ? "urgent" : ""} onClick={() => openOperationalDetail(row)}><td><Avatar name={row.person} photo={row.photo} /><span><strong>{row.person}</strong><small>{roleLabel(row.role)}</small></span></td><td>{requestType(row.category)}</td><td>{row.owner || <em>Sem responsável</em>}</td><td>{formatDate(row.date)}</td><td><StatusChip label={statusLabel(row)} tone={statusTone(row.status, row.priority, row.overdue)} />{row.overdue && <small className="request-overdue">Retorno atrasado</small>}</td><td>{row.note || row.description}</td><td><button type="button" aria-label={`Abrir pedido de ${row.person}`} onClick={(event) => { event.stopPropagation(); openOperationalDetail(row); }}>•••</button></td></tr>)}</tbody></table></div><div className="request-mobile-list">{filteredRows.map((row) => <button type="button" key={row.key} onClick={() => openOperationalDetail(row)}><Avatar name={row.person} photo={row.photo} /><div><strong>{row.person}</strong><small>{requestType(row.category)} · {row.owner || "Sem responsável"}</small><p>{row.title}</p></div><StatusChip label={row.overdue ? "Retorno atrasado" : statusLabel(row)} tone={statusTone(row.status, row.priority, row.overdue)} /><time>{shortDate(row.date)}</time></button>)}</div></> : <div className="request-empty-operations"><RequestIcon type="search" /><strong>Nenhuma solicitação encontrada com esses filtros.</strong><button type="button" onClick={() => { setSearch(""); setQuickFilter("TODOS"); setAdvancedStatus(""); setAdvancedOwner(""); setAdvancedPeriod(""); setOnlyUnassigned(false); }}>Limpar busca e filtros</button></div>}

      {central.canManageRepositories && central.repositories.some((repository) => repository.status === "SUGERIDO") && <details className="request-repository-settings"><summary>Configurar repositórios de oração e visita</summary><div>{central.repositories.filter((repository) => repository.status === "SUGERIDO").map((repository) => <article key={repository.id}><span className="request-repository-icon"><RequestIcon type={repository.tipo === "ORACAO" ? "prayer" : "people"} /></span><div><strong>{repository.nome}</strong><small>Escolha um ministério responsável, se necessário.</small></div><select value={repositoryMinistries[repository.id] || ""} onChange={(event) => setRepositoryMinistries((current) => ({ ...current, [repository.id]: event.target.value }))}><option value="">Sem ministério definido</option>{central.ministries.map((ministry) => <option key={ministry.id} value={ministry.id}>{ministry.nome}</option>)}</select><button type="button" disabled={busy === `repository-${repository.id}`} onClick={() => void requestAction(`repository-${repository.id}`, "/api/pilot/solicitacoes/central", { action: "CONFIRMAR_REPOSITORIO", repositoryId: repository.id, ministryId: Number(repositoryMinistries[repository.id]) || null }, `${repository.nome} criado com sucesso.`)}>Confirmar criação</button></article>)}</div></details>}
      {canManage && <p className="request-retention-note">Pedidos concluídos permanecem disponíveis por 30 dias antes da limpeza automática.</p>}
    </div>}

    {pendingPastor && <div className="request-whatsapp-backdrop" role="presentation" onMouseDown={() => setPendingPastor(null)}><section className="request-whatsapp-dialog" role="dialog" aria-modal="true" aria-labelledby="whatsapp-confirm-title" onMouseDown={(event) => event.stopPropagation()}><Avatar name={pendingPastor.nome} photo={pendingPastor.foto} /><p className="pilot-kicker">CONFIRMAR CONTATO</p><h2 id="whatsapp-confirm-title">Falar com {pendingPastor.nome}</h2><p>Você abrirá uma conversa no WhatsApp com esta pessoa.</p><div><button type="button" onClick={() => setPendingPastor(null)}>Cancelar</button><button type="button" onClick={() => { window.open(pendingPastor.whatsappUrl, "_blank", "noopener,noreferrer"); setPendingPastor(null); }}>Continuar para o WhatsApp</button></div></section></div>}

    {memberDetail && <MemberRequestDialog item={memberDetail} busy={busy} onClose={() => setMemberDetail(null)} onConfirm={confirmAnsweredPrayer} />}
    {selectedRow && <div className="request-workflow-backdrop" role="presentation" onMouseDown={() => setSelectedRow(null)}><section className="request-workflow-dialog request-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="request-workflow-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="pilot-kicker">DETALHES DO ATENDIMENTO</p><h2 id="request-workflow-title">{selectedRow.title}</h2></div><button type="button" aria-label="Fechar" onClick={() => setSelectedRow(null)}>×</button></header><div className="request-workflow-request"><Avatar name={selectedRow.person} photo={selectedRow.photo} /><div><strong>{selectedRow.person}</strong><small>{roleLabel(selectedRow.role)} · {requestType(selectedRow.category)}</small><p>{selectedRow.description}</p></div>{selectedRow.priority === "URGENTE" && <StatusChip label="Urgente" tone="rose" />}</div>
      {selectedRow.repositoryItem ? <div className="request-detail-scroll"><form className="request-workflow-form" onSubmit={saveRepositoryWorkflow}><div className="request-responsibility"><label>Responsável pelo atendimento<input readOnly value={selectedRow.repositoryItem.responsavel_nome || "Ainda não definido"} /></label>{!selectedRow.repositoryItem.responsavel_usuario_id && <button type="button" onClick={() => void responsibilityAction("ASSUMIR_ITEM")}>Assumir pedido</button>}<label>Transferir ou adicionar participante<select value={targetUser} onChange={(event) => setTargetUser(event.target.value)}><option value="">Escolha uma pessoa</option>{central.assignees.map((person) => <option key={person.id} value={person.id}>{person.nome} · {roleLabel(person.funcao)}</option>)}</select></label><div><button type="button" disabled={!targetUser} onClick={() => void responsibilityAction("TRANSFERIR_ITEM")}>Transferir</button><button type="button" disabled={!targetUser} onClick={() => void responsibilityAction("ADICIONAR_PARTICIPANTE")}>Adicionar participante</button></div></div><label>Situação<select value={workflowStatus} onChange={(event) => setWorkflowStatus(event.target.value as RepositoryStatus)}>{repositoryStatusOptions(selectedRow.repositoryItem.tipo).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Prioridade<select value={priority} onChange={(event) => setPriority(event.target.value as "NORMAL" | "URGENTE")}><option value="NORMAL">Normal</option><option value="URGENTE">Urgente</option></select></label><label>Próximo retorno<input type="datetime-local" value={nextFollowUp} onChange={(event) => setNextFollowUp(event.target.value)} /></label>{selectedRow.repositoryItem.tipo === "VISITA" && <label>Visita agendada<input type="datetime-local" value={scheduledVisit} onChange={(event) => setScheduledVisit(event.target.value)} /></label>}<label className="request-workflow-wide">Mensagem entregue<textarea maxLength={2000} rows={4} value={workflowMessage} onChange={(event) => setWorkflowMessage(event.target.value)} placeholder="Atualização que o membro poderá receber." /></label><label className="request-workflow-wide">Resultado ou observação final<textarea maxLength={2000} rows={3} value={result} onChange={(event) => setResult(event.target.value)} /></label><fieldset className="request-testimony-consent request-workflow-wide"><legend>Testemunho (opcional)</legend><textarea maxLength={2000} rows={3} value={workflowTestimony} onChange={(event) => setWorkflowTestimony(event.target.value)} placeholder="Conte o testemunho quando houver." />{workflowTestimony.trim() && <div><strong>Consentimento da pessoa atendida para compartilhar o testemunho</strong><label><input type="radio" name="testimonyPermission" checked={testimonyPermission === "PERMITIR"} onChange={() => setTestimonyPermission("PERMITIR")} />Permitir</label><label><input type="radio" name="testimonyPermission" checked={testimonyPermission === "NAO_PERMITIR"} onChange={() => setTestimonyPermission("NAO_PERMITIR")} />Não permitir</label></div>}</fieldset><footer className="request-workflow-wide"><button type="button" onClick={() => setSelectedRow(null)}>Cancelar</button>{selectedRow.repositoryItem.testemunho && selectedRow.repositoryItem.testemunho_compartilhavel === 1 && !selectedRow.repositoryItem.testemunho_publicado_em && selectedRow.repositoryItem.responsavel_usuario_id === central.currentActor.id && <button type="button" className="request-testimony-share" onClick={() => void shareTestimony()}>Compartilhar testemunho</button>}<button disabled={busy === `workflow-${selectedRow.repositoryItem.id}`}>{busy === `workflow-${selectedRow.repositoryItem.id}` ? "Salvando…" : "Salvar atendimento"}</button></footer></form>
        <section className="request-notes-panel"><form onSubmit={addEvent}><header><div><strong>{eventType === "NOTA_INTERNA" ? "🔒 Nota interna da equipe" : "Registrar no histórico"}</strong><small>{eventType === "NOTA_INTERNA" ? "O membro não verá esta anotação." : "Escolha se é contato, visita ou atualização ao membro."}</small></div><select value={eventType} onChange={(event) => setEventType(event.target.value)}><option value="NOTA_INTERNA">Nota interna</option><option value="ATUALIZACAO_MEMBRO">Enviar atualização ao membro</option><option value="TENTATIVA_CONTATO">Registrar tentativa de contato</option><option value="REGISTRO_VISITA">Registrar visita realizada</option></select></header><textarea required minLength={3} maxLength={2000} rows={3} value={eventMessage} onChange={(event) => setEventMessage(event.target.value)} placeholder={eventType === "NOTA_INTERNA" ? "Escreva uma nota visível somente à equipe autorizada." : "Descreva a atualização."} /><button disabled={busy === `event-${selectedRow.repositoryItem.id}`}>{eventType === "ATUALIZACAO_MEMBRO" ? "Enviar atualização ao membro" : "Adicionar ao histórico"}</button></form><div className="request-timeline"><h3>Histórico</h3>{selectedRow.repositoryItem.eventos.length ? selectedRow.repositoryItem.eventos.map((event) => <article key={event.id} className={event.tipo === "NOTA_INTERNA" ? "internal" : ""}><span /><div><strong>{eventLabel(event.tipo)}</strong><p>{event.mensagem}</p><small>{event.autor_nome} · {formatDate(event.criado_em)}{event.tipo === "NOTA_INTERNA" ? " · Interno" : ""}</small></div></article>) : <p>Nenhuma atualização registrada.</p>}</div></section></div> : <div className="request-general-detail"><p>{selectedRow.description}</p><small>{formatDate(selectedRow.date)} · {selectedRow.generalItem?.publico_resumo || "Público autorizado"}</small>{selectedRow.generalItem?.status !== "CONCLUIDA" && <div><button type="button" onClick={() => void updateGeneral(selectedRow.generalItem!, "EM_ANALISE")}>Em análise</button><button type="button" onClick={() => void updateGeneral(selectedRow.generalItem!, "CONCLUIDA")}>Concluir</button></div>}</div>}
    </section></div>}
  </section>;
}

function MemberRequestDialog({ item, busy, onClose, onConfirm }: { item: CommunityRequest; busy: string; onClose: () => void; onConfirm: (item: CommunityRequest, testimony: string, permission: string) => Promise<void> }) {
  const [showTestimony, setShowTestimony] = useState(false); const [testimony, setTestimony] = useState(""); const [permission, setPermission] = useState("NAO_PERMITIR");
  const canConfirm = item.tipo === "ORACAO" && !["CONCLUIDA", "ORACAO_ATENDIDA", "FINALIZADO"].includes(item.operacional_status || item.status);
  return <div className="request-workflow-backdrop" role="presentation" onMouseDown={onClose}><section className="request-member-dialog" role="dialog" aria-modal="true" aria-labelledby="member-request-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="pilot-kicker">SEU PEDIDO</p><h2 id="member-request-title">{item.titulo}</h2></div><button type="button" aria-label="Fechar" onClick={onClose}>×</button></header><StatusChip label={memberStatusLabel(item)} tone={statusTone(item.operacional_status || item.status, item.prioridade)} /><p>{item.descricao}</p>{item.mensagem_atendimento && <aside><strong>Atualização da equipe</strong><p>{item.mensagem_atendimento}</p></aside>}<dl><div><dt>Enviado em</dt><dd>{formatDate(item.criado_em)}</dd></div>{item.responsavel_nome && <div><dt>Responsável</dt><dd>{item.responsavel_nome}</dd></div>}{item.proximo_retorno_em && <div><dt>Próximo retorno</dt><dd>{formatDate(item.proximo_retorno_em)}</dd></div>}{item.visita_agendada_em && <div><dt>Visita agendada</dt><dd>{formatDate(item.visita_agendada_em)}</dd></div>}</dl>{canConfirm && !showTestimony && <button className="request-answered-button" type="button" onClick={() => setShowTestimony(true)}>Minha oração foi atendida</button>}{showTestimony && <form onSubmit={(event) => { event.preventDefault(); void onConfirm(item, testimony, permission); }}><label>Deseja contar um testemunho? (opcional)<textarea value={testimony} onChange={(event) => setTestimony(event.target.value)} maxLength={2000} rows={4} /></label>{testimony && <fieldset><legend>Permitir compartilhamento?</legend><label><input type="radio" name="memberTestimonyPermission" value="PERMITIR" checked={permission === "PERMITIR"} onChange={(event) => setPermission(event.target.value)} />Permitir compartilhamento</label><label><input type="radio" name="memberTestimonyPermission" value="NAO_PERMITIR" checked={permission === "NAO_PERMITIR"} onChange={(event) => setPermission(event.target.value)} />Não permitir</label></fieldset>}<button disabled={busy === `answered-${item.id}`}>Confirmar oração atendida</button></form>}<small className="request-retention-note">Pedidos concluídos permanecem disponíveis por 30 dias.</small></section></div>;
}

function Metric({ icon, label, value, tone }: { icon: IconType; label: string; value: number; tone: string }) { return <article className={`request-metric tone-${tone}`}><span><RequestIcon type={icon} /></span><div><small>{label}</small><strong>{value}</strong></div></article>; }
function StatusChip({ label, tone }: { label: string; tone: string }) { return <span className={`request-care-status tone-${tone}`}>{label}</span>; }
function Avatar({ name, photo }: { name: string; photo: string }) { return photo ? <img loading="lazy" src={photo} alt="" /> : <span className="request-avatar-fallback">{name.slice(0, 1).toUpperCase()}</span>; }
function AudienceGroup({ title, items, selected, onChange }: { title: string; items: Array<{ key: string; label: string; detail?: string }>; selected: string[]; onChange: (value: string[]) => void }) { if (!items.length) return null; return <section><strong>{title}</strong><div>{items.map((item) => <label key={item.key}><input type="checkbox" checked={selected.includes(item.key)} onChange={() => onChange(selected.includes(item.key) ? selected.filter((key) => key !== item.key) : [...selected, item.key])} /><span>{item.label}{item.detail ? <small>{item.detail}</small> : null}</span></label>)}</div></section>; }
function parseAudienceKey(key: string) { const [type, raw] = key.split(":"); return type === "USUARIO" || type === "MINISTERIO" ? { type, id: Number(raw) } : { type, value: raw }; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim(); }
function roleLabel(value: string) { return ({ MEMBRO: "Membro", LIDER: "Líder", PASTOR: "Pastor", ADMIN_COMUNIDADE: "Administrador da comunidade" } as Record<string, string>)[value] || value || "Membro"; }
function requestType(value: RequestType) { return ({ ORACAO: "Oração", VISITA: "Visita", ACONSELHAMENTO: "Aconselhamento", APOIO: "Apoio", MINISTERIO: "Ministério", OUTRO: "Outro", INFORMACAO: "Informação" } as Record<RequestType, string>)[value]; }
function formatDate(value: string) { if (!value) return "—"; return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function shortDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value)); }
function isToday(value: string) { if (!value) return false; const date = new Date(value); const today = new Date(); return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate(); }
function toLocalInput(value: string | null) { if (!value) return ""; const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function memberStatusLabel(item: CommunityRequest) { const status = item.operacional_status || item.status; return ({ ABERTA: "Recebido", ABERTO: "Recebido", EM_ANALISE: "Em acompanhamento", EM_ORACAO: "Em oração", EM_ACOMPANHAMENTO: "Em acompanhamento", AGUARDANDO_CONTATO: "Visita sendo organizada", AGUARDANDO_RETORNO: "Aguardando retorno", EM_PROCESSO: "Visita sendo organizada", VISITA_AGENDADA: "Visita agendada", VISITA_REALIZADA: "Visita realizada", CONCLUIDA: "Concluído", FINALIZADO: "Concluído", ORACAO_ATENDIDA: "Oração atendida", VISITA_CONCLUIDA: "Visita concluída", NOVA_VISITA: "Nova visita solicitada" } as Record<string, string>)[status] || "Recebido"; }
function statusLabel(row: Pick<OperationalRow, "status" | "category" | "overdue">) { if (row.overdue) return "Aguardando retorno"; return ({ ABERTA: "Novo pedido", ABERTO: "Aguardando responsável", EM_ANALISE: "Em análise", EM_ORACAO: "Em oração", EM_ACOMPANHAMENTO: "Em acompanhamento", AGUARDANDO_CONTATO: "Aguardando contato", AGUARDANDO_RETORNO: row.category === "VISITA" ? "Visitante aguardando retorno" : "Aguardando retorno", EM_PROCESSO: "Visita sendo organizada", VISITA_AGENDADA: "Visita agendada", VISITA_REALIZADA: "Visita realizada", CONCLUIDA: "Já atendido", FINALIZADO: "Finalizado", ORACAO_ATENDIDA: "Oração atendida", VISITA_CONCLUIDA: "Visita concluída", NOVA_VISITA: "Solicita nova visita" } as Record<string, string>)[row.status] || row.status; }
function statusTone(status: string, priority = "NORMAL", overdue = false) { if (priority === "URGENTE") return "rose"; if (overdue || ["AGUARDANDO_CONTATO", "AGUARDANDO_RETORNO"].includes(status)) return "amber"; if (["CONCLUIDA", "FINALIZADO", "ORACAO_ATENDIDA", "VISITA_CONCLUIDA"].includes(status)) return "green"; if (["EM_ANALISE", "EM_ORACAO", "EM_ACOMPANHAMENTO", "EM_PROCESSO", "VISITA_AGENDADA", "VISITA_REALIZADA"].includes(status)) return "violet"; return "blue"; }
function repositoryStatusOptions(type: "ORACAO" | "VISITA") { return type === "ORACAO" ? [{ value: "ABERTO", label: "Aguardando atendimento" }, { value: "EM_ORACAO", label: "Em oração" }, { value: "EM_ACOMPANHAMENTO", label: "Em acompanhamento" }, { value: "AGUARDANDO_RETORNO", label: "Aguardando retorno" }, { value: "FINALIZADO", label: "Finalizado" }, { value: "ORACAO_ATENDIDA", label: "Oração atendida" }] : [{ value: "ABERTO", label: "Nova solicitação" }, { value: "AGUARDANDO_CONTATO", label: "Aguardando contato" }, { value: "AGUARDANDO_RETORNO", label: "Visitante aguardando retorno" }, { value: "EM_PROCESSO", label: "Em processo" }, { value: "VISITA_AGENDADA", label: "Visita agendada" }, { value: "VISITA_REALIZADA", label: "Visita realizada" }, { value: "VISITA_CONCLUIDA", label: "Visita concluída" }, { value: "NOVA_VISITA", label: "Solicita nova visita" }]; }
function eventLabel(type: string) { return ({ PEDIDO_RECEBIDO: "Pedido recebido", PEDIDO_ENCAMINHADO: "Pedido encaminhado", RESPONSAVEL_ATRIBUIDO: "Responsável atribuído", RESPONSAVEL_TRANSFERIDO: "Atendimento transferido", PARTICIPANTE_ADICIONADO: "Participante adicionado", STATUS_ATUALIZADO: "Situação atualizada", NOTA_INTERNA: "Nota interna", ATUALIZACAO_MEMBRO: "Atualização ao membro", TENTATIVA_CONTATO: "Tentativa de contato", REGISTRO_VISITA: "Visita registrada", ORACAO_ATENDIDA: "Oração atendida" } as Record<string, string>)[type] || "Atualização"; }
const allOperationalStatuses = ["ABERTO", "EM_ORACAO", "EM_ACOMPANHAMENTO", "AGUARDANDO_CONTATO", "AGUARDANDO_RETORNO", "EM_PROCESSO", "VISITA_AGENDADA", "VISITA_REALIZADA", "FINALIZADO", "ORACAO_ATENDIDA", "VISITA_CONCLUIDA", "NOVA_VISITA", "ABERTA", "EM_ANALISE", "CONCLUIDA"];

type IconType = "heart" | "prayer" | "people" | "lock" | "search" | "filter" | "inbox" | "alert" | "calendar" | "check";
function RequestIcon({ type }: { type: IconType }) {
  const paths: Record<IconType, React.ReactNode> = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    prayer: <><path d="M8 3c1 4 2 7 4 9m4-9c-1 4-2 7-4 9" /><path d="M12 12c-3 2-5 5-5 9m5-9c3 2 5 5 5 9M8 18h8" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9m-1-11a4 4 0 0 1 0 7.8" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
    filter: <path d="M4 5h16M7 12h10m-7 7h4" />,
    inbox: <><path d="M4 4h16v16H4z" /><path d="M4 13h4l2 3h4l2-3h4" /></>,
    alert: <><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}
