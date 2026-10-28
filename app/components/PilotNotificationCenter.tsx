"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CHAT_SOUND_EVENT, chatSoundsEnabled, setChatSoundsEnabled } from "../lib/chat-sounds";
import "./notification-center.css";
import {
  isNativeNotificationBridgeAvailable,
} from "../lib/androidNativeBridge";
import { showUnreadDeviceNotifications } from "../lib/device-notification-sync";
import {
  getWebPushSubscriptionState,
  isWebPushSupported,
  subscribeWebPushNotifications,
  unsubscribeWebPushNotifications,
  type PushDeliveryStatus,
} from "../lib/web-push-client";

type Notification = {
  id: number;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  destination: string;
  senderName: string;
  hierarchy: string;
  ministry: string;
  category: NotificationCategory;
  area?: string;
};

type NotificationConfig = { escalas: boolean; eventos: boolean; pedidos: boolean; mensagens: boolean; sistema: boolean };
type NotificationCategory = keyof NotificationConfig;
export type NotificationUnreadSummary = Record<NotificationCategory, number> & { total: number };
const DEFAULT_CONFIG: NotificationConfig = { escalas: true, eventos: true, pedidos: true, mensagens: true, sistema: true };

export default function PilotNotificationCenter({
  onUnreadChange,
}: {
  onUnreadChange?: (summary: NotificationUnreadSummary) => void;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [scope, setScope] = useState<"tudo" | "precisa">("tudo");
  // O relógio vem de estado para o rótulo "Hoje/Ontem" não divergir entre
  // servidor e cliente na hidratação.
  const [agora, setAgora] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const controls = () => [...(panel?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]') || [])].filter(item => item.getClientRects().length);
    panel?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab") return;
      const items = controls(), first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    panel?.addEventListener("keydown", onKeyDown);
    return () => { panel?.removeEventListener("keydown", onKeyDown); trigger?.focus({ preventScroll: true }); };
  }, [open]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [canConfigure, setCanConfigure] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  useEffect(() => {
    const sync = () => setSoundEnabled(chatSoundsEnabled());
    sync(); window.addEventListener(CHAT_SOUND_EVENT, sync);
    return () => window.removeEventListener(CHAT_SOUND_EVENT, sync);
  }, []);
  const [config, setConfig] = useState<NotificationConfig>(DEFAULT_CONFIG);
  const [devicePermission, setDevicePermission] = useState<"unsupported" | NotificationPermission>("unsupported");
  const [webPushSubscribed, setWebPushSubscribed] = useState(false);
  const [pushDelivery, setPushDelivery] = useState<PushDeliveryStatus | null>(null);
  const [showDevicePermissionHelp, setShowDevicePermissionHelp] = useState(false);
  const [deviceChecking, setDeviceChecking] = useState(true);
  const [deviceCheckFailed, setDeviceCheckFailed] = useState(false);
  const [deviceCheckRevision, setDeviceCheckRevision] = useState(0);
  const [deviceMessage, setDeviceMessage] = useState("");
  const [deviceActivating, setDeviceActivating] = useState(false);
  const [nativePushAvailable, setNativePushAvailable] = useState(false);
  const activatingRef = useRef(false);

  useEffect(() => {
    const acertar = () => setAgora(Date.now());
    const primeiro = window.setTimeout(acertar, 0);
    const relogio = window.setInterval(acertar, 300000);
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(relogio);
    };
  }, []);
  const requestRef = useRef<AbortController | null>(null);
  const unread = items.filter((item) => !item.read).length;
  const unreadSummary = useMemo<NotificationUnreadSummary>(() => {
    const summary: NotificationUnreadSummary = {
      total: 0,
      escalas: 0,
      eventos: 0,
      pedidos: 0,
      mensagens: 0,
      sistema: 0,
    };
    for (const item of items) {
      if (item.read) continue;
      summary.total += 1;
      summary[item.category] += 1;
    }
    return summary;
  }, [items]);

  useEffect(() => {
    onUnreadChange?.(unreadSummary);
  }, [onUnreadChange, unreadSummary]);

  const showUnreadOnDevice = useCallback(
    (nextItems: Notification[]) => showUnreadDeviceNotifications(nextItems),
    [],
  );

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/pilot/notificacoes", {
        cache: "no-store",
        signal: controller.signal,
      });
      const result = (await response.json()) as {
        notifications?: Notification[];
        canConfigure?: boolean;
        config?: NotificationConfig;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Falha ao carregar.");
      const nextItems = result.notifications || [];
      void showUnreadOnDevice(nextItems);
      setItems(nextItems);
      setCanConfigure(Boolean(result.canConfigure));
      setConfig(result.config || DEFAULT_CONFIG);
      setMessage("");
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setMessage((error as Error).message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [showUnreadOnDevice]);

  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    const refreshDeviceState = async () => {
      if (activatingRef.current || document.visibilityState !== "visible") return;
      const request = ++revision;
      setDeviceChecking(true);
      setDeviceCheckFailed(false);
      setDeviceMessage("");
      setWebPushSubscribed(false);
      setPushDelivery(null);
      const native = typeof window.VinkuloAndroid?.requestPushToken === "function";
      setNativePushAvailable(native);
      const permission = isWebPushSupported() ? Notification.permission : "unsupported";
      setDevicePermission(permission);
      try {
        if (permission === "granted" && !native) {
          const state = await getWebPushSubscriptionState();
          if (cancelled || request !== revision) return;
          setWebPushSubscribed(state.subscribed);
          setPushDelivery(state.delivery || null);
          if (state.error) { setDeviceMessage(state.error); setDeviceCheckFailed(true); }
        }
      } catch {
        if (!cancelled && request === revision) {
          setDeviceCheckFailed(true);
          setDeviceMessage("Não foi possível conferir a ativação. Verifique sua conexão e tente novamente.");
        }
      } finally {
        if (!cancelled && request === revision) setDeviceChecking(false);
      }
    };
    const refresh = () => { void refreshDeviceState(); };
    const initial = window.setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [open, deviceCheckRevision]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const refreshAfterAppAction = () => void load();
    const openFromNavigation = () => {
      setOpen(true);
      void load();
    };
    const openFromDeviceNotification = (event: Event) => {
      const destination = (event as CustomEvent<unknown>).detail;
      if (typeof destination === "string" && isSafeInternalDestination(destination)) {
        window.location.assign(destination);
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("adote:refresh-notifications", refreshAfterAppAction);
    window.addEventListener("vinkulo:open-notifications", openFromNavigation);
    window.addEventListener("vinkulo:notification-open", openFromDeviceNotification);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("adote:refresh-notifications", refreshAfterAppAction);
      window.removeEventListener("vinkulo:open-notifications", openFromNavigation);
      window.removeEventListener("vinkulo:notification-open", openFromDeviceNotification);
      requestRef.current?.abort();
    };
  }, [load]);

  async function markRead(id?: number) {
    const response = await fetch("/api/pilot/notificacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { todas: true }),
    });
    if (!response.ok) return;
    setItems((current) =>
      current.map((item) =>
        !id || item.id === id ? { ...item, read: true } : item,
      ),
    );
  }

  async function openNotification(item: Notification) {
    if (!item.read) await markRead(item.id);
    setOpen(false);
    if (isSafeInternalDestination(item.destination)) {
      window.location.assign(item.destination);
    }
  }

  async function saveConfig() {
    if (savingConfig) return;
    setSavingConfig(true);
    try {
    const response = await fetch("/api/pilot/notificacoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) { setMessage(result.error || "Não foi possível salvar."); return; }
    setConfiguring(false);
    await load();
    } catch { setMessage("Não foi possível salvar. Verifique a conexão e tente novamente."); } finally { setSavingConfig(false); }
  }

  async function clearRead(id?: number) {
    const response = await fetch("/api/pilot/notificacoes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { lidas: true }),
    });
    if (!response.ok) return;
    setItems((current) => current.filter((item) => id ? item.id !== id : !item.read));
  }

  const enableDeviceNotifications = useCallback(async () => {
    if (activatingRef.current) return;
    activatingRef.current = true;
    setDeviceActivating(true);
    setDeviceMessage("");
    try {
      if (window.VinkuloAndroid?.requestPushToken) {
        window.VinkuloAndroid.requestPushToken();
        setDeviceMessage("Ativação solicitada ao aplicativo Android. Confira a permissão em Configurações › Aplicativos › Vínkulo › Notificações. A solicitação ainda não confirma o recebimento de avisos.");
        return;
      }
      if (!isWebPushSupported()) {
        setDevicePermission("unsupported");
        setDeviceMessage(isNativeNotificationBridgeAvailable()
          ? "Esta versão do APK não oferece push em segundo plano. Instale o Vínkulo pelo navegador para receber avisos mesmo fechado."
          : "Este navegador não oferece notificações push.");
        return;
      }
      const { registration } = await subscribeWebPushNotifications();
      setDevicePermission("granted");
      setWebPushSubscribed(true);
      setPushDelivery(null);
      await registration.showNotification("Notificações ativadas", {
        body: "Agora o Vínkulo poderá avisar você mesmo quando estiver fechado.",
        icon: "/vinkulo-logo.png",
        badge: "/vinkulo-logo.png",
        tag: "vinkulo-notifications-enabled",
        data: { url: "/painel" },
      });
      await load();
    } catch (error) {
      const permission = "Notification" in window ? Notification.permission : "unsupported";
      setDevicePermission(permission);
      setDeviceMessage(error instanceof Error ? error.message : "Não foi possível ativar as notificações push.");
    } finally {
      activatingRef.current = false;
      setDeviceActivating(false);
    }
  }, [load]);

  async function disableDeviceNotifications() {
    if (activatingRef.current) return;
    activatingRef.current = true; setDeviceActivating(true); setDeviceMessage("");
    try {
      await unsubscribeWebPushNotifications();
      setWebPushSubscribed(false); setPushDelivery(null);
      setDeviceMessage("Avisos em segundo plano desativados neste aparelho.");
    } catch (error) { setDeviceMessage(error instanceof Error ? error.message : "Não foi possível desativar. Tente novamente."); }
    finally { activatingRef.current = false; setDeviceActivating(false); }
  }

  function handleDeviceNotificationPermission() {
    if (deviceCheckFailed) { setDeviceCheckRevision(value => value + 1); return; }
    if (devicePermission === "denied" && !nativePushAvailable) {
      setShowDevicePermissionHelp((value) => !value);
      return;
    }
    void enableDeviceNotifications();
  }

  useEffect(() => {
    const enableFromMobileMenu = () => {
      setOpen(true);
      void enableDeviceNotifications();
    };
    window.addEventListener("vinkulo:enable-device-notifications", enableFromMobileMenu);
    return () => window.removeEventListener("vinkulo:enable-device-notifications", enableFromMobileMenu);
  }, [enableDeviceNotifications]);

  return (
    <div className="pilot-notification-center">
      <button
        className="pilot-notification-trigger"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`${unread} notificações não lidas`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
      </button>
      {open && createPortal(
        <>
          <button
            className="pilot-notification-backdrop"
            type="button"
            aria-label="Fechar notificações"
            onClick={() => setOpen(false)}
          />
          <section ref={panelRef} tabIndex={-1} className="pilot-notification-panel notification-redesign" role="dialog" aria-modal="true" aria-label="Notificações">
            <header>
              <div className="notification-heading"><span className="notification-brand"><NotificationIcon id="system" /></span><div><h2>{configuring ? "Preferências" : "Notificações"}</h2><p>{configuring ? "Do seu jeito, no seu ritmo" : unread ? `${unread} ${unread === 1 ? "novidade para você" : "novidades para você"}` : "Você está em dia"}</p></div></div>
              <div className="notification-panel-actions">
                <button type="button" onClick={() => setConfiguring(value => !value)} aria-pressed={configuring} aria-label={configuring ? "Voltar às notificações" : "Configurar notificações"}>{configuring ? <span aria-hidden="true">←</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6m8 4v6"/></svg>}</button>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
              </div>
            </header>
            <div className="notification-scroll">
            {configuring ? <>
            <section className="notification-sound-settings"><div><strong>Sons do chat</strong><p>Melodias suaves ao enviar e receber mensagens com o Vínkulo aberto.</p></div><label className="notification-toggle"><input type="checkbox" role="switch" aria-label="Sons do chat" checked={soundEnabled} onChange={event => { setChatSoundsEnabled(event.target.checked); setSoundEnabled(event.target.checked); }} /><span aria-hidden="true" /></label></section>
            <section className={`notification-device-permission status-${devicePermission}`} aria-label="Notificações neste aparelho" aria-busy={deviceChecking || deviceActivating}>
              <div><strong>Notificações em segundo plano</strong><small>{deviceChecking ? "Conferindo a ativação neste aparelho…" : deviceCheckFailed ? "Não foi possível confirmar se os avisos estão ativados neste aparelho." : nativePushAvailable ? "A ativação é feita pelo aplicativo Android e depende da permissão de notificações do aparelho." : webPushSubscribed ? "Ativados para esta sessão, mesmo com o Vínkulo fechado" : devicePermission === "denied" ? "Bloqueados nas configurações do navegador ou aplicativo" : devicePermission === "unsupported" ? "Instale pelo navegador para receber avisos mesmo com o aplicativo fechado" : devicePermission === "granted" ? "Permissão liberada; conclua a ativação para receber avisos em segundo plano" : "Receba escalas, eventos, pedidos e demais avisos"}</small></div>
              {!webPushSubscribed && (nativePushAvailable || devicePermission !== "unsupported") && <button type="button" disabled={deviceChecking || deviceActivating} onClick={handleDeviceNotificationPermission}>{deviceActivating ? "Ativando…" : deviceCheckFailed ? "Verificar novamente" : nativePushAvailable ? "Solicitar ativação" : devicePermission === "denied" ? "Como liberar" : "Ativar"}</button>}
              {webPushSubscribed && <button type="button" disabled={deviceActivating || deviceChecking} onClick={() => void disableDeviceNotifications()}>{deviceActivating ? "Desativando…" : "Desativar neste aparelho"}</button>}
            </section>
            {deviceMessage && <p className="notification-device-help" role="status">{deviceMessage}</p>}
            {webPushSubscribed && <section className="notification-device-help" aria-live="polite">
              <strong>{pushDelivery?.consecutiveFailures ? "O último envio encontrou uma dificuldade" : "Privacidade neste aparelho"}</strong>
              <p>{pushDelivery?.consecutiveFailures
                ? "Os avisos continuam disponíveis nesta central. Confira sua conexão e a permissão de notificações."
                : pushDelivery?.lastAcceptedAt
                  ? "O último envio foi aceito pelo serviço de notificações. Isso não confirma a exibição no aparelho."
                  : "Os avisos externos não exibem o conteúdo das mensagens."} Ao sair da conta, as notificações desta sessão são desativadas.</p>
            </section>}
            {showDevicePermissionHelp && devicePermission === "denied" && (
              <section className="notification-device-help" aria-live="polite">
                <strong>Liberar notificações do aplicativo</strong>
                <p>No celular, abra Configurações › Aplicativos › Vínkulo › Notificações e ative Permitir notificações. Se estiver no navegador, use o cadeado ao lado do endereço.</p>
              </section>
            )}
            {canConfigure && <section className="notification-config" aria-label="Configuração de notificações">
              <div><strong>O que você recebe</strong><small>Escolha os assuntos que aparecem na sua central.</small></div>
              {(Object.keys(DEFAULT_CONFIG) as Array<keyof NotificationConfig>).map((key) => <label key={key}><input type="checkbox" checked={config[key]} onChange={(event) => setConfig((current) => ({ ...current, [key]: event.target.checked }))} /><span>{key[0].toUpperCase() + key.slice(1)}</span></label>)}
              <button type="button" disabled={savingConfig} onClick={() => void saveConfig()}>{savingConfig ? "Salvando…" : "Salvar preferências"}</button>
            </section>}
            <a className="notification-credits" href="/creditos" target="_blank" rel="noreferrer">Créditos e licenças ↗</a>
            </> : <>
            {!deviceChecking && !webPushSubscribed && devicePermission !== "unsupported" && <button className="notification-activate-hint" type="button" onClick={() => setConfiguring(true)}><NotificationIcon id="system" /><span>Receba avisos mesmo com o Vínkulo fechado</span><span aria-hidden="true">›</span></button>}
            <div className="notification-bulk-actions">
              {unread > 0 && <button className="notification-read-all" type="button" onClick={() => markRead()}>Marcar todas como lidas</button>}
              {items.some((item) => item.read) && <button className="notification-clear-read" type="button" onClick={() => void clearRead()}>Limpar visualizadas</button>}
            </div>
            {message && <p className="notification-device-help" role="status">{message}</p>}
            {loading ? (
              <div className="notification-skeleton" role="status" aria-label="Carregando notificações"><i/><i/><i/></div>
            ) : items.length === 0 ? (
              <div className="notification-empty"><span className="notification-empty-art"><NotificationIcon id="system" /><i/></span><h3>Tudo em dia por aqui</h3><p>Novidades da comunidade chegam neste espaço.</p><small>Enquanto isso, siga conectado.</small></div>
            ) : (
              <>
              <div className="notification-scope-v5" role="group" aria-label="Filtrar notificações">
                <button type="button" className={scope === "tudo" ? "active" : ""} aria-pressed={scope === "tudo"} onClick={() => setScope("tudo")}>
                  Tudo <span>{items.length}</span>
                </button>
                <button type="button" className={scope === "precisa" ? "active" : ""} aria-pressed={scope === "precisa"} onClick={() => setScope("precisa")}>
                  Precisa de você <span>{items.filter(needsYou).length}</span>
                </button>
              </div>
              <div className="pilot-notification-list">
                {(() => {
                  const visiveis = scope === "precisa" ? items.filter(needsYou) : items;
                  if (!visiveis.length) {
                    return <p className="notification-empty">Nada esperando resposta sua.</p>;
                  }
                  let ultimoDia = "";
                  return visiveis.map((item) => {
                    const rotulo = dayLabel(item.createdAt, agora);
                    const abreDia = Boolean(rotulo) && rotulo !== ultimoDia;
                    if (abreDia) ultimoDia = rotulo;
                    return (
                  <Fragment key={item.id}>
                  {abreDia && <p className="notification-day-v5">{rotulo}</p>}
                  <article className={item.read ? "" : "unread"}>
                    <span className={`notification-source-icon source-${notificationVisual(item).key}`} aria-hidden="true">
                      <NotificationIcon id={notificationVisual(item).key} />
                    </span>
                    <div>
                      <strong>{item.title}{!item.read && <i className="notification-unread-dot" aria-label="Não lida" />}</strong>
                      <small className="notification-source-label">{notificationVisual(item).label}</small>
                      {(item.senderName || item.hierarchy || item.ministry) && (
                        <small className="notification-sender-meta">
                          {[item.senderName, item.hierarchy, item.ministry].filter(Boolean).join(" · ")}
                        </small>
                      )}
                      <p>{item.message}</p>
                      <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                    </div>
                    <div className="notification-item-actions">
                      {isSafeInternalDestination(item.destination) && <button type="button" className="notification-open" aria-label={`Abrir: ${item.title}`} onClick={() => void openNotification(item)}>Abrir</button>}
                      {item.read ? <button type="button" className="notification-clear-one" onClick={() => void clearRead(item.id)}>Limpar</button> : !isSafeInternalDestination(item.destination) ? <button type="button" onClick={() => markRead(item.id)}>Lida</button> : null}
                    </div>
                  </article>
                  </Fragment>
                    );
                  });
                })()}
              </div>
              </>
            )}
            </>}
            {configuring && message && <p className="notification-device-help" role="status">{message}</p>}
            </div>
          </section>
        </>,
        document.body,
      )}
    </div>
  );
}

