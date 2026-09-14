"use client";

import {
  type CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MinistriesWorkspace from "./MinistriesWorkspace";
import NativeImageUpload from "./NativeImageUpload";
import VerifiedOwnerName from "./VerifiedOwnerName";
import {
  groupScheduleResources,
  mergeScheduleResourceLinks,
} from "../lib/schedule-resources";
import {
  addCalendarEventForDevice,
  downloadFileForDevice,
  shareToWhatsAppApp,
} from "../lib/androidNativeBridge";

type Volunteer = {
  id: number;
  ministerio_id: number;
  usuario_id: number;
  nome: string;
  funcao: string;
  papel: "VOLUNTARIO" | "LIDER";
  dias_disponiveis: string[];
  periodo_preferido: string;
  limite_escalas: number;
  escalas_ativas: number;
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
  banner_url: string;
  responsavel_usuario_id: number | null;
  responsavel_nome: string | null;
  criado_em: string;
  can_manage: number;
  can_archive?: number;
  can_delete: number;
  fio_habilitado: number;
  fio_etapas: string[];
  voluntarios: Volunteer[];
  categorias_visitantes: Array<{
    id: number;
    nome: string;
    icone: string;
    cor: string;
    total_visitantes: number;
  }>;
};
type AvailableUser = { id: number; nome: string; papel: string };
type Assignment = {
  id: number;
  voluntario_id: number;
  usuario_id: number;
  equipe_id: number | null;
  equipe_nome: string | null;
  equipe_cor: string | null;
  nome: string;
  funcao: string;
  status: "PENDENTE" | "CONFIRMADA" | "INDISPONIVEL" | "SUBSTITUICAO_SOLICITADA" | "AUSENTE";
  is_mine: number;
  telefone?: string;
  foto_perfil?: string | null;
  owner_verified?: number;
};
type ScheduleTeam = {
  equipe_id: number;
  equipe_nome: string;
  equipe_cor: string;
  funcao: string;
};
type SelectedScheduleTeam = {
  equipeId: number;
  funcao: string;
};
type SelectedScheduleAssignment = {
  voluntarioId: number;
  equipeId: number | null;
};
type ReplacementCandidate = {
  voluntarioId: number;
  usuarioId: number;
  nome: string;
  funcao: string;
  fotoPerfil: string | null;
};
type SecretaryLink = {
  id: string;
  tipo: "YOUTUBE" | "SPOTIFY" | "CIFRA_CLUB" | "GOOGLE_DRIVE" | "PERSONALIZADO";
  titulo: string;
  url: string;
};
type ReusableSecretaryLink = Omit<SecretaryLink, "id"> & {
  id: number;
  ministerio_id: number;
  item_id?: number | null;
};
type SecretaryLibraryItem = {
  id: number;
  ministerio_id: number;
  titulo: string;
  links: ReusableSecretaryLink[];
};
function blankSecretaryLink(): SecretaryLink {
  return {
    id: "draft-resource-1",
    tipo: "YOUTUBE",
    titulo: "",
    url: "",
  };
}
/** Etapa do Fio do Ministério dentro de uma escala (ver ministry-validation.ts). */
type FioStep = {
  id: string;
  titulo: string;
  feito: boolean;
  feitoEm: string | null;
  feitoPor: number | null;
};
type Schedule = {
  id: number;
  ministerio_id: number;
  ministerio_nome: string;
  ministerio_categoria: string;
  equipe_id: number | null;
  equipe_nome: string | null;
  equipes: ScheduleTeam[];
  titulo: string;
  inicia_em: string;
  termina_em: string;
  local: string;
  status: "RASCUNHO" | "AGENDADA" | "PUBLICADA" | "AGUARDANDO_CHECKLIST" | "ENCERRADA" | "CANCELADA";
  publicar_em: string | null;
  observacoes: string;
  responsavel_usuario_id: number | null;
  responsavel_nome: string | null;
  repertorio: string[];
  links_recursos: SecretaryLink[];
  fio_etapas: FioStep[];
  criado_em: string;
  campos_respostas?: Record<string, unknown>;
  can_manage: number;
  can_delete: number;
  designacoes: Assignment[];
  substitution_candidates: ReplacementCandidate[];
};
type TemporaryAccessSummary = {
  id: number;
  designacaoId: number;
  beneficiarioUsuarioId: number;
  beneficiarioNome: string;
  beneficiarioFoto: string | null;
  funcao: string;
  recurso: "ESCALA_LEITURA" | "ESTACIONAMENTO";
  recursoLabel: string;
  iniciaEm: string;
  terminaEm: string;
  status: "PENDENTE" | "AGUARDANDO_HORARIO" | "ATIVO" | "EXPIRADO" | "CANCELADO" | "NEGADO";
};
type MinistryTeamMember = {
  equipe_id: number;
  voluntario_id: number;
  usuario_id: number;
  nome: string;
  funcao: string;
};
type MinistryTeam = {
  id: number;
  nome: string;
  descricao: string;
  cor: string;
  ordem: number;
  total_membros: number;
  membros: MinistryTeamMember[];
};
type ChecklistItem = {
  id: number;
  escala_id: number;
  designacao_id: number | null;
  tarefa: string;
  status: "PENDENTE" | "FEITO" | "NAO_FEITO";
  observacao: string;
  is_mine: number;
};
type ChecklistDraft = { id: string; tarefa: string; voluntarioId: string };
type Tab =
  | "painel"
  | "integrantes"
  | "equipes"
  | "escalas"
  | "checklist"
  | "relatorios"
  | "historico"
  | "configuracoes";

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
const DAYS = [
  ["DOM", "Dom"],
  ["SEG", "Seg"],
  ["TER", "Ter"],
  ["QUA", "Qua"],
  ["QUI", "Qui"],
  ["SEX", "Sex"],
  ["SAB", "Sáb"],
];

export default function SecretaryMinisterialWorkspace({
  permissions,
  communityName,
}: {
  permissions: string[];
  communityName: string;
}) {
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [expandedChecklistSchedules, setExpandedChecklistSchedules] = useState<number[]>([]);
  const [teams, setTeams] = useState<MinistryTeam[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [selectedMinistryId, setSelectedMinistryId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("painel");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selectedAssignments, setSelectedAssignments] = useState<
    SelectedScheduleAssignment[]
  >([]);
  const [selectedTeams, setSelectedTeams] = useState<SelectedScheduleTeam[]>([]);
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const [links, setLinks] = useState<SecretaryLink[]>([blankSecretaryLink()]);
  const [libraryItems, setLibraryItems] = useState<SecretaryLibraryItem[]>([]);
  const [selectedLibraryItemIds, setSelectedLibraryItemIds] = useState<number[]>([]);
  const [scheduleStartsAt, setScheduleStartsAt] = useState("");
  const [scheduleEndsAt, setScheduleEndsAt] = useState("");
  const [scheduleCreatorOpen, setScheduleCreatorOpen] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState<ChecklistDraft[]>([]);
  // O relógio vem de estado: lê-lo na renderização daria valores diferentes no
  // servidor e no cliente e quebraria a hidratação.
  const [agora, setAgora] = useState(0);
  const [escalasExpandidas, setEscalasExpandidas] = useState<number[]>([]);
  const [editandoFioId, setEditandoFioId] = useState<number | null>(null);
  const [shareSchedule, setShareSchedule] = useState<Schedule | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [refreshingLeaders, setRefreshingLeaders] = useState(false);
  const [teamColor, setTeamColor] = useState("#7157e8");
  const [replacementScheduleId, setReplacementScheduleId] = useState<number | null>(null);
  const [replacementVolunteerId, setReplacementVolunteerId] = useState(0);
  const [renderedAt] = useState(() => Date.now());
  const scheduleDetails = useRef<HTMLDetailsElement>(null);
  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [ministriesResponse, schedulesResponse, resourcesResponse] =
        await Promise.all([
          fetch("/api/pilot/ministerios", { cache: "no-store" }),
          fetch("/api/pilot/escalas", { cache: "no-store" }),
          fetch("/api/pilot/ministerios/recursos", { cache: "no-store" }),
        ]);
      const ministriesPayload = await readJson<{
        ministerios?: Ministry[];
        availableUsers?: AvailableUser[];
        canCreate?: boolean;
        error?: string;
      }>(ministriesResponse);
      const schedulesPayload = await readJson<{
        escalas?: Schedule[];
        error?: string;
      }>(schedulesResponse);
      const resourcesPayload = await readJson<{
        checklist?: ChecklistItem[];
        bibliotecaItens?: SecretaryLibraryItem[];
        error?: string;
      }>(resourcesResponse);
      if (!ministriesResponse.ok) throw new Error(ministriesPayload.error || "Não foi possível carregar os ministérios.");
      if (!schedulesResponse.ok) throw new Error(schedulesPayload.error || "Não foi possível carregar as escalas.");
      if (!resourcesResponse.ok) throw new Error(resourcesPayload.error || "Não foi possível carregar os checklists.");
      const nextMinistries = ministriesPayload.ministerios || [];
      setMinistries(nextMinistries);
      setAvailableUsers(ministriesPayload.availableUsers || []);
      setCanCreate(Boolean(ministriesPayload.canCreate));
      setSchedules(schedulesPayload.escalas || []);
      setChecklist(resourcesPayload.checklist || []);
      setLibraryItems(resourcesPayload.bibliotecaItens || []);
      setSelectedMinistryId((current) =>
        current && nextMinistries.some((item) => item.id === current)
          ? current
          : null,
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadTeams = useCallback(async (ministryId: number) => {
    const response = await fetch(
      `/api/pilot/ministerios/equipes?ministerioId=${ministryId}`,
      { cache: "no-store" },
    );
    const payload = await readJson<{ equipes?: MinistryTeam[]; error?: string }>(
      response,
    );
    if (!response.ok) {
      throw new Error(payload.error || "Não foi possível carregar as equipes.");
    }
    setTeams(payload.equipes || []);
  }, []);

  useEffect(() => {
    // Initial synchronization with the tenant-scoped APIs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedMinistryId) return;
    // Synchronize the selected ministry with its tenant-scoped teams endpoint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTeams(selectedMinistryId).catch((cause) =>
      setError((cause as Error).message),
    );
  }, [loadTeams, selectedMinistryId]);

  useEffect(() => {
    const syncMinistryFromUrl = () => {
      const rawId = new URL(window.location.href).searchParams.get("ministry");
      const ministryId = rawId ? Number(rawId) : null;
      const validMinistryId =
        ministryId && ministries.some((item) => item.id === ministryId)
          ? ministryId
          : null;
      setSelectedMinistryId(validMinistryId);
      if (rawId && !validMinistryId && ministries.length) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("ministry");
        window.history.replaceState(
          { ...window.history.state, ministryId: null },
          "",
          cleanUrl,
        );
      }
    };
    syncMinistryFromUrl();
    window.addEventListener("popstate", syncMinistryFromUrl);
    return () => window.removeEventListener("popstate", syncMinistryFromUrl);
  }, [ministries]);

  useEffect(() => {
    const openSchedule = () => {
      setSelectedMinistryId((current) =>
        current ??
        ministries.find((ministry) => Boolean(ministry.can_manage))?.id ??
        null,
      );
      setTab("escalas");
      setScheduleCreatorOpen(true);
      window.setTimeout(() => {
        scheduleDetails.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    };
    window.addEventListener("vinkulo:new-schedule", openSchedule);
    return () => window.removeEventListener("vinkulo:new-schedule", openSchedule);
  }, [ministries]);

  useEffect(() => {
    const acertar = () => setAgora(Date.now());
    const primeiro = window.setTimeout(acertar, 0);
    const relogio = window.setInterval(acertar, 600000);
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(relogio);
    };
  }, []);

  const selectedMinistry = useMemo(
    () => ministries.find((item) => item.id === selectedMinistryId) || null,
    [ministries, selectedMinistryId],
  );
  const ministrySchedules = useMemo(
    () => schedules.filter((item) => item.ministerio_id === selectedMinistryId),
    [schedules, selectedMinistryId],
  );
  const ministryScheduleIds = useMemo(
    () => new Set(ministrySchedules.map((item) => item.id)),
    [ministrySchedules],
  );
  // Escala encerrada não precisa ocupar a tela inteira para sempre: o que já
  // passou (ou foi encerrado/cancelado) vira uma linha recolhida, e a lista
  // para de crescer sem necessidade. Antes do relógio acertar, nada é dado
  // como passado — senão a primeira renderização recolheria escalas de hoje.
  const escalasSeparadas = useMemo(() => {
    const proximas: Schedule[] = [];
    const encerradas: Schedule[] = [];
    for (const schedule of ministrySchedules) {
      const passou =
        agora > 0 &&
        (["ENCERRADA", "CANCELADA", "ARQUIVADA"].includes(schedule.status) ||
          Date.parse(schedule.termina_em) < agora);
      if (passou) encerradas.push(schedule);
      else proximas.push(schedule);
    }
    return { proximas, encerradas };
  }, [ministrySchedules, agora]);
  // O Fio só aparece nas escalas de ministérios que o ligaram — e continua
  // aparecendo numa escala que já tem etapas, para o ministério não perder de
  // vista o que ficou marcado se alguém desligar a opção depois.
  const ministeriosComFio = useMemo(
    () => new Set(ministries.filter((item) => Boolean(item.fio_habilitado)).map((item) => item.id)),
    [ministries],
  );
  const ministryChecklist = useMemo(
    () => checklist.filter((item) => ministryScheduleIds.has(item.escala_id)),
    [checklist, ministryScheduleIds],
  );
  const ownVolunteer = selectedMinistry?.voluntarios.find((item) => Boolean(item.is_mine));
  const selectedTeamEntries = useMemo(
    () => selectedTeams.flatMap((selection) => {
      const team = teams.find((item) => item.id === selection.equipeId);
      return team ? [{ team, funcao: selection.funcao }] : [];
    }),
    [selectedTeams, teams],
  );
  const scheduleCandidates = useMemo(
    () => selectedTeamEntries.length
      ? selectedMinistry?.voluntarios.filter((volunteer) =>
          selectedTeamEntries.some(({ team }) =>
            team.membros.some((member) => member.voluntario_id === volunteer.id),
          ),
        ) || []
      : selectedMinistry?.voluntarios || [],
    [selectedMinistry, selectedTeamEntries],
  );
  const candidateAvailability = useMemo(() => {
    const start = Date.parse(scheduleStartsAt);
    const end = Date.parse(scheduleEndsAt);
    const hasValidWindow = Number.isFinite(start) && Number.isFinite(end) && end > start;
    const selectedDate = hasValidWindow ? new Date(scheduleStartsAt) : null;
    const dayCode = selectedDate ? DAYS[selectedDate.getDay()]?.[0] : "";
    const hour = selectedDate?.getHours() ?? -1;
    const period = hour < 0 ? "" : hour < 12 ? "MANHA" : hour < 18 ? "TARDE" : "NOITE";
    return scheduleCandidates
      .map((volunteer) => {
        const capacityReached = volunteer.escalas_ativas >= volunteer.limite_escalas;
        const conflict = hasValidWindow && ministrySchedules.some((schedule) =>
          schedule.status !== "CANCELADA" &&
          schedule.status !== "ENCERRADA" &&
          Date.parse(schedule.inicia_em) < end &&
          Date.parse(schedule.termina_em) > start &&
          schedule.designacoes.some((assignment) => assignment.usuario_id === volunteer.usuario_id),
        );
        const informed = volunteer.dias_disponiveis.length > 0;
        const dayMatches = informed && volunteer.dias_disponiveis.includes(dayCode);
        const periodMatches = volunteer.periodo_preferido === "FLEXIVEL" || volunteer.periodo_preferido === period;
        const suggested = hasValidWindow && dayMatches && periodMatches && !capacityReached && !conflict;
        const status = !hasValidWindow
          ? "Informe início e término"
          : capacityReached
            ? "Limite de escalas atingido"
            : conflict
              ? "Conflito de horário"
              : !informed
                ? "Disponibilidade não informada"
                : !dayMatches
                  ? "Outro dia informado"
                  : !periodMatches
                    ? "Período diferente"
                    : "Sugerido para esta data";
        return { volunteer, capacityReached, conflict, suggested, status };
      })
      .sort((left, right) => Number(right.suggested) - Number(left.suggested) || left.volunteer.nome.localeCompare(right.volunteer.nome, "pt-BR"));
  }, [ministrySchedules, scheduleCandidates, scheduleEndsAt, scheduleStartsAt]);
  const ministryLibrary = useMemo(
    () => libraryItems.filter((item) => item.ministerio_id === selectedMinistryId),
    [libraryItems, selectedMinistryId],
  );
  const selectedLibraryItems = useMemo(
    () => ministryLibrary.filter((item) => selectedLibraryItemIds.includes(item.id)),
    [ministryLibrary, selectedLibraryItemIds],
  );
  const previousChecklistTemplate = useMemo(() => {
    const schedulesByDate = [...ministrySchedules].sort(
      (left, right) => Date.parse(right.inicia_em) - Date.parse(left.inicia_em),
    );
    for (const schedule of schedulesByDate) {
      const items = ministryChecklist.filter((item) => item.escala_id === schedule.id);
      if (!items.length) continue;
      return items.map((item) => {
        const assignment = schedule.designacoes.find(
          (candidate) => candidate.id === item.designacao_id,
        );
        return {
          tarefa: item.tarefa,
          voluntarioId: assignment ? String(assignment.voluntario_id) : "",
        };
      });
    }
    return [];
  }, [ministryChecklist, ministrySchedules]);
  const canManage = Boolean(selectedMinistry?.can_manage);
  const upcoming = ministrySchedules.filter(
    (item) => item.status !== "CANCELADA" && Date.parse(item.termina_em) >= renderedAt,
  );
  const pendingChecklist = ministryChecklist.filter((item) => item.status === "PENDENTE");
  const ownUpcomingSchedules = schedules
    .filter(
      (item) =>
        item.status === "PUBLICADA" &&
        Date.parse(item.termina_em) >= renderedAt &&
        item.designacoes.some((assignment) => Boolean(assignment.is_mine)),
    )
    .slice(0, 5);

  function openMinistry(ministry: Ministry) {
    const url = new URL(window.location.href);
    url.searchParams.set("ministry", String(ministry.id));
    window.history.pushState(
      { ...window.history.state, ministryId: ministry.id },
      "",
      url,
    );
    setSelectedMinistryId(ministry.id);
    setExpandedTeamId(null);
    setLinks([blankSecretaryLink()]);
    setSelectedLibraryItemIds([]);
    setScheduleCreatorOpen(false);
    setTab(ministry.can_manage ? "painel" : "escalas");
    setError("");
    setFeedback("");
  }

  function closeMinistry() {
    const url = new URL(window.location.href);
    url.searchParams.delete("ministry");
    window.history.replaceState(
      { ...window.history.state, ministryId: null },
      "",
      url,
    );
    setSelectedMinistryId(null);
    setLinks([blankSecretaryLink()]);
    setSelectedLibraryItemIds([]);
    setTeams([]);
    setSelectedTeamId(null);
    setExpandedTeamId(null);
    setScheduleCreatorOpen(false);
    setTab("painel");
    setError("");
    setFeedback("");
  }

  async function createMinistry(
    event: FormEvent<HTMLFormElement>,
    fio: FioTemplateValue,
  ) {
    event.preventDefault();
    const created = await submit(
      "creating-ministry",
      "/api/pilot/ministerios",
      "POST",
      {
        ...formBody(event.currentTarget),
        fioHabilitado: fio.habilitado,
        fioEtapas: fio.habilitado ? fio.etapas : [],
      },
      "Ministério criado e pronto para receber integrantes.",
      event.currentTarget,
    );
    if (created) setCreateDialogOpen(false);
  }

  async function openCreateMinistryDialog() {
    setCreateDialogOpen(true);
    setRefreshingLeaders(true);
    try {
      await loadData(true);
    } finally {
      setRefreshingLeaders(false);
    }
  }

  async function addVolunteer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMinistry) return;
    await submit(
      "adding-volunteer",
      `/api/pilot/ministerios/${selectedMinistry.id}`,
      "PATCH",
      {
        acao: "ADICIONAR_VOLUNTARIO",
        ...formBody(event.currentTarget),
        diasDisponiveis: [],
        periodoPreferido: "FLEXIVEL",
      },
      "Integrante incluído no ministério.",
      event.currentTarget,
    );
  }

  async function updateAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMinistry) return;
    const data = new FormData(event.currentTarget);
    await submit(
      "availability",
      `/api/pilot/ministerios/${selectedMinistry.id}`,
      "PATCH",
      {
        acao: "ATUALIZAR_MINHA_DISPONIBILIDADE",
        diasDisponiveis: data.getAll("diasDisponiveis"),
        periodoPreferido: data.get("periodoPreferido"),
      },
      "Sua disponibilidade foi atualizada.",
    );
  }

  async function updateScheduleLimit(
    volunteer: Volunteer,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedMinistry) return;
    const data = new FormData(event.currentTarget);
    await submit(
      `capacity-${volunteer.id}`,
      `/api/pilot/ministerios/${selectedMinistry.id}`,
      "PATCH",
      {
        acao: "ATUALIZAR_LIMITE_ESCALAS",
        voluntarioId: volunteer.id,
        limiteEscalas: Number(data.get("limiteEscalas")),
      },
      `Limite de ${volunteer.nome} atualizado.`,
    );
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMinistry) return;
    const body = formBody(event.currentTarget);
    const assignments = selectedAssignments.flatMap((selection) => {
      const volunteer = scheduleCandidates.find(
        (item) => item.id === selection.voluntarioId,
      );
      return volunteer
        ? [{
            voluntarioId: volunteer.id,
            funcao: volunteer.funcao,
            equipeId: selection.equipeId,
          }]
        : [];
    });
    const title = String(body.titulo || "").trim();
    const startsAt = String(body.iniciaEm || "");
    const endsAt = String(body.terminaEm || "");
    const publishing = body.status === "PUBLICADA" || body.status === "AGENDADA";
    if (!title) {
      setError("Etapa 1 — informe o título da escala.");
      return;
    }
    if (!startsAt || !endsAt) {
      setError("Etapa 1 — informe o início e o término da escala.");
      return;
    }
    if (
      !Number.isFinite(Date.parse(startsAt)) ||
      !Number.isFinite(Date.parse(endsAt)) ||
      Date.parse(endsAt) <= Date.parse(startsAt)
    ) {
      setError("Etapa 1 — o término precisa ser posterior ao início.");
      return;
    }
    if (selectedTeamEntries.some(({ team }) => !team.membros.length)) {
      setError("Etapa 2 — uma das equipes selecionadas ainda não possui integrantes.");
      return;
    }
    if (publishing && !assignments.length) {
      setError("Etapa 2 — selecione pelo menos um integrante antes de publicar.");
      return;
    }
    if (publishing && !Number(body.responsavelUsuarioId)) {
      setError("Etapa 1 — escolha um responsável antes de publicar.");
      return;
    }
    const submittedAt = performance.timeOrigin + event.timeStamp;
    if (body.status === "AGENDADA" && (!body.publicarEm || Date.parse(String(body.publicarEm)) <= submittedAt)) {
      setError("Etapa 5 — escolha um horário futuro para publicar a escala.");
      return;
    }
    const typedRepertoire = String(body.repertorio || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const repertorio = [...new Set([
      ...typedRepertoire,
      ...selectedLibraryItems.map((item) => item.titulo.trim()),
    ])];
    const selectedLinks = selectedLibraryItems.flatMap((item) =>
      item.links.map((link) => ({
        id: String(link.id),
        tipo: link.tipo,
        titulo: item.titulo,
        url: link.url,
      })),
    );
    const scheduleLinks = mergeScheduleResourceLinks(
      selectedLinks,
      links.filter((item) => item.titulo.trim() && item.url.trim()),
    ) as SecretaryLink[];
    const created = await submit(
      "creating-schedule",
      "/api/pilot/escalas",
      "POST",
      {
        ...body,
        ministerioId: selectedMinistry.id,
        equipes: selectedTeams,
        designacoes: assignments,
        repertorio,
        links: scheduleLinks,
        checklist: checklistDraft
          .filter((item) => item.tarefa.trim())
          .map((item) => ({
            tarefa: item.tarefa,
            voluntarioId: item.voluntarioId ? Number(item.voluntarioId) : null,
          })),
      },
      body.status === "PUBLICADA"
        ? "Escala publicada e integrantes notificados."
        : body.status === "AGENDADA"
          ? "Escala agendada. O cronômetro já está ativo."
          : "Rascunho da escala salvo.",
      event.currentTarget,
    );
    if (created) {
      setSelectedAssignments([]);
      setSelectedTeams([]);
      setLinks([blankSecretaryLink()]);
      setSelectedLibraryItemIds([]);
      setChecklistDraft([]);
      setScheduleStartsAt("");
      setScheduleEndsAt("");
      setScheduleCreatorOpen(false);
    }
  }

  // Marcar uma etapa do fio. Vale para quem lidera e para quem está escalado —
  // a rota decide; aqui só mandamos a intenção.
  async function toggleFioStep(schedule: Schedule, step: FioStep) {
    await submit(
      `fio-${schedule.id}-${step.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      { acao: "FIO_ETAPA", etapaId: step.id, feito: !step.feito },
      step.feito ? "Etapa reaberta no fio." : "Etapa concluída no fio.",
    );
  }

  // Cada escala pode variar as próprias etapas: o modelo do ministério é só o
  // ponto de partida. O que já estava marcado continua marcado.
  async function saveFioSteps(schedule: Schedule, titulos: string[]) {
    const anteriores = new Map(schedule.fio_etapas.map((step) => [step.titulo, step]));
    const etapas = titulos.map((titulo, index) => {
      const anterior = anteriores.get(titulo);
      return {
        id: anterior?.id || `etapa-${index + 1}-${Date.now().toString(36)}`,
        titulo,
        feito: anterior?.feito ?? false,
        feitoEm: anterior?.feitoEm ?? null,
        feitoPor: anterior?.feitoPor ?? null,
      };
    });
    const salvo = await submit(
      `fio-etapas-${schedule.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      { acao: "FIO_ETAPAS_DEFINIR", fioEtapas: etapas },
      "Etapas do fio atualizadas nesta escala.",
    );
    if (salvo) setEditandoFioId(null);
  }

  async function updateSchedule(
    schedule: Schedule,
    event: FormEvent<HTMLFormElement>,
    selectedScheduleTeams: SelectedScheduleTeam[],
  ) {
    event.preventDefault();
    const body = formBody(event.currentTarget);
    const repertorio = String(body.repertorio || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const updated = await submit(
      `editing-schedule-${schedule.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      {
        acao: "ATUALIZAR",
        ministerioId: schedule.ministerio_id,
        equipes: selectedScheduleTeams,
        titulo: body.titulo,
        iniciaEm: body.iniciaEm,
        terminaEm: body.terminaEm,
        local: body.local,
        status: schedule.status,
        publicarEm: schedule.publicar_em,
        observacoes: body.observacoes,
        responsavelUsuarioId: Number(body.responsavelUsuarioId) || null,
        repertorio,
        links: schedule.links_recursos,
        designacoes: [],
        checklist: [],
        camposRespostas: schedule.campos_respostas || {},
      },
      "Escala atualizada com segurança.",
    );
    if (updated) setEditingSchedule(null);
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMinistry) return;
    const form = event.currentTarget;
    const created = await submit(
      "creating-team",
      "/api/pilot/ministerios/equipes",
      "POST",
      { ...formBody(form), cor: teamColor, ministerioId: selectedMinistry.id },
      "Equipe criada dentro deste ministério.",
      form,
    );
    if (created) {
      setTeamColor("#7157e8");
      await loadTeams(selectedMinistry.id);
    }
  }

  async function saveTeamMembers(team: MinistryTeam, volunteerIds: number[]) {
    if (!selectedMinistry) return;
    const saved = await submit(
      `team-members-${team.id}`,
      `/api/pilot/ministerios/equipes/${team.id}`,
      "PATCH",
      { acao: "DEFINIR_MEMBROS", voluntarioIds: volunteerIds },
      `Integrantes da equipe “${team.nome}” atualizados.`,
    );
    if (saved) await loadTeams(selectedMinistry.id);
  }

  async function deleteTeam(team: MinistryTeam) {
    if (!selectedMinistry) return;
    if (!window.confirm(`Excluir a equipe “${team.nome}”?`)) return;
    setBusy(`delete-team-${team.id}`);
    setError("");
    try {
      const response = await fetch(`/api/pilot/ministerios/equipes/${team.id}`, {
        method: "DELETE",
      });
      const payload = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir a equipe.");
      setFeedback("Equipe removida com segurança.");
      setSelectedTeams((current) =>
        current.filter((selection) => selection.equipeId !== team.id),
      );
      setSelectedAssignments((current) =>
        current.filter((assignment) => assignment.equipeId !== team.id),
      );
      await loadTeams(selectedMinistry.id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function updateChecklist(item: ChecklistItem, status: "FEITO" | "NAO_FEITO" | "PENDENTE") {
    const previous = item.status;
    setChecklist((current) => current.map((entry) => entry.id === item.id ? { ...entry, status } : entry));
    setBusy(`checklist-${item.id}`);
    setError("");
    try {
      const response = await fetch("/api/pilot/ministerios/recursos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "ATUALIZAR_CHECKLIST", itemId: item.id, status, observacao: item.observacao || "" }),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar o checklist.");
      setFeedback(status === "FEITO" ? "Responsabilidade concluída." : "Status do checklist atualizado.");
    } catch (cause) {
      setChecklist((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: previous } : entry));
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function respondToSchedule(
    schedule: Schedule,
    status: "CONFIRMADA" | "INDISPONIVEL",
    substitutoVoluntarioId?: number,
  ) {
    const saved = await submit(
      `response-${schedule.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      { acao: "RESPONDER", status, substitutoVoluntarioId },
      status === "CONFIRMADA"
        ? "Participação confirmada."
        : "Indisponibilidade registrada; a pessoa indicada recebeu a escala.",
    );
    if (saved) {
      setReplacementScheduleId(null);
      setReplacementVolunteerId(0);
      await loadData(true);
    }
  }

  async function setAssignmentStatus(
    schedule: Schedule,
    assignment: Assignment,
    status: Assignment["status"],
  ) {
    await submit(
      `assignment-${assignment.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      {
        acao: "DEFINIR_STATUS_DESIGNACAO",
        designacaoId: assignment.id,
        status,
      },
      `Situação de ${assignment.nome} atualizada para ${assignmentStatusLabel(status)}.`,
    );
  }

  async function addReplacement(
    schedule: Schedule,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = formBody(form);
    await submit(
      `replacement-${schedule.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      {
        acao: "ADICIONAR_DESIGNACAO",
        voluntarioId: Number(body.voluntarioId),
        funcao: body.funcao,
      },
      "Substituto adicionado com confirmação pendente.",
      form,
    );
  }

  async function deleteSchedule(schedule: Schedule) {
    if (
      !window.confirm(
        `Arquivar a escala “${schedule.titulo}”? Ela sairá das telas, mas o histórico será preservado.`,
      )
    ) return;
    await submit(
      `delete-${schedule.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      { acao: "EXCLUIR" },
      "Escala arquivada com histórico preservado.",
    );
  }

  async function publishSchedule(schedule: Schedule) {
    if (
      !window.confirm(
        `Publicar a escala “${schedule.titulo}” e notificar os integrantes agora?`,
      )
    ) return;
    await submit(
      `publish-${schedule.id}`,
      `/api/pilot/escalas/${schedule.id}`,
      "PATCH",
      { acao: "PUBLICAR" },
      "Escala publicada e integrantes notificados.",
    );
  }

  async function downloadSchedulePdf(schedule: Schedule) {
    setBusy(`pdf-${schedule.id}`);
    setError("");
    try {
      await downloadFileForDevice(
        `/api/pilot/escalas/${schedule.id}/pdf?download=1`,
        `escala-${schedule.titulo}.pdf`,
      );
      setFeedback("Download do PDF iniciado.");
    } catch (cause) {
      setError((cause as Error).message || "Não foi possível abrir o PDF.");
    } finally {
      setBusy("");
    }
  }

  function addScheduleToCalendar(schedule: Schedule) {
    setError("");
    try {
      addCalendarEventForDevice({
        title: schedule.titulo,
        startsAt: schedule.inicia_em,
        endsAt: schedule.termina_em,
        location: schedule.local,
        description: [
          `Ministério: ${schedule.ministerio_nome}`,
          `Responsável: ${schedule.responsavel_nome || "Não definido"}`,
          schedule.observacoes,
        ].filter(Boolean).join("\n"),
      });
      setFeedback("Escolha o seu calendário e confirme o evento para concluir a sincronização.");
    } catch (cause) {
      setError((cause as Error).message || "Não foi possível abrir o calendário.");
    }
  }

  async function archiveDiaconia() {
    if (!selectedMinistry) return;
    if (
      !window.confirm(
        `Arquivar a Diaconia “${selectedMinistry.nome}”? Escalas e vínculos sairão das telas, com históricos preservados.`,
      )
    ) return;
    const completed = await submit(
      `archive-ministry-${selectedMinistry.id}`,
      `/api/pilot/ministerios/${selectedMinistry.id}`,
      "PATCH",
      { acao: "ARQUIVAR_DIACONIA" },
      "Diaconia arquivada com históricos preservados.",
    );
    if (completed) {
      closeMinistry();
    }
  }

  async function deleteMinistry(ministry: Ministry) {
    if (
      !window.confirm(
        `Excluir definitivamente o ministério “${ministry.nome}” e seus dados vinculados? Esta ação será auditada.`,
      )
    ) return;
    setBusy(`delete-ministry-${ministry.id}`);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(`/api/pilot/ministerios/${ministry.id}`, {
        method: "DELETE",
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir.");
      closeMinistry();
      setFeedback("Ministério e dados vinculados excluídos com auditoria.");
      await loadData(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function updateMinistrySettings(
    event: FormEvent<HTMLFormElement>,
    bannerUrl: string,
    fio: FioTemplateValue,
  ) {
    event.preventDefault();
    if (!selectedMinistry) return;
    await submit(
      `settings-${selectedMinistry.id}`,
      `/api/pilot/ministerios/${selectedMinistry.id}`,
      "PATCH",
      {
        acao: "ATUALIZAR",
        ...formBody(event.currentTarget),
        bannerUrl,
        fioHabilitado: fio.habilitado,
        fioEtapas: fio.habilitado ? fio.etapas : [],
        status: selectedMinistry.status,
      },
      "Configurações do ministério atualizadas.",
    );
  }

  async function saveReusableLinks(itemTitle: string) {
    if (!selectedMinistry) return;
    const completeLinks = links.filter((item) => item.titulo.trim() && item.url.trim());
    if (!completeLinks.length) {
      setError("Inclua ao menos um título e um link HTTPS antes de salvar na biblioteca.");
      return;
    }
    const item = itemTitle.trim() || completeLinks[0].titulo.trim();
    if (!item) {
      setError("Dê um nome ao item da biblioteca (ex.: o nome da música).");
      return;
    }
    await submit(
      "saving-reusable-links",
      "/api/pilot/ministerios/recursos",
      "POST",
      {
        acao: "SALVAR_LINKS_REUTILIZAVEIS",
        ministerioId: selectedMinistry.id,
        item,
        links: completeLinks,
      },
      `“${item}” salvo na biblioteca deste ministério.`,
    );
  }

  async function renameLibraryItem(item: SecretaryLibraryItem, titulo: string) {
    const nextTitle = titulo.trim();
    if (!nextTitle || nextTitle === item.titulo) return;
    await submit(
      `renaming-library-item-${item.id}`,
      "/api/pilot/ministerios/recursos",
      "POST",
      { acao: "RENOMEAR_ITEM_BIBLIOTECA", id: item.id, titulo: nextTitle },
      "Nome do item atualizado.",
    );
  }

  async function removeLibraryItem(item: SecretaryLibraryItem) {
    if (!window.confirm(`Remover “${item.titulo}” e todos os seus links da biblioteca?`)) return;
    await submit(
      `removing-library-item-${item.id}`,
      "/api/pilot/ministerios/recursos",
      "POST",
      { acao: "EXCLUIR_ITEM_BIBLIOTECA", id: item.id },
      "Item removido da biblioteca.",
    );
  }

  async function removeReusableLink(link: ReusableSecretaryLink) {
    if (!window.confirm(`Remover “${link.titulo}” da biblioteca deste ministério?`)) return;
    await submit(
      `removing-reusable-link-${link.id}`,
      "/api/pilot/ministerios/recursos",
      "POST",
      { acao: "EXCLUIR_LINK_REUTILIZAVEL", id: link.id },
      "Link removido da biblioteca.",
    );
  }

  function useReusableLink(link: ReusableSecretaryLink) {
    setLinks((current) => current.some((item) => item.url === link.url)
      ? current
      : [...current, { id: crypto.randomUUID(), tipo: link.tipo, titulo: link.titulo, url: link.url }]);
  }

  function toggleLibraryItem(item: SecretaryLibraryItem) {
    const selected = selectedLibraryItemIds.includes(item.id);
    setSelectedLibraryItemIds((current) => selected
      ? current.filter((id) => id !== item.id)
      : [...current, item.id]);
    setError("");
    setFeedback(selected
      ? `“${item.titulo}” removida do repertório.`
      : `✓ “${item.titulo}” selecionada para o repertório com ${item.links.length} link(s).`);
  }

  async function submit(
    busyKey: string,
    url: string,
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    success: string,
    form?: HTMLFormElement,
  ) {
    setBusy(busyKey);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir.");
      form?.reset();
      setFeedback(success);
      await loadData(true);
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <section className="secretary-workspace" aria-busy="true">
        <div className="secretary-skeleton secretary-skeleton-hero" />
        <div className="secretary-summary-grid">
          {[1, 2, 3, 4].map((item) => <div className="secretary-skeleton" key={item} />)}
        </div>
      </section>
    );
  }

  if (!selectedMinistry) {
    return (
      <section
        key="ministerios-catalogo"
        className="secretary-workspace secretary-catalog"
        data-editor-key="ministerios-catalogo"
      >
        <header
          className="secretary-catalog-header"
          data-editor-key="ministerios-catalogo-cabecalho"
        >
          <div>
            <p className="pilot-kicker">MINISTÉRIOS · V4.7.3</p>
            <h1 data-editor-key="ministerios-catalogo-titulo">Ministérios</h1>
            <p>
              Acesse somente os ministérios relacionados à sua participação
              ou responsabilidade em {communityName}.
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              className="secretary-primary-action"
              onClick={() => void openCreateMinistryDialog()}
            >
              + Novo ministério
            </button>
          )}
        </header>

        {error && <div className="secretary-message error" role="alert">{error}</div>}
        {feedback && <div className="secretary-message success" role="status">{feedback}</div>}

        <div className="secretary-catalog-layout">
          <main className="secretary-ministry-catalog" aria-label="Ministérios disponíveis">
            {ministries.map((ministry) => (
              <article
                className="secretary-ministry-tile-wrap"
                data-editor-key={`ministerios-catalogo-item-${ministry.id}`}
                key={ministry.id}
              >
                <button
                  type="button"
                  className={`secretary-ministry-tile ${ministry.banner_url ? "has-banner" : ""}`}
                  onClick={() => openMinistry(ministry)}
                >
                  {ministry.banner_url && (
                    <span className="secretary-ministry-tile-media" aria-hidden="true">
                      <img src={ministry.banner_url} alt="" loading="lazy" />
                    </span>
                  )}
                  <span className="secretary-ministry-symbol" aria-hidden="true">
                    {ministrySymbol(ministry.categoria)}
                  </span>
                  <span className="secretary-ministry-copy">
                    <small>{CATEGORY_LABELS[ministry.categoria] || ministry.categoria}</small>
                    <strong>{ministry.nome}</strong>
                    <span>{ministry.descricao || "Ministério da comunidade"}</span>
                  </span>
                  <span className="secretary-ministry-meta">
                    <small>Liderança</small>
                    <strong>{ministry.responsavel_nome || "Não definida"}</strong>
                    {ministry.categorias_visitantes?.length > 0 && (
                      <small className="secretary-visitor-care">
                        Acompanha {ministry.categorias_visitantes.map((item) => item.nome).join(", ")}
                      </small>
                    )}
                    <span>{ministry.can_manage ? "Gerenciar →" : "Minhas escalas →"}</span>
                  </span>
                </button>
              </article>
            ))}
            {!ministries.length && (
              <div className="secretary-empty secretary-catalog-empty">
                <span aria-hidden="true">✣</span>
                <h2>Nenhum ministério disponível</h2>
                <p>
                  {canCreate
                    ? "Crie o primeiro ministério e defina seu líder responsável."
                    : "Você verá aqui os ministérios em que participa ou possui uma escala publicada."}
                </p>
              </div>
            )}
          </main>

          <aside className="secretary-my-schedules" aria-label="Minhas próximas escalas">
            <header>
              <div>
                <p className="pilot-kicker">RESUMO PESSOAL</p>
                <h2>Minhas próximas escalas</h2>
              </div>
              <span>{ownUpcomingSchedules.length}</span>
            </header>
            <div>
              {ownUpcomingSchedules.map((schedule) => (
                <button
                  type="button"
                  onClick={() => {
                    const ministry = ministries.find(
                      (item) => item.id === schedule.ministerio_id,
                    );
                    if (ministry) openMinistry(ministry);
                  }}
                  key={schedule.id}
                >
                  <time dateTime={schedule.inicia_em}>
                    <strong>{formatDay(schedule.inicia_em)}</strong>
                    <span>{formatMonth(schedule.inicia_em)}</span>
                  </time>
                  <span>
                    <strong>{schedule.titulo}</strong>
                    <small>{schedule.ministerio_nome}</small>
                    <small>{formatDate(schedule.inicia_em)}</small>
                  </span>
                </button>
              ))}
              {!ownUpcomingSchedules.length && (
                <div className="secretary-card-empty">
                  <strong>Nenhuma escala próxima</strong>
                  <p>Quando você for escalado, o resumo aparecerá aqui.</p>
                </div>
              )}
            </div>
          </aside>
        </div>

        {createDialogOpen && (
          <div
            className="secretary-dialog-backdrop"
            role="presentation"
            onMouseDown={() => setCreateDialogOpen(false)}
          >
            <section
              className="secretary-share-dialog secretary-create-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-ministry-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <p className="pilot-kicker">NOVO MINISTÉRIO</p>
                  <h2 id="create-ministry-title">Criar ministério</h2>
                </div>
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  ×
                </button>
              </header>
              <p>Defina o líder responsável. Ele administrará somente este ministério.</p>
              <MinistryForm
                users={availableUsers}
                loadingUsers={refreshingLeaders}
                busy={busy === "creating-ministry"}
                onSubmit={createMinistry}
              />
            </section>
          </div>
        )}
      </section>
    );
  }

  // O cartão da escala vive numa função para poder ser reaproveitado nas duas
  // listas: as próximas, sempre abertas, e uma encerrada que a pessoa expandiu.
  function renderScheduleCard(schedule: Schedule) {
    const knownTeamIds = new Set(schedule.equipes.map((team) => team.equipe_id));
    const assignmentGroups = [
      ...schedule.equipes.map((team) => ({
        key: String(team.equipe_id),
        team,
        assignments: schedule.designacoes.filter(
          (assignment) => assignment.equipe_id === team.equipe_id,
        ),
      })),
      {
        key: "livres",
        team: null,
        assignments: schedule.designacoes.filter(
          (assignment) => !assignment.equipe_id || !knownTeamIds.has(assignment.equipe_id),
        ),
      },
    ].filter((group) => group.assignments.length > 0);
    return (
      <article className="secretary-schedule-card" key={schedule.id}>
        <header>
          <time dateTime={schedule.inicia_em}><strong>{formatDay(schedule.inicia_em)}</strong><span>{formatMonth(schedule.inicia_em)}</span></time>
          <div><span className={`secretary-status ${schedule.status.toLowerCase()}`}>{schedule.status.replaceAll("_", " ")}</span><h2>{schedule.titulo}</h2><p>{formatDate(schedule.inicia_em)} · {schedule.local || "Local não informado"}</p>{schedule.status === "AGENDADA" && schedule.publicar_em && <SchedulePublicationCountdown opensAt={schedule.publicar_em} />}</div>
        </header>
        <div className="secretary-schedule-body">
          <div><small>Responsável</small><strong>{schedule.responsavel_nome || "Não definido"}</strong></div>
          <div><small>{schedule.equipes.length === 1 ? "Equipe" : "Equipes"}</small><strong>{schedule.equipes.length ? schedule.equipes.map((team) => team.equipe_nome).join(" · ") : "Seleção livre"}</strong><div className="secretary-avatar-stack">{schedule.designacoes.slice(0, 5).map((item) => <span key={item.id} title={`${item.equipe_nome ? `${item.equipe_nome} · ` : ""}${item.nome} · ${item.funcao}`}>{initials(item.nome)}</span>)}{schedule.designacoes.length > 5 && <b>+{schedule.designacoes.length - 5}</b>}</div></div>
          <div><small>Repertório</small><strong>{schedule.repertorio.length} itens</strong></div>
          <div><small>Checklist</small><strong>{checklist.filter((item) => item.escala_id === schedule.id).length} tarefas</strong></div>
        </div>
        <ScheduleRepertoire schedule={schedule} />
        {(schedule.fio_etapas.length > 0 ||
          (ministeriosComFio.has(schedule.ministerio_id) && Boolean(schedule.can_manage))) && (
          <FioThread
            schedule={schedule}
            agora={agora}
            busy={busy}
            editando={editandoFioId === schedule.id}
            onAbrirEdicao={() => setEditandoFioId(schedule.id)}
            onFecharEdicao={() => setEditandoFioId(null)}
            onAlternarEtapa={(step) => void toggleFioStep(schedule, step)}
            onSalvarEtapas={(titulos) => void saveFioSteps(schedule, titulos)}
          />
        )}
        <div className="secretary-assignment-status-list">
          {assignmentGroups.map((group) => (
            <section className="secretary-assignment-team" key={group.key}>
              {group.team && (
                <header>
                  <div>
                    <strong>{group.team.equipe_nome}</strong>
                    <small>{group.team.funcao ? `Função/local: ${group.team.funcao}` : "Função/local não informado"}</small>
                  </div>
                  <span>{group.assignments.length}</span>
                </header>
              )}
              {group.assignments.map((assignment) => (
            <article key={assignment.id} data-status={assignment.status.toLowerCase()}>
              <span className="secretary-avatar">{initials(assignment.nome)}</span>
              <div>
                <VerifiedOwnerName name={assignment.nome} verified={Boolean(assignment.owner_verified)} />
                <small>{assignment.funcao} · {assignmentStatusLabel(assignment.status)}</small>
              </div>
              {Boolean(assignment.is_mine) && assignment.status === "PENDENTE" && schedule.status === "PUBLICADA" && (
                <div className="secretary-response-actions">
                  <button
                    type="button"
                    disabled={busy === `response-${schedule.id}`}
                    onClick={() => void respondToSchedule(schedule, "CONFIRMADA")}
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy === `response-${schedule.id}`}
                    onClick={() => {
                      setReplacementScheduleId(schedule.id);
                      setReplacementVolunteerId(0);
                    }}
                  >
                    Não posso
                  </button>
                </div>
              )}
              {Boolean(assignment.is_mine) && assignment.status === "PENDENTE" && replacementScheduleId === schedule.id && (
                <div className="secretary-self-substitute-picker">
                  <strong>Quem pode ficar no seu lugar?</strong>
                  <p>Escolha uma pessoa ativa deste ministério.</p>
                  {schedule.substitution_candidates?.length ? (
                    <select value={replacementVolunteerId || ""} onChange={(event) => setReplacementVolunteerId(Number(event.target.value))}>
                      <option value="" disabled>Selecione uma pessoa</option>
                      {schedule.substitution_candidates.map((candidate) => (
                        <option key={candidate.voluntarioId} value={candidate.voluntarioId}>{candidate.nome} · {candidate.funcao}</option>
                      ))}
                    </select>
                  ) : <small>Não há outra pessoa disponível. Fale com a liderança.</small>}
                  <div>
                    <button type="button" disabled={!replacementVolunteerId || busy === `response-${schedule.id}`} onClick={() => void respondToSchedule(schedule, "INDISPONIVEL", replacementVolunteerId)}>Confirmar substituição</button>
                    <button type="button" className="secondary" onClick={() => setReplacementScheduleId(null)}>Cancelar</button>
                  </div>
                </div>
              )}
              {Boolean(schedule.can_manage) && (
                <div className="secretary-manager-assignment-actions">
                  <button
                    type="button"
                    disabled={busy === `assignment-${assignment.id}`}
                    onClick={() => void setAssignmentStatus(schedule, assignment, "AUSENTE")}
                  >
                    Marcar ausente
                  </button>
                  {assignment.status !== "PENDENTE" && (
                    <button
                      type="button"
                      disabled={busy === `assignment-${assignment.id}`}
                      onClick={() => void setAssignmentStatus(schedule, assignment, "PENDENTE")}
                    >
                      Reabrir
                    </button>
                  )}
                </div>
              )}
            </article>
              ))}
            </section>
          ))}
        </div>
        {Boolean(schedule.can_manage) && (
          <form
            className="secretary-replacement-form"
            onSubmit={(event) => void addReplacement(schedule, event)}
          >
            <strong>Adicionar substituto</strong>
            <select name="voluntarioId" required defaultValue="">
              <option value="" disabled>Selecione um integrante</option>
              {scheduleCandidates
                .filter((candidate) =>
                  !schedule.designacoes.some(
                    (assignment) => assignment.voluntario_id === candidate.id,
                  ),
                )
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.nome} · {candidate.funcao}
                  </option>
                ))}
            </select>
            {schedule.equipes.length > 0 && (
              <select name="equipeId" required defaultValue="">
                <option value="" disabled>Equipe de origem</option>
                {schedule.equipes.map((team) => (
                  <option key={team.equipe_id} value={team.equipe_id}>
                    {team.equipe_nome}{team.funcao ? ` · ${team.funcao}` : ""}
                  </option>
                ))}
              </select>
            )}
            <input name="funcao" required maxLength={100} placeholder="Função na escala" />
            <button disabled={busy === `replacement-${schedule.id}`}>Adicionar</button>
          </form>
        )}
        <div className="secretary-schedule-actions">
          {Boolean(schedule.can_manage) && schedule.status === "RASCUNHO" && (
            <button type="button" className="publish" onClick={() => void publishSchedule(schedule)} disabled={busy === `publish-${schedule.id}`}>
              {busy === `publish-${schedule.id}` ? "Publicando…" : "Publicar"}
            </button>
          )}
          <button type="button" onClick={() => void downloadSchedulePdf(schedule)} disabled={busy === `pdf-${schedule.id}`}>{busy === `pdf-${schedule.id}` ? "Preparando…" : "PDF"}</button>
          <button type="button" onClick={() => addScheduleToCalendar(schedule)}>Adicionar ao calendário</button>
          <button type="button" className="share" onClick={() => setShareSchedule(schedule)} disabled={!schedule.can_manage || schedule.status !== "PUBLICADA" || busy === `share-${schedule.id}`}>Compartilhar</button>
          {Boolean(schedule.can_manage) && ["RASCUNHO", "AGENDADA", "PUBLICADA"].includes(schedule.status) && (
            <button type="button" className="edit" onClick={() => setEditingSchedule(schedule)}>
              Editar escala
            </button>
          )}
          {Boolean(schedule.can_delete) && (
            <button
              type="button"
              className="danger"
              onClick={() => void deleteSchedule(schedule)}
              disabled={busy === `delete-${schedule.id}`}
            >
              Excluir
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <section
      key={`ministerio-detalhe-${selectedMinistry.id}`}
      className="secretary-workspace"
      data-editor-key={`ministerio-detalhe-${selectedMinistry.id}`}
    >
      <header
        className={`secretary-hero ${selectedMinistry.banner_url ? "has-banner" : ""}`}
        data-editor-key={`ministerio-detalhe-cabecalho-${selectedMinistry.id}`}
      >
        {selectedMinistry.banner_url && (
          <div className="secretary-hero-media">
            <img
              src={selectedMinistry.banner_url}
              alt={`Capa do ministério ${selectedMinistry.nome}`}
              loading="eager"
            />
          </div>
        )}
        <div className="secretary-hero-copy">
          <p className="pilot-kicker">
            MINISTÉRIO · {CATEGORY_LABELS[selectedMinistry.categoria] || selectedMinistry.categoria}
          </p>
          <h1>{selectedMinistry.nome}</h1>
          <p>
            {selectedMinistry.descricao ||
              "Escalas, integrantes, funções e recursos isolados deste ministério."}
          </p>
        </div>
        <div className="secretary-community">
          <span>Líder responsável</span>
          <strong>{selectedMinistry.responsavel_nome || "Não definido"}</strong>
          <small>{communityName} · acesso controlado</small>
          {selectedMinistry.categorias_visitantes?.length > 0 && (
            <small className="secretary-visitor-care">
              Visitantes: {selectedMinistry.categorias_visitantes.map((item) => item.nome).join(", ")}
            </small>
          )}
        </div>
      </header>

      <div className="secretary-flow" aria-label="Fluxo do Ministério">
        {[
          ["1", "Ministério"],
          ["2", "Integrantes"],
          ["3", "Escala"],
          ["4", "Repertório"],
          ["5", "Checklist"],
          ["6", "Compartilhar"],
        ].map(([number, label]) => (
          <div key={number}><span>{number}</span><strong>{label}</strong></div>
        ))}
      </div>

      <div className="secretary-toolbar">
        <button
          type="button"
          className="secretary-back-button"
          onClick={closeMinistry}
        >
          ← Todos os ministérios
        </button>
        {canManage && (
          <div className="secretary-toolbar-actions">
            <button
              type="button"
              className="secretary-toolbar-secondary"
              onClick={() => setTab("checklist")}
            >
              ✓ Checklist
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("escalas");
                setScheduleCreatorOpen(true);
                window.setTimeout(() => {
                  scheduleDetails.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 80);
              }}
            >
              + Criar escala
            </button>
          </div>
        )}
      </div>

      <nav className="secretary-tabs" aria-label="Seções do Ministério">
        {(canManage
          ? ([
              ["painel", "Visão geral"],
              ["integrantes", "Integrantes"],
              ["equipes", "Equipes"],
              ["escalas", "Escalas"],
              ["checklist", "Checklists"],
              ["relatorios", "Relatórios"],
              ["historico", "Histórico"],
              ["configuracoes", "Configurações"],
            ] as [Tab, string][])
          : ([["escalas", "Minhas escalas"]] as [Tab, string][]))
          .map(([id, label]) => (
          <button type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)} key={id}>{label}</button>
        ))}
      </nav>

      {error && <div className="secretary-message error" role="alert">{error}</div>}
      {feedback && <div className="secretary-message success" role="status">{feedback}</div>}

      {(
        <>
          {tab === "painel" && selectedMinistry && (
            <div className="secretary-panel">
              <div className="secretary-summary-grid">
                <SummaryCard label="Escalas publicadas" value={ministrySchedules.filter((item) => item.status === "PUBLICADA").length} detail={selectedMinistry.nome} icon="▣" tone="purple" />
                <SummaryCard label="Integrantes" value={selectedMinistry.voluntarios.length} detail={selectedMinistry.nome} icon="♙" tone="blue" />
                <SummaryCard label="Próximas escalas" value={upcoming.length} detail="Em preparação ou publicadas" icon="▣" tone="green" />
                <SummaryCard label="Pendências" value={pendingChecklist.length} detail="Itens de checklist" icon="✓" tone="amber" />
              </div>
              <div className="secretary-dashboard-grid">
                <article className="secretary-card secretary-ministry-card">
                  <header><div><p className="pilot-kicker">MINISTÉRIO SELECIONADO</p><h2>{selectedMinistry.nome}</h2></div><span>{CATEGORY_LABELS[selectedMinistry.categoria] || selectedMinistry.categoria}</span></header>
                  <p>{selectedMinistry.descricao || "Adicione uma descrição nas configurações do ministério."}</p>
                  <dl>
                    <div><dt>Responsável</dt><dd>{selectedMinistry.responsavel_nome || "Não definido"}</dd></div>
                    <div><dt>Categorias de visitantes</dt><dd>{selectedMinistry.categorias_visitantes?.length ? selectedMinistry.categorias_visitantes.map((item) => item.nome).join(", ") : "Nenhuma associada"}</dd></div>
                    <div><dt>Status</dt><dd>{selectedMinistry.status === "ATIVO" ? "Ativo" : "Inativo"}</dd></div>
                    <div><dt>Criado em</dt><dd>{formatDate(selectedMinistry.criado_em, false)}</dd></div>
                  </dl>
                  <div className="secretary-card-actions">
                    <button type="button" onClick={() => setTab("integrantes")}>Gerenciar equipe</button>
                    <button type="button" onClick={() => setTab("escalas")}>Ver escalas</button>
                  </div>
                </article>
                <article className="secretary-card">
                  <header><div><p className="pilot-kicker">PRÓXIMA ESCALA</p><h2>Agenda da equipe</h2></div></header>
                  {upcoming[0] ? <ScheduleCompact schedule={upcoming[0]} onShare={setShareSchedule} onPdf={downloadSchedulePdf} onCalendar={addScheduleToCalendar} busy={busy} /> : <div className="secretary-card-empty"><strong>Nenhuma escala futura</strong><p>Crie uma escala e selecione os integrantes deste ministério.</p></div>}
                </article>
                <article className="secretary-card">
                  <header><div><p className="pilot-kicker">RESPONSABILIDADES</p><h2>Checklist em andamento</h2></div><span>{pendingChecklist.length}</span></header>
                  <div className="secretary-checklist-preview">
                    {pendingChecklist.slice(0, 5).map((item) => (
                      <button key={item.id} type="button" onClick={() => void updateChecklist(item, "FEITO")} disabled={Boolean(busy)}>
                        <span>○</span><strong>{item.tarefa}</strong><small>Marcar feito</small>
                      </button>
                    ))}
                    {!pendingChecklist.length && <div className="secretary-card-empty"><strong>Tudo organizado</strong><p>Não há responsabilidades pendentes.</p></div>}
                  </div>
                </article>
              </div>
            </div>
          )}

          {(tab === "integrantes" || tab === "equipes") && selectedMinistry && (
            <div className="secretary-section-grid">
              {tab === "integrantes" && <section className="secretary-card secretary-wide-card">
                <header><div><p className="pilot-kicker">EQUIPE DO MINISTÉRIO</p><h2>{selectedMinistry.voluntarios.length} integrantes</h2></div><span>Carregamento automático nas escalas</span></header>
                <div className="secretary-members">
                  {selectedMinistry.voluntarios.map((volunteer) => (
                    <article key={volunteer.id}>
                      <span className="secretary-avatar">{initials(volunteer.nome)}</span>
                      <div><strong>{volunteer.nome}</strong><small>{volunteer.funcao}</small></div>
                      <span className={`secretary-role ${volunteer.papel.toLowerCase()}`}>{volunteer.papel === "LIDER" ? "Líder" : "Integrante"}</span>
                      <small>
                        {volunteer.escalas_ativas} escala(s) futura(s) · {Math.max(0, volunteer.limite_escalas - volunteer.escalas_ativas)} restante(s)
                      </small>
                      {canManage && (
                        <form
                          className="secretary-capacity-form"
                          onSubmit={(event) => void updateScheduleLimit(volunteer, event)}
                        >
                          <label>
                            Limite
                            <input
                              name="limiteEscalas"
                              type="number"
                              min={1}
                              max={52}
                              defaultValue={volunteer.limite_escalas}
                            />
                          </label>
                          <button disabled={busy === `capacity-${volunteer.id}`}>Salvar</button>
                        </form>
                      )}
                    </article>
                  ))}
                  {!selectedMinistry.voluntarios.length && <div className="secretary-card-empty"><strong>Nenhum integrante</strong><p>Inclua pessoas ativas da comunidade.</p></div>}
                </div>
              </section>}
              {tab === "equipes" && <section className="secretary-card secretary-wide-card ministry-team-section">
                <header>
                  <div>
                    <p className="pilot-kicker">EQUIPES DO MINISTÉRIO</p>
                    <h2>Grupos para organizar as escalas</h2>
                  </div>
                  <span>Máximo de 3 equipes por integrante</span>
                </header>
                <div className="ministry-team-grid">
                  {teams.map((team) => (
                    <form
                      className={`ministry-team-card${expandedTeamId === team.id ? " expanded" : " collapsed"}`}
                      key={`${team.id}-${team.membros.map((member) => member.voluntario_id).join("-")}`}
                      style={{ "--team-color": team.cor } as CSSProperties}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const volunteerIds = new FormData(event.currentTarget)
                          .getAll("voluntarioIds")
                          .map(Number)
                          .filter((id) => Number.isInteger(id) && id > 0);
                        void saveTeamMembers(team, volunteerIds);
                      }}
                    >
                      <button
                        type="button"
                        className="ministry-team-collapse-trigger"
                        aria-expanded={expandedTeamId === team.id}
                        onClick={() => setExpandedTeamId((current) => current === team.id ? null : team.id)}
                      >
                        <span aria-hidden="true" />
                        <strong>{team.nome}</strong>
                        <i aria-hidden="true">⌄</i>
                      </button>
                      {expandedTeamId === team.id && <>
                      <div className="ministry-team-members">
                        {selectedMinistry.voluntarios.map((volunteer) => (
                          <label key={volunteer.id}>
                            <input
                              type="checkbox"
                              name="voluntarioIds"
                              value={volunteer.id}
                              defaultChecked={team.membros.some(
                                (member) => member.voluntario_id === volunteer.id,
                              )}
                              disabled={!canManage}
                            />
                            <span>{initials(volunteer.nome)}</span>
                            <small>{volunteer.nome}</small>
                          </label>
                        ))}
                      </div>
                      {canManage && (
                        <footer>
                          <button disabled={busy === `team-members-${team.id}`}>
                            {busy === `team-members-${team.id}` ? "Salvando…" : "Salvar integrantes"}
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => void deleteTeam(team)}
                            disabled={busy === `delete-team-${team.id}`}
                          >
                            Excluir equipe
                          </button>
                        </footer>
                      )}
                      </>}
                    </form>
                  ))}
                  {!teams.length && (
                    <div className="secretary-card-empty">
                      <strong>Nenhuma equipe criada</strong>
                      <p>Crie grupos opcionais para filtrar os integrantes de cada escala.</p>
                    </div>
                  )}
                </div>
              </section>}
              {tab === "integrantes" && canManage && (
                <form className="secretary-card secretary-form" onSubmit={addVolunteer}>
                  <header><div><p className="pilot-kicker">NOVO INTEGRANTE</p><h2>Adicionar à equipe</h2></div></header>
                  <label>Pessoa<select name="usuarioId" required defaultValue=""><option value="" disabled>Selecione</option>{availableUsers.map((user) => {
                    const existing = selectedMinistry.voluntarios.find((item) => item.usuario_id === user.id);
                    return <option key={user.id} value={user.id}>{user.nome} · {user.papel}{existing ? ` · já integra (${existing.escalas_ativas} escala(s))` : ""}</option>;
                  })}</select></label>
                  <label>Função<input name="funcao" required maxLength={100} placeholder="Ex.: Vocal, recepção, mídia" /></label>
                  <label>Papel<select name="papel" defaultValue="VOLUNTARIO"><option value="VOLUNTARIO">Integrante</option><option value="LIDER">Líder</option></select></label>
                  <p className="secretary-form-help">Líderes do ministério, pastores e proprietários podem nomear outro líder neste mesmo ministério.</p>
                  <button disabled={busy === "adding-volunteer"}>{busy === "adding-volunteer" ? "Salvando…" : "Adicionar integrante"}</button>
                </form>
              )}
              {tab === "equipes" && canManage && (
                <form className="secretary-card secretary-form" onSubmit={createTeam}>
                  <header><div><p className="pilot-kicker">NOVA EQUIPE</p><h2>Criar grupo de escala</h2></div></header>
                  <label>Nome<input name="nome" required maxLength={80} placeholder="Ex.: Equipe A, Vocal, Recepção" /></label>
                  <label>Descrição<textarea name="descricao" rows={3} maxLength={300} /></label>
                  <fieldset className="secretary-team-color-field">
                    <legend>Identidade da equipe</legend>
                    <p>Escolha um tom harmonizado com os temas claro e escuro.</p>
                    <div className="secretary-team-color-options" role="radiogroup" aria-label="Cor da equipe">
                      {["#7157e8", "#2563eb", "#0891b2", "#059669", "#d97706", "#db2777"].map((color) => (
                        <button
                          type="button"
                          key={color}
                          className={teamColor === color ? "active" : ""}
                          style={{ "--team-choice": color } as CSSProperties}
                          onClick={() => setTeamColor(color)}
                          aria-label={`Selecionar cor ${color}`}
                          aria-pressed={teamColor === color}
                        />
                      ))}
                      <label className="secretary-team-custom-color">
                        Personalizar
                        <input
                          name="corPersonalizada"
                          type="color"
                          value={teamColor}
                          onChange={(event) => setTeamColor(event.target.value)}
                        />
                      </label>
                    </div>
                  </fieldset>
                  <label>Ordem<input name="ordem" type="number" min={0} max={999} defaultValue={teams.length} /></label>
                  <button disabled={busy === "creating-team"}>{busy === "creating-team" ? "Criando…" : "Criar equipe"}</button>
                </form>
              )}
              {tab === "integrantes" && ownVolunteer && (
                <form className="secretary-card secretary-form secretary-availability" onSubmit={updateAvailability}>
                  <header><div><p className="pilot-kicker">MINHA DISPONIBILIDADE</p><h2>Quando posso servir</h2></div></header>
                  <div className="secretary-day-picker">
                    {DAYS.map(([value, label]) => <label key={value}><input type="checkbox" name="diasDisponiveis" value={value} defaultChecked={ownVolunteer.dias_disponiveis.includes(value)} /><span>{label}</span></label>)}
                  </div>
                  <label>Período preferido<select name="periodoPreferido" defaultValue={ownVolunteer.periodo_preferido}><option value="MANHA">Manhã</option><option value="TARDE">Tarde</option><option value="NOITE">Noite</option><option value="FLEXIVEL">Flexível</option></select></label>
                  <button disabled={busy === "availability"}>{busy === "availability" ? "Salvando…" : "Salvar disponibilidade"}</button>
                </form>
              )}
            </div>
          )}

          {tab === "escalas" && selectedMinistry && (
            <div className="secretary-schedules">
              {canManage && (
                <details
                  className="secretary-create-schedule"
                  ref={scheduleDetails}
                  data-keep-open-on-outside
                  open={scheduleCreatorOpen}
                  onToggle={(event) => {
                    if (event.currentTarget.open !== scheduleCreatorOpen) {
                      setScheduleCreatorOpen(event.currentTarget.open);
                    }
                  }}
                >
                  <summary><span>+</span><div><strong>Criar nova escala</strong><small>Equipe, repertório, links e checklist em um único fluxo</small></div></summary>
                  <form onSubmit={createSchedule}>
                    <details className="secretary-fold-section" open>
                      <summary><span>1</span><div><h3>Informações da escala</h3><p>Campos obrigatórios e responsável.</p></div><i aria-hidden="true">⌄</i></summary>
                      <div className="secretary-fold-content secretary-form-grid">
                        <label>Título<input name="titulo" required maxLength={140} placeholder="Ex.: Culto de celebração" /></label>
                        <fieldset className="span-2 secretary-schedule-teams">
                          <legend>Equipes na escala</legend>
                          <p>Selecione quantas equipes forem necessárias. Em cada uma, informe a função ou o local de atuação.</p>
                          <div>
                            {teams.map((team) => {
                              const selection = selectedTeams.find((item) => item.equipeId === team.id);
                              return (
                                <section key={team.id} data-selected={Boolean(selection)}>
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(selection)}
                                      onChange={() => {
                                        setSelectedTeams((current) =>
                                          selection
                                            ? current.filter((item) => item.equipeId !== team.id)
                                            : [...current, { equipeId: team.id, funcao: "" }],
                                        );
                                        if (selection) {
                                          setSelectedAssignments((current) =>
                                            current.filter((item) => item.equipeId !== team.id),
                                          );
                                        }
                                        setChecklistDraft((current) =>
                                          current.map((item) => ({ ...item, voluntarioId: "" })),
                                        );
                                      }}
                                    />
                                    <span>{team.nome}</span>
                                    <small>{team.membros.length} integrantes</small>
                                  </label>
                                  {selection && (
                                    <label className="secretary-team-duty">
                                      <span>Função/local desta equipe</span>
                                      <input
                                        value={selection.funcao}
                                        onChange={(event) => setSelectedTeams((current) =>
                                          current.map((item) =>
                                            item.equipeId === team.id
                                              ? { ...item, funcao: event.target.value }
                                              : item,
                                          ),
                                        )}
                                        maxLength={180}
                                        placeholder="Ex.: Velha, Centro ou Recepção"
                                      />
                                    </label>
                                  )}
                                </section>
                              );
                            })}
                            {!teams.length && <p className="secretary-inline-empty">Nenhuma equipe criada. Você ainda pode montar uma escala com integrantes livres.</p>}
                          </div>
                        </fieldset>
                        <label>Responsável<select name="responsavelUsuarioId" defaultValue=""><option value="">Definir depois</option>{selectedMinistry.voluntarios.map((item) => <option key={item.id} value={item.usuario_id}>{item.nome}</option>)}</select><small>Opcional no rascunho; escolha um integrante antes de publicar.</small></label>
                        <label>Início<input name="iniciaEm" type="datetime-local" required value={scheduleStartsAt} onChange={(event) => setScheduleStartsAt(event.target.value)} /></label>
                        <label>Término<input name="terminaEm" type="datetime-local" required value={scheduleEndsAt} onChange={(event) => setScheduleEndsAt(event.target.value)} /></label>
                        <label className="span-2">Local<input name="local" maxLength={180} placeholder="Templo, sala ou endereço" /></label>
                      </div>
                    </details>
                    <details className="secretary-fold-section">
                      <summary><span>2</span><div><h3>{selectedTeamEntries.length ? `${selectedTeamEntries.length} equipe${selectedTeamEntries.length === 1 ? "" : "s"} selecionada${selectedTeamEntries.length === 1 ? "" : "s"}` : "Integrantes do ministério"}</h3><p>{selectedTeamEntries.length ? "Selecione os integrantes dentro de cada equipe, mantendo a origem de cada pessoa." : "Sem equipes selecionadas, os integrantes ficam livres nesta escala."}</p></div><i aria-hidden="true">⌄</i></summary>
                      <div className="secretary-fold-content">
                        <div className="secretary-suggestion-toolbar">
                          <p>O sistema considera dia, período, limite e conflitos reais. A validação final também acontece no servidor.</p>
                          <button type="button" onClick={() => setSelectedAssignments(candidateAvailability.filter((item) => item.suggested).flatMap(({ volunteer }) => {
                            const team = selectedTeamEntries.find(({ team: candidateTeam }) => candidateTeam.membros.some((member) => member.voluntario_id === volunteer.id));
                            return selectedTeamEntries.length && !team ? [] : [{ voluntarioId: volunteer.id, equipeId: team?.team.id || null }];
                          }))} disabled={!candidateAvailability.some((item) => item.suggested)}>Selecionar sugestões disponíveis</button>
                        </div>
                        <div className="secretary-team-assignment-groups">
                          {(selectedTeamEntries.length
                            ? selectedTeamEntries
                            : [{ team: null, funcao: "" }]
                          ).map(({ team, funcao }) => {
                            const candidates = candidateAvailability.filter(({ volunteer }) =>
                              !team || team.membros.some((member) => member.voluntario_id === volunteer.id),
                            );
                            return (
                              <section key={team?.id || "livre"}>
                                <header>
                                  <div>
                                    <strong>{team?.nome || "Integrantes livres"}</strong>
                                    <small>{team ? (funcao ? `Função/local: ${funcao}` : "Função/local não informado") : "Sem equipe definida"}</small>
                                  </div>
                                  <span>{candidates.length}</span>
                                </header>
                                <div className="secretary-team-picker">
                                  {candidates.map(({ volunteer: item, capacityReached, conflict, suggested, status }) => {
                                    const selectedHere = selectedAssignments.some((assignment) =>
                                      assignment.voluntarioId === item.id && assignment.equipeId === (team?.id || null),
                                    );
                                    const selectedElsewhere = selectedAssignments.some((assignment) =>
                                      assignment.voluntarioId === item.id && assignment.equipeId !== (team?.id || null),
                                    );
                                    return (
                                      <label key={item.id} className={suggested ? "suggested" : conflict || capacityReached ? "unavailable" : ""}>
                                        <input type="checkbox" disabled={capacityReached || conflict || selectedElsewhere} checked={selectedHere} onChange={() => setSelectedAssignments((current) => selectedHere ? current.filter((assignment) => assignment.voluntarioId !== item.id) : [...current, { voluntarioId: item.id, equipeId: team?.id || null }])} />
                                        <span className="secretary-avatar">{initials(item.nome)}</span>
                                        <strong>{item.nome}</strong>
                                        <small>{item.funcao} · {item.escalas_ativas} ativa(s) · {Math.max(0, item.limite_escalas - item.escalas_ativas)} restante(s)</small>
                                        <em>{selectedElsewhere ? "Selecionado em outra equipe" : status}</em>
                                      </label>
                                    );
                                  })}
                                  {!candidates.length && <p className="secretary-inline-empty">Esta equipe ainda não possui integrantes.</p>}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                    <details className="secretary-fold-section">
                      <summary><span>3</span><div><h3>Repertório e materiais</h3><p>Reaproveite links já salvos neste ministério.</p></div><i aria-hidden="true">⌄</i></summary>
                      <div className="secretary-fold-content">
                        <label>Repertório<textarea name="repertorio" rows={6} maxLength={8000} placeholder={"Música ou conteúdo 1\nMúsica ou conteúdo 2"} /></label>
                        <LinkBuilder
                          links={links}
                          setLinks={setLinks}
                          libraryItems={ministryLibrary}
                          selectedItemIds={selectedLibraryItemIds}
                          onToggleItem={toggleLibraryItem}
                          onUseSaved={useReusableLink}
                          onRemoveSaved={(link) => void removeReusableLink(link)}
                          onRenameItem={(item, titulo) => void renameLibraryItem(item, titulo)}
                          onRemoveItem={(item) => void removeLibraryItem(item)}
                          onSaveCurrent={(titulo) => void saveReusableLinks(titulo)}
                          busy={busy}
                        />
                      </div>
                    </details>
                    <details className="secretary-fold-section">
                      <summary><span>4</span><div><h3>Checklist de responsabilidades</h3><p>Defina a tarefa e a pessoa responsável.</p></div><i aria-hidden="true">⌄</i></summary>
                      <div className="secretary-fold-content secretary-checklist-builder">
                        <div className="secretary-checklist-tools">
                          <p>Comece do zero ou reaproveite as tarefas da escala mais recente.</p>
                          <button
                            type="button"
                            disabled={!previousChecklistTemplate.length}
                            onClick={() => {
                              setChecklistDraft(previousChecklistTemplate.map((item) => ({
                                id: crypto.randomUUID(),
                                tarefa: item.tarefa,
                                voluntarioId: scheduleCandidates.some((candidate) => String(candidate.id) === item.voluntarioId)
                                  ? item.voluntarioId
                                  : "",
                              })));
                              setFeedback("Checklist anterior aplicado. Revise os responsáveis antes de salvar.");
                            }}
                          >Usar checklist anterior</button>
                        </div>
                        {checklistDraft.map((item) => (
                          <div className="secretary-checklist-draft" key={item.id}>
                            <input aria-label="Tarefa" value={item.tarefa} onChange={(event) => setChecklistDraft((current) => current.map((draft) => draft.id === item.id ? { ...draft, tarefa: event.target.value } : draft))} placeholder="Ex.: Testar microfones" maxLength={180} />
                            <select aria-label="Responsável" value={item.voluntarioId} onChange={(event) => setChecklistDraft((current) => current.map((draft) => draft.id === item.id ? { ...draft, voluntarioId: event.target.value } : draft))}>
                              <option value="">Equipe</option>
                              {scheduleCandidates
                                .filter((volunteer) =>
                                  String(volunteer.id) === item.voluntarioId ||
                                  !checklistDraft.some(
                                    (draft) => draft.id !== item.id && draft.voluntarioId === String(volunteer.id),
                                  ),
                                )
                                .map((volunteer) => <option key={volunteer.id} value={volunteer.id}>{volunteer.nome}</option>)}
                            </select>
                            <button type="button" aria-label="Remover responsabilidade" onClick={() => setChecklistDraft((current) => current.filter((draft) => draft.id !== item.id))}>×</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => setChecklistDraft((current) => [...current, { id: crypto.randomUUID(), tarefa: "", voluntarioId: "" }])}>+ Adicionar responsabilidade</button>
                      </div>
                    </details>
                    <details className="secretary-fold-section">
                      <summary><span>5</span><div><h3>Publicação</h3><p>Rascunhos não notificam a equipe.</p></div><i aria-hidden="true">⌄</i></summary>
                      <div className="secretary-fold-content secretary-form-grid">
                        <label>Status<select name="status" defaultValue="RASCUNHO"><option value="RASCUNHO">Salvar como rascunho</option><option value="AGENDADA">Agendar publicação</option><option value="PUBLICADA">Publicar e notificar agora</option></select></label>
                        <label>Publicar em<input name="publicarEm" type="datetime-local" /><small>Obrigatório apenas para publicação agendada.</small></label>
                        <label className="span-2">Observações<textarea name="observacoes" rows={4} maxLength={1200} /></label>
                      </div>
                    </details>
                    <footer><button type="submit" disabled={busy === "creating-schedule"}>{busy === "creating-schedule" ? "Salvando…" : "Salvar escala"}</button></footer>
                  </form>
                </details>
              )}
              <div className="secretary-schedule-list">
                {escalasSeparadas.proximas.map((schedule) => renderScheduleCard(schedule))}
                {escalasSeparadas.encerradas.length > 0 && (
                  <section className="fio-encerradas">
                    <header>
                      <p>
                        {escalasSeparadas.encerradas.length}
                        {escalasSeparadas.encerradas.length === 1
                          ? " escala encerrada recolhida automaticamente"
                          : " escalas encerradas recolhidas automaticamente"}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setEscalasExpandidas((atual) =>
                            atual.length
                              ? []
                              : escalasSeparadas.encerradas.map((item) => item.id),
                          )
                        }
                      >
                        {escalasExpandidas.length ? "Recolher tudo" : "Expandir tudo"}
                      </button>
                    </header>
                    {escalasSeparadas.encerradas.map((schedule) =>
                      escalasExpandidas.includes(schedule.id) ? (
                        <div key={schedule.id}>{renderScheduleCard(schedule)}</div>
                      ) : (
                        <button
                          type="button"
                          className="fio-encerrada-linha"
                          key={schedule.id}
                          onClick={() => setEscalasExpandidas((atual) => [...atual, schedule.id])}
                        >
                          <time dateTime={schedule.inicia_em}>
                            <strong>{formatDay(schedule.inicia_em)}</strong>
                            <span>{formatMonth(schedule.inicia_em)}</span>
                          </time>
                          <span className="fio-encerrada-copy">
                            <strong>{schedule.titulo}</strong>
                            <small>{formatDate(schedule.inicia_em)} · {schedule.local || "Local não informado"}</small>
                          </span>
                          <FioVerdict schedule={schedule} agora={agora} />
                        </button>
                      ),
                    )}
                  </section>
                )}
                {!ministrySchedules.length && <div className="secretary-empty compact"><span>▣</span><h2>Nenhuma escala cadastrada</h2><p>Crie a primeira escala deste ministério.</p></div>}
              </div>
            </div>
          )}

          {tab === "checklist" && (
            <section className="secretary-card secretary-wide-card">
              <header><div><p className="pilot-kicker">CHECKLISTS POR ESCALA</p><h2>Responsabilidades sincronizadas</h2></div><span>{pendingChecklist.length} pendentes</span></header>
              <div className="secretary-checklist-table">
                {ministrySchedules.map((schedule) => {
                  const items = ministryChecklist.filter((item) => item.escala_id === schedule.id);
                  if (!items.length) return null;
                  const done = items.filter((item) => item.status === "FEITO").length;
                  const isOpen = expandedChecklistSchedules.includes(schedule.id);
                  const isPast = new Date(schedule.inicia_em.replace(" ", "T")).getTime() < Date.now();
                  const state = done === items.length ? "done" : isPast ? "overdue" : "pending";
                  return (
                    <section key={schedule.id} className={`secretary-checklist-group is-${state}`}>
                      <header><button type="button" className="secretary-checklist-collapse" aria-expanded={isOpen} onClick={() => setExpandedChecklistSchedules((current) => current.includes(schedule.id) ? current.filter((id) => id !== schedule.id) : [...current, schedule.id])}><div><strong>{schedule.titulo}</strong><small>{formatDate(schedule.inicia_em)}</small></div><span><b>{done}/{items.length}</b><i aria-hidden="true">⌄</i></span></button><em>{state === "done" ? "Concluído" : state === "overdue" ? "Atenção: pendente" : "Pendente"}</em></header>
                      {isOpen && items.map((item) => (
                        <div key={item.id}>
                          <button type="button" onClick={() => void updateChecklist(item, item.status === "FEITO" ? "PENDENTE" : "FEITO")} disabled={busy === `checklist-${item.id}`} aria-label={item.status === "FEITO" ? "Reabrir item" : "Concluir item"}>{item.status === "FEITO" ? "✓" : "○"}</button>
                          <strong>{item.tarefa}</strong>
                          <span>{item.status.replaceAll("_", " ")}</span>
                        </div>
                      ))}
                    </section>
                  );
                })}
                {!ministryChecklist.length && <div className="secretary-card-empty"><strong>Nenhum checklist disponível</strong><p>As responsabilidades surgem automaticamente quando uma escala é criada.</p></div>}
              </div>
            </section>
          )}

          {editingSchedule && (
            <EditScheduleDialog
              schedule={editingSchedule}
              ministry={selectedMinistry}
              teams={teams}
              busy={busy === `editing-schedule-${editingSchedule.id}`}
              onClose={() => setEditingSchedule(null)}
              onSubmit={updateSchedule}
            />
          )}

          {tab === "relatorios" && (
            <div className="secretary-reports">
              <div className="secretary-summary-grid">
                <SummaryCard label="Escalas publicadas" value={ministrySchedules.filter((item) => item.status === "PUBLICADA").length} detail="Visíveis à equipe" icon="▣" tone="purple" />
                <SummaryCard label="Confirmações" value={ministrySchedules.flatMap((item) => item.designacoes).filter((item) => item.status === "CONFIRMADA").length} detail="Integrantes confirmados" icon="✓" tone="green" />
                <SummaryCard label="Indisponibilidades" value={ministrySchedules.flatMap((item) => item.designacoes).filter((item) => item.status === "INDISPONIVEL").length} detail="Respostas registradas" icon="!" tone="amber" />
                <SummaryCard label="Itens concluídos" value={ministryChecklist.filter((item) => item.status === "FEITO").length} detail={`${ministryChecklist.length} responsabilidades`} icon="↗" tone="blue" />
              </div>
              <section className="secretary-card secretary-wide-card">
                <header><div><p className="pilot-kicker">EXPORTAÇÃO</p><h2>Documentos das escalas</h2></div><span>PDF · imagem · calendário</span></header>
                <div className="secretary-report-list">
                  {ministrySchedules.map((schedule) => (
                    <article key={schedule.id}>
                      <div><strong>{schedule.titulo}</strong><span>{formatDate(schedule.inicia_em)} · {schedule.status}</span></div>
                      <button type="button" onClick={() => void downloadSchedulePdf(schedule)} disabled={busy === `pdf-${schedule.id}`}>{busy === `pdf-${schedule.id}` ? "Preparando…" : "Baixar PDF"}</button>
                      <button type="button" onClick={() => downloadScheduleImage(schedule)}>Baixar imagem</button>
                      <button type="button" onClick={() => addScheduleToCalendar(schedule)}>Adicionar ao calendário</button>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}

          {tab === "historico" && (
            <MinistryAccessHistory schedules={ministrySchedules} />
          )}

          {tab === "configuracoes" && (
            <div className="secretary-settings">
              <MinistrySettingsForm
                key={`${selectedMinistry.id}:${selectedMinistry.banner_url || ""}`}
                ministry={selectedMinistry}
                users={availableUsers}
                busy={busy === `settings-${selectedMinistry.id}`}
                onSubmit={updateMinistrySettings}
              />
              {(Boolean(selectedMinistry.can_delete) ||
                (selectedMinistry.categoria === "DIACONIA" && Boolean(selectedMinistry.can_archive))) && (
                <section className="secretary-settings-danger-zone">
                  <div><p className="pilot-kicker">ÁREA DE RISCO</p><h2>Arquivamento e exclusão</h2><p>Estas ações ficam somente nas configurações para evitar acionamentos acidentais.</p></div>
                  <div>
                    {selectedMinistry.categoria === "DIACONIA" && Boolean(selectedMinistry.can_archive) && (
                      <button type="button" onClick={() => void archiveDiaconia()} disabled={busy === `archive-ministry-${selectedMinistry.id}`}>Arquivar Diaconia</button>
                    )}
                    {Boolean(selectedMinistry.can_delete) && (
                      <button type="button" className="danger" onClick={() => void deleteMinistry(selectedMinistry)} disabled={busy === `delete-ministry-${selectedMinistry.id}`}>Excluir ministério</button>
                    )}
                  </div>
                </section>
              )}
              <section className="secretary-advanced">
                <header><div><p className="pilot-kicker">CONFIGURAÇÕES AVANÇADAS</p><h2>Recursos preservados</h2><p>Funções personalizadas, modelos, histórico e controles anteriores continuam disponíveis.</p></div></header>
                <MinistriesWorkspace permissions={permissions} communityName={communityName} />
              </section>
            </div>
          )}
        </>
      )}

      {shareSchedule && (
        <ShareDialogV2
          schedule={shareSchedule}
          onClose={() => setShareSchedule(null)}
        />
      )}
    </section>
  );
}

function MinistrySettingsForm({
  ministry,
  users,
  busy,
  onSubmit,
}: {
  ministry: Ministry;
  users: AvailableUser[];
  busy: boolean;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    bannerUrl: string,
    fio: FioTemplateValue,
  ) => Promise<void>;
}) {
  const [bannerUrl, setBannerUrl] = useState(ministry.banner_url || "");
  const [categoria, setCategoria] = useState(ministry.categoria);
  const [fio, setFio] = useState<FioTemplateValue>({
    habilitado: Boolean(ministry.fio_habilitado),
    etapas: ministry.fio_etapas,
  });
  return (
    <form
      className="secretary-ministry-settings"
      onSubmit={(event) => void onSubmit(event, bannerUrl, fio)}
    >
      <header className="secretary-settings-hero">
        <span className="secretary-settings-icon" aria-hidden="true">
          {ministrySymbol(ministry.categoria)}
        </span>
        <div>
          <p className="pilot-kicker">IDENTIDADE DO MINISTÉRIO</p>
          <h2>Configurações de {ministry.nome}</h2>
          <p>
            Nome, liderança, descrição, categoria, links e banner ficam
            isolados neste ministério.
          </p>
        </div>
        <span className="secretary-settings-status">
          <i /> {ministry.status === "ATIVO" ? "Ministério ativo" : "Ministério inativo"}
        </span>
      </header>
      <div className="secretary-settings-grid">
        <section className="secretary-settings-section">
          <header><span>1</span><div><strong>Informações principais</strong><small>Nome e apresentação dentro da comunidade</small></div></header>
          <label>
            Nome do ministério
            <input name="nome" required maxLength={120} defaultValue={ministry.nome} />
          </label>
          <label>
            Descrição
            <textarea
              name="descricao"
              rows={5}
              maxLength={1200}
              defaultValue={ministry.descricao}
              placeholder="Explique o propósito e as atividades deste ministério."
            />
            <small>Até 1.200 caracteres. Esta descrição aparece somente onde a permissão permitir.</small>
          </label>
        </section>

        <section className="secretary-settings-section">
          <header><span>2</span><div><strong>Liderança e categoria</strong><small>Responsabilidade isolada por ministério</small></div></header>
          <label>
            Categoria
            <select
              name="categoria"
              value={categoria}
              onChange={(event) => setCategoria(event.target.value)}
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Líder responsável
            <select
              name="responsavelUsuarioId"
              defaultValue={String(ministry.responsavel_usuario_id || "")}
            >
              <option value="">Não definido</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.nome}</option>
              ))}
            </select>
            <small>O líder gerencia somente este ministério; Pastores mantêm acesso global.</small>
          </label>
        </section>

        <section className="secretary-settings-section secretary-settings-links">
          <header><span>3</span><div><strong>Canais oficiais</strong><small>Links opcionais e conferíveis</small></div></header>
          <label>
            YouTube oficial
            <input name="youtubeUrl" type="url" inputMode="url" placeholder="https://youtube.com/..." defaultValue={ministry.youtube_url} />
          </label>
          <label>
            Spotify oficial
            <input name="spotifyUrl" type="url" inputMode="url" placeholder="https://open.spotify.com/..." defaultValue={ministry.spotify_url} />
          </label>
        </section>

        <section className="secretary-settings-section secretary-settings-fio">
          <header><span>4</span><div><strong>Fio do Ministério</strong><small>O modelo de checkpoints que cada escala nova recebe</small></div></header>
          <FioTemplateFields categoria={categoria} value={fio} onChange={setFio} />
        </section>

        <section className="secretary-settings-section secretary-settings-banner">
          <header><span>5</span><div><strong>Imagem de capa</strong><small>Banner responsivo para celular e computador</small></div></header>
          <NativeImageUpload
            label="Banner do ministério"
            value={bannerUrl}
            purpose="ministry-banner"
            resourceId={ministry.id}
            previewMode="banner"
            onChange={setBannerUrl}
            help="A imagem será otimizada automaticamente para desktop e celular."
          />
        </section>
      </div>
      <footer className="secretary-settings-footer">
        <div><strong>Alterações isoladas</strong><span>Não afetam outros ministérios ou comunidades.</span></div>
        <button disabled={busy}>{busy ? "Salvando…" : "Salvar configurações"}</button>
      </footer>
    </form>
  );
}

function MinistryForm({
  users,
  loadingUsers,
  busy,
  onSubmit,
}: {
  users: AvailableUser[];
  loadingUsers: boolean;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, fio: FioTemplateValue) => void;
}) {
  const [categoria, setCategoria] = useState("OUTRO");
  const [fio, setFio] = useState<FioTemplateValue>({ habilitado: false, etapas: [] });
  return (
    <form
      className="secretary-form secretary-ministry-form"
      onSubmit={(event) => onSubmit(event, fio)}
    >
      <label>Nome do ministério<input name="nome" required maxLength={120} /></label>
      <label>Categoria<select name="categoria" value={categoria} onChange={(event) => setCategoria(event.target.value)}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>
        Líder responsável
        <select name="responsavelUsuarioId" required defaultValue="">
          <option value="" disabled>
            {loadingUsers
              ? "Atualizando líderes…"
              : users.length
                ? "Selecione o líder"
                : "Nenhuma pessoa ativa encontrada"}
          </option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.nome} · {communityRoleLabel(user.papel)}
            </option>
          ))}
        </select>
        {!loadingUsers && !users.length && (
          <small>Promova ou vincule uma pessoa ativa nesta comunidade e abra novamente este formulário.</small>
        )}
      </label>
      <label className="span-2">Descrição<textarea name="descricao" rows={4} maxLength={1200} /></label>
      <div className="span-2">
        <FioTemplateFields categoria={categoria} value={fio} onChange={setFio} />
      </div>
      <input type="hidden" name="status" value="ATIVO" />
      <button disabled={busy || loadingUsers || !users.length}>{busy ? "Criando…" : "Criar ministério"}</button>
    </form>
  );
}

function communityRoleLabel(role: string) {
  return ({
    LIDER: "Líder",
    PASTOR: "Pastor",
    ADMIN_COMUNIDADE: "Administrador",
    SUPERADMIN: "Proprietário",
    MEMBRO: "Membro",
  } as Record<string, string>)[role] || "Pessoa ativa";
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: string;
  tone: string;
}) {
  return (
    <article className={`secretary-summary ${tone}`}>
      <span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
    </article>
  );
}

function ScheduleCompact({
  schedule,
  onShare,
  onPdf,
  onCalendar,
  busy,
}: {
  schedule: Schedule;
  onShare: (schedule: Schedule) => void;
  onPdf: (schedule: Schedule) => Promise<void>;
  onCalendar: (schedule: Schedule) => void;
  busy: string;
}) {
  return (
    <div className="secretary-next-schedule">
      <time><strong>{formatDay(schedule.inicia_em)}</strong><span>{formatMonth(schedule.inicia_em)}</span></time>
      <div><strong>{schedule.titulo}</strong><span>{formatDate(schedule.inicia_em)} · {schedule.local || "Local não informado"}</span><small>{schedule.designacoes.length} integrantes · {schedule.repertorio.length} itens no repertório</small>{schedule.status === "AGENDADA" && schedule.publicar_em && <SchedulePublicationCountdown opensAt={schedule.publicar_em} />}</div>
      <div className="secretary-card-actions"><button type="button" onClick={() => void onPdf(schedule)} disabled={busy === `pdf-${schedule.id}`}>{busy === `pdf-${schedule.id}` ? "Preparando…" : "PDF"}</button><button type="button" onClick={() => onCalendar(schedule)}>Calendário</button>{schedule.can_manage && schedule.status === "PUBLICADA" && <button type="button" onClick={() => onShare(schedule)} disabled={busy === `share-${schedule.id}`}>Compartilhar</button>}</div>
    </div>
  );
}

const LINK_ICONS: Record<SecretaryLink["tipo"], { classe: string; caminho: React.ReactNode }> = {
  YOUTUBE: { classe: "yt", caminho: <path d="M23 7.5a3 3 0 0 0-2.1-2.1C19 4.9 12 4.9 12 4.9s-7 0-8.9.5A3 3 0 0 0 1 7.5 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.5 31 31 0 0 0-.5-4.5zM9.8 15.3V8.7l6 3.3z" /> },
  SPOTIFY: { classe: "sp", caminho: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.8.8 0 0 1-1.1.3c-3-1.8-6.7-2.2-11.1-1.2a.8.8 0 1 1-.3-1.5c4.8-1.1 8.9-.6 12.2 1.4.4.2.5.7.3 1zm1.2-2.8a1 1 0 0 1-1.3.3c-3.4-2.1-8.6-2.7-12.6-1.5a1 1 0 1 1-.6-1.9c4.6-1.4 10.3-.7 14.2 1.7.5.3.6.9.3 1.4zm.1-2.9C14.8 8.3 8.5 8.1 4.9 9.2a1.2 1.2 0 1 1-.7-2.3C8.4 5.6 15.3 5.8 19.6 8.4a1.2 1.2 0 0 1-1.2 2z" /> },
  CIFRA_CLUB: { classe: "cc", caminho: <><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="16" r="3" fill="none" stroke="currentColor" strokeWidth="2" /></> },
  GOOGLE_DRIVE: { classe: "gd", caminho: <path d="M8.4 2.6h7.2l6.4 11-3.6 6.2-6.4-11zM7 5.1l7.2 12.4H3.6L2 14.7zM10.5 21.4l3.6-6.2h7.2l-3.6 6.2z" /> },
  PERSONALIZADO: { classe: "lk", caminho: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12.2 19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></> },
};

function PlatformIcon({ tipo }: { tipo: SecretaryLink["tipo"] }) {
  const icon = LINK_ICONS[tipo] || LINK_ICONS.PERSONALIZADO;
  return <svg viewBox="0 0 24 24" fill="currentColor" focusable="false" aria-hidden="true">{icon.caminho}</svg>;
}

function LibraryActionIcon({ name }: { name: "add" | "check" | "edit" | "remove" }) {
  if (name === "add") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
  }
  if (name === "check") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" /></svg>;
  }
  if (name === "edit") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" /><path d="m14.5 6.7 2.8 2.8" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

function ScheduleRepertoire({ schedule }: { schedule: Schedule }) {
  const resources = groupScheduleResources(schedule.repertorio, schedule.links_recursos);
  if (!resources.groups.length && !resources.unmatched.length) return null;
  return (
    <section className="secretary-schedule-repertoire" aria-label="Repertório e links da escala">
      <header><strong>Repertório</strong><span>{schedule.repertorio.length} música(s)</span></header>
      <div>
        {resources.groups.map((group) => (
          <article key={group.title}>
            <strong>{group.title}</strong>
            <div className="secretary-resource-links">
              {group.links.map((link) => (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer" title={`${linkTypeLabel(link.tipo as SecretaryLink["tipo"])} · ${group.title}`}>
                  <span className={`platform-icon ${LINK_ICONS[link.tipo as SecretaryLink["tipo"]]?.classe || "lk"} static`}><PlatformIcon tipo={link.tipo as SecretaryLink["tipo"]} /></span>
                  <span>{linkTypeLabel(link.tipo as SecretaryLink["tipo"])}</span>
                </a>
              ))}
              {!group.links.length && <small>Sem link anexado</small>}
            </div>
          </article>
        ))}
        {resources.unmatched.length > 0 && (
          <article>
            <strong>Outros materiais</strong>
            <div className="secretary-resource-links">
              {resources.unmatched.map((link) => (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer">
                  <span className={`platform-icon ${LINK_ICONS[link.tipo as SecretaryLink["tipo"]]?.classe || "lk"} static`}><PlatformIcon tipo={link.tipo as SecretaryLink["tipo"]} /></span>
                  <span>{link.titulo || linkTypeLabel(link.tipo as SecretaryLink["tipo"])}</span>
                </a>
              ))}
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function EditScheduleDialog({
  schedule,
  ministry,
  teams,
  busy,
  onClose,
  onSubmit,
}: {
  schedule: Schedule;
  ministry: Ministry;
  teams: MinistryTeam[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (
    schedule: Schedule,
    event: FormEvent<HTMLFormElement>,
    teams: SelectedScheduleTeam[],
  ) => void;
}) {
  const [repertoireValue, setRepertoireValue] = useState(
    schedule.repertorio.join("\n"),
  );
  const repertoirePreview = useMemo(
    () => repertoireValue
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    [repertoireValue],
  );
  const [selectedScheduleTeams, setSelectedScheduleTeams] = useState<
    SelectedScheduleTeam[]
  >(() =>
    schedule.equipes.length
      ? schedule.equipes.map((team) => ({
          equipeId: team.equipe_id,
          funcao: team.funcao,
        }))
      : schedule.equipe_id
        ? [{ equipeId: schedule.equipe_id, funcao: "" }]
        : [],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="secretary-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="secretary-share-dialog secretary-edit-schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-schedule-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="pilot-kicker">GERENCIAR ESCALA</p>
            <h2 id="edit-schedule-title">Editar escala</h2>
          </div>
          <button type="button" aria-label="Fechar editor" onClick={onClose}>×</button>
        </header>
        <p>Atualize as informações principais e revise o repertório sem alterar as confirmações dos integrantes.</p>
        <form className="secretary-form secretary-edit-schedule-form" onSubmit={(event) => onSubmit(schedule, event, selectedScheduleTeams)}>
          <div className="secretary-edit-repertoire-preview">
            <div>
              <strong>Repertório atual</strong>
              <small>A prévia muda enquanto você ajusta os itens abaixo.</small>
            </div>
            <ScheduleRepertoire schedule={{ ...schedule, repertorio: repertoirePreview }} />
            {!repertoirePreview.length && <p>Nenhum item no repertório.</p>}
          </div>
          <div className="secretary-form-grid">
            <label className="span-2">Título<input name="titulo" required maxLength={140} defaultValue={schedule.titulo} /></label>
            <fieldset className="span-2 secretary-schedule-teams">
              <legend>Equipes na escala</legend>
              <p>As equipes escolhidas aparecem separadas na escala. Remova primeiro as designações da equipe antes de retirá-la daqui.</p>
              <div>
                {teams.map((team) => {
                  const selection = selectedScheduleTeams.find((item) => item.equipeId === team.id);
                  return (
                    <section key={team.id} data-selected={Boolean(selection)}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(selection)}
                          onChange={() => setSelectedScheduleTeams((current) =>
                            selection
                              ? current.filter((item) => item.equipeId !== team.id)
                              : [...current, { equipeId: team.id, funcao: "" }],
                          )}
                        />
                        <span>{team.nome}</span>
                        <small>{team.membros.length} integrantes</small>
                      </label>
                      {selection && (
                        <label className="secretary-team-duty">
                          <span>Função/local desta equipe</span>
                          <input
                            value={selection.funcao}
                            onChange={(event) => setSelectedScheduleTeams((current) =>
                              current.map((item) => item.equipeId === team.id
                                ? { ...item, funcao: event.target.value }
                                : item),
                            )}
                            maxLength={180}
                            placeholder="Ex.: Velha, Centro ou Recepção"
                          />
                        </label>
                      )}
                    </section>
                  );
                })}
              </div>
            </fieldset>
            <label>Responsável<select name="responsavelUsuarioId" defaultValue={schedule.responsavel_usuario_id || ""}><option value="">Não definido</option>{ministry.voluntarios.map((volunteer) => <option key={volunteer.id} value={volunteer.usuario_id}>{volunteer.nome}</option>)}</select></label>
            <label>Início<input name="iniciaEm" type="datetime-local" required defaultValue={toLocalDateTimeInput(schedule.inicia_em)} /></label>
            <label>Término<input name="terminaEm" type="datetime-local" required defaultValue={toLocalDateTimeInput(schedule.termina_em)} /></label>
            <label className="span-2">Local<input name="local" maxLength={180} defaultValue={schedule.local} /></label>
            <label className="span-2">Ajustar repertório<textarea name="repertorio" rows={5} maxLength={8000} value={repertoireValue} onChange={(event) => setRepertoireValue(event.target.value)} placeholder={"Uma música ou conteúdo por linha"} /></label>
            <label className="span-2">Observações<textarea name="observacoes" rows={4} maxLength={1200} defaultValue={schedule.observacoes} /></label>
          </div>
          <footer className="secretary-edit-schedule-footer">
            <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function LinkBuilder({ links, setLinks, libraryItems, selectedItemIds, onToggleItem, onUseSaved, onRemoveSaved, onRenameItem, onRemoveItem, onSaveCurrent, busy }: {
  links: SecretaryLink[];
  setLinks: React.Dispatch<React.SetStateAction<SecretaryLink[]>>;
  libraryItems: SecretaryLibraryItem[];
  selectedItemIds: number[];
  onToggleItem: (item: SecretaryLibraryItem) => void;
  onUseSaved: (link: ReusableSecretaryLink) => void;
  onRemoveSaved: (link: ReusableSecretaryLink) => void;
  onRenameItem: (item: SecretaryLibraryItem, titulo: string) => void;
  onRemoveItem: (item: SecretaryLibraryItem) => void;
  onSaveCurrent: (titulo: string) => void;
  busy: string;
}) {
  const [search, setSearch] = useState("");
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? libraryItems.filter((item) => item.titulo.toLowerCase().includes(term) || item.links.some((link) => link.url.toLowerCase().includes(term))) : libraryItems;
  }, [libraryItems, search]);
  const selectedItems = useMemo(
    () => libraryItems.filter((item) => selectedItemIds.includes(item.id)),
    [libraryItems, selectedItemIds],
  );

  return (
    <div className="secretary-link-builder">
      <section className="ministry-library" aria-label="Biblioteca do ministério">
        <header><div><strong>Biblioteca do ministério</strong><small>Cada item reúne todos os links da mesma música ou material.</small></div><span>{libraryItems.length}</span></header>
        {libraryItems.length > 0 && <div className="ministry-library-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar música ou material…" aria-label="Buscar na biblioteca do ministério" /></div>}
        <div className="ministry-library-list">
          {filteredItems.map((item) => {
            const selected = selectedItemIds.includes(item.id);
            return (
            <div className={`ministry-library-entry${selected ? " is-selected" : ""}`} key={item.id}>
              <div className={`ministry-library-row${openItemId === item.id ? " is-open" : ""}${selected ? " is-selected" : ""}`}>
                {renamingId === item.id ? <input className="ministry-library-rename" autoFocus defaultValue={item.titulo} maxLength={120} aria-label="Novo nome do item" onBlur={(event) => { onRenameItem(item, event.target.value); setRenamingId(null); }} onKeyDown={(event) => { if (event.key === "Enter") { onRenameItem(item, event.currentTarget.value); setRenamingId(null); } if (event.key === "Escape") setRenamingId(null); }} /> : <button type="button" className="ministry-library-name" onClick={() => setOpenItemId((current) => current === item.id ? null : item.id)} aria-expanded={openItemId === item.id}>{item.titulo}</button>}
                <div className="ministry-library-actions">
                  <div className="ministry-library-icons">
                    {item.links.map((link) => <button key={link.id} type="button" className={`platform-icon ${LINK_ICONS[link.tipo]?.classe || "lk"}`} title={`Usar ${linkTypeLabel(link.tipo)}`} onClick={() => onUseSaved(link)}><PlatformIcon tipo={link.tipo} /><span className="sr-only">{linkTypeLabel(link.tipo)}</span></button>)}
                    <button type="button" className="platform-icon add" title="Adicionar outro link a este item" onClick={() => { setItemTitle(item.titulo); setLinks((current) => [...current, { id: crypto.randomUUID(), tipo: "YOUTUBE", titulo: item.titulo, url: "" }]); }}><LibraryActionIcon name="add" /></button>
                  </div>
                  <button type="button" className={`ministry-library-select${selected ? " selected" : ""}`} aria-pressed={selected} onClick={() => onToggleItem(item)}><LibraryActionIcon name="check" /><span>{selected ? "Selecionada" : "Selecionar"}</span></button>
                  <button type="button" className="ministry-library-rename-action" title="Renomear item" aria-label={`Renomear ${item.titulo}`} onClick={() => setRenamingId(item.id)}><LibraryActionIcon name="edit" /></button>
                  <button type="button" className="ministry-library-delete" title="Excluir item" aria-label={`Excluir ${item.titulo}`} disabled={busy === `removing-library-item-${item.id}`} onClick={() => onRemoveItem(item)}><LibraryActionIcon name="remove" /></button>
                </div>
              </div>
              {openItemId === item.id && <div className="ministry-library-detail">{item.links.map((link) => <div key={link.id}><span className={`platform-icon ${LINK_ICONS[link.tipo]?.classe || "lk"} static`}><PlatformIcon tipo={link.tipo} /></span><small>{link.url}</small><button type="button" onClick={() => onUseSaved(link)}>Usar</button><button type="button" className="danger" disabled={busy === `removing-reusable-link-${link.id}`} onClick={() => onRemoveSaved(link)}>Remover</button></div>)}{!item.links.length && <p>Este item ainda não tem links salvos.</p>}</div>}
            </div>
          );})}
          {!libraryItems.length && <p className="ministry-library-empty">Nenhum item salvo neste ministério.</p>}
          {Boolean(libraryItems.length) && !filteredItems.length && <p className="ministry-library-empty">Nenhum item encontrado para “{search}”.</p>}
        </div>
      </section>
      {selectedItemIds.length > 0 && (
        <section className="secretary-selected-repertoire" aria-live="polite">
          <header>
            <strong>{selectedItemIds.length} música(s) selecionada(s)</strong>
            <span>Links incluídos na escala</span>
          </header>
          <ul aria-label="Músicas selecionadas para a escala">
            {selectedItems.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.titulo}</strong>
                  <span className="secretary-selected-repertoire-links" aria-label={`Links de ${item.titulo}`}>
                    {item.links.map((link) => (
                      <span key={link.id} className={`platform-icon ${LINK_ICONS[link.tipo]?.classe || "lk"} static`} title={linkTypeLabel(link.tipo)}>
                        <PlatformIcon tipo={link.tipo} />
                        <span className="sr-only">{linkTypeLabel(link.tipo)}</span>
                      </span>
                    ))}
                    {!item.links.length && <small>Sem link</small>}
                  </span>
                </div>
                <button type="button" onClick={() => onToggleItem(item)} aria-label={`Remover ${item.titulo} da seleção`} title="Remover da seleção">
                  <LibraryActionIcon name="remove" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {links.map((item) => <div className="secretary-link-draft" key={item.id}><select value={item.tipo} onChange={(event) => setLinks((current) => current.map((link) => link.id === item.id ? { ...link, tipo: event.target.value as SecretaryLink["tipo"] } : link))}><option value="YOUTUBE">YouTube</option><option value="SPOTIFY">Spotify</option><option value="CIFRA_CLUB">Cifra Club</option><option value="GOOGLE_DRIVE">Google Drive</option><option value="PERSONALIZADO">Personalizado</option></select><input value={item.titulo} onChange={(event) => setLinks((current) => current.map((link) => link.id === item.id ? { ...link, titulo: event.target.value } : link))} placeholder="Título do recurso" maxLength={100} /><input value={item.url} onChange={(event) => setLinks((current) => current.map((link) => link.id === item.id ? { ...link, url: event.target.value } : link))} placeholder="https://…" type="url" /><div className="secretary-link-draft-actions"><button type="button" aria-label={`Adicionar outro link para ${item.titulo || "este recurso"}`} onClick={() => setLinks((current) => [...current, { id: crypto.randomUUID(), tipo: "YOUTUBE", titulo: item.titulo, url: "" }])}>＋ link</button><button type="button" aria-label="Remover link" onClick={() => setLinks((current) => current.filter((link) => link.id !== item.id))}>×</button></div></div>)}
      <div className="secretary-link-actions"><button type="button" onClick={() => setLinks((current) => [...current, { id: crypto.randomUUID(), tipo: "YOUTUBE", titulo: "", url: "" }])}>+ Nova música ou recurso</button><div className="secretary-library-save"><input value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} placeholder="Nome do item na biblioteca (ex.: Mil Graus)" maxLength={120} aria-label="Nome do item na biblioteca" /><button type="button" disabled={busy === "saving-reusable-links" || !links.some((item) => item.titulo.trim() && item.url.trim())} onClick={() => { onSaveCurrent(itemTitle); setItemTitle(""); }}>{busy === "saving-reusable-links" ? "Salvando…" : "Salvar na biblioteca"}</button></div></div>
    </div>
  );
}

function linkTypeLabel(type: SecretaryLink["tipo"]) {
  return ({
    YOUTUBE: "YouTube",
    SPOTIFY: "Spotify",
    CIFRA_CLUB: "Cifra Club",
    GOOGLE_DRIVE: "Google Drive",
    PERSONALIZADO: "Personalizado",
  } as const)[type];
}

function MinistryAccessHistory({ schedules }: { schedules: Schedule[] }) {
  const manageableSchedules = useMemo(
    () => schedules.filter((schedule) => Boolean(schedule.can_manage)),
    [schedules],
  );
  const [entries, setEntries] = useState<Array<TemporaryAccessSummary & {
    scheduleId: number;
    scheduleTitle: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [workingEntryId, setWorkingEntryId] = useState<number | null>(null);
  const [retentionDays, setRetentionDays] = useState(30);
  const [savingRetention, setSavingRetention] = useState(false);
  const [retentionFeedback, setRetentionFeedback] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(
        manageableSchedules.map(async (schedule) => {
          const response = await fetch(`/api/pilot/escalas/${schedule.id}/acessos`, {
            cache: "no-store",
          });
          const payload = await readJson<{ acessos?: TemporaryAccessSummary[]; retencaoDias?: number; error?: string }>(response);
          if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o histórico.");
          return {
            retentionDays: payload.retencaoDias || 30,
            entries: (payload.acessos || []).map((entry) => ({
              ...entry,
              scheduleId: schedule.id,
              scheduleTitle: schedule.titulo,
            })),
          };
        }),
      );
      setRetentionDays(results[0]?.retentionDays || 30);
      setEntries(results.flatMap((result) => result.entries).sort((left, right) => right.id - left.id));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [manageableSchedules]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const schedule = manageableSchedules[0];
    if (!schedule) return;
    setSavingRetention(true);
    setRetentionFeedback("");
    setError("");
    try {
      const response = await fetch(`/api/pilot/escalas/${schedule.id}/acessos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retencaoDias: retentionDays }),
      });
      const payload = await readJson<{ retencaoDias?: number; excluidos?: number; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar o prazo de retenção.");
      setRetentionDays(payload.retencaoDias || retentionDays);
      setRetentionFeedback(
        payload.excluidos
          ? `${payload.excluidos} registro(s) antigo(s) foram excluídos.`
          : "Prazo salvo. A limpeza será aplicada automaticamente.",
      );
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSavingRetention(false);
    }
  }

  async function cancel(entry: (typeof entries)[number]) {
    if (!window.confirm(`Cancelar o acesso de ${entry.beneficiarioNome}?`)) return;
    setWorkingEntryId(entry.id);
    setError("");
    const previous = entries;
    setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, status: "CANCELADO" } : item));
    try {
      const response = await fetch(
        `/api/pilot/escalas/${entry.scheduleId}/acessos/${entry.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "CANCELAR" }),
        },
      );
      const payload = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Não foi possível cancelar o acesso.");
    } catch (cause) {
      setEntries(previous);
      setError((cause as Error).message);
    } finally {
      setWorkingEntryId(null);
    }
  }

  async function removeHistory(entry: (typeof entries)[number]) {
    const active = ["PENDENTE", "AGUARDANDO_HORARIO", "ATIVO"].includes(entry.status);
    const warning = active
      ? "Este acesso ainda está ativo e será revogado imediatamente."
      : "O registro deixará de aparecer no histórico do ministério.";
    if (!window.confirm(`Excluir o histórico de ${entry.beneficiarioNome}?\n\n${warning}`)) return;
    setWorkingEntryId(entry.id);
    setError("");
    const previous = entries;
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    try {
      const response = await fetch(
        `/api/pilot/escalas/${entry.scheduleId}/acessos/${entry.id}`,
        { method: "DELETE" },
      );
      const payload = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir o histórico.");
    } catch (cause) {
      setEntries(previous);
      setError((cause as Error).message);
    } finally {
      setWorkingEntryId(null);
    }
  }

  return (
    <section className="secretary-card secretary-access-history-page">
      <header>
        <div><p className="pilot-kicker">HISTÓRICO DO MINISTÉRIO</p><h2>Acessos temporários</h2><p>Registros em texto, separados do fluxo de compartilhamento.</p></div>
        <div className="secretary-history-controls">
          <form className="secretary-history-retention" onSubmit={saveRetention}>
            <label>Excluir registros encerrados após<input type="number" min="1" max="30" step="1" value={retentionDays} onChange={(event) => setRetentionDays(Math.min(30, Math.max(1, Number(event.target.value) || 1)))} aria-label="Dias para exclusão automática do histórico" /><span>dias</span></label>
            <button disabled={savingRetention || !manageableSchedules.length}>{savingRetention ? "Salvando…" : "Salvar prazo"}</button>
          </form>
          <button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar histórico"}</button>
        </div>
      </header>
      <p className="secretary-history-retention-note">O prazo pode ser de 1 a 30 dias. Acessos ativos nunca entram na exclusão automática.</p>
      {retentionFeedback && <p className="secretary-share-status" role="status">{retentionFeedback}</p>}
      {error && <p className="secretary-share-error" role="alert">{error}</p>}
      <div className="secretary-access-history-text">
        {entries.map((entry) => (
          <article key={entry.id}>
            <span className="secretary-whatsapp-avatar">{entry.beneficiarioFoto ? <img src={entry.beneficiarioFoto} alt="" loading="lazy" /> : initials(entry.beneficiarioNome)}</span>
            <p><strong>{entry.beneficiarioNome}</strong> recebeu acesso a <b>{entry.recursoLabel}</b> na escala “{entry.scheduleTitle}”, de {formatDate(entry.iniciaEm)} até {formatDate(entry.terminaEm)}.</p>
            <small data-status={entry.status.toLowerCase()}>{entry.status.replaceAll("_", " ")}</small>
            <div className="secretary-access-history-actions">
              {["PENDENTE", "AGUARDANDO_HORARIO", "ATIVO"].includes(entry.status) && <button type="button" disabled={workingEntryId === entry.id} onClick={() => void cancel(entry)}>Cancelar acesso</button>}
              <button type="button" className="danger" disabled={workingEntryId === entry.id} onClick={() => void removeHistory(entry)}>{workingEntryId === entry.id ? "Processando…" : "Excluir histórico"}</button>
            </div>
          </article>
        ))}
        {!loading && !entries.length && <p>Nenhum acesso temporário foi criado para este ministério.</p>}
      </div>
    </section>
  );
}

function ShareDialogV2({
  schedule,
  onClose,
}: {
  schedule: Schedule;
  onClose: () => void;
}) {
  const parkingMinistry =
    schedule.ministerio_categoria === "ESTACIONAMENTO" ||
    schedule.ministerio_nome.toLocaleLowerCase("pt-BR").includes("estacionamento");
  const [multiPersonMode, setMultiPersonMode] = useState(false);
  const [selectedDesignationIds, setSelectedDesignationIds] = useState<number[]>(
    schedule.designacoes[0]?.id ? [schedule.designacoes[0].id] : [],
  );
  const [resource, setResource] = useState<"ESCALA_LEITURA" | "ESTACIONAMENTO">(
    parkingMinistry ? "ESTACIONAMENTO" : "ESCALA_LEITURA",
  );
  const [startsAt, setStartsAt] = useState(() => toLocalDateTimeInput(schedule.inicia_em));
  const [endsAt, setEndsAt] = useState(() => toLocalDateTimeInput(schedule.termina_em));
  const [created, setCreated] = useState<Array<{
    id: number;
    token: string;
    status: string;
    recursoLabel: string;
    beneficiarioNome: string;
    iniciaEm: string;
    terminaEm: string;
  }>>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("Copiar mensagem");
  const [shareStatus, setShareStatus] = useState("");
  const selectedAssignments = schedule.designacoes.filter((assignment) =>
    selectedDesignationIds.includes(assignment.id),
  );
  const directRecipient = selectedAssignments.length === 1 ? selectedAssignments[0] : null;
  const generatedAccesses =
    typeof window === "undefined"
      ? []
      : created.map((access) => ({
          ...access,
          url: `${window.location.origin}/acesso/${access.token}`,
        }));
  const safeMessage = message.trim().slice(0, 6000);
  const accessWindowError = temporaryAccessWindowError(startsAt, endsAt);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function createAccess() {
    if (!selectedDesignationIds.length || !selectedAssignments.length || !startsAt || !endsAt) {
      setError("Selecione uma ou mais pessoas, o recurso e o período.");
      return;
    }
    if (accessWindowError) {
      setError(accessWindowError);
      return;
    }
    setLoading(true);
    setError("");
    setCreated([]);
    try {
      const response = await fetch(`/api/pilot/escalas/${schedule.id}/acessos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designacaoIds: selectedDesignationIds,
          recurso: resource,
          iniciaEm: new Date(startsAt).toISOString(),
          terminaEm: new Date(endsAt).toISOString(),
        }),
      });
      const result = (await response.json()) as {
        acessos?: Array<{
          id: number;
          token: string;
          status: string;
          recursoLabel: string;
          beneficiarioNome: string;
          iniciaEm: string;
          terminaEm: string;
        }>;
        error?: string;
      };
      if (!response.ok || !result.acessos?.length) {
        throw new Error(result.error || "Não foi possível criar os acessos temporários.");
      }
      const next = result.acessos;
      setCreated(next);
      setMessage(
        buildTemporaryAccessGroupMessage({
          schedule,
          accesses: next.map((item) => ({
            personName: item.beneficiarioNome,
            resourceLabel: item.recursoLabel,
            startsAt: item.iniciaEm,
            endsAt: item.terminaEm,
            url: `${window.location.origin}/acesso/${item.token}`,
          })),
        }),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyGeneratedMessage() {
    if (!safeMessage) return;
    try {
      await navigator.clipboard.writeText(safeMessage);
      setCopyStatus(created.length > 1 ? "Mensagem e links copiados" : "Mensagem copiada");
    } catch {
      setCopyStatus("Selecione e copie a mensagem");
    }
    window.setTimeout(() => setCopyStatus("Copiar mensagem"), 2_000);
  }

  async function shareGeneratedMessage(recipientName?: string) {
    if (!safeMessage) return;
    setShareStatus("");
    try {
      if (shareToWhatsAppApp(safeMessage)) {
        setShareStatus(
          recipientName
            ? `WhatsApp aberto para enviar a ${recipientName}.`
            : "WhatsApp aberto. Escolha a conversa ou o grupo.",
        );
        return;
      }
      if (navigator.share) {
        await navigator.share({
          title: `Acesso temporário — ${schedule.titulo}`,
          text: safeMessage,
        });
        setShareStatus(
          recipientName
            ? `Mensagem preparada para enviar a ${recipientName}.`
            : "Escolha o WhatsApp e depois a conversa ou grupo.",
        );
        return;
      }
      await navigator.clipboard.writeText(safeMessage);
      setShareStatus("Mensagem copiada. Abra o WhatsApp e cole na conversa desejada.");
    } catch (cause) {
      if ((cause as Error).name === "AbortError") return;
      setShareStatus("Não foi possível abrir o compartilhamento. Use Copiar mensagem.");
    }
  }

  function resetGeneratedAccess() {
    setCreated([]);
    setMessage("");
    setShareStatus("");
    setError("");
  }

  return (
    <div className="secretary-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="secretary-share-dialog secretary-share-dialog-v2" role="dialog" aria-modal="true" aria-labelledby="share-v2-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><p className="pilot-kicker">COMPARTILHAMENTO TEMPORÁRIO</p><h2 id="share-v2-title">{schedule.titulo}</h2></div>
          <button type="button" aria-label="Fechar" onClick={onClose}>×</button>
        </header>
        <p>Autorize uma pessoa escalada, em uma única comunidade, para um único recurso e período.</p>

        <fieldset className="secretary-share-section">
          <legend>1. Pessoa autorizada</legend>
          <label className="secretary-share-multiple-toggle">
            <input
              type="checkbox"
              checked={multiPersonMode}
              onChange={(event) => {
                const enabled = event.target.checked;
                setMultiPersonMode(enabled);
                setSelectedDesignationIds((current) =>
                  enabled ? current : current.slice(0, 1),
                );
                setCreated([]);
              }}
            />
            <span>
              <strong>Selecionar várias pessoas para enviar em um grupo</strong>
              <small>Cada pessoa recebe um link individual e só consegue abrir o próprio acesso.</small>
            </span>
          </label>
          {multiPersonMode && schedule.designacoes.length > 1 && (
            <button
              type="button"
              className="secretary-share-select-all"
              onClick={() => {
                setSelectedDesignationIds((current) =>
                  current.length === schedule.designacoes.length
                    ? []
                    : schedule.designacoes.map((assignment) => assignment.id),
                );
                setCreated([]);
              }}
            >
              {selectedDesignationIds.length === schedule.designacoes.length
                ? "Limpar seleção"
                : "Selecionar todas as pessoas"}
            </button>
          )}
          <div className="secretary-share-person-grid">
            {schedule.designacoes.map((assignment) => {
              const selected = selectedDesignationIds.includes(assignment.id);
              return (
              <button
                type="button"
                key={assignment.id}
                className={selected ? "active" : ""}
                onClick={() => {
                  setSelectedDesignationIds((current) => {
                    if (!multiPersonMode) return [assignment.id];
                    return current.includes(assignment.id)
                      ? current.filter((id) => id !== assignment.id)
                      : [...current, assignment.id];
                  });
                  setCreated([]);
                }}
                aria-pressed={selected}
              >
                <span className="secretary-whatsapp-avatar">
                  {assignment.foto_perfil
                    ? <img src={assignment.foto_perfil} alt="" loading="lazy" />
                    : initials(assignment.nome)}
                </span>
                <div>
                  <VerifiedOwnerName name={assignment.nome} verified={Boolean(assignment.owner_verified)} />
                  <small>{assignment.funcao}</small>
                </div>
                <i aria-hidden="true">{selected ? "✓" : ""}</i>
              </button>
              );
            })}
          </div>
          {!schedule.designacoes.length && <p>Nenhuma pessoa está designada nesta escala.</p>}
        </fieldset>

        <fieldset className="secretary-share-section">
          <legend>2. Aba ou recurso permitido</legend>
          <div className="secretary-share-resource-grid">
            <button type="button" className={resource === "ESCALA_LEITURA" ? "active" : ""} onClick={() => { setResource("ESCALA_LEITURA"); resetGeneratedAccess(); }} aria-pressed={resource === "ESCALA_LEITURA"}>
              <strong>Escala em leitura</strong><small>Somente os dados operacionais desta escala.</small>
            </button>
            {parkingMinistry && (
              <button type="button" className={resource === "ESTACIONAMENTO" ? "active" : ""} onClick={() => { setResource("ESTACIONAMENTO"); resetGeneratedAccess(); }} aria-pressed={resource === "ESTACIONAMENTO"}>
                <strong>Estacionamento</strong><small>Apenas a aba operacional protegida.</small>
              </button>
            )}
          </div>
        </fieldset>

        <fieldset className="secretary-share-window">
          <legend>3. Horário autorizado</legend>
          <label>Início<input type="datetime-local" value={startsAt} step={60} onChange={(event) => { setStartsAt(event.target.value); resetGeneratedAccess(); }} /></label>
          <label>Término<input type="datetime-local" value={endsAt} step={60} onChange={(event) => { setEndsAt(event.target.value); resetGeneratedAccess(); }} /></label>
          <button type="button" disabled={loading || !selectedDesignationIds.length || !startsAt || !endsAt || Boolean(accessWindowError)} onClick={() => void createAccess()}>{loading ? "Validando…" : selectedDesignationIds.length > 1 ? `Gerar ${selectedDesignationIds.length} acessos pessoais` : "Gerar acesso pessoal"}</button>
          <small>Escolha livremente o início e o término. Por segurança, cada liberação pode durar no máximo 31 dias.</small>
          {accessWindowError && <small className="secretary-share-window-error" role="alert">{accessWindowError}</small>}
        </fieldset>

        {error && <p className="secretary-share-error" role="alert">{error}</p>}

        {created.length > 0 && (
          <section className="secretary-generated-access" aria-live="polite">
            <header>
              <div>
                <small>{created.length > 1 ? "ACESSOS PESSOAIS CRIADOS" : created[0].status.replaceAll("_", " ")}</small>
                <strong>{created.length > 1 ? `${created.length} pessoas autorizadas` : `Acesso criado para ${created[0].beneficiarioNome}`}</strong>
              </div>
              <span>{created[0].recursoLabel}</span>
            </header>
            <div className="secretary-generated-links">
              {generatedAccesses.map((access) => (
                <article key={access.id}>
                  <div><strong>{access.beneficiarioNome}</strong><small>Link individual — exige a conta correta</small></div>
                  <input readOnly value={access.url} aria-label={`Link de ${access.beneficiarioNome}`} onFocus={(event) => event.currentTarget.select()} />
                  <button type="button" onClick={() => void navigator.clipboard.writeText(access.url)}>Copiar</button>
                </article>
              ))}
            </div>
            <label className="secretary-share-message">Mensagem para envio<textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 6000))} rows={Math.min(12, 7 + created.length)} maxLength={6000} /></label>
            <div className="secretary-share-actions">
              <button type="button" onClick={() => void copyGeneratedMessage()}>{copyStatus}</button>
              <button type="button" onClick={() => void shareGeneratedMessage()}>Escolher conversa ou grupo</button>
              {directRecipient?.telefone && <button type="button" onClick={() => void shareGeneratedMessage(directRecipient.nome)}>Enviar para contato</button>}
              <a href={`https://t.me/share/url?url=${encodeURIComponent(generatedAccesses[0]?.url || "")}&text=${encodeURIComponent(safeMessage)}`} target="_blank" rel="noreferrer">Telegram</a>
              <a href={`mailto:?subject=${encodeURIComponent(`Acesso temporário — ${schedule.titulo}`)}&body=${encodeURIComponent(safeMessage)}`}>E-mail</a>
              <button type="button" onClick={() => void downloadFileForDevice(`/api/pilot/escalas/${schedule.id}/pdf?download=1`, `escala-${schedule.titulo}.pdf`).catch((cause) => setShareStatus((cause as Error).message || "Não foi possível abrir o PDF."))}>Baixar PDF</button>
              <button type="button" onClick={() => downloadScheduleImage(schedule)}>Baixar imagem</button>
            </div>
            {shareStatus && <p className="secretary-share-status" role="status">{shareStatus}</p>}
          </section>
        )}

      </section>
    </div>
  );
}

