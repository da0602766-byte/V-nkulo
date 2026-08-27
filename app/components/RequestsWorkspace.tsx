"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type RequestType = "ORACAO" | "VISITA" | "ACONSELHAMENTO" | "APOIO" | "MINISTERIO" | "OUTRO" | "INFORMACAO";
type CommunityRequest = {
  id: number; tipo: RequestType; titulo: string; descricao: string;
  visibilidade: "PASTORAL" | "GESTORES" | "PRIVADA";
  status: "ABERTA" | "EM_ANALISE" | "CONCLUIDA";
  criado_em: string; solicitante_nome: string; publico_resumo: string;
};
type AudienceOptions = {
  usuarios: Array<{ id: number; nome: string; papel: string }>;
  ministerios: Array<{ id: number; nome: string }>;
  papeis: string[]; allowAllMembers: boolean;
};
type RepositoryItem = {
  id: number; solicitacao_id: number;
  item_status: "ABERTO" | "EM_ORACAO" | "FINALIZADO" | "ORACAO_ATENDIDA" | "EM_PROCESSO" | "VISITA_CONCLUIDA" | "NOVA_VISITA";
  titulo: string; descricao: string; solicitante_nome: string;
  solicitante_telefone: string; criado_em: string;
  responsavel_usuario_id: number | null; responsavel_nome: string;
  mensagem_atendimento: string; testemunho: string;
  testemunho_compartilhavel: number; testemunho_publicado_em: string | null;
};
type Repository = {
  id: number; tipo: "ORACAO" | "VISITA"; nome: string;
  status: "SUGERIDO" | "ATIVO"; ministerio_id: number | null;
  ministerio_nome: string; items: RepositoryItem[];
};
type PastorContact = { id: number; nome: string; foto: string; whatsappUrl: string };
type CentralData = {
  canManageRepositories: boolean;
  currentActor: { id: number; nome: string };
  whatsappPreference: { canConfigure: boolean; enabled: boolean; hasPhone: boolean };
  pastoresContato: PastorContact[];
  ministries: Array<{ id: number; nome: string }>;
  repositories: Repository[];
};

const CATEGORIES: Array<{ value: Exclude<RequestType, "INFORMACAO">; label: string }> = [
  { value: "ORACAO", label: "Oração" },
  { value: "VISITA", label: "Visita" },
  { value: "ACONSELHAMENTO", label: "Aconselhamento" },
  { value: "APOIO", label: "Apoio" },
  { value: "MINISTERIO", label: "Ministério" },
  { value: "OUTRO", label: "Outro" },
];
const EMPTY_CENTRAL: CentralData = {
  canManageRepositories: false,
  currentActor: { id: 0, nome: "" },
  whatsappPreference: { canConfigure: false, enabled: false, hasPhone: false },
  pastoresContato: [], ministries: [], repositories: [],
};