function isSafeInternalDestination(value: string) {
  return (
    value.startsWith("/painel?") ||
    value.startsWith("/painel/visitantes?") ||
    value.startsWith("/comunidades") ||
    value.startsWith("/proprietario")
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

// Os ícones eram caracteres de texto (P # ▣ ♡ □ ✦), com peso e altura que
// nenhuma fonte garante. Viraram traçado, como no resto da navegação.
const NOTIFICATION_ICONS: Record<string, string> = {
  parking: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4.8 13V7.6h3a2.9 2.9 0 0 1 0 5.8h-3",
  ministry: "m12 3 9 4.8-9 4.8-9-4.8L12 3Zm-9 9.8 9 4.8 9-4.8",
  event: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm-2 5h18M8 3v4m8-4v4",
  request: "M12 20.5S4.5 15.8 4.5 10.4A4.1 4.1 0 0 1 12 7.8a4.1 4.1 0 0 1 7.5 2.6c0 5.4-7.5 10.1-7.5 10.1Z",
  message: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z",
  system: "M18.2 9.2a6.2 6.2 0 0 0-12.4 0c0 5.1-2 6.2-2 6.2h16.4s-2-1.1-2-6.2ZM10.4 19.4a2 2 0 0 0 3.2 0",
};

function NotificationIcon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={NOTIFICATION_ICONS[id] || NOTIFICATION_ICONS.system} />
    </svg>
  );
}