function buildTemporaryAccessGroupMessage({
  schedule,
  accesses,
}: {
  schedule: Schedule;
  accesses: Array<{
    personName: string;
    resourceLabel: string;
    startsAt: string;
    endsAt: string;
    url: string;
  }>;
}) {
  const first = accesses[0];
  if (!first) return "";
  if (accesses.length === 1) {
    return [
      `Olá, ${first.personName}.`,
      "",
      `Escala: ${schedule.titulo}`,
      `Ministério: ${schedule.ministerio_nome}`,
      `Acesso permitido: ${first.resourceLabel}`,
      `Início: ${formatDate(first.startsAt)}`,
      `Término: ${formatDate(first.endsAt)}`,
      "Entre com a conta vinculada à escala:",
      first.url,
    ].join("\n");
  }
  return [
    "Olá, equipe.",
    "",
    `Escala: ${schedule.titulo}`,
    `Ministério: ${schedule.ministerio_nome}`,
    `Acesso permitido: ${first.resourceLabel}`,
    `Início: ${formatDate(first.startsAt)}`,
    `Término: ${formatDate(first.endsAt)}`,
    "",
    "Cada pessoa deve abrir somente o link ao lado do próprio nome:",
    ...accesses.flatMap((access, index) => [
      "",
      `${index + 1}. ${access.personName}`,
      access.url,
    ]),
  ].join("\n");
}