export default function RequestsWorkspace({ communityName }: { communityName: string }) {
  const [items, setItems] = useState<CommunityRequest[]>([]);
  const [central, setCentral] = useState<CentralData>(EMPTY_CENTRAL);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"TODAS" | Exclude<RequestType, "INFORMACAO">>("TODAS");
  const [pendingPastor, setPendingPastor] = useState<PastorContact | null>(null);
  const [selectedRepositoryItem, setSelectedRepositoryItem] = useState<(RepositoryItem & { repositoryType: Repository["tipo"] }) | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<RepositoryItem["item_status"]>("ABERTO");
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [workflowTestimony, setWorkflowTestimony] = useState("");
  const [testimonyPermission, setTestimonyPermission] = useState<"" | "PERMITIR" | "NAO_PERMITIR">("");
  const [requestCategory, setRequestCategory] = useState<Exclude<RequestType, "INFORMACAO">>("ORACAO");
  const [repositoryMinistries, setRepositoryMinistries] = useState<Record<number, string>>({});
  const [audienceOptions, setAudienceOptions] = useState<AudienceOptions>({
    usuarios: [], ministerios: [], papeis: [], allowAllMembers: false,
  });
  const [selectedAudience, setSelectedAudience] = useState<string[]>([]);
  const [personSearch, setPersonSearch] = useState("");
  const formRef = useRef<HTMLDetailsElement>(null);
  const repositoryRef = useRef<HTMLElement>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [requestsResponse, centralResponse] = await Promise.all([
        fetch("/api/pilot/solicitacoes", { cache: "no-store" }),
        fetch("/api/pilot/solicitacoes/central", { cache: "no-store" }),
      ]);
      const requestsPayload = (await requestsResponse.json()) as {
        solicitacoes?: CommunityRequest[]; canManage?: boolean;
        audienceOptions?: AudienceOptions; error?: string;
      };
      const centralPayload = (await centralResponse.json()) as CentralData & { error?: string };
      if (!requestsResponse.ok) throw new Error(requestsPayload.error || "Falha ao carregar pedidos.");
      if (!centralResponse.ok) throw new Error(centralPayload.error || "Falha ao carregar a Central.");
      setItems(requestsPayload.solicitacoes || []);
      setCanManage(Boolean(requestsPayload.canManage));
      setAudienceOptions(requestsPayload.audienceOptions || {
        usuarios: [], ministerios: [], papeis: [], allowAllMembers: false,
      });
      setCentral(centralPayload);
      setRepositoryMinistries((current) => {
        const next = { ...current };
        for (const repository of centralPayload.repositories || []) {
          if (repository.ministerio_id && !next[repository.id]) next[repository.id] = String(repository.ministerio_id);
        }
        return next;
      });
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const open = () => {
      if (!formRef.current) return;
      formRef.current.open = true;
      window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener("vinkulo:new-request", open);
    return () => window.removeEventListener("vinkulo:new-request", open);
  }, []);

  const metrics = useMemo(() => ({
    abertas: items.filter((item) => item.status === "ABERTA").length,
    analise: items.filter((item) => item.status === "EM_ANALISE").length,
    concluidas: items.filter((item) => item.status === "CONCLUIDA").length,
    repositorios: central.repositories.filter((item) => item.status === "ATIVO").length,
  }), [central.repositories, items]);
  const generalItems = useMemo(() => items.filter((item) => item.tipo !== "ORACAO" && item.tipo !== "VISITA"), [items]);
  const filteredItems = useMemo(() => generalItems.filter((item) => {
    if (filter === "TODAS") return true;
    if (filter === "OUTRO" && item.tipo === "INFORMACAO") return true;
    return item.tipo === filter;
  }), [filter, generalItems]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const category = String(data.get("tipo") || "") as RequestType;
    const goesToRepository = category === "ORACAO" || category === "VISITA";
    if (!goesToRepository && !selectedAudience.length) {
      setError("Selecione pelo menos uma pessoa, ministério ou função autorizada.");
      return;
    }
    setBusy("create"); clearMessages();
    try {
      const response = await fetch("/api/pilot/solicitacoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(data.entries()), visibilidade: "PRIVADA",
          audience: goesToRepository ? undefined : selectedAudience.map(parseAudienceKey),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível enviar.");
      form.reset(); setSelectedAudience([]);
      if (formRef.current) formRef.current.open = false;
      setFeedback(goesToRepository
        ? `Pedido enviado diretamente ao repositório de ${category === "ORACAO" ? "orações" : "visitas"}.`
        : "Pedido registrado e público autorizado notificado.");
      await load(true);
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(""); }
  }

  async function update(item: CommunityRequest, status: CommunityRequest["status"]) {
    setBusy(`item-${item.id}`); clearMessages();
    try {
      const response = await fetch("/api/pilot/solicitacoes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar.");
      setFeedback("Situação atualizada e solicitante notificado.");
      await load(true);
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(""); }
  }

  async function centralAction(key: string, payload: Record<string, unknown>, successMessage: string) {
    setBusy(key); clearMessages();
    try {
      const response = await fetch("/api/pilot/solicitacoes/central", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(responsePayload.error || "Não foi possível concluir a ação.");
      setFeedback(successMessage);
      await load(true);
      return true;
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(""); }
    return false;
  }

  function openRepositoryWorkflow(item: RepositoryItem, repositoryType: Repository["tipo"]) {
    setSelectedRepositoryItem({ ...item, repositoryType });
    setWorkflowStatus(item.item_status);
    setWorkflowMessage(item.mensagem_atendimento || "");
    setWorkflowTestimony(item.testemunho || "");
    setTestimonyPermission(item.testemunho_compartilhavel === 1 ? "PERMITIR" : item.testemunho_compartilhavel === 0 ? "NAO_PERMITIR" : "");
    clearMessages();
  }

  async function saveRepositoryWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRepositoryItem) return;
    if (workflowTestimony.trim() && !testimonyPermission) {
      setError("Escolha se o testemunho pode ou não ser compartilhado.");
      return;
    }
    const ok = await centralAction(
      `workflow-${selectedRepositoryItem.id}`,
      {
        action: "ATUALIZAR_ITEM",
        itemId: selectedRepositoryItem.id,
        status: workflowStatus,
        mensagemAtendimento: workflowMessage,
        testemunho: workflowTestimony,
        testemunhoPermissao: workflowTestimony.trim() ? testimonyPermission : "NAO_INFORMADO",
      },
      "Atendimento atualizado e solicitante notificado.",
    );
    if (ok) setSelectedRepositoryItem(null);
  }

  async function shareTestimony() {
    if (!selectedRepositoryItem) return;
    const ok = await centralAction(
      `testimony-${selectedRepositoryItem.id}`,
      { action: "PUBLICAR_TESTEMUNHO", itemId: selectedRepositoryItem.id },
      "Testemunho compartilhado no feed da comunidade.",
    );
    if (ok) setSelectedRepositoryItem(null);
  }

  function forwardToRepository(item: CommunityRequest) {
    if (item.tipo !== "ORACAO" && item.tipo !== "VISITA") return;
    const repository = central.repositories.find((candidate) => candidate.tipo === item.tipo && candidate.status === "ATIVO");
    if (!repository) {
      setError(`Ative primeiro o repositório de ${item.tipo === "ORACAO" ? "orações" : "visitas"}.`);
      repositoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    void centralAction(
      `forward-${item.id}`,
      { action: "ENCAMINHAR_REPOSITORIO", repositoryId: repository.id, requestId: item.id },
      `Pedido encaminhado ao ${repository.nome}.`,
    );
  }

  function clearMessages() { setFeedback(""); setError(""); }

  return (
    <section className="requests-workspace request-central-v110">
      <header className="workspace-heading request-central-heading">
        <div>
          <p className="pilot-kicker">CENTRAL DE PEDIDOS</p>
          <h1>Pedidos de {communityName}</h1>
          <p>Privacidade por visibilidade escolhida, encaminhamento e acompanhamento em um único lugar.</p>
        </div>
        <span className="scope-badge">Acesso validado no servidor</span>
      </header>

      {canManage && (
        <section className="request-dashboard" aria-label="Resumo das solicitações">
          <Metric label="Abertas" value={metrics.abertas} tone="open" />
          <Metric label="Em análise" value={metrics.analise} tone="analysis" />
          <Metric label="Concluídas" value={metrics.concluidas} tone="done" />
          <Metric label="Repositórios" value={metrics.repositorios} tone="repository" />
        </section>
      )}

      {(central.pastoresContato.length > 0 || central.whatsappPreference.canConfigure) && (
        <section className="request-contact-panel" aria-labelledby="pastoral-contact-title">
          <div>
            <p className="pilot-kicker">CONTATO PASTORAL</p>
            <h2 id="pastoral-contact-title">Fale com um pastor</h2>
            <p>O WhatsApp só abre depois de você confirmar com quem falará.</p>
          </div>
          {central.pastoresContato.length > 0 && (
            <div className="request-contact-strip">
              {central.pastoresContato.map((pastor) => (
                <button key={pastor.id} type="button" onClick={() => setPendingPastor(pastor)}>
                  <Avatar name={pastor.nome} photo={pastor.foto} />
                  <span>{pastor.nome}</span><small>WhatsApp</small>
                </button>
              ))}
            </div>
          )}
          {central.whatsappPreference.canConfigure && (
            <label className="request-whatsapp-toggle">
              <input
                type="checkbox" checked={central.whatsappPreference.enabled}
                disabled={busy === "whatsapp" || !central.whatsappPreference.hasPhone}
                onChange={(event) => void centralAction(
                  "whatsapp", { action: "TOGGLE_WHATSAPP", enabled: event.target.checked },
                  event.target.checked
                    ? "Seu WhatsApp agora está disponível aos membros ativos."
                    : "Seu WhatsApp deixou de aparecer aos membros.",
                )}
              />
              <span>
                Disponibilizar meu WhatsApp
                <small>{central.whatsappPreference.hasPhone
                  ? "Você pode desativar quando quiser."
                  : "Cadastre um telefone válido no seu perfil para ativar."}</small>
              </span>
            </label>
          )}
        </section>
      )}

      {canManage && central.repositories.length > 0 && (
        <section className="request-repository-section" ref={repositoryRef}>
          <div className="request-section-title">
            <div><p className="pilot-kicker">ORAÇÕES E VISITAS</p><h2>Repositórios da comunidade</h2></div>
            <span>{central.repositories.filter((item) => item.status === "ATIVO").length} ativos</span>
          </div>
          <div className="request-repository-grid">
            {central.repositories.map((repository) => repository.status === "SUGERIDO" ? (
              <article className="request-repository-suggestion" key={repository.id}>
                <span className="request-repository-icon" aria-hidden="true">{repository.tipo === "ORACAO" ? "♡" : "⌂"}</span>
                <div><strong>Sugestão: {repository.nome}</strong><p>Confirme a criação e, se desejar, escolha o ministério responsável.</p></div>
                <label>
                  <span>Ministério responsável (opcional)</span>
                  <select
                    value={repositoryMinistries[repository.id] || ""}
                    onChange={(event) => setRepositoryMinistries((current) => ({ ...current, [repository.id]: event.target.value }))}
                  >
                    <option value="">Sem ministério definido</option>
                    {central.ministries.map((ministry) => <option key={ministry.id} value={ministry.id}>{ministry.nome}</option>)}
                  </select>
                </label>
                <button
                  type="button" disabled={busy === `repository-${repository.id}`}
                  onClick={() => void centralAction(
                    `repository-${repository.id}`,
                    { action: "CONFIRMAR_REPOSITORIO", repositoryId: repository.id, ministryId: Number(repositoryMinistries[repository.id]) || null },
                    `${repository.nome} criado com sucesso.`,
                  )}
                >{busy === `repository-${repository.id}` ? "Criando…" : "Confirmar criação"}</button>
              </article>
            ) : (
              <details className="request-repository" key={repository.id}>
                <summary>
                  <span className="request-repository-icon" aria-hidden="true">{repository.tipo === "ORACAO" ? "♡" : "⌂"}</span>
                  <span><strong>{repository.nome}</strong><small>{repository.ministerio_nome
                    ? `Responsável: ${repository.ministerio_nome}`
                    : "Sem ministério responsável definido"}</small></span>
                  <em>{repository.items.length}</em>
                </summary>
                <div className="request-repository-items">
                  {repository.items.length ? repository.items.map((item) => (
                    <button type="button" key={item.id} onClick={() => openRepositoryWorkflow(item, repository.tipo)}>
                      <span className={`request-repository-item-mark type-${repository.tipo.toLowerCase()}`} aria-hidden="true">{repository.tipo === "ORACAO" ? "♡" : "⌂"}</span>
                      <span><strong>{item.titulo}</strong><small>{item.solicitante_nome} · {repositoryStatusLabel(repository.tipo, item.item_status)}</small></span>
                      <em>Atender</em>
                    </button>
                  )) : <p className="request-repository-empty">Nenhum pedido encaminhado.</p>}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <details className="operations-form-card request-form-card request-create-collapsible" ref={formRef}>
        <summary><span aria-hidden="true">＋</span>Criar pedido</summary>
        <form className="pilot-form request-form" onSubmit={create}>
          <label>Categoria<select name="tipo" value={requestCategory} onChange={(event) => setRequestCategory(event.target.value as Exclude<RequestType, "INFORMACAO">)}>
            {CATEGORIES.map((category) => <option value={category.value} key={category.value}>{category.label}</option>)}
          </select></label>
          <label>Privacidade<span className="request-privacy-readonly">Somente o público selecionado</span></label>
          {(requestCategory === "ORACAO" || requestCategory === "VISITA") ? (
            <div className="request-repository-routing request-wide-field" role="status">
              <span aria-hidden="true">{requestCategory === "ORACAO" ? "♡" : "⌂"}</span>
              <div><strong>Envio direto ao repositório de {requestCategory === "ORACAO" ? "orações" : "visitas"}</strong><small>A equipe responsável receberá o pedido para iniciar o acompanhamento.</small></div>
            </div>
          ) : <fieldset className="request-audience request-wide-field">
            <legend>Quem pode ler e receber notificação?*</legend>
            <p>A mesma seleção controla acesso e notificações no servidor.</p>
            <label className="request-person-search"><span>Pesquisar pessoa</span><input
              type="search" value={personSearch} onChange={(event) => setPersonSearch(event.target.value)}
              placeholder="Digite o nome do usuário"
            /></label>
            <div className="request-audience-grid">
              <AudienceGroup
                title="Pessoas"
                items={audienceOptions.usuarios
                  .filter((item) => item.nome.toLocaleLowerCase("pt-BR").includes(personSearch.trim().toLocaleLowerCase("pt-BR")))
                  .map((item) => ({ key: `USUARIO:${item.id}`, label: item.nome, detail: roleLabel(item.papel) }))}
                selected={selectedAudience} onChange={setSelectedAudience}
              />
              <AudienceGroup title="Ministérios" items={audienceOptions.ministerios.map((item) => ({ key: `MINISTERIO:${item.id}`, label: item.nome }))} selected={selectedAudience} onChange={setSelectedAudience} />
              {audienceOptions.papeis.length > 0 && <AudienceGroup title="Funções autorizadas" items={audienceOptions.papeis.map((papel) => ({ key: `PAPEL:${papel}`, label: roleLabel(papel) }))} selected={selectedAudience} onChange={setSelectedAudience} />}
              {audienceOptions.allowAllMembers && <AudienceGroup title="Comunidade" items={[{ key: "TODOS_MEMBROS:TODOS", label: "Todos os membros ativos" }]} selected={selectedAudience} onChange={setSelectedAudience} />}
            </div>
            <div className="request-audience-preview" aria-live="polite">{selectedAudience.length ? `${selectedAudience.length} público(s) selecionado(s)` : "Nenhum público selecionado"}</div>
          </fieldset>}
          <label className="request-wide-field">Título*<input name="titulo" required minLength={3} maxLength={120} /></label>
          <label className="request-wide-field">Descrição*<textarea name="descricao" required minLength={10} maxLength={2000} rows={4} /></label>
          <button disabled={busy === "create"}>{busy === "create" ? "Enviando…" : "Enviar pedido"}</button>
        </form>
      </details>

      {(feedback || error) && <p className={`operations-feedback ${error ? "error" : ""}`} role="status">{error || feedback}</p>}

      {canManage && (
        <>
          <nav className="request-category-tabs" aria-label="Filtrar solicitações por categoria">
            <button type="button" className={filter === "TODAS" ? "active" : ""} onClick={() => setFilter("TODAS")}>Todas <span>{generalItems.length}</span></button>
            {CATEGORIES.filter((category) => category.value !== "ORACAO" && category.value !== "VISITA").map((category) => <button
              type="button" key={category.value} className={filter === category.value ? "active" : ""}
              onClick={() => setFilter(category.value)}
            >{category.label}<span>{items.filter((item) => item.tipo === category.value || (category.value === "OUTRO" && item.tipo === "INFORMACAO")).length}</span></button>)}
          </nav>

          {loading ? (
            <div className="ministry-skeleton" aria-label="Carregando solicitações"><span /><span /><span /></div>
          ) : filteredItems.length ? (
            <div className="request-compact-list">
              {filteredItems.map((item) => <details key={item.id}>
                <summary>
                  <span className={`request-type-mark request-type-${item.tipo.toLowerCase()}`} aria-hidden="true" />
                  <span><small>{requestType(item.tipo)} · {item.solicitante_nome}</small><strong>{item.titulo}</strong></span>
                  <em className={`request-status status-${item.status.toLowerCase()}`}>{requestStatus(item.status)}</em>
                </summary>
                <div className="request-compact-detail">
                  <p>{item.descricao}</p>
                  <small>{formatDate(item.criado_em)} · {item.publico_resumo || visibilityLabel(item.visibilidade)}</small>
                  <div className="request-actions">
                    {item.status !== "CONCLUIDA" && <>
                      <button disabled={busy === `item-${item.id}`} onClick={() => void update(item, "EM_ANALISE")}>Em análise</button>
                      <button disabled={busy === `item-${item.id}`} onClick={() => void update(item, "CONCLUIDA")}>Concluir</button>
                    </>}
                    {(item.tipo === "ORACAO" || item.tipo === "VISITA") && item.status !== "CONCLUIDA" && <button disabled={busy === `forward-${item.id}`} onClick={() => forwardToRepository(item)}>Enviar ao repositório</button>}
                  </div>
                </div>
              </details>)}
            </div>
          ) : <div className="pilot-empty-state"><strong>Nenhum pedido nesta categoria</strong><p>Escolha outra categoria ou crie um novo pedido.</p></div>}
        </>
      )}

      {pendingPastor && <div className="request-whatsapp-backdrop" role="presentation" onMouseDown={() => setPendingPastor(null)}>
        <section className="request-whatsapp-dialog" role="dialog" aria-modal="true" aria-labelledby="whatsapp-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
          <Avatar name={pendingPastor.nome} photo={pendingPastor.foto} />
          <p className="pilot-kicker">CONFIRMAR CONTATO</p><h2 id="whatsapp-confirm-title">Falar com {pendingPastor.nome}</h2>
          <p>Você abrirá uma conversa no WhatsApp com esta pessoa.</p>
          <div><button type="button" onClick={() => setPendingPastor(null)}>Cancelar</button><button type="button" onClick={() => {
            window.open(pendingPastor.whatsappUrl, "_blank", "noopener,noreferrer"); setPendingPastor(null);
          }}>Continuar para o WhatsApp</button></div>
        </section>
      </div>}

      {selectedRepositoryItem && <div className="request-workflow-backdrop" role="presentation" onMouseDown={() => setSelectedRepositoryItem(null)}>
        <section className="request-workflow-dialog" role="dialog" aria-modal="true" aria-labelledby="request-workflow-title" onMouseDown={(event) => event.stopPropagation()}>
          <header>
            <div><p className="pilot-kicker">{selectedRepositoryItem.repositoryType === "ORACAO" ? "ATENDIMENTO DE ORAÇÃO" : "ATENDIMENTO DE VISITA"}</p><h2 id="request-workflow-title">{selectedRepositoryItem.titulo}</h2></div>
            <button type="button" aria-label="Fechar" onClick={() => setSelectedRepositoryItem(null)}>×</button>
          </header>
          <div className="request-workflow-request"><strong>{selectedRepositoryItem.solicitante_nome}</strong><p>{selectedRepositoryItem.descricao}</p></div>
          <form onSubmit={saveRepositoryWorkflow}>
            <label>Responsável pelo atendimento<input readOnly value={selectedRepositoryItem.responsavel_nome || central.currentActor.nome} /></label>
            <label>Situação<select value={workflowStatus} onChange={(event) => setWorkflowStatus(event.target.value as RepositoryItem["item_status"])}>
              {repositoryStatusOptions(selectedRepositoryItem.repositoryType).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
            <label className="request-workflow-wide">Mensagem entregue<textarea required minLength={3} maxLength={2000} rows={5} value={workflowMessage} onChange={(event) => setWorkflowMessage(event.target.value)} placeholder={selectedRepositoryItem.repositoryType === "ORACAO" ? "Registre a mensagem, orientação ou retorno entregue à pessoa." : "Registre o andamento, a visita realizada e as orientações entregues."} /></label>
            <fieldset className="request-testimony-consent request-workflow-wide">
              <legend>Testemunho (opcional)</legend>
              <textarea maxLength={2000} rows={4} value={workflowTestimony} onChange={(event) => setWorkflowTestimony(event.target.value)} placeholder="Conte o testemunho quando houver." />
              {workflowTestimony.trim() && <div><strong>Consentimento da pessoa atendida para compartilhar o testemunho</strong><label><input type="radio" name="testimonyPermission" checked={testimonyPermission === "PERMITIR"} onChange={() => setTestimonyPermission("PERMITIR")} />Permitir</label><label><input type="radio" name="testimonyPermission" checked={testimonyPermission === "NAO_PERMITIR"} onChange={() => setTestimonyPermission("NAO_PERMITIR")} />Não permitir</label></div>}
            </fieldset>
            <footer className="request-workflow-wide">
              <button type="button" onClick={() => setSelectedRepositoryItem(null)}>Cancelar</button>
              {selectedRepositoryItem.testemunho && selectedRepositoryItem.testemunho_compartilhavel === 1 && !selectedRepositoryItem.testemunho_publicado_em && selectedRepositoryItem.responsavel_usuario_id === central.currentActor.id && <button type="button" className="request-testimony-share" disabled={busy === `testimony-${selectedRepositoryItem.id}`} onClick={() => void shareTestimony()}>Compartilhar testemunho</button>}
              <button disabled={busy === `workflow-${selectedRepositoryItem.id}`}>{busy === `workflow-${selectedRepositoryItem.id}` ? "Salvando…" : "Salvar atendimento"}</button>
            </footer>
          </form>
          <small className="request-retention-note">Atendimentos finalizados são removidos automaticamente após 30 dias.</small>
        </section>
      </div>}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <article className={`request-metric tone-${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}
function Avatar({ name, photo }: { name: string; photo: string }) {
  return photo ? <img src={photo} alt="" /> : <span className="request-avatar-fallback">{name.slice(0, 1).toUpperCase()}</span>;
}
function AudienceGroup({ title, items, selected, onChange }: {
  title: string; items: Array<{ key: string; label: string; detail?: string }>;
  selected: string[]; onChange: (value: string[]) => void;
}) {
  if (!items.length) return null;
  return <section><strong>{title}</strong><div>{items.map((item) => <label key={item.key}>
    <input type="checkbox" checked={selected.includes(item.key)} onChange={() => onChange(selected.includes(item.key) ? selected.filter((key) => key !== item.key) : [...selected, item.key])} />
    <span>{item.label}{item.detail ? <small>{item.detail}</small> : null}</span>
  </label>)}</div></section>;
}
function parseAudienceKey(key: string) {
  const [type, raw] = key.split(":");
  if (type === "USUARIO" || type === "MINISTERIO") return { type, id: Number(raw) };
  return { type, value: raw };
}
function roleLabel(value: string) {
  return ({ MEMBRO: "Membro", LIDER: "Líder", PASTOR: "Pastor", ADMIN_COMUNIDADE: "Administrador da comunidade" } as Record<string, string>)[value] || value;
}
function requestType(value: RequestType) {
  return ({ ORACAO: "Oração", VISITA: "Visita", ACONSELHAMENTO: "Aconselhamento", APOIO: "Apoio", MINISTERIO: "Ministério", OUTRO: "Outro", INFORMACAO: "Informação" } as Record<RequestType, string>)[value];
}
function requestStatus(value: CommunityRequest["status"]) {
  return { ABERTA: "Aberta", EM_ANALISE: "Em análise", CONCLUIDA: "Concluída" }[value];
}
function visibilityLabel(value: CommunityRequest["visibilidade"]) {
  return { PASTORAL: "Equipe pastoral", GESTORES: "Gestores", PRIVADA: "Privada" }[value];
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function repositoryStatusOptions(type: Repository["tipo"]) {
  return type === "ORACAO"
    ? [
        { value: "ABERTO", label: "Aguardando atendimento" },
        { value: "EM_ORACAO", label: "Em oração" },
        { value: "FINALIZADO", label: "Finalizado" },
        { value: "ORACAO_ATENDIDA", label: "Oração atendida" },
      ]
    : [
        { value: "ABERTO", label: "Aguardando atendimento" },
        { value: "EM_PROCESSO", label: "Em processo" },
        { value: "VISITA_CONCLUIDA", label: "Visita concluída" },
        { value: "NOVA_VISITA", label: "Solicita nova visita" },
      ];
}

function repositoryStatusLabel(type: Repository["tipo"], status: RepositoryItem["item_status"]) {
  return repositoryStatusOptions(type).find((option) => option.value === status)?.label || "Aguardando atendimento";
}