function notificationVisual(item: Notification) {
  const source = `${item.category} ${item.area || ""} ${item.title} ${item.destination}`.toLocaleLowerCase("pt-BR");
  if (source.includes("estacion") || source.includes("parking")) return { key: "parking", label: "Estacionamento" };
  if (source.includes("escala") || source.includes("minister")) return { key: "ministry", label: "Ministérios e escalas" };
  if (source.includes("evento")) return { key: "event", label: "Eventos" };
  if (source.includes("pedido") || source.includes("oração") || source.includes("solicita")) return { key: "request", label: "Oração e solicitações" };
  if (source.includes("mensagem") || source.includes("chat")) return { key: "message", label: "Mensagens" };
  return { key: "system", label: "Sistema Vínkulo" };
}

// Só o que exige uma ação de quem lê. Ler tudo é um dever de ninguém; o que
// espera resposta precisa aparecer separado do que é só aviso.
function needsYou(item: Notification) {
  if (item.read) return false;
  const fonte = `${item.category} ${item.area || ""} ${item.title}`.toLocaleLowerCase("pt-BR");
  return (
    Boolean(item.destination) ||
    fonte.includes("escala") ||
    fonte.includes("pedido") ||
    fonte.includes("solicita") ||
    fonte.includes("aprovaç") ||
    fonte.includes("confirm")
  );
}

// Agrupa por dia civil, com rótulo relativo para os dois mais recentes.
function dayLabel(value: string, agora: number) {
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return "Sem data";
  if (!agora) return "";
  const inicioHoje = new Date(agora);
  inicioHoje.setHours(0, 0, 0, 0);
  const diff = Math.floor((inicioHoje.getTime() - new Date(data).setHours(0, 0, 0, 0)) / 86400000);
  if (diff <= 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(data);
}
