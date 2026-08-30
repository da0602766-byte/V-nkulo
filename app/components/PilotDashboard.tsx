"use client";

import Link from "./StableLink";
import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import type { PilotFeatureState } from "../lib/pilot-data";
import type { TenantContext, TenantMembership } from "../lib/tenant";
import {
  getCommunityPalette,
  type CommunityTheme,
} from "../lib/community-theme";
import CommunityAdminWorkspace, {
  type CommunityManagementView,
} from "./CommunityAdminWorkspace";
import CommunityLifecycleWorkspace from "./CommunityLifecycleWorkspace";
import CommunityHome from "./CommunityHome";
import AccountProfileWorkspace from "./AccountProfileWorkspace";
import EventsWorkspace from "./EventsWorkspace";
import GlobalVisualEditor from "./GlobalVisualEditor";
import SecretaryMinisterialWorkspace from "./SecretaryMinisterialWorkspace";
import NetworkWorkspace from "./NetworkWorkspace";
import ParkingWorkspace from "./ParkingWorkspace";
import PeopleWorkspace from "./PeopleWorkspace";
import PilotNotificationCenter from "./PilotNotificationCenter";
import PrivateChatWorkspace from "./PrivateChatWorkspace";
import RequestsWorkspace from "./RequestsWorkspace";
import ThemeControl from "./ThemeControl";
import { CellsWorkspace, VisitorsWorkspace } from "./TenantOperations";
import LeadershipWorkspace from "./LeadershipWorkspace";
import WorkspaceErrorBoundary from "./WorkspaceErrorBoundary";
import VerifiedOwnerName from "./VerifiedOwnerName";
import TemporaryAccessWatcher from "./TemporaryAccessWatcher";
import CloseDetailsOnOutside from "./CloseDetailsOnOutside";
import EditorialSidebarSchedule from "./EditorialSidebarSchedule";

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
  | "eventos"
  | "ministerios"
  | "visitantes"
  | "celulas"
  | "estacionamento"
  | "diaconia"
  | "redes"
  | "membro"
  | "lider"
  | "pastoral"
  | "comunidade"
  | "continuidade"
  | "visual-editor"
  | "pessoas"
  | "solicitacoes"
  | "mensagens"
  | "conta";
