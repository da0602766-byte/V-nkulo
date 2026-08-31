"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import DashboardChart, { type ChartSets } from "./DashboardChart";
import PortalModules, { type PortalData } from "./PortalModules";
import PdfComposer from "./PdfComposer";
import MinistryModules from "./MinistryModules";
import TeensModule from "./TeensModule";
import TextBoxes from "./TextBoxes";
import ChurchServicesModule from "./ChurchServicesModule";
import DisplayMessageBanner, { type DisplayMessageItem } from "./DisplayMessageBanner";
import ScheduledMessagesManager from "./ScheduledMessagesManager";
import { saveImageOutsidePlatform } from "../lib/media-upload-client";

type AppUser = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  permissoes: string;
  foto_perfil?: string | null;
  telefone?: string | null;
  titulo_eclesiastico?: string;
  data_nascimento?: string | null;
  nome_pais?: string | null;
  endereco?: string | null;
  celula?: string | null;
  ministerio?: string | null;
  observacoes?: string | null;
  diaconia_equipe_id?: number | null;
  diaconia_equipe_nome?: string | null;
  tema_preferido?: string | null;
  culto_registrador?: number;
  tem_senha?: number;
  redefinicao_pendente?: number;
  ativo: number;
  criado_em?: string;
  novo_cadastro?: number;
};
type Visitor = {
  id: number;
  nome_completo: string;
  data_nascimento: string | null;
  telefone: string | null;
  email: string | null;
  batizado: string;
  status: string;
  endereco: string | null;
  celula: string | null;
  celula_id: number | null;
  acompanhante: string | null;
  encontro_com_deus: number;
  curso_membros: number;
  ministerio: string | null;
  data_entrada: string;
  observacoes: string | null;
};
type Followup = {
  id: number;
  visitante_id: number;
  visitante_nome: string;
  tipo: string;
  resultado: string;
  descricao: string | null;
  proximo_contato: string | null;
  criado_em: string;
};
type Cell = {
  id: number;
  nome: string;
  responsavel: string;
  membros: string;
  observacoes: string | null;
};
type SystemNotification = {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  area: "MENU" | "VISITANTES" | "CULTOS" | "USUARIOS" | "MODULOS" | "DIACONIA";
  criado_em: string;
  lida: number;
};
type View =
  | "inicio"
  | "menu"
  | "visitantes"
  | "acompanhamentos"
  | "celulas"
  | "relatorios"
  | "louvor"
  | "diaconia"
  | "cultos"
  | "teens"
  | "avisos"
  | "modulos"
  | "usuarios"
  | "personalizar"
  | "seguranca";
type LayoutPreset = "compacto" | "medio" | "grande";
type HierarchyConfig = {
  id: string;
  nome: string;
  cor: string;
  permissoes: string[];
};
type Data = {
  metrics: {
    monthTotal: number;
    activeTotal: number;
    pendingTotal: number;
    integratedTotal: number;
  };
  charts: ChartSets;
  visitors: Visitor[];
  users: AppUser[];
  portal: PortalData;
  celulas: Cell[];
  configuracoes: { chave: string; valor: string }[];
  acompanhamentos: Followup[];
  teens: Record<string, unknown>[];
  teensAcompanhamentos: Record<string, unknown>[];
  mensagensExibicao: DisplayMessageItem[];
};

const statusLabel: Record<string, string> = {
  NOVO: "Novo",
  EM_CONTATO: "Em contato",
  EM_ACOMPANHAMENTO: "Acompanhamento",
  INTEGRADO: "Integrado",
};

const DEFAULT_COLORS = {
  primary: "#17324d",
  secondary: "#21486d",
  accent: "#17877f",
} as const;

const MENU_ITEMS = [
  ["avisos", "Menu Principal"], ["inicio", "Visão geral"],
  ["visitantes", "Visitantes"], ["acompanhamentos", "Acompanhamentos"],
  ["celulas", "Células"], ["teens", "Teens"], ["relatorios", "Relatórios"],
  ["louvor", "Equipe de Louvor"], ["diaconia", "Diaconia"],
  ["cultos", "Rotinas dos Cultos"], ["modulos", "Outras áreas"],
  ["usuarios", "Usuários e permissões"], ["personalizar", "Personalização total"],
  ["seguranca", "Segurança"],
] as const;
const DEFAULT_MENU_ORDER = MENU_ITEMS.map(([key]) => key);
const DEFAULT_HIERARCHIES: HierarchyConfig[] = [
  { id: "MEMBRO", nome: "Membro", cor: "#78909c", permissoes: [] },
  { id: "ASPIRANTE", nome: "Aspirante", cor: "#8e979d", permissoes: ["LOUVOR_VER", "CELULAS_VER", "DIACONIA_VER"] },
  { id: "DIACONO", nome: "Diácono", cor: "#b87333", permissoes: ["LOUVOR_VER", "CELULAS_VER", "DIACONIA_VER"] },
  { id: "PRESBITERO", nome: "Presbítero", cor: "#a7b2bd", permissoes: ["VISAO_GERAL_VER", "VISITANTES_VER", "VISITANTES_CRIAR", "VISITANTES_EDITAR", "ACOMPANHAMENTOS_CRIAR", "CELULAS_VER", "CELULAS_GERENCIAR", "DIACONIA_VER", "DIACONIA_GERENCIAR", "DIACONIA_CHECKLIST_GERENCIAR", "TEENS_VER", "CULTOS_VER", "CULTOS_REGISTRAR", "CULTOS_GERENCIAR"] },
  { id: "PASTOR", nome: "Pastor", cor: "#d4a514", permissoes: ["VISAO_GERAL_VER", "VISITANTES_VER", "VISITANTES_CRIAR", "VISITANTES_EDITAR", "ACOMPANHAMENTOS_CRIAR", "CELULAS_VER", "CELULAS_GERENCIAR", "DIACONIA_VER", "DIACONIA_GERENCIAR", "DIACONIA_CHECKLIST_GERENCIAR", "TEENS_VER", "CULTOS_VER", "CULTOS_REGISTRAR", "CULTOS_GERENCIAR"] },
  { id: "BISPO", nome: "Bispo", cor: "#74bfd6", permissoes: ["VISAO_GERAL_VER", "VISITANTES_VER", "VISITANTES_CRIAR", "VISITANTES_EDITAR", "ACOMPANHAMENTOS_CRIAR", "CELULAS_VER", "CELULAS_GERENCIAR", "DIACONIA_VER", "DIACONIA_GERENCIAR", "DIACONIA_CHECKLIST_GERENCIAR", "TEENS_VER", "CULTOS_VER", "CULTOS_REGISTRAR", "CULTOS_GERENCIAR"] },
];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? "Não foi possível concluir a operação.");
  if (options?.method === "POST" && typeof window !== "undefined")
    window.dispatchEvent(new Event("adote:refresh-notifications"));
  return body;
}