function temporaryAccessWindowError(startsAt: string, endsAt: string) {
  if (!startsAt || !endsAt) return "";
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "Informe datas e horários válidos.";
  }
  if (end <= start) return "O término precisa ser posterior ao início.";
  if (end <= Date.now()) return "O término da liberação precisa estar no futuro.";
  if (end - start > 31 * 24 * 60 * 60 * 1000) {
    return "A liberação pode durar no máximo 31 dias.";
  }
  return "";
}

function downloadScheduleImage(schedule: Schedule) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1200;
  const context = canvas.getContext("2d");
  if (!context) return;
  const gradient = context.createLinearGradient(0, 0, 1200, 1200);
  gradient.addColorStop(0, "#111827");
  gradient.addColorStop(1, "#312e81");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#38d9d1";
  context.font = "700 28px sans-serif";
  context.fillText("VÍNKULO · SECRETARIA MINISTERIAL", 72, 90);
  context.fillStyle = "#ffffff";
  context.font = "700 60px sans-serif";
  drawWrappedText(context, schedule.titulo, 72, 190, 1040, 72);
  context.fillStyle = "#cbd5e1";
  context.font = "32px sans-serif";
  context.fillText(`${formatDate(schedule.inicia_em)} · ${schedule.local || "Local não informado"}`, 72, 360);
  context.fillStyle = "#ffffff";
  context.font = "700 30px sans-serif";
  context.fillText("EQUIPE", 72, 460);
  context.font = "27px sans-serif";
  drawWrappedText(context, schedule.designacoes.map((item) => `${item.nome} — ${item.funcao}`).join("  •  ") || "Equipe a definir", 72, 510, 1040, 42);
  context.font = "700 30px sans-serif";
  context.fillText("REPERTÓRIO", 72, 750);
  context.font = "27px sans-serif";
  drawWrappedText(context, schedule.repertorio.join("  •  ") || "Nenhum item informado", 72, 800, 1040, 42);
  context.fillStyle = "#38d9d1";
  context.font = "700 24px sans-serif";
  context.fillText("V4.7.3 · Escala gerada pela plataforma", 72, 1120);
  const link = document.createElement("a");
  link.download = `escala-${schedule.id}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      context.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) context.fillText(line, x, y);
}

function formBody(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}

async function readJson<T>(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Fio do Ministério: a linha de checkpoints de uma escala, da criação até o dia
 * do culto. Mistura o que o sistema já sabe sozinho (publicação agendada,
 * confirmações da equipe) com as etapas que o ministério definiu.
 */
type FioNode = {
  id: string;
  titulo: string;
  estado: "feito" | "pronto" | "aguardando" | "pendente";
  detalhe?: React.ReactNode;
  step?: FioStep;
};

function fioNodes(schedule: Schedule, agora: number): FioNode[] {
  const confirmados = schedule.designacoes.filter((item) => item.status === "CONFIRMADA").length;
  const total = schedule.designacoes.length;
  const publicada = ["PUBLICADA", "AGUARDANDO_CHECKLIST", "ENCERRADA"].includes(schedule.status);
  const passou = agora > 0 && Date.parse(schedule.termina_em) < agora;
  const nodes: FioNode[] = [
    { id: "criada", titulo: "Escala criada", estado: "feito", detalhe: formatDate(schedule.criado_em) },
  ];
  if (schedule.status === "AGENDADA" && schedule.publicar_em) {
    nodes.push({
      id: "publicacao",
      titulo: "Publicação para a equipe",
      estado: "aguardando",
      detalhe: <SchedulePublicationCountdown opensAt={schedule.publicar_em} />,
    });
  } else {
    nodes.push({
      id: "publicacao",
      titulo: "Publicação para a equipe",
      estado: publicada ? "feito" : "pendente",
      detalhe: publicada ? "Publicada e equipe notificada" : "Ainda é rascunho",
    });
  }
  for (const step of schedule.fio_etapas) {
    nodes.push({
      id: step.id,
      titulo: step.titulo,
      estado: step.feito ? "feito" : "pendente",
      step,
    });
  }
  if (total > 0) {
    nodes.push({
      id: "equipe",
      titulo: "Equipe confirmada",
      estado: confirmados === total ? "feito" : "pendente",
      detalhe: `${confirmados}/${total} confirmaram presença`,
    });
  }
  const tudoPronto =
    schedule.fio_etapas.every((step) => step.feito) && (!total || confirmados === total);
  nodes.push({
    id: "dia",
    titulo: "Dia do culto",
    estado: passou ? "feito" : tudoPronto && publicada ? "pronto" : "pendente",
    detalhe: formatDate(schedule.inicia_em),
  });
  return nodes;
}

function fioVerdict(schedule: Schedule, agora: number) {
  const confirmados = schedule.designacoes.filter((item) => item.status === "CONFIRMADA").length;
  const total = schedule.designacoes.length;
  const pendentesEtapas = schedule.fio_etapas.filter((step) => !step.feito).length;
  const equipePendente = total > 0 && confirmados < total ? 1 : 0;
  const pendencias = pendentesEtapas + equipePendente;
  if (schedule.status === "RASCUNHO") return { tom: "muted", label: "Rascunho" };
  if (schedule.status === "CANCELADA") return { tom: "muted", label: "Cancelada" };
  if (schedule.status === "AGENDADA") return { tom: "info", label: "Aguardando liberação" };
  const passou = agora > 0 && Date.parse(schedule.termina_em) < agora;
  if (!pendencias) {
    return passou
      ? { tom: "muted", label: "Concluída sem pendências" }
      : { tom: "ok", label: "Tudo pronto" };
  }
  if (passou) return { tom: "bad", label: "Encerrada com pendências" };
  return {
    tom: "warn",
    label: pendencias === 1 ? "Falta 1 item" : `Faltam ${pendencias} itens`,
  };
}

function FioVerdict({ schedule, agora }: { schedule: Schedule; agora: number }) {
  const verdict = fioVerdict(schedule, agora);
  return <span className="fio-verdict" data-tom={verdict.tom}>{verdict.label}</span>;
}

function FioThread({
  schedule,
  agora,
  busy,
  editando,
  onAbrirEdicao,
  onFecharEdicao,
  onAlternarEtapa,
  onSalvarEtapas,
}: {
  schedule: Schedule;
  agora: number;
  busy: string;
  editando: boolean;
  onAbrirEdicao: () => void;
  onFecharEdicao: () => void;
  onAlternarEtapa: (step: FioStep) => void;
  onSalvarEtapas: (titulos: string[]) => void;
}) {
  const nodes = fioNodes(schedule, agora);
  const prontas = schedule.fio_etapas.filter((step) => step.feito).length;
  return (
    <section className="fio-thread-card" aria-label={`Fio da escala ${schedule.titulo}`}>
      <header>
        <div>
          <p className="pilot-kicker">FIO DO MINISTÉRIO</p>
          <strong>
            {schedule.fio_etapas.length
              ? `${prontas}/${schedule.fio_etapas.length} etapas prontas`
              : "Sem etapas definidas nesta escala"}
          </strong>
        </div>
        <FioVerdict schedule={schedule} agora={agora} />
      </header>
      {editando ? (
        <FioStepEditor
          titulosIniciais={schedule.fio_etapas.map((step) => step.titulo)}
          salvando={busy === `fio-etapas-${schedule.id}`}
          onCancelar={onFecharEdicao}
          onSalvar={onSalvarEtapas}
        />
      ) : (
        <>
          <ol className="fio-thread">
            {nodes.map((node, index) => (
              <li className="fio-node" data-estado={node.estado} style={{ "--i": index } as CSSProperties} key={node.id}>
                {node.step ? (
                  <button
                    type="button"
                    className="fio-node-toggle"
                    disabled={busy === `fio-${schedule.id}-${node.step.id}`}
                    onClick={() => onAlternarEtapa(node.step as FioStep)}
                    aria-pressed={node.estado === "feito"}
                  >
                    <span className="fio-checkbox" aria-hidden="true">{node.estado === "feito" ? "✓" : ""}</span>
                    <span className="fio-node-title">{node.titulo}</span>
                  </button>
                ) : (
                  <p className="fio-node-title">{node.titulo}</p>
                )}
                {node.detalhe && <div className="fio-node-detail">{node.detalhe}</div>}
              </li>
            ))}
          </ol>
          {Boolean(schedule.can_manage) && (
            <button type="button" className="fio-edit-trigger" onClick={onAbrirEdicao}>
              {schedule.fio_etapas.length ? "Ajustar etapas desta escala" : "Definir etapas desta escala"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

type FioTemplateValue = { habilitado: boolean; etapas: string[] };

/**
 * Modelo do Fio guardado no ministério. Ele não é a lista de uma escala: é o
 * ponto de partida que cada escala nova recebe e depois varia por conta
 * própria. As sugestões mudam com a categoria porque o caso que originou o Fio
 * é o louvor ("o som está testado?"), mas recepção e mídia têm a mesma rotina.
 */
const FIO_SUGESTOES: Record<string, string[]> = {
  LOUVOR: [
    "Repertório fechado",
    "Tons e cifras enviados",
    "Ensaio confirmado",
    "Som e retornos testados",
    "Slides prontos",
  ],
  MIDIA: ["Roteiro definido", "Câmeras e transmissão testadas", "Slides prontos"],
  RECEPCAO: ["Escala de portas definida", "Materiais separados", "Equipe orientada"],
};
const FIO_SUGESTAO_PADRAO = ["Equipe avisada", "Materiais separados", "Tudo testado no local"];

function FioTemplateFields({
  categoria,
  value,
  onChange,
}: {
  categoria: string;
  value: FioTemplateValue;
  onChange: (next: FioTemplateValue) => void;
}) {
  const sugestoes = FIO_SUGESTOES[categoria] || FIO_SUGESTAO_PADRAO;
  return (
    <div className="fio-template">
      <label className="fio-template-toggle">
        <input
          type="checkbox"
          checked={value.habilitado}
          onChange={(event) =>
            onChange({
              habilitado: event.target.checked,
              etapas:
                event.target.checked && !value.etapas.length ? sugestoes : value.etapas,
            })
          }
        />
        <span>
          <strong>Ativar o Fio do Ministério</strong>
          <small>
            Cada escala ganha um fio de checkpoints para responder, num olhar, se
            está tudo pronto para o dia.
          </small>
        </span>
      </label>
      {value.habilitado && (
        <>
          <FioStepEditor
            titulosIniciais={value.etapas}
            salvando={false}
            modo="embutido"
            onSalvar={(etapas) => onChange({ ...value, etapas })}
          />
          <small className="fio-template-help">
            Estas etapas são o ponto de partida. Cada escala pode acrescentar ou
            tirar as suas depois, sem mexer neste modelo.
          </small>
        </>
      )}
    </div>
  );
}

/** Editor de etapas — usado tanto na escala quanto no modelo do ministério. */
function FioStepEditor({
  titulosIniciais,
  salvando,
  modo = "escala",
  onCancelar,
  onSalvar,
}: {
  titulosIniciais: string[];
  salvando: boolean;
  /**
   * "escala" tem botões próprios e só grava quando o usuário confirma;
   * "embutido" vive dentro de outro formulário e devolve a lista a cada
   * digitada, porque quem grava é o formulário de fora.
   */
  modo?: "escala" | "embutido";
  onCancelar?: () => void;
  onSalvar: (titulos: string[]) => void;
}) {
  const [titulos, setTitulos] = useState<string[]>(
    titulosIniciais.length ? titulosIniciais : [""],
  );
  function aplicar(proximos: string[]) {
    setTitulos(proximos);
    if (modo === "embutido") onSalvar(limpar(proximos));
  }
  return (
    <div className="fio-editor" data-modo={modo}>
      {titulos.map((titulo, index) => (
        <div className="fio-editor-row" key={index}>
          <span className="fio-editor-bullet" aria-hidden="true" />
          <input
            value={titulo}
            maxLength={120}
            placeholder="Ex.: Som e slides testados"
            aria-label={`Etapa ${index + 1}`}
            onChange={(event) =>
              aplicar(titulos.map((item, position) => (position === index ? event.target.value : item)))
            }
          />
          <button
            type="button"
            className="fio-editor-remove"
            aria-label={`Remover etapa ${index + 1}`}
            onClick={() => aplicar(titulos.filter((_, position) => position !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <div className="fio-editor-actions">
        <button
          type="button"
          className="fio-add"
          disabled={titulos.length >= 12}
          onClick={() => aplicar([...titulos, ""])}
        >
          + Adicionar etapa
        </button>
        <span className="fio-editor-spacer" />
        {modo === "escala" && onCancelar && (
          <button type="button" className="fio-cancel" onClick={onCancelar}>
            Cancelar
          </button>
        )}
        {modo === "escala" && (
          <button
            type="button"
            className="fio-save"
            disabled={salvando}
            onClick={() => onSalvar(limpar(titulos))}
          >
            {salvando ? "Salvando…" : "Salvar etapas"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Tira espaços sobrando e linhas em branco antes de enviar as etapas. */
function limpar(titulos: string[]) {
  return titulos.map((item) => item.trim()).filter(Boolean);
}

function SchedulePublicationCountdown({ opensAt }: { opensAt: string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(opensAt) - Date.now()));
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Math.max(0, Date.parse(opensAt) - Date.now());
      setRemaining(next);
      if (!next) window.location.reload();
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [opensAt]);
  const seconds = Math.ceil(remaining / 1_000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return <small className="secretary-publication-countdown" aria-live="polite" title={`Liberação programada para ${formatDate(opensAt)}`}>Liberação automática em {days ? `${days}d ` : ""}{hours}h {minutes}min {rest}s</small>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function assignmentStatusLabel(status: Assignment["status"]) {
  return {
    PENDENTE: "aguardando resposta",
    CONFIRMADA: "participação confirmada",
    INDISPONIVEL: "não poderá participar",
    SUBSTITUICAO_SOLICITADA: "solicitou substituição",
    AUSENTE: "ausência registrada",
  }[status];
}

function ministrySymbol(category: string) {
  return ({
    LOUVOR: "♫",
    RECEPCAO: "◎",
    CRIANCAS: "☆",
    MIDIA: "◫",
    ACAO_SOCIAL: "♥",
    INTERCESSAO: "◇",
    DIACONIA: "✣",
    ESTACIONAMENTO: "◆",
  } as Record<string, string>)[category] || "✦";
}

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string, withTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)).replace(".", "").toUpperCase();
}
