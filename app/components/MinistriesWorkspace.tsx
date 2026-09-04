"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Volunteer = {
  id: number;
  ministerio_id: number;
  usuario_id: number;
  nome: string;
  funcao: string;
  papel: "VOLUNTARIO" | "LIDER";
  dias_disponiveis: string[];
  periodo_preferido: string;
  is_mine: number;
};
type Ministry = {
  id: number;
  nome: string;
  descricao: string;
  categoria: string;
  status: "ATIVO" | "INATIVO";
  youtube_url: string;
  spotify_url: string;
  can_manage: number;
  voluntarios: Volunteer[];
};
type AvailableUser = {
  id: number;
  nome: string;
  papel: string;
};
type Assignment = {
  id: number;
  escala_id: number;
  voluntario_id: number;
  usuario_id: number;
  nome: string;
  funcao: string;
  status: "PENDENTE" | "CONFIRMADA" | "INDISPONIVEL";
  is_mine: number;
};
type Schedule = {
  id: number;
  ministerio_id: number;
  ministerio_nome: string;
  titulo: string;
  inicia_em: string;
  termina_em: string;
  local: string;
  status:
    | "RASCUNHO"
    | "PUBLICADA"
    | "AGUARDANDO_CHECKLIST"
    | "ENCERRADA"
    | "CANCELADA";
  observacoes: string;
  modelo_snapshot?: {
    camposPersonalizados?: CustomField[];
    versao?: number;
    nome?: string;
  };
  campos_respostas?: Record<string, string | number | boolean>;
  can_manage: number;
  designacoes: Assignment[];
  substitution_candidates: Array<{
    voluntarioId: number;
    usuarioId: number;
    nome: string;
    funcao: string;
    fotoPerfil: string | null;
  }>;
};
type MinistryFunction = {
  id: number;
  ministerio_id: number;
  nome: string;
  descricao: string;
};
type ScheduleTemplate = {
  id: number;
  ministerio_id: number;
  nome: string;
  titulo: string;
  duracao_minutos: number;
  local: string;
  observacoes: string;
  checklist_modelo: string[];
  campos_personalizados: CustomField[];
  versao: number;
};
type CustomField = {
  id: string;
  label: string;
  type:
    | "TEXTO"
    | "NUMERO"
    | "DATA"
    | "HORA"
    | "SELECAO"
    | "CHECKBOX"
    | "TEXTO_LONGO";
  required: boolean;
  options: string[];
};
type MinistryChecklistItem = {
  id: number;
  escala_id: number;
  designacao_id: number | null;
  tarefa: string;
  status: "PENDENTE" | "FEITO" | "NAO_FEITO";
  observacao: string;
  is_mine: number;
};
type ScheduleVolunteer = Volunteer;

const CATEGORY_LABELS: Record<string, string> = {
  LOUVOR: "Louvor",
  RECEPCAO: "Recepção",
  CRIANCAS: "Crianças",
  MIDIA: "Mídia",
  ACAO_SOCIAL: "Ação social",
  INTERCESSAO: "Intercessão",
  DIACONIA: "Diaconia",
  ESTACIONAMENTO: "Estacionamento",
  OUTRO: "Outro",
};
const DAY_LABELS: Record<string, string> = {
  DOM: "Dom",
  SEG: "Seg",
  TER: "Ter",
  QUA: "Qua",
  QUI: "Qui",
  SEX: "Sex",
  SAB: "Sáb",
};
const PERIOD_LABELS: Record<string, string> = {
  MANHA: "Manhã",
  TARDE: "Tarde",
  NOITE: "Noite",
  FLEXIVEL: "Flexível",
};

