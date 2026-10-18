"use client";
import SafeImage from "./SafeImage";
import CommunityHighlight from "./CommunityHighlight";

import InviteRevocationList from './InviteRevocationList';

import Link from "./StableLink";
import VinkuloLoading from "./VinkuloLoading";
import dynamic from "next/dynamic";
import { type CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PilotFeatureState } from "../lib/pilot-data";
import type { TenantContext, TenantMembership } from "../lib/tenant";
import {
  getCommunityPalette,
  communityThemeStyle,
  type CommunityTheme,
} from "../lib/community-theme";
import type { CommunityManagementView } from "./CommunityAdminWorkspace";
import CommunityHome from "./CommunityHome";
import useFeedDialog from "./feed/useFeedDialog";
import GlobalVisualEditor from "./GlobalVisualEditorLazy";
import PilotNotificationCenter, {
  type NotificationUnreadSummary,
} from "./PilotNotificationCenter";
import IncomingMessageToast, { type IncomingMessage } from "./IncomingMessageToast";
import ThemeControl from "./ThemeControl";
import OfflineModeEntry from "./OfflineModeEntry";
import WorkspaceErrorBoundary from "./WorkspaceErrorBoundary";
import VerifiedOwnerName from "./VerifiedOwnerName";
import TemporaryAccessWatcher from "./TemporaryAccessWatcher";
import CloseDetailsOnOutside from "./CloseDetailsOnOutside";
import CommunityCentral, { CentralNavigation, CENTRAL_VIEWS } from "./CommunityCentral";

const moduleLoading = () => <section className="workspace-module-loading" aria-busy="true" role="status"><span className="pilot-loading-spinner" aria-hidden="true" /><strong>Carregando esta área…</strong><small>Somente o necessário para esta tela está sendo preparado.</small></section>;
const AccountProfileWorkspace = dynamic(() => import("./AccountProfileWorkspace"), { loading: moduleLoading });
const CommunityAdminWorkspace = dynamic(() => import("./CommunityAdminWorkspace"), { loading: moduleLoading });
const CommunityLifecycleWorkspace = dynamic(() => import("./CommunityLifecycleWorkspace"), { loading: moduleLoading });
const DayThreadWorkspace = dynamic(() => import("./DayThreadWorkspace"), { loading: moduleLoading });
const EditorialSidebarSchedule = dynamic(() => import("./EditorialSidebarSchedule"), { loading: () => null });
const EventsWorkspace = dynamic(() => import("./EventsWorkspace"), { loading: moduleLoading });
const LeadershipWorkspace = dynamic(() => import("./LeadershipWorkspace"), { loading: moduleLoading });
const NetworkWorkspace = dynamic(() => import("./NetworkWorkspace"), { loading: moduleLoading });
const ParkingWorkspace = dynamic(() => import("./ParkingWorkspace"), { loading: moduleLoading });
const PeopleWorkspace = dynamic(() => import("./PeopleWorkspace"), { loading: moduleLoading });
const PrivateChatWorkspace = dynamic(() => import("./PrivateChatWorkspace"), { loading: moduleLoading });
const RequestsWorkspace = dynamic(() => import("./RequestsWorkspace"), { loading: moduleLoading });
const SecretaryMinisterialWorkspace = dynamic(() => import("./SecretaryMinisterialWorkspace"), { loading: moduleLoading });
const CellsWorkspace = dynamic(() => import("./CellsWorkspace"), { loading: moduleLoading });

type FeedItem = {
  id: number;
  titulo: string;
  resumo: string;
  conteudo: string;
  categoria: string;
  visibilidade: "COMUNIDADE" | "PLATAFORMA";
  status: "RASCUNHO" | "PUBLICADA";
  origem: string;
  criado_em: string;
  autor_nome?: string | null;
};
type CommunityProfile = {
  nome: string;
  slug: string;
  descricao: string;
  cidade: string;
};
type View =
  | "inicio"
  | "fio"
  | "eventos"
  | "ministerios"
  | "visitantes"
  | "celulas"
  | "estacionamento"
  | "redes"
  | "membro"
  | "lider"
  | "comunidade"
  | "continuidade"
  | "visual-editor"
  | "pessoas"
  | "solicitacoes"
  | "mensagens"
  | "conta"
  | "relatorios"
  | "avisos"
  | "configuracoes";
type NavigationFocus = { anchor?: string; event?: string };
const MENU: { id: View; label: string; permission: string }[] = [
  { id: "inicio", label: "Início", permission: "dashboard.view" },
  { id: "fio", label: "Fio do dia", permission: "dashboard.view" },
  { id: "eventos", label: "Agenda", permission: "events.view" },
  { id: "ministerios", label: "Ministérios", permission: "ministries.view" },
  { id: "solicitacoes", label: "Pedidos", permission: "dashboard.view" },
  { id: "visitantes", label: "Visitantes", permission: "visitors.view" },
  { id: "celulas", label: "Células", permission: "cells.view" },
  { id: "estacionamento", label: "Estacionamento", permission: "parking.view" },
  { id: "redes", label: "Redes e unidades", permission: "networks.view" },
  { id: "membro", label: "Painel do membro", permission: "dashboard.view" },
  { id: "lider", label: "Painel de liderança", permission: "leadership.panel.view" },
  { id: "pessoas", label: "Pessoas", permission: "people.view" },
  { id: "comunidade", label: "Central da Comunidade", permission: "dashboard.view" },
  { id: "relatorios", label: "Relatórios", permission: "dashboard.view" },
  { id: "avisos", label: "Avisos", permission: "dashboard.view" },
  { id: "configuracoes", label: "Configurações", permission: "dashboard.view" },
  { id: "continuidade", label: "Continuidade", permission: "community.lifecycle.request" },
];
const COMMUNITY_MANAGEMENT_VIEWS: CommunityManagementView[] = [
  "membro",
  "lider",
  "pessoas",
  "continuidade",
];
const COMMUNITY_MANAGEMENT_DESCRIPTIONS: Record<
  CommunityManagementView,
  string
> = {
  membro: "Seus dados, vínculos e participação na comunidade.",
  lider: "Acompanhamento e decisões permitidas à liderança.",
  pessoas: "Diretório, funções e oficiais da comunidade.",
  continuidade: "Situação, solicitações administrativas e preservação do histórico.",
};
const VIEW_MODULE: Partial<Record<View, TenantContext["modules"][number]>> = {
  eventos: "events",
  ministerios: "ministries",
  visitantes: "visitors",
  celulas: "cells",
  estacionamento: "parking",
  redes: "networks",
  pessoas: "people",
};
const ROLE_LABELS: Record<string, string> = {
  MEMBRO: "Membro",
  LIDER: "Líder",
  PASTOR: "Pastoral",
  ADMIN_COMUNIDADE: "Administrador da comunidade",
  SUPERADMIN: "Superadministrador",
  PROPRIETARIO_VISUALIZADOR: "Proprietário · somente feed",
};
const MIN_FONT_SCALE = 0.85;
const MAX_FONT_SCALE = 1.25;
const DEFAULT_MOBILE_SHORTCUTS: View[] = ["inicio", "eventos", "solicitacoes"];
const MOBILE_SHORTCUT_LONG_PRESS_MS = 520;

function normalizeMobileShortcuts(value: unknown, allowedViews: View[]) {
  const allowed = new Set(allowedViews);
  const saved = Array.isArray(value)
    ? value.filter((item): item is View => typeof item === "string" && allowed.has(item as View))
    : [];
  const normalized: View[] = [];
  for (const item of [...saved, ...DEFAULT_MOBILE_SHORTCUTS, ...allowedViews]) {
    if (!allowed.has(item) || normalized.includes(item)) continue;
    normalized.push(item);
    if (normalized.length === 3) break;
  }
  for (const item of DEFAULT_MOBILE_SHORTCUTS) {
    if (normalized.length === 3) break;
    if (!normalized.includes(item)) normalized.push(item);
  }
  return normalized;
}

function MagnifierIcon({ operation }: { operation: "minus" | "plus" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 4.1 4.1M7.8 10.5h5.4" />
      {operation === "plus" && <path d="M10.5 7.8v5.4" />}
    </svg>
  );
}

function PersonalizationControls({
  userEmail,
  fontScale,
  onDecrease,
  onReset,
  onIncrease,
}: {
  userEmail: string;
  fontScale: number;
  onDecrease: () => void;
  onReset: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="account-personalization-v4" role="group" aria-label="Aparência individual">
      <span>Aparência</span>
      <ThemeControl compact cycle storageId={userEmail} />
      <div className="account-font-zoom-v4" role="group" aria-label="Tamanho de todo o sistema">
        <button type="button" onClick={onDecrease} disabled={fontScale <= MIN_FONT_SCALE} aria-label="Diminuir todo o sistema" title="Diminuir">
          <MagnifierIcon operation="minus" />
        </button>
        <button type="button" className={fontScale === 1 ? "active" : ""} onClick={onReset} aria-label="Restaurar tamanho padrão" title="Restaurar tamanho padrão">
          {Math.round(fontScale * 100)}%
        </button>
        <button type="button" onClick={onIncrease} disabled={fontScale >= MAX_FONT_SCALE} aria-label="Aumentar todo o sistema" title="Aumentar">
          <MagnifierIcon operation="plus" />
        </button>
      </div>
    </div>
  );
}

