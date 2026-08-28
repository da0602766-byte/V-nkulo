"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  category: string;
  area?: string;
};

type NotificationConfig = { escalas: boolean; eventos: boolean; pedidos: boolean; mensagens: boolean; sistema: boolean };
const DEFAULT_CONFIG: NotificationConfig = { escalas: true, eventos: true, pedidos: true, mensagens: true, sistema: true };
const DEVICE_NOTIFICATION_STORAGE_KEY = "vinkulo-device-notifications-v1";

export default function PilotNotificationCenter() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [canConfigure, setCanConfigure] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [config, setConfig] = useState<NotificationConfig>(DEFAULT_CONFIG);
  const [devicePermission, setDevicePermission] = useState<"unsupported" | NotificationPermission>("unsupported");
  const [showDevicePermissionHelp, setShowDevicePermissionHelp] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const permissionRef = useRef<"unsupported" | NotificationPermission>("unsupported");
  const shownDeviceNotificationIds = useRef<Set<number> | null>(null);
  const unread = items.filter((item) => !item.read).length;

  const showUnreadOnDevice = useCallback(async (nextItems: Notification[]) => {
    if (permissionRef.current !== "granted" || !("serviceWorker" in navigator)) return;
    if (!shownDeviceNotificationIds.current) {
      shownDeviceNotificationIds.current = readShownDeviceNotificationIds();
    }
    const shownIds = shownDeviceNotificationIds.current;
    const pending = nextItems
      .filter((item) => !item.read && !shownIds.has(item.id))
      .slice(0, 5);
    if (!pending.length) return;

    const registration = await navigator.serviceWorker.ready;
    for (const item of pending) {
      const options = {
        body: item.message,
        icon: "/vinkulo-app-icon-192.png",
        badge: "/vinkulo-app-icon-192.png",
        tag: `vinkulo-notification-${item.id}`,
        renotify: true,
        data: {
          notificationId: item.id,
          url: isSafeInternalDestination(item.destination) ? item.destination : "/painel",
        },
      } as NotificationOptions & { renotify: boolean };
      await registration.showNotification(item.title || "Vínkulo", options);
      shownIds.add(item.id);
    }
    persistShownDeviceNotificationIds(shownIds);
  }, []);

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
    const initial = window.setTimeout(() => {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        permissionRef.current = "unsupported";
        setDevicePermission("unsupported");
        return;
      }
      permissionRef.current = Notification.permission;
      setDevicePermission(Notification.permission);
    }, 0);
    return () => window.clearTimeout(initial);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const refreshAfterAppAction = () => void load();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("adote:refresh-notifications", refreshAfterAppAction);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("adote:refresh-notifications", refreshAfterAppAction);
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
    const response = await fetch("/api/pilot/notificacoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) { setMessage(result.error || "Não foi possível salvar."); return; }
    setConfiguring(false);
    await load();
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

  async function enableDeviceNotifications() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setDevicePermission("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    permissionRef.current = permission;
    setDevicePermission(permission);
    if (permission !== "granted") return;
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await registration.showNotification("Notificações ativadas", {
      body: "Avisos, escalas, eventos, mensagens e atualizações do Vínkulo poderão aparecer neste celular.",
      icon: "/vinkulo-app-icon-192.png",
      badge: "/vinkulo-app-icon-192.png",
      tag: "vinkulo-notifications-enabled",
      data: { url: "/painel" },
    });
    await load();
  }

  function handleDeviceNotificationPermission() {
    if (devicePermission === "denied") {
      setShowDevicePermissionHelp((value) => !value);
      return;
    }
    void enableDeviceNotifications();
  }

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
          <section className="pilot-notification-panel" role="dialog" aria-label="Notificações">
            <header>
              <div><p className="pilot-kicker">CENTRAL</p><h2>Notificações</h2></div>
              <div className="notification-panel-actions">
                {canConfigure && <button type="button" onClick={() => setConfiguring((value) => !value)} aria-label="Configurar notificações">⚙</button>}
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
              </div>
            </header>
            <section className={`notification-device-permission status-${devicePermission}`} aria-label="Notificações neste celular">
              <div><strong>Avisos neste celular</strong><small>{devicePermission === "granted" ? "Ativados para este aparelho" : devicePermission === "denied" ? "Bloqueados nas configurações do navegador ou aplicativo" : devicePermission === "unsupported" ? "Este navegador não oferece notificações" : "Receba escalas, eventos, mensagens e demais avisos"}</small></div>
              {devicePermission !== "granted" && devicePermission !== "unsupported" && <button type="button" onClick={handleDeviceNotificationPermission}>{devicePermission === "denied" ? "Como liberar" : "Ativar"}</button>}
            </section>
            {showDevicePermissionHelp && devicePermission === "denied" && (
              <section className="notification-device-help" aria-live="polite">
                <strong>Liberar notificações do aplicativo</strong>
                <p>No celular, abra Configurações › Aplicativos › Vínkulo › Notificações e ative Permitir notificações. Se estiver no navegador, use o cadeado ao lado do endereço.</p>
              </section>
            )}
            {configuring && <section className="notification-config" aria-label="Configuração de notificações">
              <div><strong>O que a comunidade envia</strong><small>Defina quais grupos aparecem nesta central.</small></div>
              {(Object.keys(DEFAULT_CONFIG) as Array<keyof NotificationConfig>).map((key) => <label key={key}><input type="checkbox" checked={config[key]} onChange={(event) => setConfig((current) => ({ ...current, [key]: event.target.checked }))} /><span>{key[0].toUpperCase() + key.slice(1)}</span></label>)}
              <button type="button" onClick={() => void saveConfig()}>Salvar preferências</button>
            </section>}
            <div className="notification-bulk-actions">
              {unread > 0 && <button className="notification-read-all" type="button" onClick={() => markRead()}>Marcar todas como lidas</button>}
              {items.some((item) => item.read) && <button className="notification-clear-read" type="button" onClick={() => void clearRead()}>Limpar visualizadas</button>}
            </div>
            {loading ? (
              <p className="notification-empty">Carregando…</p>
            ) : message ? (
              <p className="notification-empty">{message}</p>
            ) : items.length === 0 ? (
              <p className="notification-empty">Nenhuma solicitação nova.</p>
            ) : (
              <div className="pilot-notification-list">
                {items.map((item) => (
                  <article key={item.id} className={item.read ? "" : "unread"}>
                    <span className={`notification-source-icon source-${notificationVisual(item).key}`} aria-hidden="true">
                      {notificationVisual(item).icon}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <small className="notification-source-label">{notificationVisual(item).label}</small>
                      {(item.senderName || item.hierarchy || item.ministry) && (
                        <small className="notification-sender-meta">
                          {[item.senderName, item.hierarchy, item.ministry].filter(Boolean).join(" · ")}
                        </small>
                      )}
                      <p>{item.message}</p>
                      <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                    </div>
                    {item.read ? (
                      <button type="button" className="notification-clear-one" onClick={() => void clearRead(item.id)}>Limpar</button>
                    ) : item.destination ? (
                      <button type="button" onClick={() => void openNotification(item)}>Abrir</button>
                    ) : !item.read ? (
                      <button type="button" onClick={() => markRead(item.id)}>Lida</button>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
            <footer>
              E-mail e WhatsApp serão conectados futuramente por provedores externos.
            </footer>
          </section>
        </>,
        document.body,
      )}
    </div>
  );
}

function readShownDeviceNotificationIds() {
  try {
    const value = JSON.parse(window.localStorage.getItem(DEVICE_NOTIFICATION_STORAGE_KEY) || "[]");
    return new Set<number>(Array.isArray(value) ? value.filter((id) => Number.isInteger(id)).slice(-300) : []);
  } catch {
    return new Set<number>();
  }
}

function persistShownDeviceNotificationIds(ids: Set<number>) {
  try {
    window.localStorage.setItem(
      DEVICE_NOTIFICATION_STORAGE_KEY,
      JSON.stringify(Array.from(ids).slice(-300)),
    );
  } catch {
    // O armazenamento pode estar bloqueado; a notificação continua funcional.
  }
}

function isSafeInternalDestination(value: string) {
  return (
    value.startsWith("/painel?") ||
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

function notificationVisual(item: Notification) {
  const source = `${item.category} ${item.area || ""} ${item.title} ${item.destination}`.toLocaleLowerCase("pt-BR");
  if (source.includes("estacion") || source.includes("parking")) return { key: "parking", icon: "P", label: "Estacionamento" };
  if (source.includes("escala") || source.includes("minister")) return { key: "ministry", icon: "#", label: "Ministérios e escalas" };
  if (source.includes("evento")) return { key: "event", icon: "▣", label: "Eventos" };
  if (source.includes("pedido") || source.includes("oração") || source.includes("solicita")) return { key: "request", icon: "♡", label: "Oração e solicitações" };
  if (source.includes("mensagem") || source.includes("chat")) return { key: "message", icon: "□", label: "Mensagens" };
  return { key: "system", icon: "✦", label: "Sistema Vínkulo" };
}
