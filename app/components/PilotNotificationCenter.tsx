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
};

export default function PilotNotificationCenter() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const unread = items.filter((item) => !item.read).length;

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
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Falha ao carregar.");
      setItems(result.notifications || []);
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
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
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
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
            </header>
            {unread > 0 && <button className="notification-read-all" type="button" onClick={() => markRead()}>Marcar todas como lidas</button>}
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
                    <span aria-hidden="true">{item.read ? "○" : "●"}</span>
                    <div>
                      <strong>{item.title}</strong>
                      {(item.senderName || item.hierarchy || item.ministry) && (
                        <small className="notification-sender-meta">
                          {[item.senderName, item.hierarchy, item.ministry].filter(Boolean).join(" · ")}
                        </small>
                      )}
                      <p>{item.message}</p>
                      <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                    </div>
                    {item.destination ? (
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