export default function PilotDashboard({
  active,
  memberships,
  feed,
  features,
  parkingEnabled,
  userName,
  userEmail,
  userPhotoUrl,
  systemOwner,
  initialView,
  communityTheme,
}: {
  active: TenantContext;
  memberships: TenantMembership[];
  feed: FeedItem[];
  features: PilotFeatureState;
  parkingEnabled: boolean;
  userName: string;
  userEmail: string;
  userPhotoUrl: string;
  systemOwner: boolean;
  initialView: string;
  communityTheme: CommunityTheme;
}) {
  const communityPalette = getCommunityPalette(communityTheme.paletteId);
  const [view, setView] = useState<View>(initialView as View);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const dashboardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const dashboard = dashboardRef.current;
    const header = dashboard?.querySelector<HTMLElement>(".pilot-topbar");
    if (!dashboard || !header) return;
    const measure = () => dashboard.style.setProperty("--pilot-header-height", `${header.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const [mobileMenu, setMobileMenu] = useState<
    "menu" | "perfil" | "actions" | "shortcuts" | null
  >(null);
  const [mobileShortcuts, setMobileShortcuts] = useState<View[]>(DEFAULT_MOBILE_SHORTCUTS);
  const [mobileShortcutSlot, setMobileShortcutSlot] = useState<number | null>(null);
  const [mobileShortcutReplacement, setMobileShortcutReplacement] = useState<View | null>(null);
  const mobileShortcutPressTimer = useRef<number | null>(null);
  const mobileShortcutLongPress = useRef(false);
  const mobileShortcutsLoadedKey = useRef<string | null>(null);
  const [communitySearch, setCommunitySearch] = useState("");
  const [navigationSearch, setNavigationSearch] = useState("");
  const [navigationSearchOpen, setNavigationSearchOpen] = useState(false);
  const [quickActionSearch, setQuickActionSearch] = useState("");
  const [switching, setSwitching] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [openingVisitors, setOpeningVisitors] = useState(false);
  useEffect(() => {
    const reset = () => setOpeningVisitors(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  const [fontScale, setFontScale] = useState(1);
  const [fontScaleHydrated, setFontScaleHydrated] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [communityInfoOpen, setCommunityInfoOpen] = useState(false);
  const closeCommunityInfo = useCallback(() => setCommunityInfoOpen(false), []);
  useFeedDialog(communityInfoOpen ? "community-info" : "", closeCommunityInfo, ".community-info-dialog");
  const [communityProfile, setCommunityProfile] =
    useState<CommunityProfile | null>(null);
  const [communityInfoLoading, setCommunityInfoLoading] = useState(false);
  const [communityInfoError, setCommunityInfoError] = useState("");
  const [canEditCommunity, setCanEditCommunity] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  // Aviso animado de mensagem nova: guarda o retrato das não lidas por
  // conversa para saber *quem* escreveu, não só que o total subiu.
  const [incomingMessage, setIncomingMessage] = useState<IncomingMessage | null>(null);
  const [messagePulse, setMessagePulse] = useState(0);
  const unreadTotalRef = useRef(0);
  const unreadByConversationRef = useRef<{ comunidadeId: number; porConversa: Map<number, number> } | null>(null);
  const [unreadNotifications, setUnreadNotifications] =
    useState<NotificationUnreadSummary>({
      total: 0,
      escalas: 0,
      eventos: 0,
      pedidos: 0,
      mensagens: 0,
      sistema: 0,
    });
  const [messageCenterOpen, setMessageCenterOpen] = useState(false);
  const [chatTargetUserId, setChatTargetUserId] = useState<number | null>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      try {
        setSidebarCollapsed(window.localStorage.getItem("vinkulo:sidebar-collapsed") === "true");
      } catch {
        // O menu continua expandido quando o armazenamento do navegador não está disponível.
      }
    }, 0);
    return () => window.clearTimeout(initial);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      try {
        const individualKey = `vinkulo:font-scale:${userEmail.trim().toLowerCase()}`;
        const saved = Number(
          window.localStorage.getItem(individualKey) ??
          window.localStorage.getItem("vinkulo:font-scale"),
        );
        if (Number.isFinite(saved)) {
          setFontScale(Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Math.round(saved * 100) / 100)));
        }
      } catch {
        // Mantém o tamanho padrão quando a preferência local não está disponível.
      } finally {
        setFontScaleHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(initial);
  }, [userEmail]);

  useEffect(() => {
    if (!fontScaleHydrated) return;
    const root = document.documentElement;
    root.style.zoom = String(fontScale);
    root.style.setProperty("--vinkulo-ui-scale", String(fontScale));
    root.style.setProperty("--vinkulo-ui-scale-inverse", String(1 / fontScale));
    root.dataset.vinkuloScale = fontScale > 1 ? "ampliado" : fontScale < 1 ? "reduzido" : "normal";
    root.style.setProperty("--vinkulo-glass-alpha", "0.62");
    root.dataset.dataSaver = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ? "true" : "false";
    try {
      window.localStorage.setItem(
        `vinkulo:font-scale:${userEmail.trim().toLowerCase()}`,
        String(fontScale),
      );
      window.localStorage.setItem("vinkulo:font-scale", String(fontScale));
    } catch {
      // A preferência continua ativa na sessão atual.
    }
    window.dispatchEvent(new CustomEvent("vinkulo:network-mode"));
  }, [fontScale, fontScaleHydrated, userEmail]);

  function changeFontScale(delta: number) {
    setFontScale((current) => Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Math.round((current + delta) * 100) / 100)));
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("vinkulo:sidebar-collapsed", String(next));
      } catch {
        // A interação permanece funcional mesmo sem persistência local.
      }
      return next;
    });
  }
  const allowedMenu = useMemo(
    () =>
      MENU.filter(
        (item) =>
          (active.permissions.includes(item.permission) ||
            (item.id === "estacionamento" && active.permissions.includes("parking.reserve")) ||
            (active.isOwner && item.id === "pessoas")) &&
          (!VIEW_MODULE[item.id] ||
            active.modules.includes(VIEW_MODULE[item.id]!)) &&
          (active.communityAccess !== "FEED_ONLY" ||
            ["inicio", "pessoas"].includes(
              item.id,
            )) &&
          (item.id !== "configuracoes" || active.isCommunityOwner || active.permissions.some(permission => ["community.theme.manage", "invites.manage", "parking.configure", "membership.requests.manage"].includes(permission))) &&
          (item.id !== "estacionamento" || parkingEnabled) &&
          (item.id !== "redes" || features.networkModuleEnabled) &&
          (item.id !== "lider" ||
            ["LIDER", "PASTOR", "ADMIN_COMUNIDADE", "SUPERADMIN"].includes(
              active.papel,
            )),
      ),
    [
      active.communityAccess,
      active.isOwner,
      active.isCommunityOwner,
      active.modules,
      active.papel,
      active.permissions,
      features.networkModuleEnabled,
      parkingEnabled,
    ],
  );
  const primaryMenu = useMemo(
    () =>
      allowedMenu.filter(
        (item) =>
          !["relatorios", "avisos", "configuracoes"].includes(item.id) && (item.id === "pessoas" || !COMMUNITY_MANAGEMENT_VIEWS.includes(
            item.id as CommunityManagementView,
          )),
      ),
    [allowedMenu],
  );
  const mobileShortcutStorageKey = useMemo(
    () => `vinkulo:mobile-shortcuts:${userEmail.trim().toLowerCase()}:${active.comunidadeId}`,
    [active.comunidadeId, userEmail],
  );
  const mobileShortcutItems = useMemo(
    () => mobileShortcuts.map((id) => MENU.find((item) => item.id === id)).filter(Boolean) as typeof MENU,
    [mobileShortcuts],
  );

  useEffect(() => {
    mobileShortcutsLoadedKey.current = null;
    const timer = window.setTimeout(() => {
      let saved: unknown = null;
      try {
        saved = JSON.parse(window.localStorage.getItem(mobileShortcutStorageKey) || "null");
      } catch {
        // Usa os atalhos padrão quando a preferência local não pode ser lida.
      }
      mobileShortcutsLoadedKey.current = mobileShortcutStorageKey;
      setMobileShortcuts(normalizeMobileShortcuts(saved, primaryMenu.map((item) => item.id)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mobileShortcutStorageKey, primaryMenu]);

  useEffect(() => {
    if (mobileShortcutsLoadedKey.current !== mobileShortcutStorageKey) return;
    try {
      window.localStorage.setItem(mobileShortcutStorageKey, JSON.stringify(mobileShortcuts));
    } catch {
      // A troca continua funcional durante a sessão quando o armazenamento falha.
    }
  }, [mobileShortcutStorageKey, mobileShortcuts]);

  useEffect(() => () => {
    if (mobileShortcutPressTimer.current !== null) window.clearTimeout(mobileShortcutPressTimer.current);
  }, []);
  const sidebarGroups = useMemo(() => {
    const byId = new Map(allowedMenu.map((item) => [item.id, item]));
    const makeItem = (
      id: View,
      label?: string,
      key?: string,
      focus?: NavigationFocus,
    ) => {
      const item = byId.get(id);
      return item
        ? { ...item, label: label || item.label, key: key || item.id, focus }
        : null;
    };
    return [
      {
        label: "Dia",
        items: [
          makeItem("fio", "Fio do dia"),
          makeItem("inicio", "Início"),
          makeItem("eventos", "Agenda"),
        ].filter(Boolean),
      },
      {
        label: "Comunidade",
        items: [
          makeItem("pessoas", "Pessoas"),
          makeItem("ministerios", "Ministérios"),
          makeItem("visitantes", "Visitantes"),
          makeItem("solicitacoes", "Pedidos"),
          makeItem("estacionamento"),
          makeItem("celulas"),
          makeItem("redes"),
        ].filter(Boolean),
      },
      {
        label: "Gestão",
        items: [makeItem("comunidade", "Central da Comunidade")].filter(Boolean),
      },
    ];
  }, [allowedMenu]);
  const navigationSearchResults = useMemo(() => {
    const term = navigationSearch.trim().toLocaleLowerCase("pt-BR");
    return sidebarGroups
      .flatMap((group) => group.items)
      .filter((item) => {
        const aliases = item?.id === "comunidade" ? " relatórios avisos conta perfil liderança configurações" : item?.id === "ministerios" ? " escalas equipes" : item?.id === "inicio" ? " mural publicações" : "";
        return !term || `${item!.label}${aliases}`.toLocaleLowerCase("pt-BR").includes(term);
      })
      .slice(0, 7);
  }, [navigationSearch, sidebarGroups]);
  const communityManagementItems = useMemo(
    () =>
      allowedMenu
        .filter((item) =>
          COMMUNITY_MANAGEMENT_VIEWS.includes(
            item.id as CommunityManagementView,
          ),
        )
        .map((item) => ({
          id: item.id as CommunityManagementView,
          label: item.label,
          description:
            COMMUNITY_MANAGEMENT_DESCRIPTIONS[
              item.id as CommunityManagementView
            ],
        })),
    [allowedMenu],
  );
  const userInitials = getInitials(userName);
  const agendaAlerts = unreadNotifications.eventos + unreadNotifications.escalas;
  const menuAlerts = unreadNotifications.total + unreadMessages;
  const quickActions = useMemo(
    () =>
      active.communityAccess === "FEED_ONLY"
        ? []
        : [
            active.permissions.includes("feed.publish")
              ? { label: "Nova publicação", description: "Compartilhar com a comunidade", icon: "mural" as MenuIconId, view: "inicio" as View, event: "vinkulo:new-publication" }
              : null,
            active.permissions.includes("visitors.create")
              ? {
                  label: "Novo visitante",
                  description: "Abrir cadastro de visitante",
                  icon: "visitantes" as MenuIconId,
                  view: "visitantes" as View,
                  event: "vinkulo:new-visitor",
                }
              : null,
            active.permissions.includes("parking.view")
              ? {
                  label: "Estacionamento",
                  description: "Entrada, saída ou ocorrência",
                  icon: "estacionamento" as MenuIconId,
                  view: "estacionamento" as View,
                  event: "vinkulo:parking-action",
                }
              : null,
            active.permissions.includes("events.manage")
              ? {
                  label: "Novo evento",
                  description: "Criar evento da comunidade",
                  icon: "eventos" as MenuIconId,
                  view: "eventos" as View,
                  event: "vinkulo:new-event",
                }
              : null,
            active.permissions.includes("schedules.manage")
              ? {
                  label: "Nova escala",
                  description: "Criar escala ministerial",
                  icon: "escalas" as MenuIconId,
                  view: "ministerios" as View,
                  event: "vinkulo:new-schedule",
                }
              : null,
            {
              label: "Oração ou solicitação",
              description: "Enviar pedido com privacidade",
              icon: "solicitacoes" as MenuIconId,
              view: "solicitacoes" as View,
              event: "vinkulo:new-request",
            },
          ].filter(Boolean) as {
            label: string;
            description: string;
            icon: MenuIconId;
            view: View;
            event: string;
          }[],
    [active.communityAccess, active.permissions],
  );
  const visibleQuickActions = useMemo(() => {
    const term = quickActionSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return quickActions;
    return quickActions.filter((action) =>
      `${action.label} ${action.description}`.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [quickActionSearch, quickActions]);
  const filteredMemberships = useMemo(() => {
    const term = communitySearch.trim().toLocaleLowerCase("pt-BR");
    return term
      ? memberships.filter((membership) =>
          membership.comunidadeNome.toLocaleLowerCase("pt-BR").includes(term),
        )
      : memberships;
  }, [communitySearch, memberships]);

  useEffect(() => {
    if (!mobileMenu && !communityInfoOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenu(null);
        setCommunityInfoOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [communityInfoOpen, mobileMenu]);

  useEffect(() => {
    if (!mobileMenu) return;
    const sheet = document.getElementById("pilot-mobile-sheet");
    const trigger = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => [...(sheet?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]') || [])].filter(item => item.getClientRects().length);
    controls()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    sheet?.addEventListener("keydown", trapFocus);
    return () => { sheet?.removeEventListener("keydown", trapFocus); document.body.style.overflow = originalOverflow; trigger?.focus(); };
  }, [mobileMenu]);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setNavigationSearchOpen(true);
      }
      if (event.key === "Escape") setNavigationSearchOpen(false);
    };
    document.addEventListener("keydown", openSearch);
    return () => document.removeEventListener("keydown", openSearch);
  }, []);

  useEffect(() => {
    if (!communityInfoOpen) return;
    let cancelled = false;
    fetch("/api/pilot/comunidades", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as {
          community?: CommunityProfile;
          canEdit?: boolean;
          error?: string;
        };
        if (!response.ok || !result.community) {
          throw new Error(
            result.error || "Não foi possível carregar a comunidade.",
          );
        }
        if (cancelled) return;
        setCommunityProfile(result.community);
        setCanEditCommunity(Boolean(result.canEdit));
      })
      .catch((error) => {
        if (!cancelled) setCommunityInfoError((error as Error).message);
      })
      .finally(() => {
        if (!cancelled) setCommunityInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active.comunidadeId, communityInfoOpen]);

  useEffect(() => {
    if (active.communityAccess === "FEED_ONLY") return;
    let cancelled = false;
    const syncUnread = async () => {
      try {
        const response = await fetch("/api/pilot/chat", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          conversations?: {
            id?: number;
            participante_id?: number;
            participante_nome?: string;
            participante_foto?: string | null;
            ultima_mensagem?: string | null;
            nao_lidas?: number;
          }[];
        };
        if (cancelled) return;
        const conversations = payload.conversations || [];
        const total = conversations.reduce(
          (soma, conversation) => soma + Number(conversation.nao_lidas || 0),
          0,
        );
        if (total > unreadTotalRef.current) setMessagePulse((pulse) => pulse + 1);
        unreadTotalRef.current = total;
        setUnreadMessages(total);

        // Compara com a leitura anterior para descobrir em qual conversa a
        // mensagem chegou. A primeira sincronização só marca o ponto de
        // partida: entrar no painel não pode disparar aviso de mensagem
        // antiga.
        const snapshot = new Map(
          conversations.map((conversation) => [
            Number(conversation.id || 0),
            Number(conversation.nao_lidas || 0),
          ]),
        );
        // O retrato vale só para a comunidade em que foi tirado: ao trocar de
        // comunidade as conversas são outras, e comparar as duas listas
        // faria uma mensagem antiga passar por recém-chegada.
        const stored = unreadByConversationRef.current;
        const previous =
          stored && stored.comunidadeId === active.comunidadeId ? stored.porConversa : null;
        unreadByConversationRef.current = {
          comunidadeId: active.comunidadeId,
          porConversa: snapshot,
        };
        if (!previous) return;
        // Quem está lendo as mensagens não precisa de aviso flutuante: a
        // própria lista já mostra a conversa subindo com o contador.
        if (view === "mensagens" || messageCenterOpen) return;
        const arrived = conversations.find(
          (conversation) =>
            Number(conversation.nao_lidas || 0) >
            (previous.get(Number(conversation.id || 0)) ?? 0),
        );
        if (!arrived) return;
        setIncomingMessage({
          key: Date.now(),
          userId: Number(arrived.participante_id || 0),
          name: String(arrived.participante_nome || "Alguém da comunidade"),
          photo: arrived.participante_foto || null,
          preview: String(arrived.ultima_mensagem || ""),
          count: Number(arrived.nao_lidas || 0),
        });
      } catch {
        // O atalho continua funcional mesmo quando a contagem não responde.
      }
    };
    void syncUnread();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncUnread();
    }, 15_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void syncUnread();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [active.communityAccess, active.comunidadeId, view, messageCenterOpen]);

  function openCommunityInfo() {
    setCommunityInfoLoading(true);
    setCommunityInfoError("");
    setCommunityInfoOpen(true);
  }

  useEffect(() => {
    const syncFromAddress = () => {
      const candidate = new URL(window.location.href).searchParams.get("view");
      const menuView = candidate as View | null;
      if (!menuView) {
        setView("inicio");
        setMobileMenu(null);
        return;
      }
      // Mantém a rota solicitada no estado mesmo quando ela não é permitida,
      // para renderizar explicitamente o bloqueio em vez de deixar uma aba
      // anterior aberta sob uma URL não autorizada.
      setView(menuView);
      setMobileMenu(null);
    };
    const currentAddress = new URL(window.location.href);
    if (!currentAddress.searchParams.get("view")) {
      window.history.replaceState(
        { ...window.history.state, view: "inicio" },
        "",
        currentAddress,
      );
    }
    window.addEventListener("popstate", syncFromAddress);
    window.addEventListener("pageshow", syncFromAddress);
    return () => {
      window.removeEventListener("popstate", syncFromAddress);
      window.removeEventListener("pageshow", syncFromAddress);
    };
  }, [active.isOwner, allowedMenu]);

  // O painel de presença ("Quem está online") pede a conversa por evento em vez
  // de abrir uma segunda tela de chat: no celular vai para a aba Mensagens, no
  // desktop abre o popover. Quem pode falar com quem continua sendo decidido em
  // /api/pilot/chat.
  useEffect(() => {
    if (active.communityAccess === "FEED_ONLY") return;
    const handleOpenChat = (event: Event) => {
      const userId = Number(
        (event as CustomEvent<{ userId?: number }>).detail?.userId || 0,
      );
      if (userId <= 0) return;
      setChatTargetUserId(userId);
      if (window.matchMedia("(max-width: 760px)").matches) openView("mensagens");
      else setMessageCenterOpen(true);
    };
    window.addEventListener("vinkulo:open-chat", handleOpenChat);
    return () => window.removeEventListener("vinkulo:open-chat", handleOpenChat);
  }, [active.communityAccess]);

  const accessDeniedView =
    view !== "inicio" &&
    view !== "conta" &&
    !(view === "mensagens" && active.communityAccess !== "FEED_ONLY") &&
    !allowedMenu.some((item) => item.id === view);
  const visibleView =
    view === "conta" ||
    (view === "mensagens" && active.communityAccess !== "FEED_ONLY") ||
    allowedMenu.some((item) => item.id === view)
      ? view
      : "inicio";

  function openView(nextView: View, focus?: NavigationFocus) {
    if (nextView === "visitantes") {
      if (openingVisitors) return;
      setOpeningVisitors(true);
      setMobileMenu(null);
      window.setTimeout(() => window.location.assign("/painel/visitantes" + (focus?.event === "vinkulo:new-visitor" ? "?novo=1" : "")), 60);
      return;
    }
    if (nextView === "solicitacoes") {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("vinkulo:requests-opened")), 320);
    }
    if (nextView === "visual-editor") {
      setMobileMenu(null);
      window.dispatchEvent(new CustomEvent("vinkulo:open-visual-editor"));
      return;
    }
    // Ações contextuais podem focar uma seção depois que a área monta.
    if (focus) {
      window.setTimeout(() => {
        if (focus.event) {
          window.dispatchEvent(new CustomEvent(focus.event));
          return;
        }
        document
          .getElementById(focus.anchor as string)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 220);
    }
    setViewLoading(true);
    setView(nextView);
    rememberRecentView(nextView);
    const address = new URL(window.location.href);
    address.searchParams.set("view", nextView);
    if (new URL(window.location.href).searchParams.get("view") !== nextView) {
      address.hash = "";
      for (const key of ["anotacao", "celula", "aba", "ministry"]) address.searchParams.delete(key);
      window.history.pushState(
        { ...window.history.state, view: nextView },
        "",
        address,
      );
    }
    setMobileMenu(null);
    window.requestAnimationFrame(() =>
      document.querySelector(".pilot-workspace")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
    window.setTimeout(() => setViewLoading(false), 280);
  }

  function cancelMobileShortcutPress() {
    if (mobileShortcutPressTimer.current !== null) {
      window.clearTimeout(mobileShortcutPressTimer.current);
      mobileShortcutPressTimer.current = null;
    }
  }

  function openMobileShortcutEditor(slot: number) {
    cancelMobileShortcutPress();
    const current = mobileShortcutItems[slot];
    if (!current) return;
    mobileShortcutLongPress.current = true;
    setMobileShortcutSlot(slot);
    setMobileShortcutReplacement(current.id);
    setMobileMenu("shortcuts");
  }

  function beginMobileShortcutPress(slot: number) {
    cancelMobileShortcutPress();
    mobileShortcutLongPress.current = false;
    mobileShortcutPressTimer.current = window.setTimeout(
      () => openMobileShortcutEditor(slot),
      MOBILE_SHORTCUT_LONG_PRESS_MS,
    );
  }

  function openMobileShortcut(slot: number, item: (typeof MENU)[number]) {
    cancelMobileShortcutPress();
    if (mobileShortcutLongPress.current) {
      mobileShortcutLongPress.current = false;
      return;
    }
    if (allowedMenu.some((allowed) => allowed.id === item.id)) openView(item.id);
    else setMobileMenu("menu");
  }

  function applyMobileShortcutReplacement() {
    if (mobileShortcutSlot === null || !mobileShortcutReplacement) return;
    setMobileShortcuts((current) => {
      const next = [...current];
      const previous = next[mobileShortcutSlot];
      const duplicateSlot = next.indexOf(mobileShortcutReplacement);
      if (duplicateSlot >= 0 && duplicateSlot !== mobileShortcutSlot) next[duplicateSlot] = previous;
      next[mobileShortcutSlot] = mobileShortcutReplacement;
      return next;
    });
    setMobileMenu(null);
    setMobileShortcutSlot(null);
    setMobileShortcutReplacement(null);
  }

  function runQuickAction(action: (typeof quickActions)[number]) {
    setView(action.view);
    rememberRecentView(action.view);
    const address = new URL(window.location.href);
    address.searchParams.set("view", action.view);
    window.history.pushState(
      { ...window.history.state, view: action.view },
      "",
      address,
    );
    setMobileMenu(null);
    window.setTimeout(
      () => window.dispatchEvent(new CustomEvent(action.event)),
      80,
    );
  }

  async function switchCommunity(comunidadeId: number) {
    setSwitching(true);
    try {
      const response = await fetch("/api/pilot/comunidade-ativa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comunidadeId }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível trocar de comunidade.");
      window.location.assign("/painel?view=inicio");
      return;
    } catch (error) {
      window.alert((error as Error).message);
    }
    setSwitching(false);
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setInviteLoading(true);
    setInviteMessage("");
    setInviteLink("");
    const body = Object.fromEntries(new FormData(formElement).entries());
    try {
      const response = await fetch("/api/pilot/convites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string; inviteUrl?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível criar.");
      setInviteMessage("Convite de membro criado. Copie o link agora.");
      setInviteLink(result.inviteUrl || "");
      formElement.reset();
    } catch (error) {
      setInviteMessage((error as Error).message);
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <main
      ref={dashboardRef}
      className="pilot-dashboard"
      data-ui-version="v2"
      data-feed-design={visibleView === "inicio" ? "worship" : undefined}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      data-community-palette={communityTheme.paletteId.toLowerCase()}
      data-visual-editor-root
      data-editor-key="painel"
      style={{
        ...communityThemeStyle(communityTheme.paletteId),
        ...(communityTheme.wallpaperUrl
          ? {
              "--community-wallpaper-image": `url("${communityTheme.wallpaperUrl}")`,
            }
          : {}),
      } as CSSProperties}
    >
      <CloseDetailsOnOutside />
      {openingVisitors && <VinkuloLoading label="Abrindo Visitantes…" />}
      <header className="pilot-topbar" data-editor-key="cabecalho" data-smart-scroll-header>
        <button
          className="vinkulo-brand community-brand-trigger"
          data-editor-key="marca-comunidade"
          type="button"
          onClick={openCommunityInfo}
          aria-label={`Ver informações de ${active.comunidadeNome}`}
        >
          <span className="adote-mark community-brand-mark" aria-hidden="true">
            {communityTheme.logoUrl ? (
              <SafeImage fallbackName={active.comunidadeNome} loading="lazy" src={communityTheme.logoUrl} alt="" />
            ) : (
              <b>{getInitials(active.comunidadeNome)}</b>
            )}
          </span>
          <span>
            <strong>{active.comunidadeNome}</strong>
          </span>
        </button>
        <div className="pilot-account-cluster" data-editor-key="conta-notificacoes">
          <button
            type="button"
            className="pilot-command-search-trigger"
            onClick={() => setNavigationSearchOpen(true)}
            aria-label="Buscar uma área do Vínkulo"
          >
            <span aria-hidden="true">⌕</span>
            <span>{visibleView === "inicio" ? "Buscar uma área da comunidade…" : "Buscar"}</span>
            <kbd>⌘K</kbd>
          </button>
          <PilotNotificationCenter onUnreadChange={setUnreadNotifications} />
          {active.communityAccess !== "FEED_ONLY" && (
            <button
              type="button"
              className="pilot-message-shortcut"
              onClick={() => {
                if (window.matchMedia("(max-width: 760px)").matches) openView("mensagens");
                else setMessageCenterOpen((current) => !current);
              }}
              aria-label={
                unreadMessages
                  ? `Mensagens: ${unreadMessages} não lidas`
                  : "Abrir mensagens"
              }
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M20 15.25a3.75 3.75 0 0 1-3.75 3.75H8l-4.5 2 1.25-3.75A6 6 0 0 1 3 13V8.75A3.75 3.75 0 0 1 6.75 5h9.5A3.75 3.75 0 0 1 20 8.75v6.5Z" />
                <path d="M7.5 10h8.75M7.5 14h5.5" />
              </svg>
              {unreadMessages > 0 && <b key={messagePulse} className={messagePulse ? "is-arriving" : ""}>{Math.min(unreadMessages, 99)}</b>}
            </button>
          )}
          {active.isOwner && active.communityAccess === "OWNER" && (
            <span
              id="global-editor-toolbar-slot"
              className="global-editor-toolbar-slot"
              aria-label="Aparência"
            />
          )}
          <details className="pilot-user-menu">
            <summary
              className="pilot-user-trigger"
              aria-label={`Abrir perfil de ${userName}`}
            >
              <span>
                {userPhotoUrl ? (
                  <SafeImage fallbackName={userName} fallbackKind="avatar" loading="lazy" src={userPhotoUrl} alt="" />
                ) : (
                  userInitials
                )}
              </span>
              <div>
                <VerifiedOwnerName name={userName} verified={active.isOwner} />
                <small>{active.isOwner ? "Proprietário" : ROLE_LABELS[active.papel] || active.papel}</small>
              </div>
              <i aria-hidden="true">⌄</i>
            </summary>
            <div className="pilot-user-popover">
              <header className="pilot-user-popover-head-v3">
                <span>{userPhotoUrl ? <SafeImage fallbackName={userName} fallbackKind="avatar" loading="lazy" src={userPhotoUrl} alt="" /> : userInitials}</span>
                <div className="pilot-user-popover-identity"><VerifiedOwnerName name={userName} verified={active.isOwner} /><small>{userEmail}</small><em>{active.isOwner ? "Proprietário" : ROLE_LABELS[active.papel] || active.papel}</em></div>
              </header>
              <dl>
                <div><dt>Comunidade ativa</dt><dd>{active.comunidadeNome}</dd></div>
              </dl>
              {memberships.length > 1 && (
                <details className="pilot-user-community-switcher">
                  <summary>Trocar comunidade</summary>
                  <nav aria-label="Trocar comunidade pelo menu da conta">
                    {filteredMemberships.map((membership) => (
                      <button
                        key={membership.comunidadeId}
                        type="button"
                        className={membership.comunidadeId === active.comunidadeId ? "active" : ""}
                        disabled={switching || membership.comunidadeId === active.comunidadeId}
                        onClick={() => void switchCommunity(membership.comunidadeId)}
                      >
                        <span>{getInitials(membership.comunidadeNome)}</span>
                        <strong>{membership.comunidadeNome}</strong>
                      </button>
                    ))}
                  </nav>
                </details>
              )}
              <PersonalizationControls userEmail={userEmail} fontScale={fontScale} onDecrease={() => changeFontScale(-0.05)} onReset={() => setFontScale(1)} onIncrease={() => changeFontScale(0.05)} />
              <button type="button" onClick={() => openView("conta")}>Minha conta</button>
              {active.isOwner && <Link href="/proprietario" showLoading loadingLabel="Abrindo a Área do proprietário…">Área do proprietário</Link>}
              <Link href={`/comunidades/${active.comunidadeSlug}`} showLoading loadingLabel="Abrindo a página pública…">Página pública</Link>
              <a className="danger" href="/api/auth/logout">Sair da plataforma</a>
            </div>
          </details>
        </div>
      </header>
      {incomingMessage && (
        <IncomingMessageToast
          key={incomingMessage.key}
          message={incomingMessage}
          onDismiss={() => setIncomingMessage(null)}
          onOpen={(userId) => {
            setIncomingMessage(null);
            setChatTargetUserId(userId);
            if (window.matchMedia("(max-width: 760px)").matches) openView("mensagens");
            else setMessageCenterOpen(true);
          }}
        />
      )}
      {messageCenterOpen && (
        <div className="pilot-message-popover-backdrop" role="presentation" onMouseDown={() => setMessageCenterOpen(false)}>
          <section className="pilot-message-popover" role="dialog" aria-modal="false" aria-label="Conversas" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><p className="pilot-kicker">MENSAGENS</p><h2>Conversas</h2></div><button type="button" onClick={() => setMessageCenterOpen(false)} aria-label="Fechar mensagens">×</button></header>
            <PrivateChatWorkspace initialTargetUserId={chatTargetUserId} />
          </section>
        </div>
      )}
      {navigationSearchOpen && (
        <div className="pilot-command-search-backdrop" role="presentation" onMouseDown={() => setNavigationSearchOpen(false)}>
          <section className="pilot-command-search" role="dialog" aria-modal="true" aria-label="Buscar uma área" onMouseDown={(event) => event.stopPropagation()}>
            <label>
              <span aria-hidden="true">⌕</span>
              <input autoFocus type="search" aria-label="Buscar uma área da comunidade" value={navigationSearch} onChange={(event) => setNavigationSearch(event.target.value)} placeholder="Buscar pessoas, agenda, pedidos…" />
              <kbd>ESC</kbd>
            </label>
            <nav aria-label="Resultados da busca">
              {navigationSearchResults.map((item) => item && (
                <button key={item.key} type="button" onClick={() => { setNavigationSearchOpen(false); setNavigationSearch(""); openView(item.id); }}>
                  <span aria-hidden="true"><MenuIcon id={item.key as MenuIconId} /></span>
                  <strong>{item.label}</strong>
                </button>
              ))}
              {navigationSearchResults.length === 0 && <p>Nenhuma área disponível com esse nome.</p>}
            </nav>
          </section>
        </div>
      )}
      {switching && (
        <div className="pilot-community-switching-v3" role="status" aria-live="polite">
          <span className="pilot-loading-spinner" aria-hidden="true" />
          <div><strong>Entrando na comunidade</strong><small>Preparando informações, permissões e módulos…</small></div>
        </div>
      )}
      {active.temporaryAccess && (
        <TemporaryAccessWatcher
          resourceLabel={active.temporaryAccess.resource === "ESTACIONAMENTO" ? "Estacionamento" : "Escala em modo leitura"}
          endsAt={active.temporaryAccess.endsAt}
        />
      )}
      {communityInfoOpen && (
        <div
          className="community-info-backdrop"
          role="presentation"
          onMouseDown={() => setCommunityInfoOpen(false)}
        >
          <section
            className="community-info-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-info-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header
              className={communityTheme.bannerUrl ? "has-banner" : ""}
              style={
                communityTheme.bannerUrl
                  ? { backgroundImage: `url(${communityTheme.bannerUrl})` }
                  : undefined
              }
            >
              <button
                type="button"
                onClick={() => setCommunityInfoOpen(false)}
                aria-label="Fechar informações da comunidade"
              >
                ×
              </button>
            </header>
            <div className="community-info-identity">
              <span aria-hidden="true">
                {communityTheme.logoUrl ? (
                  <SafeImage fallbackName={active.comunidadeNome} loading="lazy" src={communityTheme.logoUrl} alt="" />
                ) : (
                  getInitials(active.comunidadeNome)
                )}
              </span>
              <div>
                <p className="pilot-kicker">COMUNIDADE ATIVA</p>
                <h2 id="community-info-title">
                  {communityProfile?.nome || active.comunidadeNome}
                </h2>
                <small>
                  {communityProfile?.cidade || "Localização não informada"}
                </small>
              </div>
            </div>
            {communityInfoLoading ? (
              <p className="community-info-status" role="status">
                Carregando informações…
              </p>
            ) : communityInfoError ? (
              <p className="community-info-status error" role="alert">
                {communityInfoError}
              </p>
            ) : (
              <>
                <p className="community-info-description">
                  {communityProfile?.descricao ||
                    "Esta comunidade ainda não adicionou uma apresentação pública."}
                </p>
                <dl>
                  <div>
                    <dt>Identidade visual</dt>
                    <dd>{communityPalette.name}</dd>
                  </div>
                  <div>
                    <dt>Privacidade</dt>
                    <dd>Publicações restritas à comunidade</dd>
                  </div>
                </dl>
              </>
            )}
            <footer>
              <Link href={`/comunidades/${active.comunidadeSlug}`} showLoading loadingLabel="Abrindo a página pública…">
                Ver página pública
              </Link>
              {canEditCommunity && (
                <button
                  type="button"
                  onClick={() => {
                    setCommunityInfoOpen(false);
                    openView("configuracoes");
                  }}
                >
                  Editar comunidade
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
      <div className="pilot-dashboard-layout">
        <aside className="pilot-sidebar" data-editor-key="menu-lateral">
          <div className="pilot-sidebar-controls">
            <button
              type="button"
              className="pilot-sidebar-toggle"
              aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
              aria-pressed={sidebarCollapsed}
              title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
              onClick={toggleSidebar}
            >
              <span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
              <strong>{sidebarCollapsed ? "Expandir" : "Recolher"}</strong>
            </button>
          </div>
          <div className="pilot-profile-card"><span>{userPhotoUrl ? <SafeImage fallbackName={userName} fallbackKind="avatar" loading="lazy" src={userPhotoUrl} alt="" /> : userInitials}</span><div><small><VerifiedOwnerName name={userName} verified={active.isOwner} /></small><strong>{active.communityAccess === "FEED_ONLY" ? "Proprietário · somente feed" : active.isOwner ? "Proprietário do sistema" : ROLE_LABELS[active.papel] || active.papel}</strong></div></div>
          <nav aria-label="Menu por perfil" data-editor-key="navegacao-principal">
            {sidebarGroups.map((group) => (
              <section className="pilot-sidebar-group" key={group.label} aria-label={group.label}>
                <h2>{group.label}</h2>
                {group.items.map((item) => item && (
                  <button
                    key={item.key}
                    data-editor-key={`menu-principal-${item.key}`}
                    className={visibleView === item.id ? "active" : ""}
                    aria-current={visibleView === item.id ? "page" : undefined}
                    onClick={() => openView(item.id, item.focus)}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <span className="pilot-sidebar-icon" aria-hidden="true"><MenuIcon id={item.key as MenuIconId} /></span>
                    <span className="pilot-sidebar-label">{item.label}</span>
                  </button>
                ))}
              </section>
            ))}
            <Link
              className="pilot-public-directory-link"
              href="/comunidades"
              aria-label="Explorar comunidades"
              title="Explorar comunidades"
            >
              <span className="pilot-sidebar-icon" aria-hidden="true">♧</span>
              <span className="pilot-sidebar-label">Explorar comunidades</span>
            </Link>
          </nav>
          {(systemOwner || active.papel === "SUPERADMIN") && (
            <EditorialSidebarSchedule onOpen={() => window.location.assign("/proprietario?tab=editorial")} />
          )}
          <div className="pilot-sidebar-note"><strong>{allowedMenu.length} áreas disponíveis</strong><p>As demais dependem das permissões do seu perfil.</p></div>
          {visibleView === "inicio" && <CommunityHighlight key={active.comunidadeId} communityId={active.comunidadeId} />}
        </aside>
        <section
          className={`pilot-workspace${CENTRAL_VIEWS.includes(visibleView) ? " central-surface" : ""}${viewLoading ? " is-view-loading" : ""}${
            visibleView === "inicio" && communityTheme.wallpaperUrl
              ? " has-community-wallpaper"
              : ""
          }`}
          data-editor-key="conteudo-principal"
          data-fullscreen-view={visibleView === "mensagens" ? "mensagens" : undefined}
        >
          {viewLoading && <div className="pilot-page-loading" role="status" aria-live="polite"><span className="pilot-loading-spinner" aria-hidden="true" />Carregando página…</div>}
          <WorkspaceErrorBoundary resetKey={`${active.comunidadeId}:${visibleView}`}>
          {accessDeniedView && (
            <section className="pilot-access-denied-inline" role="alert">
              <span aria-hidden="true">⊘</span>
              <div>
                <p className="pilot-kicker">ACESSO NEGADO</p>
                <h1>Esta aba não está autorizada.</h1>
                <p>O endereço foi validado, mas seu perfil e a comunidade ativa não possuem permissão para este recurso.</p>
                <button type="button" onClick={() => openView("inicio")}>Voltar para a Visão geral</button>
              </div>
            </section>
          )}
          {CENTRAL_VIEWS.includes(visibleView) && !accessDeniedView && <CentralNavigation
            communityName={active.comunidadeNome} roleLabel={ROLE_LABELS[active.papel] || active.papel}
            current={visibleView} allowed={[...allowedMenu.map(item => item.id), "conta"]}
            onNavigate={next => openView(next as View)} />}
          {["comunidade", "relatorios", "avisos"].includes(visibleView) && !accessDeniedView && <CommunityCentral
            key={`${active.comunidadeId}:${visibleView}`} communityId={active.comunidadeId}
            mode={visibleView === "relatorios" ? "reports" : visibleView === "avisos" ? "notices" : "overview"}
            onNotifications={() => window.dispatchEvent(new CustomEvent("vinkulo:open-notifications"))} />}
          {visibleView === "inicio" && !accessDeniedView && (
            <CommunityHome
              communityId={active.comunidadeId}
              key={active.comunidadeId}
              communityName={active.comunidadeNome}
              communitySlug={active.comunidadeSlug}
              permissions={active.permissions}
              initialFeed={feed}
              currentUserId={active.userId}
              userName={userName}
              userPhotoUrl={userPhotoUrl}
              eventsEnabled={allowedMenu.some((item) => item.id === "eventos")}
              onNavigate={(next, create) => openView(next === "escalas" ? "ministerios" : next, create ? { event: next === "eventos" ? "vinkulo:new-event" : next === "escalas" ? "vinkulo:new-schedule" : "vinkulo:new-request" } : undefined)}
              readOnlyFeed={active.communityAccess === "FEED_ONLY"}
            />
          )}
          {visibleView === "fio" && !accessDeniedView && (
            <DayThreadWorkspace permissions={active.permissions} />
          )}
          {visibleView === "visitantes" && <a href="/painel/visitantes">Abrir Visitantes →</a>}
          {visibleView === "eventos" && (
            <EventsWorkspace
              permissions={active.permissions}
              communityName={active.comunidadeNome}
              communitySlug={active.comunidadeSlug}
            />
          )}
          {visibleView === "ministerios" && (
            <SecretaryMinisterialWorkspace
              permissions={active.permissions}
              communityName={active.comunidadeNome}
            />
          )}
          {visibleView === "solicitacoes" && (
            <RequestsWorkspace key={active.comunidadeId} communityId={active.comunidadeId} communityName={active.comunidadeNome} />
          )}
          {visibleView === "mensagens" && <PrivateChatWorkspace initialTargetUserId={chatTargetUserId} />}
          {visibleView === "celulas" && (
            <CellsWorkspace
              permissions={active.permissions}
              communityName={active.comunidadeNome}
              memberMode={active.papel === "MEMBRO"}
            />
          )}
          {visibleView === "estacionamento" && (
            <ParkingWorkspace key={active.comunidadeId} communityName={active.comunidadeNome} memberMode={!active.permissions.includes("parking.view")} />
          )}
          {visibleView === "redes" && features.networkModuleEnabled && (
            <NetworkWorkspace />
          )}
          {visibleView === "membro" && <>
            <CommunityCentral key={`member:${active.comunidadeId}`} communityId={active.comunidadeId} mode="member" />
            <details className="central-disclosure"><summary>Meus dados e vínculos</summary><p>Consulte seus vínculos e mantenha seus contatos atualizados.</p>
              <PeopleWorkspace communityName={active.comunidadeNome} mode="self"
                selfLinks={allowedMenu.filter(item => ["eventos", "ministerios", "celulas"].includes(item.id)).map(item => ({ label: item.label, href: `/painel?view=${item.id}` }))} />
            </details>
            <a className="member-account-action" href="/painel?view=conta"><span aria-hidden="true">⚙</span><span><strong>Meu perfil e conta</strong><small>Foto, dados pessoais e privacidade</small></span><b aria-hidden="true">→</b></a>
          </>}
          {visibleView === "lider" && <>
            <CommunityCentral key={`leadership:${active.comunidadeId}`} communityId={active.comunidadeId} mode="leadership" />
            <details className="central-disclosure"><summary>Equipe, funções e acesso pastoral</summary><p>Consulte os responsáveis, o histórico e as opções de gestão disponíveis para você.</p>
              <LeadershipWorkspace mode={active.permissions.includes("pastoral.panel.view") ? "pastoral" : "leader"} communityName={active.comunidadeNome} />
            </details>
          </>}
          {visibleView === "pessoas" && (
            <PeopleWorkspace communityName={active.comunidadeNome} />
          )}
          {visibleView === "conta" && <AccountProfileWorkspace />}
          {visibleView === "configuracoes" && (
            <section className="community-central-workspace settings-redesign">
              <header className="settings-heading"><div><h1>Configurações</h1><p>Escolha um assunto. As alterações valem para {active.comunidadeNome}.</p></div><a href="/painel?view=conta">Meu perfil e conta →</a></header>
              <CommunityAdminWorkspace
                deviceSlot={<OfflineModeEntry />}
                contentSlot={active.permissions.includes("community.theme.manage") ? <CommunityHighlight key={`highlight:${active.comunidadeId}`} communityId={active.comunidadeId} editor /> : null}
                hideManagementHub
                accessSlot={
                  active.permissions.includes("invites.manage") ? (
                    <>
                      <form className="pilot-form invite-generator" onSubmit={createInvite}>
                        <label>E-mail da pessoa<input name="email" type="email" required autoComplete="off" /></label>
                        <label>Perfil<select name="papel" defaultValue="MEMBRO"><option value="MEMBRO">Membro</option>{(active.isCommunityOwner || active.isOwner) && <><option value="LIDER">Líder</option><option value="ADMIN_COMUNIDADE">Administrador da comunidade</option></>}</select></label>
                        <label>Validade (horas)<input name="horas" type="number" min={1} max={168} defaultValue={48} required /></label>
                        <button disabled={inviteLoading}>{inviteLoading ? "Criando…" : "Criar convite"}</button>
                      </form>
                      {inviteMessage && <p className="pilot-form-message" role="status">{inviteMessage}</p>}
                      {inviteLink && <div className="invite-result"><label>Link individual<input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /></label><button onClick={() => navigator.clipboard.writeText(inviteLink)}>Copiar link</button></div>}
                      <InviteRevocationList refreshKey={inviteLink} />
                    </>
                  ) : null
                }
                managementItems={communityManagementItems}
                onOpenManagementView={(nextView) => openView(nextView)}
                canManageCommunity={active.permissions.includes(
                  "community.theme.manage",
                )}
                canManageRequests={active.permissions.includes(
                  "membership.requests.manage",
                )}
                canConfigureParking={active.permissions.includes(
                  "parking.configure",
                )}
                canManageRegistrationLinks={active.isCommunityOwner}
              />
            </section>
          )}
          {visibleView === "continuidade" && (
            <CommunityLifecycleWorkspace
              key={active.comunidadeId}
              currentCommunityId={active.comunidadeId}
            />
          )}
          </WorkspaceErrorBoundary>
        </section>
      </div>
      <nav className="pilot-mobile-nav" data-editor-key="barra-movel" aria-label="Navegação móvel do painel">
        {mobileShortcutItems.slice(0, 2).map((item, slot) => (
          <button
            type="button"
            key={`${slot}:${item.id}`}
            className={visibleView === item.id && !mobileMenu ? "active" : ""}
            onClick={() => openMobileShortcut(slot, item)}
            onPointerDown={() => beginMobileShortcutPress(slot)}
            onPointerUp={cancelMobileShortcutPress}
            onPointerCancel={cancelMobileShortcutPress}
            onPointerLeave={cancelMobileShortcutPress}
            onContextMenu={(event) => { event.preventDefault(); openMobileShortcutEditor(slot); }}
            aria-label={`${item.label}. Toque para abrir; pressione e segure para trocar.`}
            title="Toque para abrir · segure para trocar"
          >
            <span className="pilot-mobile-nav-icon" aria-hidden="true"><MenuIcon id={item.id} /></span>
            <small className="pilot-mobile-label">{item.id === "estacionamento" ? "Vagas" : item.label}</small>
            {item.id === "eventos" && agendaAlerts > 0 && <b className="pilot-mobile-badge">{Math.min(agendaAlerts, 99)}</b>}
            {item.id === "solicitacoes" && unreadNotifications.pedidos > 0 && <b className="pilot-mobile-badge">{Math.min(unreadNotifications.pedidos, 99)}</b>}
          </button>
        ))}
        <button
          className={`pilot-mobile-create-button ${mobileMenu === "actions" ? "active" : ""}`}
          type="button"
          onClick={() => {
            if (mobileMenu !== "actions") setQuickActionSearch("");
            setMobileMenu((current) => current === "actions" ? null : "actions");
          }}
          aria-expanded={mobileMenu === "actions"}
          aria-controls="pilot-mobile-sheet"
          aria-label="Adicionar ou cadastrar"
          disabled={quickActions.length === 0}
        >
          <span className="pilot-mobile-create-icon" aria-hidden="true">+</span>
          <small className="pilot-mobile-label">Adicionar</small>
        </button>
        {mobileShortcutItems.slice(2, 3).map((item, relativeSlot) => {
          const slot = relativeSlot + 2;
          return (
            <button
              type="button"
              key={`${slot}:${item.id}`}
              className={visibleView === item.id && !mobileMenu ? "active" : ""}
              onClick={() => openMobileShortcut(slot, item)}
              onPointerDown={() => beginMobileShortcutPress(slot)}
              onPointerUp={cancelMobileShortcutPress}
              onPointerCancel={cancelMobileShortcutPress}
              onPointerLeave={cancelMobileShortcutPress}
              onContextMenu={(event) => { event.preventDefault(); openMobileShortcutEditor(slot); }}
              aria-label={`${item.label}. Toque para abrir; pressione e segure para trocar.`}
              title="Toque para abrir · segure para trocar"
            >
              <span className="pilot-mobile-nav-icon" aria-hidden="true"><MenuIcon id={item.id} /></span>
              <small className="pilot-mobile-label">{item.id === "estacionamento" ? "Vagas" : item.label}</small>
              {item.id === "eventos" && agendaAlerts > 0 && <b className="pilot-mobile-badge">{Math.min(agendaAlerts, 99)}</b>}
              {item.id === "solicitacoes" && unreadNotifications.pedidos > 0 && <b className="pilot-mobile-badge">{Math.min(unreadNotifications.pedidos, 99)}</b>}
            </button>
          );
        })}
        <button
          className={mobileMenu === "menu" ? "active" : ""}
          type="button"
          onClick={() =>
            setMobileMenu((current) => current === "menu" ? null : "menu")
          }
          aria-expanded={mobileMenu === "menu"}
          aria-controls="pilot-mobile-sheet"
          aria-label="Abrir menu geral"
        >
          <span className="pilot-mobile-list-icon" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <small className="pilot-mobile-label">Menu</small>
          {menuAlerts > 0 && <b className="pilot-mobile-badge">{Math.min(menuAlerts, 99)}</b>}
        </button>
      </nav>
      {mobileMenu && (
        <div className="pilot-mobile-overlay" role="presentation" onMouseDown={() => setMobileMenu(null)}>
          <section
            id="pilot-mobile-sheet"
            className={`pilot-mobile-sheet${mobileMenu === "menu" ? " pilot-navigation-drawer" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              mobileMenu === "menu"
                ? "Menu geral"
                : mobileMenu === "actions"
                  ? "Ações rápidas"
                  : mobileMenu === "shortcuts"
                    ? "Personalizar atalhos"
                  : "Perfil do usuário"
            }
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="pilot-kicker">
                  {mobileMenu === "menu"
                    ? "NAVEGAÇÃO"
                    : mobileMenu === "actions"
                      ? "ATALHOS CONTEXTUAIS"
                      : mobileMenu === "shortcuts"
                        ? "PERSONALIZAÇÃO"
                      : "CONTA ATIVA"}
                </p>
                <h2>
                  {mobileMenu === "menu"
                    ? "Menu geral"
                    : mobileMenu === "actions"
                      ? "O que deseja adicionar?"
                      : mobileMenu === "shortcuts"
                        ? "Substituir atalho"
                      : userName}
                </h2>
              </div>
              <div className="pilot-mobile-sheet-actions">
                {mobileMenu === "menu" && (
                  <button
                    type="button"
                    className="pilot-mobile-profile-shortcut"
                    onClick={() => setMobileMenu("perfil")}
                    aria-label="Abrir perfil e configurações"
                    title="Perfil e configurações"
                  >
                    {userPhotoUrl ? (
                      <SafeImage fallbackName={userName} fallbackKind="avatar" loading="lazy" src={userPhotoUrl} alt="" />
                    ) : userInitials}
                  </button>
                )}
                {mobileMenu !== "menu" && (
                  <button type="button" className="pilot-mobile-sheet-back" onClick={() => setMobileMenu("menu")} aria-label="Voltar ao menu">‹</button>
                )}
                <button type="button" className="pilot-mobile-sheet-close" onClick={() => setMobileMenu(null)} aria-label="Fechar menu">×</button>
              </div>
            </header>
            {mobileMenu === "menu" ? (
              <div className="pilot-mobile-menu-content">
                <div className="pilot-mobile-task-summary" aria-label="Pendências e mensagens">
                  {active.communityAccess !== "FEED_ONLY" && (
                    <button type="button" onClick={() => openView("mensagens")}>
                      <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 15.25A3.75 3.75 0 0 1 16.25 19H8l-4.5 2 1.25-3.75A6 6 0 0 1 3 13V8.75A3.75 3.75 0 0 1 6.75 5h9.5A3.75 3.75 0 0 1 20 8.75v6.5Z"/><path d="M7.5 10h8.75M7.5 14h5.5"/></svg></span>
                      <strong>Mensagens</strong>
                      <b>{Math.min(unreadMessages, 99)}</b>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenu(null);
                      window.dispatchEvent(new CustomEvent("vinkulo:open-notifications"));
                    }}
                  >
                    <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span>
                    <strong>Atualizações</strong>
                    <b>{Math.min(unreadNotifications.total, 99)}</b>
                  </button>
                  <button
                    type="button"
                    className="pilot-mobile-device-notifications"
                    onClick={() => {
                      setMobileMenu(null);
                      window.dispatchEvent(new CustomEvent("vinkulo:open-notifications"));
                    }}
                  >
                    <span aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5h4M10 18.5h4M18 8a4 4 0 0 1 3 3.8"/></svg></span>
                    <strong>Avisos neste aparelho</strong>
                    <b>Configurar</b>
                  </button>
                </div>
                <div className="pilot-mobile-menu-grid">
                  {primaryMenu.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      data-editor-key={`menu-movel-${item.id}`}
                      className={
                        visibleView === item.id ||
                        (item.id === "comunidade" &&
                          COMMUNITY_MANAGEMENT_VIEWS.includes(
                            visibleView as CommunityManagementView,
                          ))
                          ? "active"
                          : ""
                      }
                      onClick={() => openView(item.id)}
                    >
                      <span aria-hidden="true"><MenuIcon id={item.id} /></span>
                      <strong>{item.label}</strong>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={visibleView === "conta" ? "active" : ""}
                    data-editor-key="menu-movel-google-drive"
                    onClick={() => openView("conta")}
                  >
                    <span aria-hidden="true"><MenuIcon id="drive" /></span>
                    <strong>Google Drive</strong>
                  </button>
                </div>
              </div>
            ) : mobileMenu === "actions" ? (
              <div className="pilot-mobile-actions-content">
                <label className="pilot-mobile-action-search">
                  <span aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <circle cx="10.8" cy="10.8" r="6.8" />
                      <path d="m16 16 4.2 4.2" />
                    </svg>
                  </span>
                  <input
                    type="search"
                    value={quickActionSearch}
                    onChange={(event) => setQuickActionSearch(event.target.value)}
                    placeholder="Buscar ação..."
                    aria-label="Buscar ação"
                  />
                </label>
                {visibleQuickActions.length > 0 ? (
                  <div className="pilot-mobile-action-grid">
                    {visibleQuickActions.map((action) => {
                      const chips = action.label === "Novo visitante"
                        ? ["Visitantes", "Cadastro"]
                        : action.label === "Gestão"
                          ? ["Estacionamento", "Operação"]
                          : action.label === "Novo evento"
                            ? ["Agenda", "Comunidade"]
                            : action.label === "Nova escala"
                              ? ["Ministérios", "Escala"]
                              : action.label === "Nova publicação"
                                ? ["Feed", "Comunidade"]
                                : ["Pedidos", "Privacidade"];
                      return (
                        <button
                          type="button"
                          key={action.label}
                          onClick={() => runQuickAction(action)}
                        >
                          <div className="pilot-mobile-action-copy">
                            <strong>{action.label}</strong>
                            <small>{action.description}</small>
                            <span className="pilot-mobile-action-chips" aria-label={`Categorias: ${chips.join(", ")}`}>
                              {chips.map((chip) => <i key={chip}>{chip}</i>)}
                            </span>
                          </div>
                          <span className="pilot-mobile-action-illustration" aria-hidden="true"><MenuIcon id={action.icon} /></span>
                          <span className="pilot-mobile-action-next" aria-hidden="true">→</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="pilot-mobile-action-empty" role="status">Nenhuma ação encontrada.</p>
                )}
                <footer className="pilot-mobile-action-footer">
                  <span>
                    <strong>Precisa de outra opção?</strong>
                    <small>Encontre tudo no menu geral.</small>
                  </span>
                  <button type="button" onClick={() => setMobileMenu("menu")}>Ver menu geral <span aria-hidden="true">→</span></button>
                </footer>
              </div>
            ) : mobileMenu === "shortcuts" && mobileShortcutSlot !== null ? (
              <div className="pilot-mobile-shortcut-customizer">
                <p>Escolha uma aba do menu para colocar no lugar de <strong>{mobileShortcutItems[mobileShortcutSlot]?.label}</strong>.</p>
                <div className="pilot-mobile-shortcut-current" aria-label="Atalho atual">
                  <span aria-hidden="true"><MenuIcon id={mobileShortcutItems[mobileShortcutSlot]?.id || "inicio"} /></span>
                  <div><small>Atalho atual</small><strong>{mobileShortcutItems[mobileShortcutSlot]?.label}</strong></div>
                  <b aria-hidden="true">→</b>
                  <div><small>Novo atalho</small><strong>{MENU.find((item) => item.id === mobileShortcutReplacement)?.label || "Escolha abaixo"}</strong></div>
                </div>
                <div className="pilot-mobile-shortcut-options" role="listbox" aria-label="Abas disponíveis">
                  {primaryMenu.map((item) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={mobileShortcutReplacement === item.id}
                      className={mobileShortcutReplacement === item.id ? "selected" : ""}
                      key={item.id}
                      onClick={() => setMobileShortcutReplacement(item.id)}
                    >
                      <span aria-hidden="true"><MenuIcon id={item.id} /></span>
                      <strong>{item.label}</strong>
                    </button>
                  ))}
                </div>
                <div className="pilot-mobile-shortcut-actions">
                  <button
                    type="button"
                    onClick={applyMobileShortcutReplacement}
                    disabled={!mobileShortcutReplacement || mobileShortcutReplacement === mobileShortcutItems[mobileShortcutSlot]?.id}
                  >
                    {mobileShortcutReplacement && mobileShortcutReplacement !== mobileShortcutItems[mobileShortcutSlot]?.id
                      ? `Trocar por ${MENU.find((item) => item.id === mobileShortcutReplacement)?.label}`
                      : "Escolha um novo atalho"}
                  </button>
                  <button type="button" className="secondary" onClick={() => setMobileMenu(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="pilot-mobile-profile">
                <div className="pilot-mobile-profile-card">
                  <span>{userPhotoUrl ? <SafeImage fallbackName={userName} fallbackKind="avatar" loading="lazy" src={userPhotoUrl} alt="" /> : userInitials}</span>
                  <div>
                    <VerifiedOwnerName name={userName} verified={active.isOwner} />
                    <small>{userEmail}</small>
                    <em>{active.communityAccess === "FEED_ONLY" ? "Proprietário · somente feed" : active.isOwner ? "Proprietário do sistema" : ROLE_LABELS[active.papel] || active.papel}</em>
                  </div>
                </div>
                <dl>
                  <div><dt>Comunidade ativa</dt><dd>{active.comunidadeNome}</dd></div>
                </dl>
                <button
                  type="button"
                  className="pilot-profile-settings"
                  onClick={() => openView("conta")}
                >
                  Perfil e configurações
                </button>
                <details className="pilot-profile-community-switcher">
                  <summary>Trocar comunidade</summary>
                  <input
                    type="search"
                    value={communitySearch}
                    onChange={(event) => setCommunitySearch(event.target.value)}
                    placeholder="Pesquisar comunidade"
                    aria-label="Pesquisar comunidade vinculada"
                  />
                  <div>
                    {filteredMemberships.map((membership) => (
                      <button
                        key={membership.comunidadeId}
                        type="button"
                        className={
                          membership.comunidadeId === active.comunidadeId
                            ? "active"
                            : ""
                        }
                        disabled={
                          switching ||
                          membership.comunidadeId === active.comunidadeId
                        }
                        onClick={() => switchCommunity(membership.comunidadeId)}
                      >
                        <span>{getInitials(membership.comunidadeNome)}</span>
                        <strong>{membership.comunidadeNome}</strong>
                        <small>
                          {membership.comunidadeId === active.comunidadeId
                            ? "Ativa"
                            : "Trocar"}
                        </small>
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => openView("ministerios")}>
                    Abrir seletor de ministérios
                  </button>
                </details>
                <PersonalizationControls userEmail={userEmail} fontScale={fontScale} onDecrease={() => changeFontScale(-0.05)} onReset={() => setFontScale(1)} onIncrease={() => changeFontScale(0.05)} />
                <Link href={`/comunidades/${active.comunidadeSlug}`} showLoading loadingLabel="Abrindo a página pública…">Ver página pública</Link>
                <a className="pilot-mobile-logout" href="/api/auth/logout">Sair da plataforma</a>
              </div>
            )}
          </section>
        </div>
      )}
      {active.isOwner && active.communityAccess === "OWNER" && (
        <GlobalVisualEditor
          canEdit
          communityName={active.comunidadeNome}
          screenId={`panel:${visibleView}`}
        />
      )}
    </main>
  );
}

function rememberRecentView(view: View) {
  try {
    const saved = JSON.parse(window.localStorage.getItem("vinkulo:recent-views") || "[]") as unknown;
    const current = Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string" && item !== view) : [];
    window.localStorage.setItem("vinkulo:recent-views", JSON.stringify([view, ...current].slice(0, 5)));
  } catch {
    // A navegação não depende do armazenamento local.
  }
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "US";
}

type MenuIconId = View | "mural" | "escalas" | "drive";

function MenuIcon({ id }: { id: MenuIconId }) {
  const paths: Partial<Record<MenuIconId, string>> = {
    inicio: "M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5v-8Z",
    fio: "M6 5h.01M6 12h.01M6 19h.01M11 5h9M11 12h9M11 19h6",
    eventos: "M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 6h14M8 2v4m8-4v4",
    ministerios: "M12 3v18m-7-9h14M7 7h10v10H7z",
    escalas: "M7 4h10v3H7V4Zm-2 2h14v15H5V6Zm3 6 2 2 4-4m-6 7h7",
    solicitacoes: "M12 21s-8-4.4-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.6-8 11-8 11Z",
    visitantes: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m9-2v6m3-3h-6",
    celulas: "M12 3 4 7v10l8 4 8-4V7l-8-4Zm0 0v18M4 7l8 4 8-4",
    estacionamento: "M7 21V3h6a5 5 0 0 1 0 10H7m0-4h6a1 1 0 0 0 0-2H7",
    membro: "M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
    lider: "M12 3 3 8l3 13h12l3-13-9-5Zm0 0v18",
    pessoas: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8 1a4 4 0 0 1 4 4v2m-4-18a4 4 0 0 1 0 8",
    mural: "M4 5h16v14H4V5Zm3 3h4v4H7V8Zm7 0h3m-3 3h3M7 15h10",
    comunidade: "M4 7h10m4 0h2M14 5v4M4 17h2m4 0h10M8 15v4M4 12h4m4 0h8M10 10v4",
    continuidade: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
    redes: "M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 22v-2a7 7 0 0 1 14 0v2",
    drive: "M7.5 18.5h10.2a4.3 4.3 0 0 0 .5-8.6A6.5 6.5 0 0 0 5.8 8.2 4.8 4.8 0 0 0 7.5 18.5Z",
    "visual-editor": "m4 20 4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L4 20Zm9-13 4 4",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[id] || "M5 5h14v14H5z"} />
    </svg>
  );
}