export default function MinistriesWorkspace({
  permissions,
  communityName,
}: {
  permissions: string[];
  communityName: string;
}) {
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleVolunteers, setScheduleVolunteers] = useState<
    ScheduleVolunteer[]
  >([]);
  const [functions, setFunctions] = useState<MinistryFunction[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [checklist, setChecklist] = useState<MinistryChecklistItem[]>([]);
  const [tab, setTab] = useState<
    "visao" | "escalas" | "recursos" | "participantes" | "historico"
  >("visao");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [replacementScheduleId, setReplacementScheduleId] = useState<number | null>(null);
  const [replacementVolunteerId, setReplacementVolunteerId] = useState(0);
  const scheduleFormRef = useRef<HTMLDetailsElement>(null);
  const canViewSchedules = permissions.includes("schedules.view");
  const canInvite = permissions.includes("invites.manage");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ministriesResponse, schedulesResponse, resourcesResponse] =
        await Promise.all([
        fetch("/api/pilot/ministerios", { cache: "no-store" }),
        fetch("/api/pilot/escalas", { cache: "no-store" }),
        fetch("/api/pilot/ministerios/recursos", { cache: "no-store" }),
      ]);
      const ministriesPayload = (await ministriesResponse.json()) as {
        ministerios?: Ministry[];
        availableUsers?: AvailableUser[];
        canCreate?: boolean;
        error?: string;
      };
      const schedulesPayload = (await schedulesResponse.json()) as {
        escalas?: Schedule[];
        voluntarios?: ScheduleVolunteer[];
        error?: string;
      };
      const resourcesPayload = (await resourcesResponse.json()) as {
        funcoes?: MinistryFunction[];
        modelos?: ScheduleTemplate[];
        checklist?: MinistryChecklistItem[];
        error?: string;
      };
      if (!ministriesResponse.ok) {
        throw new Error(
          ministriesPayload.error || "Não foi possível carregar os ministérios.",
        );
      }
      if (!schedulesResponse.ok) {
        throw new Error(
          schedulesPayload.error || "Não foi possível carregar as escalas.",
        );
      }
      if (!resourcesResponse.ok) {
        throw new Error(
          resourcesPayload.error ||
            "Não foi possível carregar os recursos do ministério.",
        );
      }
      setMinistries(ministriesPayload.ministerios || []);
      setAvailableUsers(ministriesPayload.availableUsers || []);
      setCanCreate(Boolean(ministriesPayload.canCreate));
      setSchedules(schedulesPayload.escalas || []);
      setScheduleVolunteers(schedulesPayload.voluntarios || []);
      setFunctions(resourcesPayload.funcoes || []);
      setTemplates(resourcesPayload.modelos || []);
      setChecklist(resourcesPayload.checklist || []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const manageableMinistries = useMemo(
    () =>
      ministries.filter(
        (ministry) => ministry.can_manage && ministry.status === "ATIVO",
      ),
    [ministries],
  );
  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === Number(selectedTemplateId)),
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    if (!canViewSchedules || !manageableMinistries.length) return;
    const open = () => {
      setTab("escalas");
      window.setTimeout(() => {
        if (!scheduleFormRef.current) return;
        scheduleFormRef.current.open = true;
        scheduleFormRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 60);
    };
    window.addEventListener("vinkulo:new-schedule", open);
    return () => window.removeEventListener("vinkulo:new-schedule", open);
  }, [canViewSchedules, manageableMinistries.length]);

  // "Escalas" no menu lateral abre a aba sem abrir o formulário: quem clica ali
  // quer ver as escalas, não criar uma. Depende só de poder ver — ter ministério
  // administrável é requisito de criar, não de olhar.
  useEffect(() => {
    if (!canViewSchedules) return;
    const reveal = () => setTab("escalas");
    window.addEventListener("vinkulo:open-schedules", reveal);
    return () => window.removeEventListener("vinkulo:open-schedules", reveal);
  }, [canViewSchedules]);

  async function request(
    key: string,
    url: string,
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    success: string,
  ) {
    setBusy(key);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível concluir a ação.");
      }
      setFeedback(success);
      await loadData();
      return true;
    } catch (requestError) {
      setError((requestError as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function createMinistry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await request(
      "create-ministry",
      "/api/pilot/ministerios",
      "POST",
      {
        nome: data.get("nome"),
        categoria: data.get("categoria"),
        descricao: data.get("descricao"),
        status: "ATIVO",
        youtubeUrl: data.get("youtubeUrl"),
        spotifyUrl: data.get("spotifyUrl"),
      },
      "Ministério criado no escopo da comunidade ativa.",
    );
    if (ok) form.reset();
  }

  async function updateMinistry(
    event: FormEvent<HTMLFormElement>,
    ministry: Ministry,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await request(
      `ministry-${ministry.id}`,
      `/api/pilot/ministerios/${ministry.id}`,
      "PATCH",
      {
        acao: "ATUALIZAR",
        nome: data.get("nome"),
        categoria: data.get("categoria"),
        descricao: data.get("descricao"),
        status: ministry.status,
        youtubeUrl: data.get("youtubeUrl"),
        spotifyUrl: data.get("spotifyUrl"),
      },
      "Dados do ministério atualizados.",
    );
  }

  async function addVolunteer(
    event: FormEvent<HTMLFormElement>,
    ministry: Ministry,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await request(
      `volunteer-${ministry.id}`,
      `/api/pilot/ministerios/${ministry.id}`,
      "PATCH",
      {
        acao: "ADICIONAR_VOLUNTARIO",
        usuarioId: data.get("usuarioId"),
        funcao: data.get("funcao"),
        papel: data.get("papel") || "VOLUNTARIO",
        periodoPreferido: data.get("periodoPreferido"),
        diasDisponiveis: data.getAll("diasDisponiveis"),
      },
      "Pessoa adicionada à equipe.",
    );
    if (ok) form.reset();
  }

  async function updateMyAvailability(
    event: FormEvent<HTMLFormElement>,
    ministry: Ministry,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await request(
      `availability-${ministry.id}`,
      `/api/pilot/ministerios/${ministry.id}`,
      "PATCH",
      {
        acao: "ATUALIZAR_MINHA_DISPONIBILIDADE",
        periodoPreferido: data.get("periodoPreferido"),
        diasDisponiveis: data.getAll("diasDisponiveis"),
      },
      "Sua disponibilidade foi atualizada.",
    );
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const camposRespostas = Object.fromEntries(
      (selectedTemplate?.campos_personalizados || []).map((field) => [
        field.id,
        field.type === "CHECKBOX"
          ? data.get(`custom-${field.id}`) === "on"
          : data.get(`custom-${field.id}`) || "",
      ]),
    );
    const ok = await request(
      "create-schedule",
      "/api/pilot/escalas",
      "POST",
      {
        ministerioId: data.get("ministerioId"),
        titulo: data.get("titulo"),
        iniciaEm: localDateToIso(String(data.get("iniciaEm") || "")),
        terminaEm: localDateToIso(String(data.get("terminaEm") || "")),
        local: data.get("local"),
        status: data.get("status"),
        observacoes: data.get("observacoes"),
        camposRespostas,
        modeloId: data.get("modeloId"),
      },
      "Escala criada com validação de escopo.",
    );
    if (ok) form.reset();
  }

  async function createFunction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await request(
      "create-function",
      "/api/pilot/ministerios/recursos",
      "POST",
      {
        acao: "CRIAR_FUNCAO",
        ministerioId: data.get("ministerioId"),
        nome: data.get("nome"),
        descricao: data.get("descricao"),
      },
      "Função personalizada salva para reutilização.",
    );
    if (ok) form.reset();
  }

  async function createTemplate(
    event: FormEvent<HTMLFormElement>,
    customFields: CustomField[],
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const checklistItems = String(data.get("checklist") || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const ok = await request(
      "create-template",
      "/api/pilot/ministerios/recursos",
      "POST",
      {
        acao: "CRIAR_MODELO",
        ministerioId: data.get("ministerioId"),
        nome: data.get("nome"),
        titulo: data.get("titulo"),
        duracaoMinutos: data.get("duracaoMinutos"),
        local: data.get("local"),
        observacoes: data.get("observacoes"),
        checklist: checklistItems,
        camposPersonalizados: customFields,
      },
      "Modelo reutilizável salvo com checklist.",
    );
    if (ok) form.reset();
  }

  async function updateFunction(
    event: FormEvent<HTMLFormElement>,
    item: MinistryFunction,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await request(
      `edit-function-${item.id}`,
      "/api/pilot/ministerios/recursos",
      "PATCH",
      {
        acao: "ATUALIZAR_FUNCAO",
        id: item.id,
        nome: data.get("nome"),
        descricao: data.get("descricao"),
      },
      "Função atualizada sem alterar escalas anteriores.",
    );
  }

  async function updateTemplate(
    event: FormEvent<HTMLFormElement>,
    item: ScheduleTemplate,
    customFields: CustomField[],
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const checklistItems = String(data.get("checklist") || "")
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    await request(
      `edit-template-${item.id}`,
      "/api/pilot/ministerios/recursos",
      "PATCH",
      {
        acao: "ATUALIZAR_MODELO",
        id: item.id,
        ministerioId: item.ministerio_id,
        nome: data.get("nome"),
        titulo: data.get("titulo"),
        duracaoMinutos: data.get("duracaoMinutos"),
        local: data.get("local"),
        observacoes: data.get("observacoes"),
        checklist: checklistItems,
        camposPersonalizados: customFields,
      },
      "Modelo atualizado. Escalas antigas mantiveram a versão usada.",
    );
  }

  async function updateChecklist(
    item: MinistryChecklistItem,
    status: MinistryChecklistItem["status"],
  ) {
    await request(
      `checklist-${item.id}`,
      "/api/pilot/ministerios/recursos",
      "PATCH",
      {
        acao: "ATUALIZAR_CHECKLIST",
        itemId: item.id,
        status,
        observacao: item.observacao,
      },
      status === "FEITO"
        ? "Item concluído e registrado."
        : "Situação do item atualizada.",
    );
  }

  async function updateSchedule(
    event: FormEvent<HTMLFormElement>,
    schedule: Schedule,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = schedule.modelo_snapshot?.camposPersonalizados || [];
    const camposRespostas = Object.fromEntries(
      fields.map((field) => [
        field.id,
        field.type === "CHECKBOX"
          ? data.get(`custom-${field.id}`) === "on"
          : data.get(`custom-${field.id}`) || "",
      ]),
    );
    await request(
      `edit-schedule-${schedule.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      {
        acao: "ATUALIZAR",
        ministerioId: schedule.ministerio_id,
        titulo: data.get("titulo"),
        iniciaEm: localDateToIso(String(data.get("iniciaEm") || "")),
        terminaEm: localDateToIso(String(data.get("terminaEm") || "")),
        local: data.get("local"),
        status: data.get("status"),
        observacoes: data.get("observacoes"),
        camposRespostas,
      },
      "Escala atualizada pelo responsável autorizado.",
    );
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("member-invite");
    setFeedback("");
    setError("");
    setInviteUrl("");
    try {
      const response = await fetch("/api/pilot/convites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), papel: "MEMBRO" }),
      });
      const payload = (await response.json()) as {
        inviteUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.inviteUrl) {
        throw new Error(payload.error || "Não foi possível criar o convite.");
      }
      setInviteUrl(payload.inviteUrl);
      setFeedback(
        "Convite criado. A pessoa só poderá participar depois de aceitar o vínculo.",
      );
      form.reset();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addAssignment(
    event: FormEvent<HTMLFormElement>,
    schedule: Schedule,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const selected = scheduleVolunteers.find(
      (volunteer) => volunteer.id === Number(data.get("voluntarioId")),
    );
    const ok = await request(
      `assignment-${schedule.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      {
        acao: "ADICIONAR_DESIGNACAO",
        voluntarioId: data.get("voluntarioId"),
        funcao: data.get("funcao") || selected?.funcao,
      },
      "Designação adicionada sem conflito de horário.",
    );
    if (ok) form.reset();
  }

  async function respondToSchedule(
    schedule: Schedule,
    status: "CONFIRMADA" | "INDISPONIVEL",
    substitutoVoluntarioId?: number,
  ) {
    const saved = await request(
      `response-${schedule.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      { acao: "RESPONDER", status, substitutoVoluntarioId },
      status === "CONFIRMADA"
        ? "Participação confirmada."
        : "Indisponibilidade registrada e substituto indicado.",
    );
    if (saved) {
      setReplacementScheduleId(null);
      setReplacementVolunteerId(0);
    }
  }

  return (
    <section className="ministries-workspace">
      <header className="workspace-heading">
        <div>
          <p className="pilot-kicker">MINISTÉRIOS V4.6</p>
          <h1>Ministérios de {communityName}</h1>
          <p>
            Equipes, escalas, modelos e execução com leitura rápida no
            computador e no celular.
          </p>
        </div>
        <span className="scope-badge">Permissões no servidor</span>
      </header>

      <div className="operations-notice">
        <strong>Gestão multi-comunidade protegida</strong>
        <span>
          Só entram nas equipes pessoas com conta ativa e vínculo aceito com esta
          comunidade. Quem ainda não pertence recebe um convite individual.
        </span>
      </div>

      <div className="ministry-tabs" role="tablist" aria-label="Área de equipes">
        <button
          role="tab"
          aria-selected={tab === "visao"}
          className={tab === "visao" ? "active" : ""}
          onClick={() => setTab("visao")}
        >
          Visão geral <span>{ministries.length}</span>
        </button>
        {canViewSchedules && (
          <button
            role="tab"
            aria-selected={tab === "escalas"}
            className={tab === "escalas" ? "active" : ""}
            onClick={() => setTab("escalas")}
          >
            Escalas <span>{schedules.length}</span>
          </button>
        )}
        {manageableMinistries.length > 0 && (
          <button
            role="tab"
            aria-selected={tab === "recursos"}
            className={tab === "recursos" ? "active" : ""}
            onClick={() => setTab("recursos")}
          >
            Recursos <span>{functions.length + templates.length}</span>
          </button>
        )}
        {availableUsers.length > 0 && (
          <button
            role="tab"
            aria-selected={tab === "participantes"}
            className={tab === "participantes" ? "active" : ""}
            onClick={() => setTab("participantes")}
          >
            Participantes <span>{availableUsers.length}</span>
          </button>
        )}
        {canViewSchedules && (
          <button
            role="tab"
            aria-selected={tab === "historico"}
            className={tab === "historico" ? "active" : ""}
            onClick={() => setTab("historico")}
          >
            Histórico{" "}
            <span>
              {schedules.filter((item) => item.status === "CANCELADA").length}
            </span>
          </button>
        )}
      </div>

      {feedback && (
        <p className="operations-feedback" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <div className="operations-feedback error" role="alert">
          <span>{error}</span>
          <button className="event-inline-action" onClick={() => void loadData()}>
            Tentar novamente
          </button>
        </div>
      )}

      {loading ? (
        <div className="ministry-skeleton" aria-label="Carregando equipes">
          <span />
          <span />
          <span />
        </div>
      ) : tab === "visao" ? (
        <>
          <TeamOverview
            schedules={schedules.filter((item) => item.status !== "CANCELADA")}
            users={availableUsers}
            ministries={ministries}
          />
          {canCreate && (
            <details className="operations-form-card">
              <summary>Criar novo ministério</summary>
              <form
                className="pilot-form ministry-create-form"
                onSubmit={createMinistry}
              >
                <label>
                  Nome*
                  <input name="nome" required maxLength={120} />
                </label>
                <label>
                  Categoria
                  <select name="categoria" defaultValue="OUTRO">
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ministry-wide-field">
                  Descrição
                  <textarea name="descricao" rows={3} maxLength={1200} />
                </label>
                <label>
                  YouTube oficial
                  <input
                    name="youtubeUrl"
                    type="url"
                    inputMode="url"
                    placeholder="https://youtube.com/..."
                  />
                </label>
                <label>
                  Spotify oficial
                  <input
                    name="spotifyUrl"
                    type="url"
                    inputMode="url"
                    placeholder="https://open.spotify.com/..."
                  />
                </label>
                <button disabled={busy === "create-ministry"}>
                  {busy === "create-ministry" ? "Criando…" : "Criar ministério"}
                </button>
              </form>
            </details>
          )}
          {ministries.length ? (
            <div className="ministry-grid">
              {ministries.map((ministry) => (
                <MinistryCard
                  key={ministry.id}
                  ministry={ministry}
                  availableUsers={availableUsers}
                  functions={functions.filter(
                    (item) => item.ministerio_id === ministry.id,
                  )}
                  globalManager={canCreate}
                  busy={busy}
                  onUpdate={updateMinistry}
                  onAddVolunteer={addVolunteer}
                  onAvailability={updateMyAvailability}
                  onDeactivate={() =>
                    request(
                      `ministry-${ministry.id}`,
                      `/api/pilot/ministerios/${ministry.id}`,
                      "PATCH",
                      { acao: "DESATIVAR" },
                      "Ministério desativado sem apagar o histórico.",
                    )
                  }
                  onRemoveVolunteer={(volunteer) =>
                    window.confirm(
                      `Excluir ${volunteer.nome} desta equipe? A ação será auditada.`,
                    )
                      ? request(
                          `remove-volunteer-${volunteer.id}`,
                          `/api/pilot/ministerios/${ministry.id}`,
                          "PATCH",
                          {
                            acao: "REMOVER_VOLUNTARIO",
                            voluntarioId: volunteer.id,
                          },
                          "Pessoa excluída da equipe.",
                        )
                      : Promise.resolve(false)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="pilot-empty-state">
              <strong>Nenhum ministério nesta comunidade</strong>
              <p>O estado começa vazio e não reutiliza dados de outro tenant.</p>
            </div>
          )}
        </>
      ) : tab === "recursos" ? (
        <MinistryResourcesPanel
          ministries={manageableMinistries}
          functions={functions}
          templates={templates}
          schedules={schedules}
          checklist={checklist}
          busy={busy}
          onCreateFunction={createFunction}
          onCreateTemplate={createTemplate}
          onUpdateFunction={updateFunction}
          onUpdateTemplate={updateTemplate}
          onUpdateChecklist={updateChecklist}
          onDeactivate={(kind, id) => {
            if (
              !window.confirm(
                `Excluir definitivamente ${
                  kind === "function" ? "esta função" : "este modelo"
                }? O histórico das escalas já criadas será preservado.`,
              )
            ) {
              return Promise.resolve(false);
            }
            return request(
              `deactivate-${kind}-${id}`,
              "/api/pilot/ministerios/recursos",
              "PATCH",
              {
                acao:
                  kind === "function"
                    ? "EXCLUIR_FUNCAO"
                    : "EXCLUIR_MODELO",
                id,
              },
              kind === "function"
                ? "Função excluída; escalas existentes preservam seu histórico."
                : "Modelo excluído; escalas existentes preservam sua versão.",
            );
          }}
        />
      ) : tab === "participantes" ? (
        <ParticipantsPanel
          users={availableUsers}
          canInvite={canInvite}
          busy={busy}
          inviteUrl={inviteUrl}
          onInvite={createInvite}
        />
      ) : tab === "historico" ? (
        <ScheduleHistory
          schedules={schedules.filter((item) => item.status === "CANCELADA")}
        />
      ) : (
        <>
          {manageableMinistries.length > 0 && (
            <details className="operations-form-card" ref={scheduleFormRef}>
              <summary>Criar nova escala</summary>
              <div className="template-picker">
                <label>
                  Começar por um modelo
                  <select
                    value={selectedTemplateId}
                    onChange={(event) =>
                      setSelectedTemplateId(event.target.value)
                    }
                  >
                    <option value="">Sem modelo</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.nome} ·{" "}
                        {ministryName(ministries, template.ministerio_id)}
                      </option>
                    ))}
                  </select>
                </label>
                <span>
                  {selectedTemplate
                    ? `${selectedTemplate.duracao_minutos} min · ${selectedTemplate.checklist_modelo.length} itens de checklist`
                    : "Você também pode montar uma escala do zero."}
                </span>
              </div>
              <form
                key={selectedTemplateId || "blank"}
                className="pilot-form schedule-create-form"
                onSubmit={createSchedule}
              >
                <input
                  type="hidden"
                  name="modeloId"
                  value={selectedTemplateId}
                />
                <label>
                  Ministério*
                  <select
                    name="ministerioId"
                    required
                    defaultValue={
                      selectedTemplate
                        ? String(selectedTemplate.ministerio_id)
                        : ""
                    }
                  >
                    <option value="" disabled>
                      Selecione
                    </option>
                    {manageableMinistries.map((ministry) => (
                      <option key={ministry.id} value={ministry.id}>
                        {ministry.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Título*
                  <input
                    name="titulo"
                    required
                    maxLength={140}
                    defaultValue={selectedTemplate?.titulo || ""}
                  />
                </label>
                <label>
                  Início*
                  <input name="iniciaEm" type="datetime-local" required />
                </label>
                <label>
                  Término*
                  <input name="terminaEm" type="datetime-local" required />
                </label>
                <label>
                  Local
                  <input
                    name="local"
                    maxLength={180}
                    defaultValue={selectedTemplate?.local || ""}
                  />
                </label>
                <label>
                  Status
                  <select name="status" defaultValue="RASCUNHO">
                    <option value="RASCUNHO">Rascunho</option>
                    <option value="PUBLICADA">Publicada</option>
                  </select>
                </label>
                <label className="schedule-wide-field">
                  Observações
                  <textarea
                    name="observacoes"
                    rows={3}
                    maxLength={1200}
                    defaultValue={selectedTemplate?.observacoes || ""}
                  />
                </label>
                {selectedTemplate?.campos_personalizados.map((field) => (
                  <CustomFieldInput field={field} key={field.id} />
                ))}
                <button disabled={busy === "create-schedule"}>
                  {busy === "create-schedule" ? "Criando…" : "Criar escala"}
                </button>
              </form>
            </details>
          )}
          {schedules.some((item) => item.status !== "CANCELADA") ? (
            <div className="schedule-grid">
              {schedules
                .filter((item) => item.status !== "CANCELADA")
                .map((schedule) => {
                const available = scheduleVolunteers.filter(
                  (volunteer) =>
                    volunteer.ministerio_id === schedule.ministerio_id &&
                    !schedule.designacoes.some(
                      (assignment) =>
                        assignment.voluntario_id === volunteer.id,
                    ),
                );
                const mine = schedule.designacoes.find(
                  (assignment) => assignment.is_mine,
                );
                return (
                  <article
                    className={`schedule-card status-${schedule.status.toLowerCase()}`}
                    key={schedule.id}
                  >
                    <header>
                      <div>
                        <span className="status-pill">
                          {schedule.ministerio_nome}
                        </span>
                        <span
                          className={`status-pill status-${schedule.status.toLowerCase()}`}
                        >
                          {scheduleStatus(schedule.status)}
                        </span>
                      </div>
                      <time>{formatScheduleDate(schedule.inicia_em)}</time>
                    </header>
                    <h2>{schedule.titulo}</h2>
                    <p>{schedule.observacoes || "Sem observações adicionais."}</p>
                    <div className="schedule-next-action">
                      <strong>Responsável: liderança de {schedule.ministerio_nome}</strong>
                      <span>Próxima ação: {schedule.status === "ENCERRADA" ? "consultar o histórico" :
                        mine?.status === "PENDENTE" ? "confirmar presença ou informar indisponibilidade" :
                        schedule.status === "RASCUNHO" ? "revisar equipe e publicar" :
                        schedule.status === "AGUARDANDO_CHECKLIST" ? "concluir o checklist" :
                        schedule.designacoes.some(item => item.status === "PENDENTE") ? "acompanhar confirmações da equipe" : "consultar horário e local"}.</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Horário</dt>
                        <dd>
                          {formatScheduleRange(
                            schedule.inicia_em,
                            schedule.termina_em,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Local</dt>
                        <dd>{schedule.local || "A definir"}</dd>
                      </div>
                    </dl>
                    <div className="assignment-list">
                      <strong>Equipe designada</strong>
                      {schedule.designacoes.length ? (
                        schedule.designacoes.map((assignment) => (
                          <div key={assignment.id}>
                            <span>
                              <b>{assignment.nome}</b>
                              <small>{assignment.funcao}</small>
                            </span>
                            <em className={`assignment-${assignment.status.toLowerCase()}`}>
                              {assignmentStatus(assignment.status)}
                            </em>
                            {schedule.can_manage &&
                            ["RASCUNHO", "PUBLICADA"].includes(
                              schedule.status,
                            ) ? (
                              <button
                                disabled={busy === `remove-${assignment.id}`}
                                aria-label={`Remover ${assignment.nome}`}
                                onClick={() =>
                                  void request(
                                    `remove-${assignment.id}`,
                                    `/api/pilot/escalas/${schedule.id}`,
                                    "PATCH",
                                    {
                                      acao: "REMOVER_DESIGNACAO",
                                      designacaoId: assignment.id,
                                    },
                                    "Designação removida da escala.",
                                  )
                                }
                              >
                                Remover
                              </button>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <small>Ninguém designado ainda.</small>
                      )}
                    </div>
                    {mine && mine.status === "PENDENTE" && schedule.status === "PUBLICADA" ? (
                      <div className="schedule-response-actions">
                        <button
                          disabled={busy === `response-${schedule.id}`}
                          onClick={() =>
                            void respondToSchedule(schedule, "CONFIRMADA")
                          }
                        >
                          Confirmar
                        </button>
                        <button
                          disabled={busy === `response-${schedule.id}`}
                          onClick={() => {
                            setReplacementScheduleId(schedule.id);
                            setReplacementVolunteerId(0);
                          }}
                        >
                          Informar indisponibilidade
                        </button>
                      </div>
                    ) : null}
                    {mine && mine.status === "PENDENTE" && replacementScheduleId === schedule.id ? (
                      <div className="schedule-substitute-picker">
                        <strong>Quem pode ficar no seu lugar?</strong>
                        <p>Escolha uma pessoa ativa deste ministério.</p>
                        {schedule.substitution_candidates?.length ? (
                          <select value={replacementVolunteerId || ""} onChange={(event) => setReplacementVolunteerId(Number(event.target.value))}>
                            <option value="" disabled>Selecione uma pessoa</option>
                            {schedule.substitution_candidates.map((candidate) => <option key={candidate.voluntarioId} value={candidate.voluntarioId}>{candidate.nome} · {candidate.funcao}</option>)}
                          </select>
                        ) : <small>Não há outra pessoa disponível. Fale com a liderança.</small>}
                        <div>
                          <button disabled={!replacementVolunteerId || busy === `response-${schedule.id}`} onClick={() => void respondToSchedule(schedule, "INDISPONIVEL", replacementVolunteerId)}>Confirmar substituição</button>
                          <button className="secondary" onClick={() => setReplacementScheduleId(null)}>Cancelar</button>
                        </div>
                      </div>
                    ) : null}
                    {schedule.can_manage &&
                    ["RASCUNHO", "PUBLICADA"].includes(schedule.status) ? (
                      <>
                        {available.length ? (
                          <form
                            className="pilot-form assignment-form"
                            onSubmit={(event) =>
                              addAssignment(event, schedule)
                            }
                          >
                            <label>
                              Voluntário
                              <select
                                name="voluntarioId"
                                required
                                defaultValue=""
                              >
                                <option value="" disabled>
                                  Selecione
                                </option>
                                {available.map((volunteer) => (
                                  <option key={volunteer.id} value={volunteer.id}>
                                    {volunteer.nome} · {volunteer.funcao}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Função nesta escala
                              <input
                                name="funcao"
                                maxLength={100}
                                list={`schedule-functions-${schedule.id}`}
                              />
                              <datalist id={`schedule-functions-${schedule.id}`}>
                                {functions
                                  .filter(
                                    (item) =>
                                      item.ministerio_id ===
                                      schedule.ministerio_id,
                                  )
                                  .map((item) => (
                                    <option key={item.id} value={item.nome} />
                                  ))}
                              </datalist>
                            </label>
                            <button disabled={busy === `assignment-${schedule.id}`}>
                              Designar
                            </button>
                          </form>
                        ) : null}
                        <details className="schedule-edit-panel">
                          <summary>Editar escala</summary>
                          <form
                            className="pilot-form schedule-edit-form"
                            onSubmit={(event) =>
                              updateSchedule(event, schedule)
                            }
                          >
                            <label>
                              Título*
                              <input
                                name="titulo"
                                required
                                maxLength={140}
                                defaultValue={schedule.titulo}
                              />
                            </label>
                            <label>
                              Início*
                              <input
                                name="iniciaEm"
                                type="datetime-local"
                                required
                                defaultValue={toLocalDateTime(schedule.inicia_em)}
                              />
                            </label>
                            <label>
                              Término*
                              <input
                                name="terminaEm"
                                type="datetime-local"
                                required
                                defaultValue={toLocalDateTime(schedule.termina_em)}
                              />
                            </label>
                            <label>
                              Local
                              <input
                                name="local"
                                maxLength={180}
                                defaultValue={schedule.local}
                              />
                            </label>
                            <label>
                              Status
                              <select
                                name="status"
                                defaultValue={schedule.status}
                              >
                                <option value="RASCUNHO">Rascunho</option>
                                <option value="PUBLICADA">Publicada</option>
                              </select>
                            </label>
                            <label className="schedule-wide-field">
                              Observações
                              <textarea
                                name="observacoes"
                                rows={3}
                                maxLength={1200}
                                defaultValue={schedule.observacoes}
                              />
                            </label>
                            {(
                              schedule.modelo_snapshot?.camposPersonalizados ||
                              []
                            ).map((field) => (
                              <CustomFieldInput
                                field={field}
                                key={field.id}
                                value={schedule.campos_respostas?.[field.id]}
                              />
                            ))}
                            <button
                              disabled={busy === `edit-schedule-${schedule.id}`}
                            >
                              Salvar alterações
                            </button>
                          </form>
                        </details>
                        <button
                          className="schedule-cancel"
                          disabled={busy === `cancel-${schedule.id}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Cancelar a escala “${schedule.titulo}”?`,
                              )
                            ) {
                              void request(
                                `cancel-${schedule.id}`,
                                `/api/pilot/escalas/${schedule.id}`,
                                "PATCH",
                                { acao: "CANCELAR" },
                                "Escala cancelada sem apagar o histórico.",
                              );
                            }
                          }}
                        >
                          Cancelar escala
                        </button>
                      </>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="pilot-empty-state">
              <strong>Nenhuma escala disponível</strong>
              <p>
                Rascunhos aparecem apenas para quem administra o ministério.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TeamOverview({
  schedules,
  users,
  ministries,
}: {
  schedules: Schedule[];
  users: AvailableUser[];
  ministries: Ministry[];
}) {
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay() + index);
    const count = schedules.filter(
      (schedule) =>
        new Date(schedule.inicia_em).toLocaleDateString("pt-BR") ===
        date.toLocaleDateString("pt-BR"),
    ).length;
    return { date, count };
  });
  return (
    <div className="team-overview">
      <div className="team-metrics">
        <article>
          <span>Equipes ativas</span>
          <strong>
            {ministries.filter((item) => item.status === "ATIVO").length}
          </strong>
        </article>
        <article>
          <span>Participantes</span>
          <strong>{users.length}</strong>
        </article>
        <article>
          <span>Escalas abertas</span>
          <strong>{schedules.length}</strong>
        </article>
        <article>
          <span>Confirmações</span>
          <strong>
            {schedules.reduce(
              (total, item) =>
                total +
                item.designacoes.filter(
                  (assignment) => assignment.status === "CONFIRMADA",
                ).length,
              0,
            )}
          </strong>
        </article>
      </div>
      <div className="schedule-week" aria-label="Resumo da semana">
        {week.map(({ date, count }) => (
          <div className={count ? "has-service" : ""} key={date.toISOString()}>
            <span>
              {new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
                .format(date)
                .replace(".", "")}
            </span>
            <b>{date.getDate()}</b>
            <small>{count} escala{count === 1 ? "" : "s"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function MinistryResourcesPanel({
  ministries,
  functions,
  templates,
  schedules,
  checklist,
  busy,
  onCreateFunction,
  onCreateTemplate,
  onUpdateFunction,
  onUpdateTemplate,
  onUpdateChecklist,
  onDeactivate,
}: {
  ministries: Ministry[];
  functions: MinistryFunction[];
  templates: ScheduleTemplate[];
  schedules: Schedule[];
  checklist: MinistryChecklistItem[];
  busy: string | null;
  onCreateFunction: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCreateTemplate: (
    event: FormEvent<HTMLFormElement>,
    fields: CustomField[],
  ) => Promise<void>;
  onUpdateFunction: (
    event: FormEvent<HTMLFormElement>,
    item: MinistryFunction,
  ) => Promise<void>;
  onUpdateTemplate: (
    event: FormEvent<HTMLFormElement>,
    item: ScheduleTemplate,
    fields: CustomField[],
  ) => Promise<void>;
  onUpdateChecklist: (
    item: MinistryChecklistItem,
    status: MinistryChecklistItem["status"],
  ) => Promise<void>;
  onDeactivate: (
    kind: "function" | "template",
    id: number,
  ) => Promise<boolean>;
}) {
  const [newFields, setNewFields] = useState<CustomField[]>([]);
  return (
    <section className="ministry-resources">
      <div className="ministry-resource-intro">
        <div>
          <span>Biblioteca operacional</span>
          <strong>Configure uma vez, reutilize em cada escala</strong>
        </div>
        <p>
          Funções e modelos ficam isolados na comunidade ativa. Alterações são
          auditadas e validadas no servidor.
        </p>
      </div>

      <div className="ministry-resource-forms">
        <details className="operations-form-card" open={!functions.length}>
          <summary>Nova função personalizada</summary>
          <form className="pilot-form resource-form" onSubmit={onCreateFunction}>
            <label>
              Ministério*
              <select name="ministerioId" required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {ministries.map((ministry) => (
                  <option key={ministry.id} value={ministry.id}>
                    {ministry.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome da função*
              <input
                name="nome"
                required
                maxLength={100}
                placeholder="Ex.: Vocal principal"
              />
            </label>
            <label className="resource-wide-field">
              Descrição
              <input
                name="descricao"
                maxLength={300}
                placeholder="Responsabilidades resumidas"
              />
            </label>
            <button disabled={busy === "create-function"}>
              {busy === "create-function" ? "Salvando…" : "Salvar função"}
            </button>
          </form>
        </details>

        <details className="operations-form-card" open={!templates.length}>
          <summary>Novo modelo de escala</summary>
          <form
            className="pilot-form resource-form"
            onSubmit={(event) => onCreateTemplate(event, newFields)}
          >
            <label>
              Ministério*
              <select name="ministerioId" required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {ministries.map((ministry) => (
                  <option key={ministry.id} value={ministry.id}>
                    {ministry.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome do modelo*
              <input
                name="nome"
                required
                maxLength={100}
                placeholder="Ex.: Culto de domingo"
              />
            </label>
            <label>
              Título da escala*
              <input name="titulo" required maxLength={140} />
            </label>
            <label>
              Duração em minutos*
              <input
                name="duracaoMinutos"
                type="number"
                min={15}
                max={1440}
                defaultValue={120}
                required
              />
            </label>
            <label>
              Local
              <input name="local" maxLength={180} />
            </label>
            <label>
              Observações
              <input name="observacoes" maxLength={1200} />
            </label>
            <label className="resource-wide-field">
              Checklist padrão
              <textarea
                name="checklist"
                rows={5}
                placeholder={"Um item por linha\nTestar equipamentos\nRevisar organização"}
              />
            </label>
            <CustomFieldBuilder fields={newFields} onChange={setNewFields} />
            <button disabled={busy === "create-template"}>
              {busy === "create-template" ? "Salvando…" : "Salvar modelo"}
            </button>
          </form>
        </details>
      </div>

      <div className="resource-library-grid">
        <article>
          <header>
            <div>
              <span>Funções</span>
              <strong>{functions.length} disponíveis</strong>
            </div>
          </header>
          <div className="resource-chip-list">
            {functions.length ? (
              functions.map((item) => (
                <details className="resource-edit-card" key={item.id}>
                  <summary>
                    <span>
                      <strong>{item.nome}</strong>
                      <small>
                        {ministryName(ministries, item.ministerio_id)}
                        {item.descricao ? ` · ${item.descricao}` : ""}
                      </small>
                    </span>
                    <em>Editar</em>
                  </summary>
                  <form
                    className="pilot-form resource-edit-form"
                    onSubmit={(event) => onUpdateFunction(event, item)}
                  >
                    <label>
                      Nome
                      <input name="nome" required defaultValue={item.nome} />
                    </label>
                    <label>
                      Descrição
                      <input
                        name="descricao"
                        defaultValue={item.descricao}
                        maxLength={300}
                      />
                    </label>
                    <div className="resource-edit-actions">
                      <button disabled={busy === `edit-function-${item.id}`}>
                        Salvar edição
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy === `deactivate-function-${item.id}`}
                        onClick={() => void onDeactivate("function", item.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </form>
                </details>
              ))
            ) : (
              <p>Nenhuma função personalizada criada.</p>
            )}
          </div>
        </article>
        <article>
          <header>
            <div>
              <span>Modelos</span>
              <strong>{templates.length} reutilizáveis</strong>
            </div>
          </header>
          <div className="resource-chip-list">
            {templates.length ? (
              templates.map((item) => (
                <TemplateEditor
                  key={item.id}
                  item={item}
                  ministry={ministryName(ministries, item.ministerio_id)}
                  busy={busy}
                  onUpdate={onUpdateTemplate}
                  onDeactivate={() => onDeactivate("template", item.id)}
                />
              ))
            ) : (
              <p>Nenhum modelo salvo.</p>
            )}
          </div>
        </article>
      </div>

      <div className="ministry-execution-panel">
        <header>
          <div>
            <span>Execução e checklist</span>
            <strong>
              {checklist.filter((item) => item.status === "PENDENTE").length}{" "}
              pendências
            </strong>
          </div>
          <p>
            O participante vê sua escala publicada; gestores acompanham a
            execução do ministério.
          </p>
        </header>
        {checklist.length ? (
          <div className="ministry-checklist-list">
            {checklist.map((item) => {
              const schedule = schedules.find(
                (candidate) => candidate.id === item.escala_id,
              );
              const canUpdate = Boolean(schedule?.can_manage || item.is_mine);
              return (
                <article key={item.id}>
                  <span
                    className={`checklist-state state-${item.status.toLowerCase()}`}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{item.tarefa}</strong>
                    <small>
                      {schedule?.titulo || "Escala"} ·{" "}
                      {checklistStatus(item.status)}
                    </small>
                  </div>
                  {canUpdate ? (
                    <div className="checklist-actions">
                      <button
                        disabled={busy === `checklist-${item.id}`}
                        onClick={() => void onUpdateChecklist(item, "FEITO")}
                      >
                        Concluir
                      </button>
                      <button
                        disabled={busy === `checklist-${item.id}`}
                        onClick={() =>
                          void onUpdateChecklist(item, "NAO_FEITO")
                        }
                      >
                        Não realizado
                      </button>
                    </div>
                  ) : (
                    <span className="scope-badge">Somente leitura</span>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="pilot-empty-state">
            <strong>Nenhum checklist em andamento</strong>
            <p>Crie uma escala a partir de um modelo para gerar os itens.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function TemplateEditor({
  item,
  ministry,
  busy,
  onUpdate,
  onDeactivate,
}: {
  item: ScheduleTemplate;
  ministry: string;
  busy: string | null;
  onUpdate: (
    event: FormEvent<HTMLFormElement>,
    item: ScheduleTemplate,
    fields: CustomField[],
  ) => Promise<void>;
  onDeactivate: () => Promise<boolean>;
}) {
  const [fields, setFields] = useState<CustomField[]>(
    item.campos_personalizados || [],
  );
  return (
    <details className="resource-edit-card">
      <summary>
        <span>
          <strong>{item.nome}</strong>
          <small>
            {ministry} · versão {item.versao || 1} · {item.duracao_minutos} min ·{" "}
            {item.checklist_modelo.length} itens · {fields.length} campos
          </small>
        </span>
        <em>Editar</em>
      </summary>
      <form
        className="pilot-form resource-edit-form template-edit-form"
        onSubmit={(event) => onUpdate(event, item, fields)}
      >
        <label>
          Nome do modelo
          <input name="nome" required defaultValue={item.nome} maxLength={100} />
        </label>
        <label>
          Título da escala
          <input
            name="titulo"
            required
            defaultValue={item.titulo}
            maxLength={140}
          />
        </label>
        <label>
          Duração em minutos
          <input
            name="duracaoMinutos"
            type="number"
            min={15}
            max={1440}
            required
            defaultValue={item.duracao_minutos}
          />
        </label>
        <label>
          Local
          <input name="local" defaultValue={item.local} maxLength={180} />
        </label>
        <label className="resource-wide-field">
          Observações
          <textarea
            name="observacoes"
            defaultValue={item.observacoes}
            maxLength={1200}
            rows={3}
          />
        </label>
        <label className="resource-wide-field">
          Checklist padrão
          <textarea
            name="checklist"
            defaultValue={item.checklist_modelo.join("\n")}
            rows={5}
          />
        </label>
        <CustomFieldBuilder fields={fields} onChange={setFields} />
        <div className="resource-edit-actions">
          <button disabled={busy === `edit-template-${item.id}`}>
            Salvar nova versão
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy === `deactivate-template-${item.id}`}
            onClick={() => void onDeactivate()}
          >
            Excluir
          </button>
        </div>
        <small className="resource-version-note">
          Escalas antigas guardam uma cópia da versão que utilizaram.
        </small>
      </form>
    </details>
  );
}

function CustomFieldBuilder({
  fields,
  onChange,
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
}) {
  function addField() {
    const position = fields.length + 1;
    onChange([
      ...fields,
      {
        id: `campo-${Date.now()}-${position}`,
        label: `Campo ${position}`,
        type: "TEXTO",
        required: false,
        options: [],
      },
    ]);
  }
  function updateField(index: number, patch: Partial<CustomField>) {
    onChange(
      fields.map((field, position) =>
        position === index ? { ...field, ...patch } : field,
      ),
    );
  }
  return (
    <fieldset className="custom-field-builder resource-wide-field">
      <legend>Campos personalizados da escala</legend>
      <p>
        Acrescente texto, número, data, horário, seleção, confirmação ou
        observação longa.
      </p>
      {fields.map((field, index) => (
        <div className="custom-field-row" key={field.id}>
          <label>
            Nome do campo
            <input
              value={field.label}
              maxLength={80}
              onChange={(event) =>
                updateField(index, { label: event.target.value })
              }
            />
          </label>
          <label>
            Tipo
            <select
              value={field.type}
              onChange={(event) =>
                updateField(index, {
                  type: event.target.value as CustomField["type"],
                  options:
                    event.target.value === "SELECAO"
                      ? field.options.length
                        ? field.options
                        : ["Opção 1", "Opção 2"]
                      : [],
                })
              }
            >
              <option value="TEXTO">Texto</option>
              <option value="NUMERO">Número</option>
              <option value="DATA">Data</option>
              <option value="HORA">Horário</option>
              <option value="SELECAO">Seleção</option>
              <option value="CHECKBOX">Confirmação</option>
              <option value="TEXTO_LONGO">Texto longo</option>
            </select>
          </label>
          {field.type === "SELECAO" && (
            <label>
              Opções, separadas por vírgula
              <input
                value={field.options.join(", ")}
                onChange={(event) =>
                  updateField(index, {
                    options: event.target.value
                      .split(",")
                      .map((option) => option.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          )}
          <label className="custom-field-required">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) =>
                updateField(index, { required: event.target.checked })
              }
            />
            Obrigatório
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              onChange(fields.filter((_, position) => position !== index))
            }
          >
            Remover
          </button>
        </div>
      ))}
      <button type="button" className="secondary-button" onClick={addField}>
        + Adicionar campo
      </button>
    </fieldset>
  );
}

function CustomFieldInput({
  field,
  value,
}: {
  field: CustomField;
  value?: string | number | boolean;
}) {
  const name = `custom-${field.id}`;
  if (field.type === "CHECKBOX") {
    return (
      <label className="composer-share custom-schedule-field">
        <input
          name={name}
          type="checkbox"
          required={field.required}
          defaultChecked={value === true}
        />
        <span>
          {field.label}
          {field.required ? " *" : ""}
        </span>
      </label>
    );
  }
  if (field.type === "SELECAO") {
    return (
      <label className="custom-schedule-field">
        {field.label}
        {field.required ? "*" : ""}
        <select
          name={name}
          required={field.required}
          defaultValue={String(value ?? "")}
        >
          <option value="">Selecione</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "TEXTO_LONGO") {
    return (
      <label className="schedule-wide-field custom-schedule-field">
        {field.label}
        {field.required ? "*" : ""}
        <textarea
          name={name}
          rows={3}
          required={field.required}
          defaultValue={String(value ?? "")}
        />
      </label>
    );
  }
  const type =
    field.type === "NUMERO"
      ? "number"
      : field.type === "DATA"
        ? "date"
        : field.type === "HORA"
          ? "time"
          : "text";
  return (
    <label className="custom-schedule-field">
      {field.label}
      {field.required ? "*" : ""}
      <input
        name={name}
        type={type}
        required={field.required}
        defaultValue={String(value ?? "")}
      />
    </label>
  );
}

function ParticipantsPanel({
  users,
  canInvite,
  busy,
  inviteUrl,
  onInvite,
}: {
  users: AvailableUser[];
  canInvite: boolean;
  busy: string | null;
  inviteUrl: string;
  onInvite: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const roles = ["MEMBRO", "LIDER", "PASTOR", "ADMIN_COMUNIDADE"];
  return (
    <section className="participants-panel">
      <div className="participant-metrics">
        {roles.map((role) => (
          <article key={role}>
            <span>{roleLabel(role)}</span>
            <strong>{users.filter((user) => user.papel === role).length}</strong>
          </article>
        ))}
      </div>
      {canInvite && (
        <form className="participant-invite" onSubmit={onInvite}>
          <div>
            <strong>Convidar participante</strong>
            <span>
              O acesso só será liberado depois que a pessoa aceitar o convite.
            </span>
          </div>
          <input
            name="email"
            type="email"
            required
            placeholder="email@exemplo.com"
            aria-label="E-mail da pessoa convidada"
          />
          <button disabled={busy === "member-invite"}>
            {busy === "member-invite" ? "Criando…" : "Gerar convite"}
          </button>
        </form>
      )}
      {inviteUrl && (
        <div className="invite-result" role="status">
          <span>Link individual pronto para copiar:</span>
          <input readOnly value={inviteUrl} aria-label="Link de convite" />
        </div>
      )}
      <div className="participant-list">
        {users.map((user) => (
          <article key={user.id}>
            <span className="team-avatar">{initials(user.nome)}</span>
            <div>
              <strong>{user.nome}</strong>
              <small>Conta ativa nesta comunidade</small>
            </div>
            <em className={`participant-role role-${user.papel.toLowerCase()}`}>
              {roleLabel(user.papel)}
            </em>
          </article>
        ))}
      </div>
    </section>
  );
}

function ScheduleHistory({ schedules }: { schedules: Schedule[] }) {
  if (!schedules.length) {
    return (
      <div className="pilot-empty-state">
        <strong>Nenhuma escala cancelada</strong>
        <p>Quando houver cancelamento, o registro permanecerá aqui.</p>
      </div>
    );
  }
  return (
    <div className="schedule-history">
      {schedules.map((schedule) => (
        <article key={schedule.id}>
          <span className="status-pill status-cancelada">Cancelada</span>
          <strong>{schedule.titulo}</strong>
          <small>
            {schedule.ministerio_nome} · {formatScheduleDate(schedule.inicia_em)}
          </small>
          <span>{schedule.designacoes.length} pessoas preservadas</span>
        </article>
      ))}
    </div>
  );
}

function MinistryCard({
  ministry,
  availableUsers,
  functions,
  globalManager,
  busy,
  onUpdate,
  onAddVolunteer,
  onAvailability,
  onDeactivate,
  onRemoveVolunteer,
}: {
  ministry: Ministry;
  availableUsers: AvailableUser[];
  functions: MinistryFunction[];
  globalManager: boolean;
  busy: string | null;
  onUpdate: (
    event: FormEvent<HTMLFormElement>,
    ministry: Ministry,
  ) => Promise<void>;
  onAddVolunteer: (
    event: FormEvent<HTMLFormElement>,
    ministry: Ministry,
  ) => Promise<void>;
  onAvailability: (
    event: FormEvent<HTMLFormElement>,
    ministry: Ministry,
  ) => Promise<void>;
  onDeactivate: () => Promise<boolean>;
  onRemoveVolunteer: (volunteer: Volunteer) => Promise<boolean>;
}) {
  const mine = ministry.voluntarios.find((volunteer) => volunteer.is_mine);
  const leaders = ministry.voluntarios.filter(
    (volunteer) => volunteer.papel === "LIDER",
  );
  return (
    <article
      className={`ministry-card status-${ministry.status.toLowerCase()}`}
    >
      <header>
        <div className="ministry-icon" aria-hidden="true">
          {ministry.nome.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <span className="status-pill">
            {CATEGORY_LABELS[ministry.categoria] || "Outro"}
          </span>
          <span
            className={`status-pill status-${ministry.status.toLowerCase()}`}
          >
            {ministry.status === "ATIVO" ? "Ativo" : "Inativo"}
          </span>
        </div>
      </header>
      <h2>{ministry.nome}</h2>
      <p>{ministry.descricao || "Sem descrição adicional."}</p>
      {(ministry.youtube_url || ministry.spotify_url) && (
        <div className="ministry-media-links">
          {ministry.youtube_url ? (
            <a
              href={ministry.youtube_url}
              target="_blank"
              rel="noreferrer noopener"
            >
              ▶ YouTube
            </a>
          ) : null}
          {ministry.spotify_url ? (
            <a
              href={ministry.spotify_url}
              target="_blank"
              rel="noreferrer noopener"
            >
              ◉ Spotify
            </a>
          ) : null}
        </div>
      )}
      <div className="ministry-summary">
        <span>
          <strong>{ministry.voluntarios.length}</strong> pessoas
        </span>
        <span>
          <strong>{leaders.length}</strong> líderes
        </span>
      </div>
      <div className="ministry-team">
        <strong>Equipe ativa</strong>
        {ministry.voluntarios.length ? (
          ministry.voluntarios.map((volunteer) => (
            <div key={volunteer.id}>
              <span className="team-avatar">
                {initials(volunteer.nome)}
              </span>
              <span>
                <b>{volunteer.nome}</b>
                <small>
                  {volunteer.funcao} ·{" "}
                  {PERIOD_LABELS[volunteer.periodo_preferido] || "Flexível"}
                </small>
                <small>
                  {volunteer.dias_disponiveis.length
                    ? volunteer.dias_disponiveis
                        .map((day) => DAY_LABELS[day] || day)
                        .join(", ")
                    : "Disponibilidade não informada"}
                </small>
              </span>
              <em>{volunteer.papel === "LIDER" ? "Líder" : "Voluntário"}</em>
              {ministry.can_manage &&
              (volunteer.papel !== "LIDER" || globalManager) ? (
                <button
                  disabled={busy === `remove-volunteer-${volunteer.id}`}
                  onClick={() => void onRemoveVolunteer(volunteer)}
                >
                  Excluir da equipe
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <small>Nenhuma pessoa adicionada.</small>
        )}
      </div>
      {mine ? (
        <details className="ministry-detail">
          <summary>Minha disponibilidade</summary>
          <form
            className="pilot-form availability-form"
            onSubmit={(event) => onAvailability(event, ministry)}
          >
            <DaySelector selected={mine.dias_disponiveis} />
            <label>
              Período preferido
              <select
                name="periodoPreferido"
                defaultValue={mine.periodo_preferido}
              >
                {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy === `availability-${ministry.id}`}>
              Salvar disponibilidade
            </button>
          </form>
        </details>
      ) : null}
      {ministry.can_manage ? (
        <>
          <details className="ministry-detail">
            <summary>Adicionar pessoa</summary>
            <form
              className="pilot-form volunteer-form"
              onSubmit={(event) => onAddVolunteer(event, ministry)}
            >
              <label>
                Pessoa da comunidade*
                <select name="usuarioId" required defaultValue="">
                  <option value="" disabled>
                    Selecione
                  </option>
                  {availableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nome} · {user.papel}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Função*
                <input
                  name="funcao"
                  required
                  maxLength={100}
                  list={`ministry-functions-${ministry.id}`}
                />
                <datalist id={`ministry-functions-${ministry.id}`}>
                  {functions.map((item) => (
                    <option key={item.id} value={item.nome} />
                  ))}
                </datalist>
              </label>
              <label>
                Papel
                <select name="papel" defaultValue="VOLUNTARIO">
                  <option value="VOLUNTARIO">Voluntário</option>
                  {globalManager ? <option value="LIDER">Líder</option> : null}
                </select>
              </label>
              <label>
                Período
                <select name="periodoPreferido" defaultValue="FLEXIVEL">
                  {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <DaySelector selected={[]} />
              <button disabled={busy === `volunteer-${ministry.id}`}>
                Adicionar à equipe
              </button>
            </form>
          </details>
          <details className="ministry-detail">
            <summary>Editar ministério</summary>
            <form
              className="pilot-form ministry-edit-form"
              onSubmit={(event) => onUpdate(event, ministry)}
            >
              <label>
                Nome*
                <input
                  name="nome"
                  required
                  maxLength={120}
                  defaultValue={ministry.nome}
                />
              </label>
              <label>
                Categoria
                <select name="categoria" defaultValue={ministry.categoria}>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Descrição
                <textarea
                  name="descricao"
                  rows={3}
                  maxLength={1200}
                  defaultValue={ministry.descricao}
                />
              </label>
              <label>
                YouTube oficial
                <input
                  name="youtubeUrl"
                  type="url"
                  inputMode="url"
                  defaultValue={ministry.youtube_url}
                  placeholder="https://youtube.com/..."
                />
              </label>
              <label>
                Spotify oficial
                <input
                  name="spotifyUrl"
                  type="url"
                  inputMode="url"
                  defaultValue={ministry.spotify_url}
                  placeholder="https://open.spotify.com/..."
                />
              </label>
              <button disabled={busy === `ministry-${ministry.id}`}>
                Salvar alterações
              </button>
            </form>
          </details>
          {globalManager && ministry.status === "ATIVO" ? (
            <button
              className="ministry-deactivate"
              disabled={busy === `ministry-${ministry.id}`}
              onClick={() => {
                if (
                  window.confirm(
                    `Desativar o ministério “${ministry.nome}” sem apagar o histórico?`,
                  )
                ) {
                  void onDeactivate();
                }
              }}
            >
              Desativar ministério
            </button>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

function DaySelector({ selected }: { selected: string[] }) {
  return (
    <fieldset className="day-selector">
      <legend>Dias disponíveis</legend>
      {Object.entries(DAY_LABELS).map(([value, label]) => (
        <label key={value}>
          <input
            type="checkbox"
            name="diasDisponiveis"
            value={value}
            defaultChecked={selected.includes(value)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function localDateToIso(value: string) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatScheduleRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
  return `${formatter.format(new Date(start))} até ${formatter.format(
    new Date(end),
  )}`;
}

function scheduleStatus(status: Schedule["status"]) {
  if (status === "PUBLICADA") return "Publicada";
  if (status === "AGUARDANDO_CHECKLIST") return "Checklist liberado";
  if (status === "ENCERRADA") return "Encerrada";
  if (status === "CANCELADA") return "Cancelada";
  return "Rascunho";
}

function assignmentStatus(status: Assignment["status"]) {
  if (status === "CONFIRMADA") return "Confirmada";
  if (status === "INDISPONIVEL") return "Indisponível";
  return "Pendente";
}

function checklistStatus(status: MinistryChecklistItem["status"]) {
  if (status === "FEITO") return "Concluído";
  if (status === "NAO_FEITO") return "Não realizado";
  return "Pendente";
}

function ministryName(ministries: Ministry[], ministryId: number) {
  return (
    ministries.find((ministry) => ministry.id === ministryId)?.nome ||
    "Ministério"
  );
}

function roleLabel(role: string) {
  if (role === "ADMIN_COMUNIDADE") return "Administradores";
  if (role === "SUPERADMIN") return "Superadministradores";
  if (role === "PASTOR") return "Pastores";
  if (role === "LIDER") return "Líderes";
  return "Membros";
}