type NavigationFocus = { anchor?: string; event?: string };
const MENU: { id: View; label: string; permission: string }[] = [
  { id: "inicio", label: "Início", permission: "dashboard.view" },
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
  { id: "comunidade", label: "Configurações", permission: "dashboard.view" },
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
  continuidade: "Sucessão e continuidade da comunidade.",
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
  const [mobileMenu, setMobileMenu] = useState<
    "menu" | "perfil" | "actions" | null
  >(null);
  const [communitySearch, setCommunitySearch] = useState("");
  const [navigationSearch, setNavigationSearch] = useState("");
  const [navigationSearchOpen, setNavigationSearchOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [fontScaleHydrated, setFontScaleHydrated] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [communityInfoOpen, setCommunityInfoOpen] = useState(false);
  const [communityProfile, setCommunityProfile] =
    useState<CommunityProfile | null>(null);
  const [communityInfoLoading, setCommunityInfoLoading] = useState(false);
  const [communityInfoError, setCommunityInfoError] = useState("");
  const [canEditCommunity, setCanEditCommunity] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

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
    try {
      window.localStorage.setItem(
        `vinkulo:font-scale:${userEmail.trim().toLowerCase()}`,
        String(fontScale),
      );
      window.localStorage.setItem("vinkulo:font-scale", String(fontScale));
    } catch {
      // A preferência continua ativa na sessão atual.
    }
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
          !COMMUNITY_MANAGEMENT_VIEWS.includes(
            item.id as CommunityManagementView,
          ),
      ),
    [allowedMenu],
  );
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
          makeItem("inicio", "Início"),
          makeItem("inicio", "Mural", "mural", { anchor: "mural" }),
          makeItem("eventos", "Agenda"),
        ].filter(Boolean),
      },
      {
        label: "Comunidade",
        items: [
          makeItem("pessoas", "Pessoas"),
          makeItem("ministerios", "Ministérios"),
          makeItem("ministerios", "Escalas", "escalas", {
            event: "vinkulo:open-schedules",
          }),
          makeItem("visitantes", "Visitantes"),
          makeItem("solicitacoes", "Pedidos"),
          makeItem("estacionamento", "Estacionamento"),
          makeItem("celulas"),
          makeItem("redes"),
          makeItem("diaconia"),
        ].filter(Boolean),
      },
      {
        label: "Gestão",
        items: [makeItem("comunidade", "Configurações")].filter(Boolean),
      },
    ];
  }, [allowedMenu]);
  const navigationSearchResults = useMemo(() => {
    const term = navigationSearch.trim().toLocaleLowerCase("pt-BR");
    return sidebarGroups
      .flatMap((group) => group.items)
      .filter((item) => !term || item!.label.toLocaleLowerCase("pt-BR").includes(term))
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
  const eventViewAvailable = allowedMenu.some((item) => item.id === "eventos");
  const quickActions = useMemo(
    () =>
      active.communityAccess === "FEED_ONLY"
        ? []
        : [
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
          conversations?: { nao_lidas?: number }[];
        };
        if (!cancelled) {
          setUnreadMessages(
            (payload.conversations || []).reduce(
              (total, conversation) => total + Number(conversation.nao_lidas || 0),
              0,
            ),
          );
        }
      } catch {
        // O atalho continua funcional mesmo quando a contagem não responde.
      }
    };
    void syncUnread();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncUnread();
    }, 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void syncUnread();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [active.communityAccess, active.comunidadeId, view]);

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
    if (nextView === "visual-editor") {
      setMobileMenu(null);
      window.dispatchEvent(new CustomEvent("vinkulo:open-visual-editor"));
      return;
    }
    // "Mural" e "Escalas" apontam para a mesma view que "Início" e
    // "Ministérios". Sem um destino próprio os quatro itens levavam ao mesmo
    // lugar, e dois deles mentiam sobre onde iam parar. O foco resolve isso
    // sem duplicar view: leva à seção certa depois que a tela monta.
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
    const address = new URL(window.location.href);
    address.searchParams.set("view", nextView);
    if (new URL(window.location.href).searchParams.get("view") !== nextView) {
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

  function runQuickAction(action: (typeof quickActions)[number]) {
    setView(action.view);
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
        body: JSON.stringify({ ...body, papel: "MEMBRO" }),
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
      className="pilot-dashboard"
      data-ui-version="v2"
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      data-community-palette={communityTheme.paletteId.toLowerCase()}
      data-visual-editor-root
      data-editor-key="painel"
      style={{
        "--community-light-bg": communityPalette.light.background,
        "--community-light-surface": communityPalette.light.surface,
        "--community-light-surface-2": communityPalette.light.surface2,
        "--community-light-text": communityPalette.light.text,
        "--community-light-muted": communityPalette.light.muted,
        "--community-light-line": communityPalette.light.line,
        "--community-light-primary": communityPalette.light.primary,
        "--community-light-secondary": communityPalette.light.secondary,
        "--community-light-accent": communityPalette.light.accent,
        "--community-light-shadow": communityPalette.light.shadow,
        "--community-dark-bg": communityPalette.dark.background,
        "--community-dark-surface": communityPalette.dark.surface,
        "--community-dark-surface-2": communityPalette.dark.surface2,
        "--community-dark-text": communityPalette.dark.text,
        "--community-dark-muted": communityPalette.dark.muted,
        "--community-dark-line": communityPalette.dark.line,
        "--community-dark-primary": communityPalette.dark.primary,
        "--community-dark-secondary": communityPalette.dark.secondary,
        "--community-dark-accent": communityPalette.dark.accent,
        "--community-dark-shadow": communityPalette.dark.shadow,
        ...(communityTheme.wallpaperUrl
          ? {
              "--community-wallpaper-image": `url("${communityTheme.wallpaperUrl}")`,
            }
          : {}),
      } as CSSProperties}
    >
      <CloseDetailsOnOutside />
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
              <img src={communityTheme.logoUrl} alt="" />
            ) : (
              <b>{getInitials(active.comunidadeNome)}</b>
            )}
          </span>
          <span>
            <strong>{active.comunidadeNome}</strong>
            <small>Informações da comunidade</small>
          </span>
        </button>
        <div className="pilot-account-cluster" data-editor-key="conta-notificacoes">
          <details className="pilot-desktop-community-switcher">
            <summary title="Trocar comunidade" aria-label="Trocar comunidade">
              <span>{getInitials(active.comunidadeNome)}</span>
              <strong>{active.comunidadeNome}</strong>
              <i>⌄</i>
            </summary>
            <div>
              <label>
                <span className="sr-only">Pesquisar comunidade</span>
                <input
                  type="search"
                  value={communitySearch}
                  onChange={(event) => setCommunitySearch(event.target.value)}
                  placeholder="Pesquisar comunidade"
                />
              </label>
              <nav aria-label="Comunidades vinculadas">
                {filteredMemberships.map((membership) => (
                  <button
                    key={membership.comunidadeId}
                    type="button"
                    className={membership.comunidadeId === active.comunidadeId ? "active" : ""}
                    disabled={switching || membership.comunidadeId === active.comunidadeId}
                    onClick={() => void switchCommunity(membership.comunidadeId)}
                  >
                    <span>{getInitials(membership.comunidadeNome)}</span>
                    <div><strong>{membership.comunidadeNome}</strong><small>{membership.comunidadeId === active.comunidadeId ? "Ativa agora" : "Trocar contexto"}</small></div>
                  </button>
                ))}
              </nav>
            </div>
          </details>
          <button
            type="button"
            className="pilot-command-search-trigger"
            onClick={() => setNavigationSearchOpen(true)}
            aria-label="Buscar uma área do Vínkulo"
          >
            <span aria-hidden="true">⌕</span>
            <span>Buscar</span>
            <kbd>⌘K</kbd>
          </button>
          <PilotNotificationCenter />
          {active.communityAccess !== "FEED_ONLY" && (
            <button
              type="button"
              className="pilot-message-shortcut"
              onClick={() => openView("mensagens")}
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
              {unreadMessages > 0 && <b>{Math.min(unreadMessages, 99)}</b>}
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
                  <img src={userPhotoUrl} alt="" />
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
                <span>{userPhotoUrl ? <img src={userPhotoUrl} alt="" /> : userInitials}</span>
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
              {active.isOwner && <Link href="/proprietario">Área do proprietário</Link>}
              <Link href={`/comunidades/${active.comunidadeSlug}`}>Página pública</Link>
              <a className="danger" href="/api/auth/logout">Sair da plataforma</a>
            </div>
          </details>
        </div>
      </header>
      {navigationSearchOpen && (
        <div className="pilot-command-search-backdrop" role="presentation" onMouseDown={() => setNavigationSearchOpen(false)}>
          <section className="pilot-command-search" role="dialog" aria-modal="true" aria-label="Buscar uma área" onMouseDown={(event) => event.stopPropagation()}>
            <label>
              <span aria-hidden="true">⌕</span>
              <input autoFocus type="search" value={navigationSearch} onChange={(event) => setNavigationSearch(event.target.value)} placeholder="Buscar pessoas, agenda, pedidos…" />
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
                  <img src={communityTheme.logoUrl} alt="" />
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
              <Link href={`/comunidades/${active.comunidadeSlug}`}>
                Ver página pública
              </Link>
              {canEditCommunity && (
                <button
                  type="button"
                  onClick={() => {
                    setCommunityInfoOpen(false);
                    openView("comunidade");
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
          <div className="pilot-profile-card"><span>{userPhotoUrl ? <img src={userPhotoUrl} alt="" /> : userInitials}</span><div><small><VerifiedOwnerName name={userName} verified={active.isOwner} /></small><strong>{active.communityAccess === "FEED_ONLY" ? "Proprietário · somente feed" : active.isOwner ? "Proprietário do sistema" : ROLE_LABELS[active.papel] || active.papel}</strong></div></div>
          <nav aria-label="Menu por perfil" data-editor-key="navegacao-principal">
            {active.isOwner && (
              <Link
                className="pilot-owner-area-link"
                href="/proprietario"
                aria-label="Área do proprietário"
                title="Área do proprietário"
              >
                <span className="pilot-sidebar-icon" aria-hidden="true">⌘</span>
                <span className="pilot-sidebar-label">Área do proprietário</span>
              </Link>
            )}
            {sidebarGroups.map((group) => (
              <section className="pilot-sidebar-group" key={group.label} aria-label={group.label}>
                <h2>{group.label}</h2>
                {group.items.map((item) => item && (
                  <button
                    key={item.key}
                    data-editor-key={`menu-principal-${item.key}`}
                    className={visibleView === item.id ? "active" : ""}
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
        </aside>
        <section
          className={`pilot-workspace${viewLoading ? " is-view-loading" : ""}${
            visibleView === "inicio" && communityTheme.wallpaperUrl
              ? " has-community-wallpaper"
              : ""
          }`}
          data-editor-key="conteudo-principal"
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
          {COMMUNITY_MANAGEMENT_VIEWS.includes(
            visibleView as CommunityManagementView,
          ) && (
            <button
              type="button"
              className="community-management-back"
              onClick={() => openView("comunidade")}
            >
              <span aria-hidden="true">←</span>
              Gestão da comunidade
            </button>
          )}
          {visibleView === "inicio" && !accessDeniedView && (
            <CommunityHome
              communityName={active.comunidadeNome}
              communitySlug={active.comunidadeSlug}
              permissions={active.permissions}
              initialFeed={feed}
              currentUserId={active.userId}
              userName={userName}
              readOnlyFeed={active.communityAccess === "FEED_ONLY"}
            />
          )}
          {visibleView === "visitantes" && (
            <VisitorsWorkspace
              permissions={active.permissions}
              communityName={active.comunidadeNome}
            />
          )}
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
            <RequestsWorkspace communityName={active.comunidadeNome} />
          )}
          {visibleView === "mensagens" && <PrivateChatWorkspace />}
          {visibleView === "celulas" && (
            <CellsWorkspace
              permissions={active.permissions}
              communityName={active.comunidadeNome}
            />
          )}
          {visibleView === "estacionamento" && (
            <ParkingWorkspace communityName={active.comunidadeNome} memberMode={!active.permissions.includes("parking.view")} />
          )}
          {visibleView === "redes" && features.networkModuleEnabled && (
            <NetworkWorkspace />
          )}
          {visibleView === "membro" && (
            <PeopleWorkspace
              communityName={active.comunidadeNome}
              mode="self"
            />
          )}
          {visibleView === "lider" && (
            <LeadershipWorkspace
              mode={active.permissions.includes("pastoral.panel.view") ? "pastoral" : "leader"}
              communityName={active.comunidadeNome}
            />
          )}
          {visibleView === "pessoas" && (
            <PeopleWorkspace communityName={active.comunidadeNome} />
          )}
          {visibleView === "conta" && <AccountProfileWorkspace />}
          {visibleView === "comunidade" && (
            <section>
              <header className="workspace-heading"><div><p className="pilot-kicker">GESTÃO DA COMUNIDADE</p><h1>Central da comunidade</h1><p>Pessoas, liderança, continuidade, solicitações e preferências reunidas no contexto da comunidade ativa.</p></div></header>
              {active.permissions.includes("invites.manage") && (
                <>
                  <form className="pilot-form invite-generator" onSubmit={createInvite}>
                    <label>E-mail da pessoa<input name="email" type="email" required autoComplete="off" /></label>
                    <label>Perfil<select name="papel" value="MEMBRO" disabled><option value="MEMBRO">Membro</option></select></label>
                    <button disabled={inviteLoading}>{inviteLoading ? "Criando…" : "Criar convite"}</button>
                  </form>
                  {inviteMessage && <p className="pilot-form-message" role="status">{inviteMessage}</p>}
                  {inviteLink && <div className="invite-result"><label>Link individual<input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /></label><button onClick={() => navigator.clipboard.writeText(inviteLink)}>Copiar link</button></div>}
                  <div className="sensitive-action-note"><strong>Perfis privilegiados bloqueados</strong><p>Convites para líderes, pastores ou administradores exigirão MFA, reautenticação e revisão.</p></div>
                </>
              )}
              <CommunityAdminWorkspace
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
              currentCommunityId={active.comunidadeId}
            />
          )}
          </WorkspaceErrorBoundary>
        </section>
      </div>
      <nav className="pilot-mobile-nav" data-editor-key="barra-movel" aria-label="Navegação móvel do painel">
        <button
          type="button"
          className={visibleView === "inicio" && !mobileMenu ? "active" : ""}
          onClick={() => openView("inicio")}
          aria-label="Início"
        >
          <span className="pilot-mobile-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M9.5 20v-6h5v6"/></svg></span>
          <small className="pilot-mobile-label">Início</small>
        </button>
        <button type="button" className={mobileMenu === "perfil" ? "active" : ""} onClick={() => setMobileMenu((current) => current === "perfil" ? null : "perfil")} aria-label="Comunidade">
          <span className="pilot-mobile-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 19v-7l7-5 7 5v7M9 19v-4h6v4M8 8V5h3"/></svg></span>
          <small className="pilot-mobile-label">Comunidade</small>
        </button>
        <button type="button" className={visibleView === "eventos" && !mobileMenu ? "active" : ""} onClick={() => eventViewAvailable ? openView("eventos") : setMobileMenu("menu")} aria-label="Agenda">
          <span className="pilot-mobile-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h3M14 14h2"/></svg></span>
          <small className="pilot-mobile-label">Agenda</small>
        </button>
        <button type="button" className={visibleView === "solicitacoes" && !mobileMenu ? "active" : ""} onClick={() => openView("solicitacoes")} aria-label="Pedidos">
          <span className="pilot-mobile-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg></span>
          <small className="pilot-mobile-label">Pedidos</small>
        </button>
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
        </button>
      </nav>
      {mobileMenu && (
        <div className="pilot-mobile-overlay" role="presentation" onMouseDown={() => setMobileMenu(null)}>
          <section
            id="pilot-mobile-sheet"
            className="pilot-mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={
              mobileMenu === "menu"
                ? "Menu geral"
                : mobileMenu === "actions"
                  ? "Ações rápidas"
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
                      : "CONTA ATIVA"}
                </p>
                <h2>
                  {mobileMenu === "menu"
                    ? "Menu geral"
                    : mobileMenu === "actions"
                      ? "O que deseja adicionar?"
                      : userName}
                </h2>
              </div>
              <button type="button" onClick={() => setMobileMenu(null)} aria-label="Fechar menu">×</button>
            </header>
            {mobileMenu === "menu" ? (
              <div className="pilot-mobile-menu-content">
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
                </div>
              </div>
            ) : mobileMenu === "actions" ? (
              <div className="pilot-mobile-action-grid">
                {quickActions.map((action) => (
                  <button
                    type="button"
                    key={action.label}
                    onClick={() => runQuickAction(action)}
                  >
                    <span aria-hidden="true"><MenuIcon id={action.icon} /></span>
                    <div>
                      <strong>{action.label}</strong>
                      <small>{action.description}</small>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="pilot-mobile-profile">
                <div className="pilot-mobile-profile-card">
                  <span>{userPhotoUrl ? <img src={userPhotoUrl} alt="" /> : userInitials}</span>
                  <div>
                    <VerifiedOwnerName name={userName} verified={active.isOwner} />
                    <small>{userEmail}</small>
                    <em>{active.communityAccess === "FEED_ONLY" ? "Proprietário · somente feed" : active.isOwner ? "Proprietário do sistema" : ROLE_LABELS[active.papel] || active.papel}</em>
                  </div>
                </div>
                <dl>
                  <div><dt>Comunidade ativa</dt><dd>{active.comunidadeNome}</dd></div>
                </dl>
                {active.isOwner && (
                  <Link className="pilot-profile-manage" href="/proprietario">
                    Abrir Área do Proprietário
                  </Link>
                )}
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
                <button
                  type="button"
                  className="pilot-profile-manage"
                  onClick={() => openView("conta")}
                >
                  Minha conta
                </button>
                <Link href={`/comunidades/${active.comunidadeSlug}`}>Ver página pública</Link>
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

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "US";
}

type MenuIconId = View | "mural" | "escalas";

function MenuIcon({ id }: { id: MenuIconId }) {
  const paths: Partial<Record<MenuIconId, string>> = {
    inicio: "M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5v-8Z",
    eventos: "M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 6h14M8 2v4m8-4v4",
    ministerios: "M12 3v18m-7-9h14M7 7h10v10H7z",
    escalas: "M7 4h10v3H7V4Zm-2 2h14v15H5V6Zm3 6 2 2 4-4m-6 7h7",
    diaconia: "M6 20v-8a6 6 0 0 1 12 0v8M9 8a3 3 0 1 1 6 0",
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
    "visual-editor": "m4 20 4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L4 20Zm9-13 4 4",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[id] || "M5 5h14v14H5z"} />
    </svg>
  );
}