export default function AdoteDashboard({
  user,
  data,
  permissionCatalog,
}: {
  user: AppUser;
  data: Data;
  permissionCatalog: { key: string; label: string }[];
}) {
  const isAdmin = user.perfil === "ADMIN";
  const [view, setView] = useState<View>(isAdmin ? "inicio" : "avisos");
  const [visitors, setVisitors] = useState(data.visitors);
  const [users, setUsers] = useState(data.users);
  const [portal, setPortal] = useState(data.portal);
  const [displayMessages, setDisplayMessages] = useState(data.mensagensExibicao);
  const [profile, setProfile] = useState(user);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState(
    user.tema_preferido === "ESCURO" ? "ESCURO" : "CLARO",
  );
  const [search, setSearch] = useState("");
  const [visitorSearchResults, setVisitorSearchResults] = useState<Visitor[] | null>(null);
  const [selectedVisitorIds, setSelectedVisitorIds] = useState<Set<number>>(new Set());
  const [userSearch, setUserSearch] = useState("");
  const [userTitleFilter, setUserTitleFilter] = useState("TODOS");
  const [userStatusFilter, setUserStatusFilter] = useState("TODOS");
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [modal, setModal] = useState<
    | "visitor"
    | "visitor_details"
    | "user"
    | "user_details"
    | "followup"
    | "cell"
    | "profile"
    | null
  >(null);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [followups, setFollowups] = useState(data.acompanhamentos);
  const [selectedFollowup, setSelectedFollowup] = useState<Followup | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [cells, setCells] = useState(data.celulas);
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const config = Object.fromEntries(
    data.configuracoes.map((item) => [item.chave, item.valor]),
  );
  const [labels, setLabels] = useState(() =>
    normalizeLabels(safeJson<Record<string, string>>(config.abas, {})),
  );
  const [theme, setTheme] = useState(
    safeJson<Record<string, string>>(config.tema, {}),
  );
  const [siteInfo, setSiteInfo] = useState(
    safeJson<Record<string, string>>(config.site, {}),
  );
  const [loginConfig, setLoginConfig] = useState(
    safeJson<{
      titulo?: string;
      subtitulo?: string;
      logo?: string;
      fundo?: string;
      destaque?: string;
    }>(config.login, {}),
  );
  const [menuOrder, setMenuOrder] = useState(() =>
    normalizeMenuOrder(safeJson<string[]>(config.ordem_menu, DEFAULT_MENU_ORDER)),
  );
  const [textOverrides, setTextOverrides] = useState(() =>
    safeJson<Record<string, string>>(config.textos, {}),
  );
  const [tabLayouts, setTabLayouts] = useState<Record<string, LayoutPreset>>(() =>
    safeJson<Record<string, LayoutPreset>>(config.layout_abas, {}),
  );
  const [hiddenTabs, setHiddenTabs] = useState<string[]>(() =>
    safeJson<string[]>(config.abas_ocultas, []),
  );
  const [hierarchies, setHierarchies] = useState<HierarchyConfig[]>(() =>
    normalizeHierarchies(safeJson<HierarchyConfig[]>(config.hierarquias, DEFAULT_HIERARCHIES)),
  );
  const initialMaintenance = safeJson<{
    ativa?: boolean;
    mensagem?: string;
    iniciaEm?: string | null;
    terminaEm?: string | null;
  }>(config.manutencao, {});
  const [appearanceRevision, setAppearanceRevision] = useState(0);
  const [pdfConfig, setPdfConfig] = useState<{
    baseUrl: string;
    title: string;
  } | null>(null);
  const actingAsAdmin = isAdmin && !previewTitle;
  const simulatedProfile = previewTitle
    ? {
        ...profile,
        perfil: "ACOMPANHANTE",
        permissoes: [
          "HIERARQUIA_CONFIGURADA",
          ...(hierarchies.find((item) => item.id === previewTitle)?.permissoes || []),
        ].join(","),
        titulo_eclesiastico: previewTitle,
        diaconia_equipe_id: null,
        culto_registrador: 0,
      }
    : profile;
  const displayProfile = previewTitle
    ? { ...simulatedProfile, nome: "Novo usuário" }
    : profile;
  const permissions = actingAsAdmin
    ? permissionCatalog.map((item) => item.key)
    : [
        ...simulatedProfile.permissoes.split(",").filter(Boolean),
        ...automaticClientPermissions(simulatedProfile),
      ];
  const hasExtraAccess = actingAsAdmin || permissions.length > 0;
  const mainMenuLabel = labels.avisos || "Menu Principal";
  const can = (permission: string) => {
    const impliedBy: Record<string, string[]> = {
      LOUVOR_VER: ["LOUVOR_GERENCIAR"],
      DIACONIA_VER: [
        "DIACONIA_GERENCIAR",
        "DIACONIA_CHECKLIST_GERENCIAR",
        "DIACONIA_RANKING_VER",
        "DIACONIA_RANKING_PUBLICAR",
      ],
      DIACONIA_RANKING_VER: ["DIACONIA_RANKING_PUBLICAR"],
      MODULOS_PERSONALIZADOS_VER: ["MODULOS_GERENCIAR"],
      CELULAS_VER: ["CELULAS_GERENCIAR"],
      TEENS_VER: ["TEENS_GERENCIAR"],
      CULTOS_VER: ["CULTOS_REGISTRAR", "CULTOS_GERENCIAR"],
      CULTOS_REGISTRAR: ["CULTOS_GERENCIAR"],
    };
    return (
      actingAsAdmin ||
      permissions.includes(permission) ||
      (impliedBy[permission] ?? []).some((item) => permissions.includes(item))
    );
  };

  const loadNotifications = useCallback(async () => {
    try {
      const result = await api("/api/notificacoes");
      setNotifications(result.notificacoes || []);
    } catch {
      // A central de notificações não deve bloquear o restante do sistema.
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(loadNotifications, 0);
    const timer = window.setInterval(loadNotifications, 45_000);
    const refresh = () => loadNotifications();
    window.addEventListener("adote:refresh-notifications", refresh);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("adote:refresh-notifications", refresh);
    };
  }, [loadNotifications]);

  useEffect(() => {
    const refreshAccess = async () => {
      try {
        const response = await fetch("/api/perfil", { cache: "no-store" });
        if (!response.ok) return;
        const result = (await response.json()) as { usuario?: AppUser };
        const current = result.usuario;
        if (
          current &&
          (current.permissoes !== profile.permissoes ||
            current.perfil !== profile.perfil ||
            current.titulo_eclesiastico !== profile.titulo_eclesiastico ||
            current.diaconia_equipe_id !== profile.diaconia_equipe_id ||
            current.ativo !== profile.ativo)
        ) {
          window.location.reload();
        }
      } catch {
        // Uma falha de rede não deve interromper a navegação atual.
      }
    };
    const initial = window.setTimeout(refreshAccess, 5_000);
    const timer = window.setInterval(refreshAccess, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [profile]);

  useEffect(() => {
    const root = document.querySelector(".app-shell");
    if (!root || !Object.keys(textOverrides).length) return;
    const applyOverrides = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const raw = node.nodeValue || "";
        const original = raw.trim();
        const replacement = textOverrides[original];
        const parent = node.parentElement;
        if (replacement && parent && !parent.closest("input, textarea, option, script, style")) {
          node.nodeValue = raw.replace(original, replacement);
        }
        node = walker.nextNode();
      }
    };
    applyOverrides();
    const observer = new MutationObserver(applyOverrides);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [textOverrides, view]);

  useEffect(() => {
    const checkMaintenance = async () => {
      if (isAdmin) return;
      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        const result = await response.json() as { manutencao?: { ativa?: boolean } };
        if (result.manutencao?.ativa) window.location.replace("/");
      } catch {
        // Uma falha de rede temporária não deve expulsar o usuário.
      }
    };
    const initial = window.setTimeout(checkMaintenance, 0);
    const timer = window.setInterval(checkMaintenance, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [isAdmin]);

  useEffect(() => {
    const refreshMessages = async () => {
      try {
        const response = await fetch(isAdmin ? "/api/mensagens?admin=1" : "/api/mensagens", {
          cache: "no-store",
        });
        const result = await response.json() as {
          mensagens?: DisplayMessageItem[];
          manutencao?: boolean;
        };
        if (response.status === 503 && result.manutencao) {
          window.location.replace("/");
          return;
        }
        if (response.ok && result.mensagens) setDisplayMessages(result.mensagens);
      } catch {
        // Mantém a última versão disponível até a conexão voltar.
      }
    };
    const timer = window.setInterval(refreshMessages, 45_000);
    return () => window.clearInterval(timer);
  }, [isAdmin]);

  async function toggleTheme() {
    const next = themeMode === "ESCURO" ? "CLARO" : "ESCURO";
    setThemeMode(next);
    try {
      await api("/api/perfil/tema", {
        method: "PATCH",
        body: JSON.stringify({ tema: next }),
      });
      setProfile((current) => ({ ...current, tema_preferido: next }));
    } catch (error) {
      setThemeMode(themeMode);
      notify((error as Error).message);
    }
  }

  const filteredVisitors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return visitors.slice(0, 10);
    return visitorSearchResults ?? visitors.filter((visitor) =>
      `${visitor.nome_completo} ${visitor.telefone ?? ""} ${visitor.email ?? ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [search, visitorSearchResults, visitors]);

  useEffect(() => {
    const term = search.trim();
    const timer = window.setTimeout(async () => {
      if (!term) {
        setVisitorSearchResults(null);
        return;
      }
      try {
        const result = await api(`/api/visitantes?busca=${encodeURIComponent(term)}`);
        setVisitorSearchResults(result.visitantes || []);
      } catch (error) {
        notify((error as Error).message);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLocaleLowerCase("pt-BR");
    return users.filter((item) => {
      const matchesSearch = !term ||
        `${item.nome} ${item.email} ${item.telefone || ""} ${item.diaconia_equipe_nome || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(term);
      const matchesTitle =
        userTitleFilter === "TODOS" ||
        (item.titulo_eclesiastico || "MEMBRO") === userTitleFilter;
      const matchesStatus =
        userStatusFilter === "TODOS" ||
        (userStatusFilter === "NOVOS" && Boolean(item.novo_cadastro)) ||
        (userStatusFilter === "SEM_SENHA" && !item.tem_senha) ||
        (userStatusFilter === "REDEFINICAO" && Boolean(item.redefinicao_pendente)) ||
        (userStatusFilter === "INATIVOS" && !item.ativo);
      return matchesSearch && matchesTitle && matchesStatus;
    });
  }, [userSearch, userStatusFilter, userTitleFilter, users]);

  const unreadNotifications = notifications.filter((item) => !Number(item.lida)).length;

  async function openSystemNotification(item: SystemNotification) {
    if (!Number(item.lida)) {
      setNotifications((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, lida: 1 } : entry,
        ),
      );
      try {
        await api("/api/notificacoes", {
          method: "PATCH",
          body: JSON.stringify({ id: item.id }),
        });
      } catch {
        loadNotifications();
      }
    }
    const destination: Record<SystemNotification["area"], View> = {
      MENU: "avisos",
      VISITANTES: "visitantes",
      CULTOS: "cultos",
      USUARIOS: "usuarios",
      MODULOS: "modulos",
      DIACONIA: "diaconia",
    };
    setView(destination[item.area]);
    setNotificationOpen(false);
  }

  async function markAllNotificationsRead() {
    setNotifications((current) =>
      current.map((item) => ({ ...item, lida: 1 })),
    );
    try {
      await api("/api/notificacoes", {
        method: "PATCH",
        body: JSON.stringify({ todas: true }),
      });
    } catch {
      loadNotifications();
    }
  }

  function notify(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3500);
  }

  async function submitVisitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        ...Object.fromEntries(form.entries()),
        encontroComDeus: form.get("encontroComDeus") === "on",
        cursoMembros: form.get("cursoMembros") === "on",
      };
      if (selectedVisitor)
        await api(`/api/visitantes/${selectedVisitor.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else
        await api("/api/visitantes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      const result = await api("/api/visitantes");
      setVisitors(result.visitantes);
      setModal(null);
      setSelectedVisitor(null);
      notify(
        selectedVisitor
          ? "Visitante atualizado."
          : "Visitante cadastrado com sucesso.",
      );
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function submitFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVisitor) return;
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        ...Object.fromEntries(form.entries()),
        visitanteId: selectedVisitor.id,
      };
      if (selectedFollowup)
        await api(`/api/acompanhamentos/${selectedFollowup.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else
        await api("/api/acompanhamentos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      const result = await api("/api/acompanhamentos");
      setFollowups(result.acompanhamentos);
      setModal(null);
      setSelectedFollowup(null);
      notify(
        selectedFollowup
          ? "Acompanhamento atualizado."
          : "Acompanhamento registrado.",
      );
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function deleteVisitor(visitor: Visitor) {
    if (!window.confirm(`Excluir o cadastro de ${visitor.nome_completo}?`))
      return;
    try {
      await api(`/api/visitantes/${visitor.id}`, { method: "DELETE" });
      setVisitors((current) =>
        current.filter((item) => item.id !== visitor.id),
      );
      setVisitorSearchResults((current) =>
        current?.filter((item) => item.id !== visitor.id) ?? null,
      );
      setSelectedVisitorIds((current) => {
        const next = new Set(current);
        next.delete(visitor.id);
        return next;
      });
      notify("Visitante excluído.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  function toggleVisitorSelection(id: number) {
    setSelectedVisitorIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisibleVisitors() {
    const visibleIds = filteredVisitors.map((item) => item.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedVisitorIds.has(id));
    setSelectedVisitorIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function deleteSelectedVisitors() {
    const ids = [...selectedVisitorIds];
    if (!ids.length) return;
    if (!window.confirm(`Tem certeza de que deseja excluir ${ids.length} visitante${ids.length > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all(ids.map((id) => api(`/api/visitantes/${id}`, { method: "DELETE" })));
      setVisitors((current) => current.filter((item) => !selectedVisitorIds.has(item.id)));
      setVisitorSearchResults((current) => current?.filter((item) => !selectedVisitorIds.has(item.id)) ?? null);
      setSelectedVisitorIds(new Set());
      notify(`${ids.length} visitante${ids.length > 1 ? "s excluídos" : " excluído"}.`);
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function deleteFollowup(item: Followup) {
    if (!window.confirm("Excluir este acompanhamento?")) return;
    try {
      await api(`/api/acompanhamentos/${item.id}`, { method: "DELETE" });
      setFollowups((current) =>
        current.filter((record) => record.id !== item.id),
      );
      notify("Acompanhamento excluído.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedPermissions = permissionCatalog
      .filter((item) => form.get(item.key) === "on")
      .map((item) => item.key);
    const payload = {
      nome: form.get("nome"),
      email: form.get("email"),
      telefone: form.get("telefone"),
      dataNascimento: form.get("dataNascimento"),
      nomePais: form.get("nomePais"),
      endereco: form.get("endereco"),
      celula: form.get("celula"),
      ministerio: form.get("ministerio"),
      observacoes: form.get("observacoes"),
      diaconiaEquipeId: form.get("diaconiaEquipeId"),
      tituloEclesiastico: form.get("tituloEclesiastico"),
      perfil: form.get("perfil"),
      permissoes: selectedPermissions,
      ativo: form.get("ativo") === "on",
    };
    try {
      if (selectedUser)
        await api(`/api/usuarios/${selectedUser.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else
        await api("/api/usuarios", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      const result = await api("/api/usuarios");
      setUsers(result.usuarios);
      const diaconia = await api("/api/diaconia");
      setPortal((current) => ({
        ...current,
        diaconias: diaconia.diaconias,
        equipesDiaconia: diaconia.equipes,
        usuariosDiaconia: diaconia.usuarios,
        rankingDiaconia: diaconia.ranking,
        rankingPublicado: diaconia.rankingPublicado,
      }));
      if (selectedUser?.id === profile.id) {
        const refreshedProfile = result.usuarios.find(
          (item: AppUser) => item.id === profile.id,
        );
        if (refreshedProfile) setProfile(refreshedProfile);
      }
      setModal(null);
      setSelectedUser(null);
      notify("Permissões atualizadas.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function deleteUser(item: AppUser) {
    if (!window.confirm(`Excluir definitivamente o cadastro de ${item.nome}?`))
      return;
    if (
      !window.confirm(
        "Confirme mais uma vez: o acesso e os dados vinculados a esta pessoa serão removidos.",
      )
    )
      return;
    try {
      await api(`/api/usuarios/${item.id}`, { method: "DELETE" });
      setUsers((current) =>
        current.filter((userItem) => userItem.id !== item.id),
      );
      const diaconia = await api("/api/diaconia");
      setPortal((current) => ({
        ...current,
        diaconias: diaconia.diaconias,
        equipesDiaconia: diaconia.equipes,
        usuariosDiaconia: diaconia.usuarios,
        rankingDiaconia: diaconia.ranking,
        rankingPublicado: diaconia.rankingPublicado,
      }));
      notify("Pessoa e acesso excluídos.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function createPasswordLink(item: AppUser) {
    try {
      const result = await api(`/api/usuarios/${item.id}/reset-link`, {
        method: "POST",
      });
      const link = `${window.location.origin}${result.path}`;
      try {
        await navigator.clipboard.writeText(link);
        notify(
          "Link seguro copiado. Envie-o à pessoa por e-mail ou WhatsApp; ele expira em 30 minutos.",
        );
      } catch {
        window.prompt(
          "Copie este link e envie à pessoa. Ele expira em 30 minutos:",
          link,
        );
      }
      setUsers((current) =>
        current.map((userItem) =>
          userItem.id === item.id
            ? { ...userItem, redefinicao_pendente: 0, tem_senha: 1 }
            : userItem,
        ),
      );
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function submitCell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      nome: form.get("nome"),
      responsavel: form.get("responsavel"),
      membros: String(form.get("membros") ?? "")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      observacoes: form.get("observacoes"),
    };
    try {
      if (selectedCell)
        await api(`/api/celulas/${selectedCell.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else
        await api("/api/celulas", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      const result = await api("/api/celulas");
      setCells(result.celulas);
      setModal(null);
      setSelectedCell(null);
      notify("Célula salva com sucesso.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function deleteCell(cell: Cell) {
    if (
      !window.confirm(
        `Excluir a célula ${cell.nome}? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    try {
      await api(`/api/celulas/${cell.id}`, { method: "DELETE" });
      setCells((current) => current.filter((item) => item.id !== cell.id));
      notify("Célula excluída.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = (
      event.currentTarget.elements.namedItem("foto") as HTMLInputElement
    ).files?.[0];
    try {
      const fotoPerfil = file
        ? (await saveImageOutsidePlatform(file, "profile-photo")).url
        : profile.foto_perfil;
      const result = await api("/api/perfil", {
        method: "PATCH",
        body: JSON.stringify({
          nome: form.get("nome"),
          email: form.get("email"),
          senhaAtual: form.get("senhaAtual"),
          telefone: form.get("telefone"),
          dataNascimento: form.get("dataNascimento"),
          endereco: form.get("endereco"),
          celula: form.get("celula"),
          ministerio: form.get("ministerio"),
          observacoes: form.get("observacoes"),
          fotoPerfil,
        }),
      });
      setProfile((current) => ({ ...current, ...result }));
      setModal(null);
      notify("Perfil atualizado.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function saveAppearance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const loginLogoFile = (
      event.currentTarget.elements.namedItem(
        "loginLogoFile",
      ) as HTMLInputElement | null
    )?.files?.[0];
    const abas = {
      inicio: form.get("inicio"),
      avisos: form.get("avisos"),
      visitantes: form.get("visitantes"),
      acompanhamentos: form.get("acompanhamentos"),
      celulas: form.get("celulas"),
      relatorios: form.get("relatorios"),
      louvor: form.get("louvor"),
      diaconia: form.get("diaconia"),
      cultos: form.get("cultos") || labels.cultos || "Rotinas dos Cultos",
      teens: form.get("teens") || labels.teens || "Teens",
      modulos: form.get("modulos"),
      usuarios: form.get("usuarios"),
      personalizar: form.get("personalizar"),
      seguranca: form.get("seguranca"),
      menu: form.get("menu"),
    } as Record<string, string>;
    const tema = {
      primary: form.get("primary"),
      secondary: form.get("secondary"),
      accent: form.get("accent"),
      logo: form.get("logo"),
    } as Record<string, string>;
    const site = {
      nome: form.get("siteNome"),
      subtitulo: form.get("subtitulo"),
      rodape: form.get("rodape"),
      instagram: form.get("instagram"),
      whatsapp: form.get("whatsapp"),
    } as Record<string, string>;
    let loginLogo: FormDataEntryValue | string | null;
    try {
      loginLogo = loginLogoFile
        ? (await saveImageOutsidePlatform(loginLogoFile, "login-logo")).url
        : form.get("loginLogo");
    } catch (error) {
      notify((error as Error).message);
      return;
    }
    const login = {
      titulo: form.get("loginTitulo"),
      subtitulo: form.get("loginSubtitulo"),
      logo: loginLogo,
      fundo: form.get("loginFundo"),
      destaque: form.get("loginDestaque"),
    };
    const textos = parseTextOverrides(String(form.get("textOverrides") || ""));
    try {
      await api("/api/configuracoes", {
        method: "PATCH",
        body: JSON.stringify({
          abas,
          tema,
          site,
          login,
          ordemMenu: menuOrder,
          textos,
          layoutAbas: tabLayouts,
          abasOcultas: hiddenTabs,
          hierarquias: hierarchies,
        }),
      });
      setLabels(abas);
      setTheme(tema);
      setSiteInfo(site);
      setLoginConfig(login as typeof loginConfig);
      setTextOverrides(textos);
      notify("Personalização aplicada no sistema e na página de login.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  function moveMenuItem(key: string, direction: -1 | 1) {
    setMenuOrder((current) => {
      const index = current.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function changeTabLayout(preset: LayoutPreset) {
    const previous = tabLayouts;
    const next = { ...tabLayouts, [view]: preset };
    setTabLayouts(next);
    try {
      await api("/api/configuracoes", {
        method: "PATCH",
        body: JSON.stringify({ layoutAbas: next }),
      });
      notify("Organização desta aba atualizada.");
    } catch (error) {
      setTabLayouts(previous);
      notify((error as Error).message);
    }
  }

  function toggleTabVisibility(key: string) {
    if (key === "avisos" || key === "personalizar") {
      notify("O Menu Principal e a Personalização ficam protegidos para evitar perda de acesso.");
      return;
    }
    setHiddenTabs((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function updateHierarchy(id: string, patch: Partial<HierarchyConfig>) {
    setHierarchies((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function toggleHierarchyPermission(id: string, permission: string) {
    setHierarchies((current) => current.map((item) => {
      if (item.id !== id) return item;
      const selected = item.permissoes.includes(permission);
      return {
        ...item,
        permissoes: selected
          ? item.permissoes.filter((key) => key !== permission)
          : [...item.permissoes, permission],
      };
    }));
  }

  function addHierarchy() {
    const id = `NIVEL_${Date.now()}`;
    setHierarchies((current) => [
      ...current,
      { id, nome: "Nova hierarquia", cor: "#526d82", permissoes: [] },
    ]);
  }

  function removeHierarchy(id: string) {
    if (id === "MEMBRO") return notify("A hierarquia Membro é obrigatória.");
    const assigned = users.filter((item) => item.titulo_eclesiastico === id).length;
    if (assigned) return notify(`Altere primeiro a hierarquia de ${assigned} usuário${assigned === 1 ? "" : "s"} vinculado${assigned === 1 ? "" : "s"} a este nível.`);
    if (!window.confirm("Excluir esta hierarquia?")) return;
    setHierarchies((current) => current.filter((item) => item.id !== id));
  }

  function applyHierarchyToForm(event: React.ChangeEvent<HTMLSelectElement>) {
    const hierarchy = hierarchies.find((item) => item.id === event.target.value);
    const form = event.currentTarget.form;
    if (!hierarchy || !form) return;
    permissionCatalog.forEach((permission) => {
      const checkbox = form.elements.namedItem(permission.key) as HTMLInputElement | null;
      if (checkbox) checkbox.checked = hierarchy.permissoes.includes(permission.key);
    });
  }

  async function restoreDefaultColors() {
    if (
      !window.confirm(
        "Restaurar as cores originais do sistema e da página de login? Sua logo, seus textos e os nomes das abas serão mantidos.",
      )
    )
      return;

    const nextTheme = {
      ...theme,
      ...DEFAULT_COLORS,
    };
    const nextLogin = {
      ...loginConfig,
      fundo: DEFAULT_COLORS.primary,
      destaque: DEFAULT_COLORS.accent,
    };

    try {
      await api("/api/configuracoes", {
        method: "PATCH",
        body: JSON.stringify({ tema: nextTheme, login: nextLogin }),
      });
      setTheme(nextTheme);
      setLoginConfig(nextLogin);
      setAppearanceRevision((current) => current + 1);
      notify(
        "Cores originais restauradas. Seus textos e sua logo foram mantidos.",
      );
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function renameTab(key: string, value: string) {
    const clean = value.trim();
    if (!clean || clean === labels[key]) return;
    const previous = labels;
    const next = { ...labels, [key]: clean };
    setLabels(next);
    try {
      await api("/api/configuracoes", {
        method: "PATCH",
        body: JSON.stringify({ abas: next }),
      });
      notify(`Aba alterada para “${clean}”.`);
    } catch (error) {
      setLabels(previous);
      notify((error as Error).message);
    }
  }

  const recentVisitors = visitors.slice(0, 5);
  const showManagement =
    can("VISITANTES_VER") ||
    can("CELULAS_VER") ||
    can("RELATORIOS_VER") ||
    can("TEENS_VER");
  const showMinistries =
    can("LOUVOR_VER") ||
    can("DIACONIA_VER") ||
    can("CULTOS_VER") ||
    can("MODULOS_PERSONALIZADOS_VER");
  const ministryPortal =
    previewTitle && clientTitleRank(previewTitle) < 3
      ? {
          ...portal,
          diaconias: [],
          equipesDiaconia: [],
          usuariosDiaconia: [],
          rankingDiaconia: { equipes: [], pessoas: [] },
          rankingPublicado: false,
        }
      : portal;
  const visibleDisplayMessages = useMemo(
    () =>
      displayMessages.filter((item) => {
        if (!Number(item.ativo_agora)) return false;
        const areas = displayMessageAreas(item.areas);
        return areas.includes("todas") || areas.includes(view);
      }),
    [displayMessages, view],
  );

  return (
    <div
      className={`app-shell ${themeMode === "ESCURO" ? "dark-mode" : ""} tab-layout-${tabLayouts[view] || "medio"}`}
      style={
        {
          "--brand-primary": theme.primary || DEFAULT_COLORS.primary,
          "--brand-secondary": theme.secondary || DEFAULT_COLORS.secondary,
          "--brand-accent": theme.accent || DEFAULT_COLORS.accent,
          ...Object.fromEntries(menuOrder.map((key, index) => [`--menu-order-${key}`, index + 1])),
          ...Object.fromEntries(MENU_ITEMS.map(([key]) => [`--tab-display-${key}`, hiddenTabs.includes(key) ? "none" : "grid"])),
        } as React.CSSProperties
      }
    >
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
      <aside className="sidebar">
        <button
          className="brand brand-button"
          onClick={() => setView(actingAsAdmin ? "inicio" : "avisos")}
        >
          {theme.logo ? (
            <img className="brand-logo" src={theme.logo} alt="Logo da igreja" />
          ) : (
            <span className="brand-mark">A</span>
          )}
          <span>
            <strong>{siteInfo.nome || "ADOTE"}</strong>
            <small>{siteInfo.subtitulo || "Gestão da igreja"}</small>
          </span>
        </button>
        <nav aria-label="Navegação principal">
          {can("SISTEMA_PERSONALIZAR") && (
            <p className="inline-edit-hint">
              Clique no nome para editar · clique no ícone para abrir
            </p>
          )}
          <EditableNavItem
            icon="◫"
            labelKey="avisos"
            label={mainMenuLabel}
            active={view === "avisos"}
            count={portal.avisos.length}
            emphasized
            canEdit={can("SISTEMA_PERSONALIZAR")}
            onOpen={() => setView("avisos")}
            onRename={renameTab}
          />
          {can("VISAO_GERAL_VER") && (
            <EditableNavItem
              icon="⌂"
              labelKey="inicio"
              label={labels.inicio || "Visão geral"}
              active={view === "inicio"}
              canEdit={can("SISTEMA_PERSONALIZAR")}
              onOpen={() => setView("inicio")}
              onRename={renameTab}
            />
          )}
          {showManagement && (
            <details className="nav-group" open style={{ order: Math.min(...["visitantes", "acompanhamentos", "celulas", "teens", "relatorios"].map((key) => menuOrder.indexOf(key) + 1)) }}>
              <summary>GESTÃO</summary>
              {can("VISITANTES_VER") && (
                <EditableNavItem
                  icon="◉"
                  labelKey="visitantes"
                  label={labels.visitantes || "Visitantes"}
                  active={view === "visitantes"}
                  canEdit={can("SISTEMA_PERSONALIZAR")}
                  onOpen={() => setView("visitantes")}
                  onRename={renameTab}
                />
              )}
              {can("VISITANTES_VER") && (
                <EditableNavItem
                  icon="✓"
                  labelKey="acompanhamentos"
                  label={labels.acompanhamentos || "Acompanhamentos"}
                  active={view === "acompanhamentos"}
                  canEdit={can("SISTEMA_PERSONALIZAR")}
                  onOpen={() => setView("acompanhamentos")}
                  onRename={renameTab}
                />
              )}
              {can("CELULAS_VER") && (
                <EditableNavItem
                  icon="⌘"
                  labelKey="celulas"
                  label={labels.celulas || "Células"}
                  active={view === "celulas"}
                  canEdit={can("SISTEMA_PERSONALIZAR")}
                  onOpen={() => setView("celulas")}
                  onRename={renameTab}
                />
              )}
              {can("TEENS_VER") && (
                <EditableNavItem
                  icon="◇"
                  labelKey="teens"
                  label={labels.teens || "Teens"}
                  active={view === "teens"}
                  canEdit={can("SISTEMA_PERSONALIZAR")}
                  onOpen={() => setView("teens")}
                  onRename={renameTab}
                />
              )}
              {can("RELATORIOS_VER") && (
                <EditableNavItem
                  icon="▥"
                  labelKey="relatorios"
                  label={labels.relatorios || "Relatórios"}
                  active={view === "relatorios"}
                  canEdit={can("SISTEMA_PERSONALIZAR")}
                  onOpen={() => setView("relatorios")}
                  onRename={renameTab}
                />
              )}
            </details>
          )}
          {showMinistries && (
            <details className="nav-group" style={{ order: Math.min(...["louvor", "diaconia", "cultos", "modulos"].map((key) => menuOrder.indexOf(key) + 1)) }}>
              <summary>MINISTÉRIOS</summary>
              {can("LOUVOR_VER") && (
                <EditableNavItem
                  icon="♫"
                  labelKey="louvor"
                  label={labels.louvor || "Equipe de Louvor"}
                  active={view === "louvor"}
                  canEdit={can("SISTEMA_PERSONALIZAR")}
                  onOpen={() => setView("louvor")}
                  onRename={renameTab}
                />
              )}
              {can("DIACONIA_VER") && (
                <EditableNavItem
                  icon="☷"
                  labelKey="diaconia"
                  label={labels.diaconia || "Diaconia"}
                  active={view === "diaconia"}
                  canEdit={can("SISTEMA_PERSONALIZAR")}
                  onOpen={() => setView("diaconia")}
                  onRename={renameTab}
                />
              )}
              {can("CULTOS_VER") && (
                <EditableNavItem
                  icon="▦"
                  labelKey="cultos"
                  label={labels.cultos || "Rotinas dos Cultos"}
                  active={view === "cultos"}
                  canEdit={can("SISTEMA_PERSONALIZAR")}
                  onOpen={() => setView("cultos")}
                  onRename={renameTab}
                />
              )}
              {can("MODULOS_PERSONALIZADOS_VER") && (
                <EditableNavItem
                  icon="⊞"
                  labelKey="modulos"
                  label={labels.modulos || "Outras áreas"}
                  active={view === "modulos"}
                  canEdit={can("SISTEMA_PERSONALIZAR")}
                  onOpen={() => setView("modulos")}
                  onRename={renameTab}
                />
              )}
            </details>
          )}
          {actingAsAdmin && (
            <details className="nav-group" style={{ order: Math.min(...["usuarios", "personalizar", "seguranca"].map((key) => menuOrder.indexOf(key) + 1)) }}>
              <summary>ADMINISTRAÇÃO</summary>
              {can("USUARIOS_GERENCIAR") && (
                <EditableNavItem
                  icon="♙"
                  labelKey="usuarios"
                  label={labels.usuarios || "Usuários e permissões"}
                  active={view === "usuarios"}
                  canEdit={can("SISTEMA_PERSONALIZAR")}
                  onOpen={() => setView("usuarios")}
                  onRename={renameTab}
                />
              )}
              {can("SISTEMA_PERSONALIZAR") && (
                <EditableNavItem
                  icon="◐"
                  labelKey="personalizar"
                  label={labels.personalizar || "Personalização total"}
                  active={view === "personalizar"}
                  canEdit
                  onOpen={() => setView("personalizar")}
                  onRename={renameTab}
                />
              )}
              <EditableNavItem
                icon="◇"
                labelKey="seguranca"
                label={labels.seguranca || "Segurança"}
                active={view === "seguranca"}
                canEdit={can("SISTEMA_PERSONALIZAR")}
                onOpen={() => setView("seguranca")}
                onRename={renameTab}
              />
            </details>
          )}
        </nav>
        <div className="profile-card">
          <button
            className="avatar avatar-button"
            onClick={() => !previewTitle && setModal("profile")}
            disabled={Boolean(previewTitle)}
          >
            {displayProfile.foto_perfil && !previewTitle ? (
              <img src={displayProfile.foto_perfil} alt="Foto de perfil" />
            ) : (
              initials(displayProfile.nome)
            )}
          </button>
          <span>
            <strong>{displayProfile.nome}</strong>
            <small>
              <span
                className={`church-title title-${(displayProfile.titulo_eclesiastico || "MEMBRO").toLowerCase()}`}
                style={hierarchyBadgeStyle(displayProfile.titulo_eclesiastico, hierarchies)}
              >
                {titleLabel(displayProfile.titulo_eclesiastico, hierarchies)}
              </span>
            </small>
          </span>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={
              themeMode === "ESCURO" ? "Usar tema claro" : "Usar tema escuro"
            }
            title={themeMode === "ESCURO" ? "Tema claro" : "Tema escuro"}
          >
            {themeMode === "ESCURO" ? "☀" : "☾"}
          </button>
          <a className="profile-logout" href="/api/auth/logout" aria-label="Sair do sistema">
            <span aria-hidden="true">↪</span>
            <span>Sair</span>
          </a>
        </div>
      </aside>

      <main className="main-content">
        {isAdmin && (
          <div className={`preview-toolbar ${previewTitle ? "active" : ""}`}>
            <span>
              {previewTitle
                ? `Prévia ativa: ${titleLabel(previewTitle, hierarchies)}`
                : "Visualizar como outro perfil"}
            </span>
            <select
              aria-label="Escolher perfil para prévia"
              value={previewTitle || ""}
              onChange={(event) => {
                const next = event.target.value || null;
                setPreviewTitle(next);
                setView(next ? "avisos" : "inicio");
              }}
            >
              <option value="">Minha visão de administrador</option>
              {hierarchies.map((hierarchy) => (
                <option value={hierarchy.id} key={hierarchy.id}>{hierarchy.nome}</option>
              ))}
            </select>
            {previewTitle && (
              <button
                type="button"
                onClick={() => {
                  setPreviewTitle(null);
                  setView("inicio");
                }}
              >
                Sair da prévia
              </button>
            )}
          </div>
        )}
        <div className="account-toolbar">
          <div className="account-toolbar-actions">
            <button
              type="button"
              className={`account-action notification-trigger ${notificationOpen ? "active" : ""}`}
              onClick={() => {
                const next = !notificationOpen;
                setNotificationOpen(next);
                if (next) loadNotifications();
              }}
              aria-expanded={notificationOpen}
            >
              <span aria-hidden="true">♢</span>
              <span>Notificações</span>
              {unreadNotifications > 0 && (
                <b>{unreadNotifications > 99 ? "99+" : unreadNotifications}</b>
              )}
            </button>
            <button type="button" className="account-action" onClick={toggleTheme}>
              <span aria-hidden="true">{themeMode === "ESCURO" ? "☀" : "☾"}</span>
              <span>{themeMode === "ESCURO" ? "Tema claro" : "Tema escuro"}</span>
            </button>
            <a className="account-action logout-action" href="/api/auth/logout">
              <span aria-hidden="true">↪</span>
              <span>Sair</span>
            </a>
          </div>
          {notificationOpen && (
            <section className="notification-center" aria-label="Central de notificações">
              <header>
                <div>
                  <strong>Atualizações do sistema</strong>
                  <small>{unreadNotifications ? `${unreadNotifications} não lida${unreadNotifications === 1 ? "" : "s"}` : "Tudo em dia"}</small>
                </div>
                <div className="notification-header-actions">
                  {actingAsAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationOpen(false);
                        setView("personalizar");
                        window.setTimeout(
                          () => document.getElementById("display-control-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                          0,
                        );
                      }}
                    >
                      Programar mensagem
                    </button>
                  )}
                  {unreadNotifications > 0 && (
                    <button type="button" onClick={markAllNotificationsRead}>
                      Marcar todas como lidas
                    </button>
                  )}
                </div>
              </header>
              <div className="notification-list">
                {notifications.length ? notifications.map((item) => (
                  <button
                    type="button"
                    className={`notification-item type-${item.tipo.toLowerCase()} ${Number(item.lida) ? "read" : "unread"}`}
                    key={item.id}
                    onClick={() => openSystemNotification(item)}
                  >
                    <span className="notification-symbol" aria-hidden="true">
                      {notificationAreaIcon(item.area)}
                    </span>
                    <span>
                      <strong>{item.titulo}</strong>
                      <small>{item.mensagem}</small>
                      <time>{formatSystemDate(item.criado_em)}</time>
                    </span>
                  </button>
                )) : (
                  <div className="notification-empty">Nenhuma atualização por enquanto.</div>
                )}
              </div>
            </section>
          )}
        </div>
        <DisplayMessageBanner messages={visibleDisplayMessages} />
        <TextBoxes
          area={view}
          position="TOPO"
          boxes={portal.blocosTexto}
          canManage={can("SISTEMA_PERSONALIZAR")}
          showAdd
          onChanged={(blocosTexto) =>
            setPortal((current) => ({ ...current, blocosTexto }))
          }
          notify={notify}
        />
        {can("SISTEMA_PERSONALIZAR") && (
          <div className="layout-toolbar" aria-label="Organização das informações desta aba">
            <span>Organizar esta aba</span>
            {([
              ["compacto", "Pequeno · 4×4"],
              ["medio", "Médio · 4×2"],
              ["grande", "Grande · 2×2"],
            ] as const).map(([preset, label]) => (
              <button
                type="button"
                key={preset}
                className={(tabLayouts[view] || "medio") === preset ? "active" : ""}
                onClick={() => changeTabLayout(preset)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {view === "inicio" && can("VISAO_GERAL_VER") && (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">PAINEL DE ACOMPANHAMENTO</p>
                <h1>Olá, {profile.nome.split(" ")[0]}</h1>
                <p>Acompanhe como está a integração de visitantes da igreja.</p>
              </div>
              <div className="top-actions">
                {can("VISITANTES_CRIAR") && (
                  <button
                    className="primary-button"
                    onClick={() => setModal("visitor")}
                  >
                    <span>＋</span> Novo visitante
                  </button>
                )}
              </div>
            </header>
            <section className="metrics-grid">
              <article className="metric-card">
                <div className="metric-icon blue">◉</div>
                <div>
                  <span>Novos este mês</span>
                  <strong>{data.metrics.monthTotal}</strong>
                  <small>cadastros no período</small>
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-icon teal">✓</div>
                <div>
                  <span>Em acompanhamento</span>
                  <strong>{data.metrics.activeTotal}</strong>
                  <small>visitantes ativos</small>
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-icon amber">◷</div>
                <div>
                  <span>Contatos pendentes</span>
                  <strong>{data.metrics.pendingTotal}</strong>
                  <small className={data.metrics.pendingTotal ? "warning" : ""}>
                    para revisar
                  </small>
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-icon violet">⌘</div>
                <div>
                  <span>Integrados</span>
                  <strong>{data.metrics.integratedTotal}</strong>
                  <small>em célula ou ministério</small>
                </div>
              </article>
            </section>
            <section className="dashboard-grid">
              <DashboardChart datasets={data.charts} />
              <article className="panel status-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">JORNADA</p>
                    <h2>Status dos visitantes</h2>
                  </div>
                </div>
                <div className="empty-insight">
                  <strong>{data.metrics.activeTotal}</strong>
                  <span>visitantes ativos cadastrados</span>
                  {can("VISITANTES_VER") && (
                    <button onClick={() => setView("visitantes")}>
                      Abrir lista
                    </button>
                  )}
                </div>
              </article>
            </section>
            <section className="home-news">
              <div className="section-title">
                <div>
                  <p className="eyebrow">COMUNICAÇÃO</p>
                  <h2>{mainMenuLabel}</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => setView("avisos")}
                >
                  Ver todos
                </button>
              </div>
              <div className="news-strip">
                {portal.avisos.slice(0, 3).map((item) => (
                  <button
                    className={`news-type-${String(item.tipo).toLowerCase()} news-priority-${String(item.prioridade).toLowerCase()}`}
                    key={String(item.id)}
                    onClick={() => setView("avisos")}
                  >
                    <span>{String(item.tipo)}</span>
                    <strong>{String(item.titulo)}</strong>
                    <small>{String(item.resumo)}</small>
                  </button>
                ))}
                {!portal.avisos.length && (
                  <p className="empty-inline">Nenhuma publicação disponível.</p>
                )}
              </div>
            </section>
            <section className="bottom-grid">
              {can("VISITANTES_VER") ? (
                <article className="panel visitors-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">MOVIMENTO RECENTE</p>
                      <h2>Últimos visitantes</h2>
                    </div>
                    <button className="text-button" onClick={() => setView("visitantes")}>
                      Ver cadastro completo
                    </button>
                  </div>
                  <div className="visitor-list">
                    {recentVisitors.length ? (
                      recentVisitors.map((visitor) => (
                        <VisitorRow
                          key={visitor.id}
                          visitor={visitor}
                          onFollowup={() => {
                            setSelectedVisitor(visitor);
                            setModal("followup");
                          }}
                        />
                      ))
                    ) : (
                      <Empty text="Nenhum visitante cadastrado ainda." />
                    )}
                  </div>
                </article>
              ) : (
                <article className="panel visitors-panel overview-access-note">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">ACESSO À VISÃO GERAL</p>
                      <h2>Indicadores liberados</h2>
                    </div>
                  </div>
                  <p>
                    Você pode acompanhar totais e gráficos. Os nomes e as fichas
                    permanecem visíveis somente para pessoas autorizadas.
                  </p>
                </article>
              )}
              <article className="panel next-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">PRÓXIMOS PASSOS</p>
                    <h2>Ações recomendadas</h2>
                  </div>
                </div>
                <div className="action-item">
                  <span className="action-time">01</span>
                  <div>
                    <strong>Cadastre os primeiros visitantes</strong>
                    <small>Inclua contato e data de entrada.</small>
                  </div>
                </div>
                <div className="action-item">
                  <span className="action-time">02</span>
                  <div>
                    <strong>Defina os responsáveis</strong>
                    <small>Use o histórico para registrar cada contato.</small>
                  </div>
                </div>
                <div className="action-item">
                  <span className="action-time">03</span>
                  <div>
                    <strong>Acompanhe os indicadores</strong>
                    <small>Compare semana, mês e ano.</small>
                  </div>
                </div>
              </article>
            </section>
          </>
        )}

        {view === "visitantes" && (
          <section className="page-section">
            <PageHeader
              eyebrow="CADASTRO"
              title={labels.visitantes || "Visitantes"}
              description="Localize pessoas e acompanhe sua jornada de integração."
              action={
                can("VISITANTES_CRIAR") ? (
                  <button
                    className="primary-button"
                    onClick={() => {
                      setSelectedVisitor(null);
                      setModal("visitor");
                    }}
                  >
                    ＋ Novo visitante
                  </button>
                ) : null
              }
            />
            <div className="panel">
              <div className="list-toolbar">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome, telefone ou e-mail"
                  aria-label="Buscar visitantes"
                />
                <span>
                  {search.trim()
                    ? `${filteredVisitors.length} encontrado${filteredVisitors.length === 1 ? "" : "s"}`
                    : "10 cadastros mais recentes"}
                </span>
                {can("VISITANTES_EXCLUIR") && selectedVisitorIds.size > 0 && (
                  <button className="danger-button bulk-delete-button" onClick={deleteSelectedVisitors}>
                    Excluir selecionados ({selectedVisitorIds.size})
                  </button>
                )}
              </div>
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      {can("VISITANTES_EXCLUIR") && (
                        <th className="selection-column">
                          <input
                            type="checkbox"
                            checked={filteredVisitors.length > 0 && filteredVisitors.every((item) => selectedVisitorIds.has(item.id))}
                            onChange={toggleVisibleVisitors}
                            aria-label="Selecionar visitantes visíveis"
                          />
                        </th>
                      )}
                      <th>Visitante</th>
                      <th>Telefone</th>
                      <th>Entrada</th>
                      <th>Batismo</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVisitors.map((visitor) => (
                      <tr key={visitor.id}>
                        {can("VISITANTES_EXCLUIR") && (
                          <td className="selection-column">
                            <input
                              type="checkbox"
                              checked={selectedVisitorIds.has(visitor.id)}
                              onChange={() => toggleVisitorSelection(visitor.id)}
                              aria-label={`Selecionar ${visitor.nome_completo}`}
                            />
                          </td>
                        )}
                        <td>
                          <strong>{visitor.nome_completo}</strong>
                          <small>{visitor.celula || "Sem célula"}</small>
                        </td>
                        <td>{visitor.telefone || "—"}</td>
                        <td>{formatDate(visitor.data_entrada)}</td>
                        <td>
                          {visitor.batizado.replace(
                            "NAO_INFORMADO",
                            "Não informado",
                          )}
                        </td>
                        <td>
                          <span
                            className={`status-pill ${statusLabel[visitor.status]?.toLowerCase().replace(" ", "-")}`}
                          >
                            {statusLabel[visitor.status] || visitor.status}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="table-action detail-button"
                              onClick={() => {
                                setSelectedVisitor(visitor);
                                setModal("visitor_details");
                              }}
                            >
                              Ver ficha
                            </button>
                            {can("ACOMPANHAMENTOS_CRIAR") && (
                              <button
                                className="table-action"
                                onClick={() => {
                                  setSelectedFollowup(null);
                                  setSelectedVisitor(visitor);
                                  setModal("followup");
                                }}
                              >
                                Contato
                              </button>
                            )}
                            {can("VISITANTES_EDITAR") && (
                              <button
                                className="table-action"
                                onClick={() => {
                                  setSelectedVisitor(visitor);
                                  setModal("visitor");
                                }}
                              >
                                Editar
                              </button>
                            )}
                            {can("VISITANTES_EXCLUIR") && (
                              <button
                                className="danger-button"
                                onClick={() => deleteVisitor(visitor)}
                              >
                                Excluir
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredVisitors.length && (
                  <Empty text="Nenhum visitante encontrado." />
                )}
              </div>
            </div>
          </section>
        )}

        {view === "acompanhamentos" && (
          <section className="page-section">
            <PageHeader
              eyebrow="CUIDADO"
              title={labels.acompanhamentos || "Acompanhamentos"}
              description="Registre, edite ou exclua contatos e próximos passos."
            />
            <div className="cards-list">
              {followups.map((item) => (
                <article className="followup-card" key={item.id}>
                  <span className="visitor-avatar">
                    {initials(item.visitante_nome)}
                  </span>
                  <div>
                    <strong>{item.visitante_nome}</strong>
                    <small>
                      {item.tipo} ·{" "}
                      {new Date(item.criado_em).toLocaleDateString("pt-BR")}
                    </small>
                    <p>
                      {item.resultado}
                      {item.descricao ? ` — ${item.descricao}` : ""}
                    </p>
                  </div>
                  {can("ACOMPANHAMENTOS_CRIAR") && (
                    <div className="row-actions">
                      <button
                        className="table-action"
                        onClick={() => {
                          setSelectedVisitor(
                            visitors.find(
                              (visitor) => visitor.id === item.visitante_id,
                            ) || null,
                          );
                          setSelectedFollowup(item);
                          setModal("followup");
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="danger-button"
                        onClick={() => deleteFollowup(item)}
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!followups.length && (
                <Empty text="Nenhum acompanhamento registrado." />
              )}
            </div>
          </section>
        )}

        {view === "louvor" && can("LOUVOR_VER") && (
          <section className="page-section">
            <MinistryModules
              section="louvor"
              title={labels.louvor || "Equipe de Louvor"}
              initialData={ministryPortal}
              onDataChange={setPortal}
              can={can}
              notify={notify}
            />
          </section>
        )}

        {view === "diaconia" && can("DIACONIA_VER") && (
          <section className="page-section">
            <MinistryModules
              section="diaconia"
              title={labels.diaconia || "Diaconia"}
              initialData={ministryPortal}
              onDataChange={setPortal}
              can={can}
              notify={notify}
            />
          </section>
        )}

        {view === "cultos" && can("CULTOS_VER") && (
          <section className="page-section">
            <ChurchServicesModule notify={notify} />
          </section>
        )}

        {view === "teens" && can("TEENS_VER") && (
          <section className="page-section">
            <TeensModule
              initialTeens={data.teens}
              initialFollowups={data.teensAcompanhamentos}
              canManage={can("TEENS_GERENCIAR")}
              notify={notify}
              onChanged={() => undefined}
            />
          </section>
        )}

        {view === "avisos" && (
          <section className="page-section">
            <PortalModules
              section="avisos"
              title={mainMenuLabel}
              initialData={portal}
              onDataChange={setPortal}
              can={can}
              notify={notify}
            />
          </section>
        )}

        {view === "modulos" && can("MODULOS_PERSONALIZADOS_VER") && (
          <section className="page-section">
            <PortalModules
              section="modulos"
              title={labels.modulos || "Outras áreas"}
              initialData={portal}
              onDataChange={setPortal}
              can={can}
              notify={notify}
            />
          </section>
        )}

        {view === "celulas" && can("CELULAS_VER") && (
          <section className="page-section">
            <PageHeader
              eyebrow="CONEXÃO"
              title={labels.celulas || "Células"}
              description="Cadastre, altere e organize as pessoas de cada célula."
              action={
                can("CELULAS_GERENCIAR") ? (
                  <button
                    className="primary-button"
                    onClick={() => {
                      setSelectedCell(null);
                      setModal("cell");
                    }}
                  >
                    ＋ Nova célula
                  </button>
                ) : null
              }
            />
            <div className="cell-grid">
              {cells.length ? (
                cells.map((cell) => (
                  <article className="cell-card" key={cell.id}>
                    <header className="cell-card-header">
                      <span className="cell-icon">⌘</span>
                      <div>
                        <p>CÉLULA</p>
                        <h2>{cell.nome}</h2>
                      </div>
                      <span className="cell-member-count">
                        {safeJson<string[]>(cell.membros, []).length} pessoa{safeJson<string[]>(cell.membros, []).length === 1 ? "" : "s"}
                      </span>
                    </header>
                    <div className="cell-owner">
                      <span>Responsável</span>
                      <strong>{cell.responsavel}</strong>
                    </div>
                    <div className="cell-members">
                      <h3>Participantes</h3>
                      <div className="people-chips">
                        {safeJson<string[]>(cell.membros, []).length ? (
                          safeJson<string[]>(cell.membros, []).map((member) => (
                            <span key={member}>
                              <strong>{member}</strong>
                            </span>
                          ))
                        ) : (
                          <small>Nenhuma pessoa adicionada ainda.</small>
                        )}
                      </div>
                    </div>
                    {cell.observacoes && <p className="cell-notes">{cell.observacoes}</p>}
                    {can("CELULAS_GERENCIAR") && (
                      <footer className="cell-card-footer">
                        <button
                          className="cell-action-button"
                          onClick={() => {
                            setSelectedCell(cell);
                            setModal("cell");
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="cell-delete-button"
                          onClick={() => deleteCell(cell)}
                        >
                          Excluir
                        </button>
                      </footer>
                    )}
                  </article>
                ))
              ) : (
                <Empty text="Nenhuma célula cadastrada ainda." />
              )}
            </div>
          </section>
        )}

        {view === "menu" && hasExtraAccess && (
          <section className="page-section">
            <PageHeader
              eyebrow="NAVEGAÇÃO"
              title={labels.menu || "Menu do ADOTE"}
              description={
                actingAsAdmin
                  ? "Toque em um nome para editar; toque no ícone para abrir a área."
                  : "Acesse somente as áreas liberadas para sua conta."
              }
            />
            {actingAsAdmin && (
              <div className="mobile-menu-name">
                <span>Nome desta aba</span>
                <InlineNameEditor
                  labelKey="menu"
                  label={labels.menu || "Menu do ADOTE"}
                  onRename={renameTab}
                />
              </div>
            )}
            <div className="mobile-menu-grid">
              <MobileMenuItem
                icon="◫"
                labelKey="avisos"
                label={mainMenuLabel}
                description={`${data.portal.avisos.length} publicações para consultar`}
                canEdit={actingAsAdmin}
                emphasized
                onOpen={() => setView("avisos")}
                onRename={renameTab}
              />
              {actingAsAdmin && (
                <MobileMenuItem
                  icon="⌂"
                  labelKey="inicio"
                  label={labels.inicio || "Visão geral"}
                  description="Resumo e indicadores"
                  canEdit
                  onOpen={() => setView("inicio")}
                  onRename={renameTab}
                />
              )}
              {can("VISITANTES_VER") && (
                <MobileMenuItem
                  icon="◉"
                  labelKey="visitantes"
                  label={labels.visitantes || "Visitantes"}
                  description="Cadastro e acompanhamento"
                  canEdit={actingAsAdmin}
                  onOpen={() => setView("visitantes")}
                  onRename={renameTab}
                />
              )}
              {can("VISITANTES_VER") && (
                <MobileMenuItem
                  icon="✓"
                  labelKey="acompanhamentos"
                  label={labels.acompanhamentos || "Acompanhamentos"}
                  description="Histórico de contatos"
                  canEdit={actingAsAdmin}
                  onOpen={() => setView("acompanhamentos")}
                  onRename={renameTab}
                />
              )}
              {can("CELULAS_VER") && (
                <MobileMenuItem
                  icon="⌘"
                  labelKey="celulas"
                  label={labels.celulas || "Células"}
                  description="Grupos e integrantes"
                  canEdit={actingAsAdmin}
                  onOpen={() => setView("celulas")}
                  onRename={renameTab}
                />
              )}
              {can("TEENS_VER") && (
                <MobileMenuItem
                  icon="◇"
                  labelKey="teens"
                  label={labels.teens || "Teens"}
                  description="Menores de 17 anos e acompanhamentos"
                  canEdit={actingAsAdmin}
                  onOpen={() => setView("teens")}
                  onRename={renameTab}
                />
              )}
              {can("LOUVOR_VER") && (
                <MobileMenuItem
                  icon="♫"
                  labelKey="louvor"
                  label={labels.louvor || "Equipe de Louvor"}
                  description={
                    can("LOUVOR_GERENCIAR")
                      ? "Gerenciar escalas, músicas e links"
                      : "Consultar escalas, músicas e links"
                  }
                  canEdit={actingAsAdmin}
                  onOpen={() => setView("louvor")}
                  onRename={renameTab}
                />
              )}
              {can("DIACONIA_VER") && (
                <MobileMenuItem
                  icon="☷"
                  labelKey="diaconia"
                  label={labels.diaconia || "Diaconia"}
                  description="Equipes, escalas e ranking autorizado"
                  canEdit={actingAsAdmin}
                  onOpen={() => setView("diaconia")}
                  onRename={renameTab}
                />
              )}
              {can("CULTOS_VER") && (
                <MobileMenuItem
                  icon="▦"
                  labelKey="cultos"
                  label={labels.cultos || "Rotinas dos Cultos"}
                  description="Registros, equipes e gráficos dos cultos"
                  canEdit={actingAsAdmin}
                  onOpen={() => setView("cultos")}
                  onRename={renameTab}
                />
              )}
              {can("RELATORIOS_VER") && (
                <MobileMenuItem
                  icon="▥"
                  labelKey="relatorios"
                  label={labels.relatorios || "Relatórios"}
                  description="Prévia e download em PDF"
                  canEdit={actingAsAdmin}
                  onOpen={() => setView("relatorios")}
                  onRename={renameTab}
                />
              )}
              {can("MODULOS_PERSONALIZADOS_VER") && (
                <MobileMenuItem
                  icon="⊞"
                  labelKey="modulos"
                  label={labels.modulos || "Outras áreas"}
                  description="Abas personalizadas"
                  canEdit={actingAsAdmin}
                  onOpen={() => setView("modulos")}
                  onRename={renameTab}
                />
              )}
              {actingAsAdmin && (
                <MobileMenuItem
                  icon="♙"
                  labelKey="usuarios"
                  label={labels.usuarios || "Usuários e permissões"}
                  description="Membros, títulos e acessos"
                  canEdit
                  onOpen={() => setView("usuarios")}
                  onRename={renameTab}
                />
              )}
              {actingAsAdmin && (
                <MobileMenuItem
                  icon="◐"
                  labelKey="personalizar"
                  label={labels.personalizar || "Personalização total"}
                  description="Identidade, contatos e cores"
                  canEdit
                  onOpen={() => setView("personalizar")}
                  onRename={renameTab}
                />
              )}
              {actingAsAdmin && (
                <MobileMenuItem
                  icon="◇"
                  labelKey="seguranca"
                  label={labels.seguranca || "Segurança"}
                  description="Acesso e proteção"
                  canEdit
                  onOpen={() => setView("seguranca")}
                  onRename={renameTab}
                />
              )}
            </div>
          </section>
        )}

        {view === "relatorios" && can("RELATORIOS_VER") && (
          <section className="page-section">
            <PageHeader
              eyebrow="RELATÓRIOS"
              title={labels.relatorios || "Relatórios"}
              description="Edite o título e a observação, visualize o PDF e só então faça o download."
            />
            <div className="report-grid">
              {[
                ["semana", "Relatório semanal", "Últimos 7 dias"],
                ["mes", "Relatório mensal", "Mês atual"],
                ["ano", "Relatório anual", "Ano atual"],
              ].map(([periodo, titulo, texto]) => (
                <article className="panel" key={periodo}>
                  <p className="eyebrow">ADOTE</p>
                  <h2>{titulo}</h2>
                  <p>{texto}</p>
                  <button
                    className="primary-link"
                    onClick={() =>
                      setPdfConfig({
                        baseUrl: `/api/relatorios/pdf?periodo=${periodo}`,
                        title: `${siteInfo.nome || "ADOTE"} - ${titulo}`,
                      })
                    }
                  >
                    Editar e visualizar PDF
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "personalizar" && can("SISTEMA_PERSONALIZAR") && (
          <section className="page-section">
            <PageHeader
              eyebrow="CONTROLE TOTAL"
              title={labels.personalizar || "Personalização total"}
              description="Edite o sistema e a página de login sem depender de alterações no código."
            />
            <ScheduledMessagesManager
              initialMessages={displayMessages}
              initialMaintenance={initialMaintenance}
              labels={labels}
              onChanged={setDisplayMessages}
              notify={notify}
            />
            <form
              key={appearanceRevision}
              className="panel form-grid admin-settings"
              onSubmit={saveAppearance}
            >
              <h2 className="form-section-title span-2">
                Identidade da igreja
              </h2>
              <label>
                Nome do sistema ou igreja
                <input
                  name="siteNome"
                  defaultValue={siteInfo.nome || "ADOTE"}
                />
              </label>
              <label>
                Subtítulo
                <input
                  name="subtitulo"
                  defaultValue={siteInfo.subtitulo || "Gestão da igreja"}
                />
              </label>
              <label className="span-2">
                Logo principal — endereço da imagem
                <input
                  name="logo"
                  type="url"
                  defaultValue={theme.logo || ""}
                  placeholder="https://.../logo.png"
                />
              </label>
              <label className="span-2">
                Texto do rodapé
                <input
                  name="rodape"
                  defaultValue={
                    siteInfo.rodape || "Conectando pessoas à vida da igreja."
                  }
                />
              </label>
              <label>
                Instagram
                <input
                  name="instagram"
                  defaultValue={siteInfo.instagram || ""}
                  placeholder="@suaigreja ou link"
                />
              </label>
              <label>
                WhatsApp
                <input
                  name="whatsapp"
                  defaultValue={siteInfo.whatsapp || ""}
                  placeholder="(00) 00000-0000"
                />
              </label>
              <h2 className="form-section-title span-2">Cores do sistema</h2>
              <label>
                Cor principal
                <input
                  type="color"
                  name="primary"
                  defaultValue={theme.primary || "#17324d"}
                />
              </label>
              <label>
                Cor secundária
                <input
                  type="color"
                  name="secondary"
                  defaultValue={theme.secondary || "#21486d"}
                />
              </label>
              <label>
                Cor de destaque
                <input
                  type="color"
                  name="accent"
                  defaultValue={theme.accent || "#17877f"}
                />
              </label>
              <div className="settings-reset-card span-2">
                <div>
                  <strong>Voltar às cores originais</strong>
                  <span>
                    Restaura a paleta padrão do ADOTE sem apagar logo, textos,
                    contatos ou nomes das abas.
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={restoreDefaultColors}
                >
                  Restaurar cores originais
                </button>
              </div>
              <h2 className="form-section-title span-2">Página de login</h2>
              <label>
                Título principal
                <input
                  name="loginTitulo"
                  defaultValue={loginConfig.titulo || "Bem-vindo ao ADOTE"}
                />
              </label>
              <label>
                Subtítulo
                <input
                  name="loginSubtitulo"
                  defaultValue={
                    loginConfig.subtitulo ||
                    "Um espaço seguro e organizado para conectar pessoas e servir melhor."
                  }
                />
              </label>
              <label className="span-2">
                Logo do login — endereço da imagem
                <input
                  name="loginLogo"
                  type="url"
                  defaultValue={loginConfig.logo || theme.logo || ""}
                  placeholder="https://.../logo.png"
                />
              </label>
              <label className="span-2 image-upload-field">
                Trocar a imagem do login pelo celular ou computador
                <input
                  name="loginLogoFile"
                  type="file"
                  accept="image/*"
                />
                <small>Selecione uma imagem de até 50 MB. Ela será convertida automaticamente para WebP.</small>
              </label>
              <label>
                Cor de fundo
                <input
                  type="color"
                  name="loginFundo"
                  defaultValue={loginConfig.fundo || theme.primary || "#102b43"}
                />
              </label>
              <label>
                Cor de destaque
                <input
                  type="color"
                  name="loginDestaque"
                  defaultValue={
                    loginConfig.destaque || theme.accent || "#17877f"
                  }
                />
              </label>
              <div className="login-message-management span-2">
                <div>
                  <strong>Mensagens controladas por período</strong>
                  <span>
                    O login fica limpo por padrão. Use o painel acima para escolher
                    quando uma mensagem aparece, desaparece e em quais áreas será exibida.
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => document.getElementById("display-control-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  Abrir controle de mensagens
                </button>
              </div>
              <h2 className="form-section-title span-2">
                Nome de todas as abas
              </h2>
              <div className="menu-order-editor span-2">
                <div>
                  <strong>Posição dos menus</strong>
                  <small>Use as setas para colocar as abas na ordem desejada. A ordem também será usada no menu do celular.</small>
                </div>
                {menuOrder.map((key, index) => {
                  const fallback = MENU_ITEMS.find(([itemKey]) => itemKey === key)?.[1] || key;
                  return (
                    <div className="menu-order-row" key={key}>
                      <span><b>{index + 1}</b>{labels[key] || fallback}</span>
                      <div>
                        <button type="button" className="ghost-button small" onClick={() => moveMenuItem(key, -1)} disabled={index === 0}>↑</button>
                        <button type="button" className="ghost-button small" onClick={() => moveMenuItem(key, 1)} disabled={index === menuOrder.length - 1}>↓</button>
                        <button
                          type="button"
                          className={`ghost-button small ${hiddenTabs.includes(key) ? "restore-tab" : "delete-tab"}`}
                          onClick={() => toggleTabVisibility(key)}
                          disabled={key === "avisos" || key === "personalizar"}
                        >
                          {hiddenTabs.includes(key) ? "Restaurar" : "Excluir aba"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hierarchy-editor span-2">
                <div className="hierarchy-editor-heading">
                  <div>
                    <strong>Hierarquias e permissões</strong>
                    <small>Crie níveis, escolha apenas uma cor e marque exatamente o que cada hierarquia pode acessar.</small>
                  </div>
                  <button type="button" className="secondary-button" onClick={addHierarchy}>＋ Nova hierarquia</button>
                </div>
                {hierarchies.map((hierarchy) => (
                  <article className="hierarchy-card" key={hierarchy.id}>
                    <div className="hierarchy-card-title">
                      <input
                        aria-label="Nome da hierarquia"
                        value={hierarchy.nome}
                        onChange={(event) => updateHierarchy(hierarchy.id, { nome: event.target.value })}
                      />
                      <label>
                        <span>Cor</span>
                        <input
                          type="color"
                          value={hierarchy.cor}
                          onChange={(event) => updateHierarchy(hierarchy.id, { cor: event.target.value })}
                        />
                      </label>
                      {hierarchy.id !== "MEMBRO" && (
                        <button type="button" className="danger-button" onClick={() => removeHierarchy(hierarchy.id)}>Excluir</button>
                      )}
                    </div>
                    <div className="hierarchy-permissions">
                      {permissionCatalog.map((permission) => (
                        <label key={permission.key}>
                          <input
                            type="checkbox"
                            checked={hierarchy.permissoes.includes(permission.key)}
                            onChange={() => toggleHierarchyPermission(hierarchy.id, permission.key)}
                          />
                          {permission.label}
                        </label>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <h2 className="form-section-title span-2">Editor global de textos</h2>
              <label className="span-2">
                Alterar textos da interface
                <textarea
                  name="textOverrides"
                  rows={7}
                  defaultValue={textOverridesToText(textOverrides)}
                  placeholder={"Texto original => Novo texto\nOutro texto => Minha alteração"}
                />
                <small>Use uma alteração por linha. Copie o texto exatamente como aparece, coloque “=&gt;” e escreva o novo texto. Isso permite editar títulos, descrições, botões e mensagens fixas do sistema.</small>
              </label>
              <label>
                Visão geral
                <input
                  name="inicio"
                  defaultValue={labels.inicio || "Visão geral"}
                />
              </label>
              <label>
                Notícias e avisos
                <input
                  name="avisos"
                  defaultValue={labels.avisos || "Notícias e avisos"}
                />
              </label>
              <label>
                Visitantes
                <input
                  name="visitantes"
                  defaultValue={labels.visitantes || "Visitantes"}
                />
              </label>
              <label>
                Acompanhamentos
                <input
                  name="acompanhamentos"
                  defaultValue={labels.acompanhamentos || "Acompanhamentos"}
                />
              </label>
              <label>
                Células
                <input
                  name="celulas"
                  defaultValue={labels.celulas || "Células"}
                />
              </label>
              <label>
                Relatórios
                <input
                  name="relatorios"
                  defaultValue={labels.relatorios || "Relatórios"}
                />
              </label>
              <label>
                Equipe de Louvor
                <input
                  name="louvor"
                  defaultValue={labels.louvor || "Equipe de Louvor"}
                />
              </label>
              <label>
                Diaconia
                <input
                  name="diaconia"
                  defaultValue={labels.diaconia || "Diaconia"}
                />
              </label>
              <label>
                Rotinas dos Cultos
                <input
                  name="cultos"
                  defaultValue={labels.cultos || "Rotinas dos Cultos"}
                />
              </label>
              <label>
                Outras áreas
                <input
                  name="modulos"
                  defaultValue={labels.modulos || "Outras áreas"}
                />
              </label>
              <label>
                Usuários
                <input
                  name="usuarios"
                  defaultValue={labels.usuarios || "Usuários e permissões"}
                />
              </label>
              <label>
                Personalização
                <input
                  name="personalizar"
                  defaultValue={labels.personalizar || "Personalização total"}
                />
              </label>
              <label>
                Segurança
                <input
                  name="seguranca"
                  defaultValue={labels.seguranca || "Segurança"}
                />
              </label>
              <label>
                Menu do celular
                <input
                  name="menu"
                  defaultValue={labels.menu || "Menu do ADOTE"}
                />
              </label>
              <div className="form-actions span-2">
                <button className="primary-button">
                  Salvar e aplicar tudo
                </button>
              </div>
            </form>
          </section>
        )}

        {view === "usuarios" && (
          <section className="page-section" id="usuarios">
            <PageHeader
              eyebrow="ADMINISTRAÇÃO"
              title={labels.usuarios || "Usuários e permissões"}
              description="Consulte a ficha completa, libere acessos e envie links seguros para criar ou redefinir senhas."
              action={
                <button
                  className="primary-button"
                  onClick={() => {
                    setSelectedUser(null);
                    setModal("user");
                  }}
                >
                  ＋ Adicionar usuário
                </button>
              }
            />
            <div className="user-directory-toolbar">
              <label className="user-search-field">
                <span>⌕</span>
                <input
                  type="search"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Pesquisar por nome, e-mail, telefone ou diaconia"
                  aria-label="Pesquisar usuários"
                />
              </label>
              <label>
                <span>Título ministerial</span>
                <select
                  value={userTitleFilter}
                  onChange={(event) => setUserTitleFilter(event.target.value)}
                >
                  <option value="TODOS">Todos os títulos</option>
                  {hierarchies.map((hierarchy) => (
                    <option value={hierarchy.id} key={hierarchy.id}>{hierarchy.nome}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Situação</span>
                <select
                  value={userStatusFilter}
                  onChange={(event) => setUserStatusFilter(event.target.value)}
                >
                  <option value="TODOS">Todos os cadastros</option>
                  <option value="NOVOS">Novos — últimos 30 dias</option>
                  <option value="SEM_SENHA">Aguardando senha</option>
                  <option value="REDEFINICAO">Pediu redefinição</option>
                  <option value="INATIVOS">Inativos</option>
                </select>
              </label>
              <strong className="directory-count">
                {filteredUsers.length} de {users.length}
              </strong>
            </div>
            <div className="cards-list">
              {filteredUsers.map((item) => (
                <article
                  className={`user-card ${item.redefinicao_pendente ? "password-request" : ""}`}
                  key={item.id}
                >
                  <span className="visitor-avatar">{initials(item.nome)}</span>
                  <div>
                    <strong>{item.nome}</strong>
                    <small>
                      {item.email}
                      {item.telefone ? ` · ${item.telefone}` : ""}
                    </small>
                    {item.diaconia_equipe_nome ? (
                      <small>Diaconia: {item.diaconia_equipe_nome}</small>
                    ) : null}
                    {item.redefinicao_pendente ? (
                      <em>Solicitou redefinição de senha</em>
                    ) : !item.tem_senha ? (
                      <em>Aguardando criação da senha</em>
                    ) : null}
                  </div>
                  <span
                    className={`church-title title-${(item.titulo_eclesiastico || "MEMBRO").toLowerCase()}`}
                    style={hierarchyBadgeStyle(item.titulo_eclesiastico, hierarchies)}
                  >
                    {titleLabel(item.titulo_eclesiastico, hierarchies)}
                  </span>
                  <span className="role-pill">{item.perfil}</span>
                  <span
                    className={item.ativo ? "active-label" : "inactive-label"}
                  >
                    {item.ativo ? "Ativo" : "Inativo"}
                  </span>
                  <div className="user-card-actions">
                    <button
                      className="table-action"
                      onClick={() => {
                        setSelectedUser(item);
                        setModal("user_details");
                      }}
                    >
                      Ver ficha
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => createPasswordLink(item)}
                    >
                      {item.redefinicao_pendente || !item.tem_senha
                        ? "Gerar link de senha"
                        : "Redefinir senha"}
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setSelectedUser(item);
                        setModal("user");
                      }}
                    >
                      Editar tudo
                    </button>
                    {item.id !== profile.id && (
                      <button
                        className="danger-button"
                        onClick={() => deleteUser(item)}
                      >
                        Excluir pessoa
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!filteredUsers.length && (
                <Empty text="Nenhum usuário corresponde aos filtros escolhidos." />
              )}
            </div>
          </section>
        )}

        {view === "seguranca" && (
          <section className="page-section">
            <PageHeader
              eyebrow="PROTEÇÃO"
              title={labels.seguranca || "Segurança da conta"}
              description={`O ${siteInfo.nome || "ADOTE"} protege as senhas e limita o acesso conforme as permissões definidas por você.`}
            />
            <div className="security-grid">
              <article className="panel security-card">
                <span className="large-icon">◇</span>
                <div>
                  <h2>Login próprio e protegido</h2>
                  <p>
                    As senhas são guardadas como códigos criptográficos e não
                    podem ser visualizadas. Após 3 erros, a conta é bloqueada
                    temporariamente e a recuperação fica disponível.
                  </p>
                  <a className="primary-link" href="/api/auth/logout">
                    Sair e acessar novamente
                  </a>
                </div>
              </article>
              <article className="panel security-card">
                <span className="large-icon">♙</span>
                <div>
                  <h2>Permissões individuais</h2>
                  <p>
                    Novos cadastros começam sem acesso aos dados internos.
                    Somente o administrador libera visitantes, relatórios,
                    louvor, células e outras áreas.
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => setView("usuarios")}
                  >
                    Revisar usuários e senhas
                  </button>
                </div>
              </article>
              <article className="panel security-card">
                <span className="large-icon">✓</span>
                <div>
                  <h2>Recuperação segura</h2>
                  <p>
                    Quando alguém esquecer a senha, você gera um link pessoal em
                    Usuários e permissões. O link expira em 30 minutos e
                    funciona uma única vez.
                  </p>
                </div>
              </article>
            </div>
          </section>
        )}
        <TextBoxes
          area={view}
          position="RODAPE"
          boxes={portal.blocosTexto}
          canManage={can("SISTEMA_PERSONALIZAR")}
          showAdd
          onChanged={(blocosTexto) =>
            setPortal((current) => ({ ...current, blocosTexto }))
          }
          notify={notify}
        />
        <footer className="site-footer">
          <div>
            <strong>{siteInfo.nome || "ADOTE"}</strong>
            <span>
              {siteInfo.rodape || "Conectando pessoas à vida da igreja."}
            </span>
          </div>
          <div className="future-contacts">
            {siteInfo.instagram ? (
              <a
                href={instagramLink(siteInfo.instagram)}
                target="_blank"
                rel="noreferrer"
              >
                ◎ {siteInfo.instagram}
              </a>
            ) : (
              <span>◎ Instagram não configurado</span>
            )}
            {siteInfo.whatsapp ? (
              <a
                href={whatsappLink(siteInfo.whatsapp)}
                target="_blank"
                rel="noreferrer"
              >
                ◉ {siteInfo.whatsapp}
              </a>
            ) : (
              <span>◉ WhatsApp não configurado</span>
            )}
            {can("SISTEMA_PERSONALIZAR") && (
              <button
                className="text-button"
                onClick={() => setView("personalizar")}
              >
                Editar contatos e rodapé
              </button>
            )}
          </div>
        </footer>
      </main>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        <button
          className={`notice-mobile ${view === "avisos" ? "active" : ""}`}
          onClick={() => setView("avisos")}
        >
          <span>◫</span>
          {mainMenuLabel}
        </button>
        {can("VISAO_GERAL_VER") ? (
          <button
            className={view === "inicio" ? "active" : ""}
            onClick={() => setView("inicio")}
          >
            <span>⌂</span>
            {labels.inicio || "Início"}
          </button>
        ) : (
          <span />
        )}
        {(view === "cultos" && can("CULTOS_GERENCIAR")) ||
        ((view === "inicio" || view === "visitantes") && can("VISITANTES_CRIAR")) ? (
          <button
            className="mobile-add"
            onClick={() => {
              if (view === "cultos" && can("CULTOS_GERENCIAR")) {
                window.dispatchEvent(new Event("adote:new-cult-routine"));
              } else {
                setSelectedVisitor(null);
                setModal("visitor");
              }
            }}
            aria-label={
              view === "cultos" ? "Cadastrar nova rotina" : "Cadastrar visitante"
            }
            title={
              view === "cultos" ? "Nova rotina" : "Novo visitante"
            }
          >
            ＋
          </button>
        ) : (
          <span />
        )}
        {hasExtraAccess ? (
          <button
            className={view === "menu" ? "active" : ""}
            onClick={() => setView("menu")}
          >
            <span>☰</span>Menu
          </button>
        ) : (
          <span />
        )}
        <button
          className={modal === "profile" ? "active" : ""}
          onClick={() => setModal("profile")}
        >
          <span>♙</span>Perfil
        </button>
      </nav>

      {modal === "visitor" && (
        <Modal
          title={selectedVisitor ? "Editar visitante" : "Cadastrar visitante"}
          onClose={() => {
            setModal(null);
            setSelectedVisitor(null);
          }}
        >
          <form className="form-grid" onSubmit={submitVisitor}>
            <label className="span-2">
              Nome completo*
              <input
                name="nomeCompleto"
                required
                defaultValue={selectedVisitor?.nome_completo || ""}
              />
            </label>
            <label>
              Data de nascimento
              <input
                name="dataNascimento"
                type="date"
                defaultValue={selectedVisitor?.data_nascimento || ""}
              />
            </label>
            <label>
              Telefone
              <input
                name="telefone"
                defaultValue={selectedVisitor?.telefone || ""}
              />
            </label>
            <label className="span-2">
              Meu e-mail de acesso
              <input
                name="email"
                type="email"
                required
                defaultValue={profile.email}
                autoComplete="email"
              />
            </label>
            <label className="span-2">
              Senha atual — necessária somente para trocar o e-mail
              <input
                name="senhaAtual"
                type="password"
                autoComplete="current-password"
                placeholder="Confirme sua senha se alterar o e-mail"
              />
            </label>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                defaultValue={selectedVisitor?.email || ""}
              />
            </label>
            <label>
              Data de entrada*
              <input
                name="dataEntrada"
                type="date"
                required
                defaultValue={
                  selectedVisitor?.data_entrada ||
                  new Date().toISOString().slice(0, 10)
                }
              />
            </label>
            <label>
              Batizado
              <select
                name="batizado"
                defaultValue={selectedVisitor?.batizado || "NAO_INFORMADO"}
              >
                <option value="NAO_INFORMADO">Não informado</option>
                <option value="SIM">Sim</option>
                <option value="NAO">Não</option>
              </select>
            </label>
            <label>
              Status
              <select
                name="status"
                defaultValue={selectedVisitor?.status || "NOVO"}
              >
                <option value="NOVO">Novo</option>
                <option value="EM_CONTATO">Em contato</option>
                <option value="EM_ACOMPANHAMENTO">Em acompanhamento</option>
                <option value="INTEGRADO">Integrado</option>
              </select>
            </label>
            <label>
              Endereço
              <input
                name="endereco"
                defaultValue={selectedVisitor?.endereco || ""}
              />
            </label>
            <label>
              Célula cadastrada
              <select
                name="celulaId"
                defaultValue={String(selectedVisitor?.celula_id || "")}
              >
                <option value="">Sem célula</option>
                {cells.map((cell) => (
                  <option value={cell.id} key={cell.id}>
                    {cell.nome}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-help span-2">
              A lista mostra somente células já criadas. Ao salvar, esta pessoa
              será adicionada automaticamente à célula selecionada.
            </p>
            <label>
              Acompanhante
              <input
                name="acompanhante"
                defaultValue={selectedVisitor?.acompanhante || ""}
              />
            </label>
            <label>
              Ministério
              <input
                name="ministerio"
                defaultValue={selectedVisitor?.ministerio || ""}
              />
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                name="encontroComDeus"
                defaultChecked={Boolean(selectedVisitor?.encontro_com_deus)}
              />
              Encontro com Deus
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                name="cursoMembros"
                defaultChecked={Boolean(selectedVisitor?.curso_membros)}
              />
              Curso de membros
            </label>
            <label className="span-2">
              Observações
              <textarea
                name="observacoes"
                rows={3}
                defaultValue={selectedVisitor?.observacoes || ""}
              />
            </label>
            <div className="form-actions span-2">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setModal(null);
                  setSelectedVisitor(null);
                }}
              >
                Cancelar
              </button>
              <button className="primary-button">
                {selectedVisitor ? "Salvar alterações" : "Salvar visitante"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "visitor_details" && selectedVisitor && (
        <Modal
          title={`Ficha completa — ${selectedVisitor.nome_completo}`}
          onClose={() => {
            setModal(null);
            setSelectedVisitor(null);
          }}
        >
          <div className="detail-sheet">
            <Detail
              label="Nome completo"
              value={selectedVisitor.nome_completo}
              wide
            />
            <Detail
              label="Data de nascimento"
              value={formatDate(selectedVisitor.data_nascimento)}
            />
            <Detail label="Telefone" value={selectedVisitor.telefone} />
            <Detail label="E-mail" value={selectedVisitor.email} />
            <Detail
              label="Data de entrada"
              value={formatDate(selectedVisitor.data_entrada)}
            />
            <Detail
              label="Batizado"
              value={
                selectedVisitor.batizado === "SIM"
                  ? "Sim"
                  : selectedVisitor.batizado === "NAO"
                    ? "Não"
                    : "Não informado"
              }
            />
            <Detail
              label="Status"
              value={
                statusLabel[selectedVisitor.status] || selectedVisitor.status
              }
            />
            <Detail label="Célula" value={selectedVisitor.celula} />
            <Detail label="Acompanhante" value={selectedVisitor.acompanhante} />
            <Detail label="Ministério" value={selectedVisitor.ministerio} />
            <Detail
              label="Encontro com Deus"
              value={yesNo(selectedVisitor.encontro_com_deus)}
            />
            <Detail
              label="Curso de membros"
              value={yesNo(selectedVisitor.curso_membros)}
            />
            <Detail label="Endereço" value={selectedVisitor.endereco} wide />
            <Detail
              label="Observações"
              value={selectedVisitor.observacoes}
              wide
            />
          </div>
          <div className="form-actions detail-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setModal(null);
                setSelectedVisitor(null);
              }}
            >
              Fechar
            </button>
            {can("VISITANTES_EDITAR") && (
              <button
                className="primary-button"
                onClick={() => setModal("visitor")}
              >
                Editar ficha
              </button>
            )}
            {actingAsAdmin && (
              <button
                className="secondary-button"
                onClick={() =>
                  setPdfConfig({
                    baseUrl: `/api/visitantes/${selectedVisitor.id}/pdf`,
                    title: `Ficha técnica — ${selectedVisitor.nome_completo}`,
                  })
                }
              >
                Visualizar e baixar PDF
              </button>
            )}
          </div>
        </Modal>
      )}
      {modal === "followup" && selectedVisitor && (
        <Modal
          title={`${selectedFollowup ? "Editar acompanhamento" : "Acompanhar"} — ${selectedVisitor.nome_completo}`}
          onClose={() => {
            setModal(null);
            setSelectedFollowup(null);
          }}
        >
          <form className="form-grid" onSubmit={submitFollowup}>
            <label>
              Tipo
              <select
                name="tipo"
                defaultValue={selectedFollowup?.tipo || "WHATSAPP"}
              >
                <option>WHATSAPP</option>
                <option>LIGACAO</option>
                <option>PRESENCIAL</option>
                <option>OUTRO</option>
              </select>
            </label>
            <label>
              Próximo contato
              <input
                name="proximoContato"
                type="date"
                defaultValue={selectedFollowup?.proximo_contato || ""}
              />
            </label>
            <label className="span-2">
              Resultado*
              <input
                name="resultado"
                required
                defaultValue={selectedFollowup?.resultado || ""}
              />
            </label>
            <label className="span-2">
              Descrição
              <textarea
                name="descricao"
                rows={4}
                defaultValue={selectedFollowup?.descricao || ""}
              />
            </label>
            <div className="form-actions span-2">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setModal(null);
                  setSelectedFollowup(null);
                }}
              >
                Cancelar
              </button>
              <button className="primary-button">
                {selectedFollowup
                  ? "Salvar alterações"
                  : "Registrar acompanhamento"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "user" && (
        <Modal
          title={
            selectedUser
              ? "Editar membro e acesso"
              : "Adicionar membro e acesso"
          }
          onClose={() => {
            setModal(null);
            setSelectedUser(null);
          }}
        >
          <form className="form-grid" onSubmit={submitUser}>
            <h3 className="form-section-title span-2">Ficha pessoal</h3>
            <label>
              Nome*
              <input name="nome" defaultValue={selectedUser?.nome} required />
            </label>
            <label>
              E-mail de acesso*
              <input
                name="email"
                type="email"
                defaultValue={selectedUser?.email}
                required
                readOnly={!!selectedUser}
              />
            </label>
            <label>
              Telefone
              <input
                name="telefone"
                defaultValue={selectedUser?.telefone || ""}
              />
            </label>
            <label>
              Data de nascimento
              <input
                type="date"
                name="dataNascimento"
                defaultValue={selectedUser?.data_nascimento || ""}
              />
            </label>
            <p className="field-help span-2">
              A data calcula a idade, inclui automaticamente menores de 17 anos
              no Teens e permite a notícia de aniversário.
            </p>
            <label className="span-2">
              Nome dos pais ou responsáveis (opcional)
              <input
                name="nomePais"
                defaultValue={selectedUser?.nome_pais || ""}
              />
            </label>
            <label className="span-2">
              Endereço completo
              <input
                name="endereco"
                defaultValue={selectedUser?.endereco || ""}
                placeholder="Rua, número, bairro, cidade e CEP"
              />
            </label>
            <label>
              Célula
              <input name="celula" defaultValue={selectedUser?.celula || ""} />
            </label>
            <label>
              Ministério
              <input
                name="ministerio"
                defaultValue={selectedUser?.ministerio || ""}
              />
            </label>
            <label className="span-2">
              Equipe de diaconia
              <select
                name="diaconiaEquipeId"
                defaultValue={String(selectedUser?.diaconia_equipe_id || "")}
              >
                <option value="">Não participa de uma diaconia</option>
                {portal.equipesDiaconia.map((team) => (
                  <option value={String(team.id)} key={String(team.id)}>
                    {String(team.nome)}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              Observações
              <textarea
                name="observacoes"
                rows={3}
                defaultValue={selectedUser?.observacoes || ""}
              />
            </label>
            <h3 className="form-section-title span-2">Acesso e hierarquia</h3>
            <label>
              Título ministerial — somente admin
              <select
                name="tituloEclesiastico"
                defaultValue={selectedUser?.titulo_eclesiastico || "MEMBRO"}
                onChange={applyHierarchyToForm}
              >
                {hierarchies.map((hierarchy) => (
                  <option value={hierarchy.id} key={hierarchy.id}>{hierarchy.nome}</option>
                ))}
              </select>
            </label>
            <label>
              Perfil de acesso
              <select
                name="perfil"
                defaultValue={selectedUser?.perfil ?? "ACOMPANHANTE"}
              >
                <option value="ADMIN">Administrador</option>
                <option value="RECEPCAO">Recepção</option>
                <option value="ACOMPANHANTE">Acompanhante</option>
                <option value="LIDER_CELULA">Líder de célula</option>
              </select>
            </label>
            <fieldset className="permission-grid span-2">
              <legend>Permissões individuais</legend>
              {permissionCatalog.map((item) => (
                <label key={item.key}>
                  <input
                    type="checkbox"
                    name={item.key}
                    defaultChecked={
                      selectedUser?.perfil === "ADMIN" ||
                      selectedUser?.permissoes.split(",").includes(item.key)
                    }
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>
            {selectedUser && (
              <label className="checkbox-line span-2">
                <input
                  type="checkbox"
                  name="ativo"
                  defaultChecked={Boolean(selectedUser.ativo)}
                />
                Usuário ativo
              </label>
            )}
            <div className="form-actions span-2">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button className="primary-button">
                Salvar cadastro e permissões
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "user_details" && selectedUser && (
        <Modal
          title={`Ficha do membro — ${selectedUser.nome}`}
          onClose={() => {
            setModal(null);
            setSelectedUser(null);
          }}
        >
          <div className="detail-sheet">
            <Detail label="Nome completo" value={selectedUser.nome} wide />
            <Detail label="E-mail" value={selectedUser.email} />
            <Detail label="Telefone" value={selectedUser.telefone} />
            <Detail
              label="Data de nascimento"
              value={formatDate(selectedUser.data_nascimento)}
            />
            <Detail
              label="Pais ou responsáveis"
              value={selectedUser.nome_pais}
              wide
            />
            <Detail
              label="Título ministerial"
              value={titleLabel(selectedUser.titulo_eclesiastico, hierarchies)}
            />
            <Detail label="Perfil de acesso" value={selectedUser.perfil} />
            <Detail
              label="Situação"
              value={selectedUser.ativo ? "Ativo" : "Inativo"}
            />
            <Detail label="Célula" value={selectedUser.celula} />
            <Detail label="Ministério" value={selectedUser.ministerio} />
            <Detail
              label="Equipe de diaconia"
              value={selectedUser.diaconia_equipe_nome}
            />
            <Detail
              label="Endereço completo"
              value={selectedUser.endereco}
              wide
            />
            <Detail label="Observações" value={selectedUser.observacoes} wide />
            <Detail
              label="Permissões"
              value={
                selectedUser.perfil === "ADMIN"
                  ? "Acesso administrativo total"
                  : permissionCatalog
                      .filter((permission) =>
                        selectedUser.permissoes
                          .split(",")
                          .includes(permission.key),
                      )
                      .map((permission) => permission.label)
                      .join(" · ")
              }
              wide
            />
          </div>
          <div className="form-actions detail-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setModal(null);
                setSelectedUser(null);
              }}
            >
              Fechar
            </button>
            <button className="primary-button" onClick={() => setModal("user")}>
              Editar ficha completa
            </button>
            {actingAsAdmin && (
              <button
                className="secondary-button"
                onClick={() =>
                  setPdfConfig({
                    baseUrl: `/api/usuarios/${selectedUser.id}/pdf`,
                    title: `Ficha do membro — ${selectedUser.nome}`,
                  })
                }
              >
                Visualizar e baixar PDF
              </button>
            )}
          </div>
        </Modal>
      )}
      {modal === "cell" && (
        <Modal
          title={selectedCell ? "Editar célula" : "Nova célula"}
          onClose={() => {
            setModal(null);
            setSelectedCell(null);
          }}
        >
          <form className="form-grid" onSubmit={submitCell}>
            <label>
              Nome da célula*
              <input name="nome" required defaultValue={selectedCell?.nome} />
            </label>
            <label>
              Responsável*
              <input
                name="responsavel"
                required
                defaultValue={selectedCell?.responsavel}
              />
            </label>
            <label className="span-2">
              Pessoas da célula — uma por linha
              <textarea
                name="membros"
                rows={7}
                defaultValue={
                  selectedCell
                    ? safeJson<string[]>(selectedCell.membros, []).join("\n")
                    : ""
                }
                placeholder="Nome da pessoa"
              />
            </label>
            <label className="span-2">
              Observações
              <textarea
                name="observacoes"
                rows={3}
                defaultValue={selectedCell?.observacoes || ""}
              />
            </label>
            <div className="form-actions span-2">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button className="primary-button">Salvar célula</button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "profile" && (
        <Modal title="Meu cadastro" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={saveProfile}>
            <label>
              Nome*
              <input name="nome" required defaultValue={profile.nome} />
            </label>
            <label>
              Telefone
              <input name="telefone" defaultValue={profile.telefone || ""} />
            </label>
            <label>
              Data de nascimento
              <input
                type="date"
                name="dataNascimento"
                defaultValue={profile.data_nascimento || ""}
              />
            </label>
            <label>
              Foto (opcional, original de até 50 MB)
              <input
                name="foto"
                type="file"
                accept="image/*"
              />
            </label>
            <label className="span-2">
              Endereço completo
              <input
                name="endereco"
                defaultValue={profile.endereco || ""}
                placeholder="Rua, número, bairro, cidade e CEP"
              />
            </label>
            <label>
              Célula
              <input name="celula" defaultValue={profile.celula || ""} />
            </label>
            <label>
              Ministério
              <input
                name="ministerio"
                defaultValue={profile.ministerio || ""}
              />
            </label>
            <label className="span-2">
              Equipe de diaconia
              <div className="readonly-title">
                <strong>
                  {profile.diaconia_equipe_nome ||
                    "Não participa de uma diaconia"}
                </strong>
                <small>Definida pelo administrador</small>
              </div>
            </label>
            <label className="span-2">
              Observações
              <textarea
                name="observacoes"
                rows={3}
                defaultValue={profile.observacoes || ""}
              />
            </label>
            <label>
              Título ministerial
              <div className="readonly-title">
                <span
                  className={`church-title title-${(profile.titulo_eclesiastico || "MEMBRO").toLowerCase()}`}
                  style={hierarchyBadgeStyle(profile.titulo_eclesiastico, hierarchies)}
                >
                  {titleLabel(profile.titulo_eclesiastico, hierarchies)}
                </span>
                <small>Definido pelo administrador</small>
              </div>
            </label>
            <p className="field-help span-2">
              Você pode alterar seus dados pessoais e seu próprio e-mail. O
              título ministerial e a equipe de diaconia continuam controlados
              pela administração.
            </p>
            <div className="profile-preferences-card span-2">
              <div>
                <strong>Aparência desta conta</strong>
                <small>
                  Sua escolha entre claro e escuro fica salva somente para o seu usuário.
                </small>
              </div>
              <button type="button" className="secondary-button" onClick={toggleTheme}>
                {themeMode === "ESCURO" ? "☀ Usar tema claro" : "☾ Usar tema escuro"}
              </button>
            </div>
            <div className="form-actions span-2">
              <a className="profile-modal-logout" href="/api/auth/logout">
                ↪ Sair do sistema
              </a>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button className="primary-button">Salvar cadastro</button>
            </div>
          </form>
        </Modal>
      )}
      {pdfConfig && (
        <PdfComposer
          baseUrl={pdfConfig.baseUrl}
          initialTitle={pdfConfig.title}
          onClose={() => setPdfConfig(null)}
        />
      )}
    </div>
  );
}

type RenameHandler = (key: string, value: string) => void | Promise<void>;

function InlineNameEditor({
  labelKey,
  label,
  onRename,
  className = "",
}: {
  labelKey: string;
  label: string;
  onRename: RenameHandler;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        className={`inline-name-trigger ${className}`.trim()}
        onClick={() => setEditing(true)}
        aria-label={`Renomear a aba ${label}`}
        title="Clique para renomear"
      >
        <span>{label}</span>
        <span className="inline-edit-icon" aria-hidden="true">
          ✎
        </span>
      </button>
    );
  }

  return (
    <input
      className={`inline-name-input ${className}`.trim()}
      key={label}
      defaultValue={label}
      autoFocus
      aria-label={`Editar nome da aba ${label}`}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => {
        const value = event.currentTarget.value.trim();
        if (value && value !== label) onRename(labelKey, value);
        else event.currentTarget.value = label;
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = label;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function EditableNavItem({
  icon,
  labelKey,
  label,
  active,
  canEdit,
  onOpen,
  onRename,
  count,
  emphasized = false,
}: {
  icon: string;
  labelKey: string;
  label: string;
  active: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onRename: RenameHandler;
  count?: number;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`editable-nav-row ${active ? "active" : ""} ${emphasized ? "notice-nav" : ""}`}
      style={{
        order: `var(--menu-order-${labelKey})`,
        display: `var(--tab-display-${labelKey}, grid)`,
      }}
    >
      <button
        className="nav-open-button"
        onClick={onOpen}
        aria-label={`Abrir ${label}`}
        title={`Abrir ${label}`}
      >
        <span>{icon}</span>
      </button>
      {canEdit ? (
        <InlineNameEditor
          labelKey={labelKey}
          label={label}
          onRename={onRename}
        />
      ) : (
        <button className="nav-text-button" onClick={onOpen}>
          {label}
        </button>
      )}
      {count !== undefined && <b>{count}</b>}
    </div>
  );
}

function MobileMenuItem({
  icon,
  labelKey,
  label,
  description,
  canEdit,
  onOpen,
  onRename,
  emphasized = false,
}: {
  icon: string;
  labelKey: string;
  label: string;
  description: string;
  canEdit: boolean;
  onOpen: () => void;
  onRename: RenameHandler;
  emphasized?: boolean;
}) {
  return (
    <article
      className={`mobile-menu-card ${emphasized ? "notice-menu-card" : ""}`}
      style={{
        order: `var(--menu-order-${labelKey})`,
        display: `var(--tab-display-${labelKey}, grid)`,
      }}
    >
      <button
        className="mobile-menu-open"
        onClick={onOpen}
        aria-label={`Abrir ${label}`}
      >
        <span>{icon}</span>
      </button>
      <div>
        {canEdit ? (
          <InlineNameEditor
            labelKey={labelKey}
            label={label}
            onRename={onRename}
          />
        ) : (
          <button className="mobile-menu-label" onClick={onOpen}>
            {label}
          </button>
        )}
        <small>{description}</small>
      </div>
    </article>
  );
}

function Detail({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: string | number | null;
  wide?: boolean;
}) {
  const text =
    value === null || value === undefined || String(value).trim() === ""
      ? "Não informado"
      : String(value);
  return (
    <div className={`detail-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>{text}</strong>
    </div>
  );
}

function VisitorRow({
  visitor,
  onFollowup,
}: {
  visitor: Visitor;
  onFollowup: () => void;
}) {
  return (
    <div className="visitor-row">
      <span className="visitor-avatar">{initials(visitor.nome_completo)}</span>
      <span className="visitor-name">
        <strong>{visitor.nome_completo}</strong>
        <small>
          {new Date(`${visitor.data_entrada}T12:00:00`).toLocaleDateString(
            "pt-BR",
          )}
        </small>
      </span>
      <span
        className={`status-pill ${statusLabel[visitor.status]?.toLowerCase().replace(" ", "-")}`}
      >
        {statusLabel[visitor.status] || visitor.status}
      </span>
      <button
        onClick={onFollowup}
        aria-label={`Acompanhar ${visitor.nome_completo}`}
      >
        ›
      </button>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="topbar page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">ADOTE</p>
            <h2>{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <span>◌</span>
      <p>{text}</p>
    </div>
  );
}
function safeJson<T>(value: string | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
function normalizeMenuOrder(value: string[]) {
  const allowed = new Set<string>(DEFAULT_MENU_ORDER);
  const clean = Array.isArray(value)
    ? value.filter((key, index) => allowed.has(key) && value.indexOf(key) === index)
    : [];
  return [...clean, ...DEFAULT_MENU_ORDER.filter((key) => !clean.includes(key))];
}
function normalizeHierarchies(value: HierarchyConfig[]) {
  if (!Array.isArray(value) || !value.length) return DEFAULT_HIERARCHIES;
  const seen = new Set<string>();
  const clean = value.flatMap((item) => {
    const id = String(item?.id || "").trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,40}$/.test(id) || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      nome: String(item.nome || id).trim().slice(0, 40) || id,
      cor: /^#[0-9a-f]{6}$/i.test(String(item.cor)) ? item.cor : "#526d82",
      permissoes: Array.isArray(item.permissoes) ? item.permissoes.map(String) : [],
    }];
  });
  return clean.length ? clean : DEFAULT_HIERARCHIES;
}
function parseTextOverrides(value: string) {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.split("=>").map((part) => part.trim()))
      .filter(([original, replacement]) => original && replacement)
      .map(([original, ...replacement]) => [original, replacement.join(" => ")]),
  );
}
function textOverridesToText(value: Record<string, string>) {
  return Object.entries(value).map(([original, replacement]) => `${original} => ${replacement}`).join("\n");
}
function displayMessageAreas(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
function normalizeLabels(value: Record<string, string>) {
  const legacyMainNames = [
    "aviso",
    "avisos",
    "notícias e avisos",
    "noticias e avisos",
  ];
  const current = String(value.avisos || "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  return !current || legacyMainNames.includes(current)
    ? { ...value, avisos: "Menu Principal" }
    : value;
}
function formatDate(value?: string | null) {
  return value
    ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")
    : "Não informado";
}
function yesNo(value?: number | boolean) {
  return value ? "Sim" : "Não";
}
function titleLabel(value?: string, hierarchies: HierarchyConfig[] = DEFAULT_HIERARCHIES) {
  const configured = hierarchies.find((item) => item.id === (value || "MEMBRO"));
  if (configured) return configured.nome;
  return (
    (
      {
        MEMBRO: "Membro",
        ASPIRANTE: "Aspirante",
        DIACONO: "Diácono",
        PRESBITERO: "Presbítero",
        PASTOR: "Pastor",
        BISPO: "Bispo",
      } as Record<string, string>
    )[value || "MEMBRO"] || value || "Membro"
  );
}

function hierarchyBadgeStyle(value: string | undefined, hierarchies: HierarchyConfig[]) {
  const color = hierarchies.find((item) => item.id === (value || "MEMBRO"))?.cor;
  if (!color) return undefined;
  const hex = color.replace("#", "");
  const number = Number.parseInt(hex, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  const readable = red * 0.299 + green * 0.587 + blue * 0.114 > 155 ? "#193040" : "#ffffff";
  return { background: color, borderColor: color, color: readable } as React.CSSProperties;
}

function notificationAreaIcon(area: SystemNotification["area"]) {
  return (
    {
      MENU: "◫",
      VISITANTES: "◉",
      CULTOS: "▦",
      USUARIOS: "♙",
      MODULOS: "⊞",
      DIACONIA: "☷",
    } as const
  )[area];
}

function formatSystemDate(value: string) {
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clientTitleRank(value?: string | null) {
  const normalized = (value || "MEMBRO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return (
    (
      {
        MEMBRO: 0,
        ASPIRANTE: 1,
        DIACONO: 2,
        PRESBITERO: 3,
        PASTOR: 4,
        BISPO: 5,
      } as Record<string, number>
    )[normalized] ?? 0
  );
}

function automaticClientPermissions(user: AppUser) {
  const permissions = new Set<string>();
  const rank = clientTitleRank(user.titulo_eclesiastico);
  const hierarchyConfigured = user.permissoes.split(",").includes("HIERARQUIA_CONFIGURADA");
  if (!hierarchyConfigured && rank >= 1) {
    permissions.add("LOUVOR_VER");
    permissions.add("CELULAS_VER");
    permissions.add("DIACONIA_VER");
  }
  if (user.diaconia_equipe_id) permissions.add("DIACONIA_VER");
  if (!hierarchyConfigured && rank >= 3) {
    [
      "VISITANTES_VER",
      "VISITANTES_CRIAR",
      "VISITANTES_EDITAR",
      "ACOMPANHAMENTOS_CRIAR",
      "CELULAS_VER",
      "CELULAS_GERENCIAR",
      "DIACONIA_VER",
      "DIACONIA_GERENCIAR",
      "DIACONIA_CHECKLIST_GERENCIAR",
      "TEENS_VER",
      "CULTOS_VER",
      "CULTOS_REGISTRAR",
      "CULTOS_GERENCIAR",
    ].forEach((permission) => permissions.add(permission));
  }
  if (user.culto_registrador) {
    permissions.add("CULTOS_VER");
    permissions.add("CULTOS_REGISTRAR");
  }
  return [...permissions];
}
function instagramLink(value: string) {
  const clean = value.trim();
  return clean.startsWith("http")
    ? clean
    : `https://instagram.com/${clean.replace(/^@/, "")}`;
}
function whatsappLink(value: string) {
  const clean = value.trim();
  return clean.startsWith("http")
    ? clean
    : `https://wa.me/${clean.replace(/\D/g, "")}`;
}
