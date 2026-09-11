"use client";

import { useEffect, useState } from "react";

type QueueItem = {
  id: number;
  titulo: string;
  categoria: string;
  comunidade_nome: string;
  publicar_em: string;
  status: string;
};
type SidebarNotification = { id:number; title:string; message:string; destination:string; read:boolean; category:string };
type SidebarPost = { id:number; titulo:string; resumo:string; conteudo:string; categoria:string; criado_em:string };

const STORAGE_KEY = "adote:editorial-sidebar-visible";

export default function EditorialSidebarSchedule({ onOpen }: { onOpen: () => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [notifications, setNotifications] = useState<SidebarNotification[]>([]);
  const [posts, setPosts] = useState<SidebarPost[]>([]);
  const [visible, setVisible] = useState(true);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const restorePreference = window.setTimeout(() => {
      try {
        setVisible(window.localStorage.getItem(STORAGE_KEY) !== "false");
      } catch {
        setVisible(true);
      }
      setNow(Date.now());
    }, 0);
    let active = true;
    async function load() {
      try {
        const [scheduleResponse, notificationResponse, postResponse] = await Promise.all([
          fetch("/api/pilot/editorial/programacoes", { cache: "no-store" }),
          fetch("/api/pilot/notificacoes", { cache: "no-store" }),
          fetch("/api/pilot/publicacoes?placement=sidebar&limit=4", { cache: "no-store" }),
        ]);
        if (scheduleResponse.ok) {
          const result = (await scheduleResponse.json()) as { queue?: QueueItem[] };
          if (active) setQueue(result.queue || []);
        }
        if (notificationResponse.ok) {
          const result = (await notificationResponse.json()) as { notifications?: SidebarNotification[] };
          if (active) setNotifications(result.notifications || []);
        }
        if (postResponse.ok) {
          const result = (await postResponse.json()) as { publicacoes?: SidebarPost[] };
          if (active) setPosts(result.publicacoes || []);
        }
      } catch {
        // O painel é informativo; uma falha de rede não interrompe a navegação.
      }
    }
    void load();
    const refresh = window.setInterval(() => void load(), 30_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      active = false;
      window.clearTimeout(restorePreference);
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, []);

  function changeVisibility(next: boolean) {
    setVisible(next);
    try { window.localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* preferência opcional */ }
  }

  const next = queue.find((item) => item.status === "AGENDADA");
  const latest = notifications.find((item) => !item.read) || notifications[0];
  if (!visible) {
    return (
      <button className="editorial-sidebar-restore" type="button" onClick={() => changeVisibility(true)}>
        <span>◷</span> Agenda editorial
      </button>
    );
  }

  return (
    <section className="editorial-sidebar-card" aria-label="Assistente e avisos da comunidade">
      <header>
        <div><span>✦</span><strong>Assistente e avisos</strong></div>
        <button type="button" onClick={() => changeVisibility(false)} aria-label="Ocultar agenda editorial">−</button>
      </header>
      {latest && (
        <button
          className="editorial-sidebar-alert"
          type="button"
          onClick={() => window.location.assign(latest.destination || "/painel?view=inicio")}
        >
          <span>{latest.read ? "Aviso recente" : "Novo aviso"}</span>
          <strong>{latest.title}</strong>
          <small>{latest.message}</small>
        </button>
      )}
      {posts.length > 0 && <div className="editorial-sidebar-posts" aria-label="Publicações na lateral">
        {posts.map((post) => <button key={post.id} type="button" onClick={() => window.location.assign(`/painel?view=inicio#publicacao-${post.id}`)}><small>{post.categoria.replaceAll("_", " ")}</small><strong>{post.titulo}</strong><span>{post.resumo || post.conteudo}</span></button>)}
      </div>}
      {next ? (
        <button className="editorial-sidebar-next" type="button" onClick={onOpen}>
          <small>Próxima publicação</small>
          <strong>{next.titulo}</strong>
          <span>{next.comunidade_nome}</span>
          <time>{formatCountdown(next.publicar_em, now)}</time>
        </button>
      ) : (
        <button className="editorial-sidebar-empty" type="button" onClick={onOpen}>
          <span>Nenhuma mensagem automática programada.</span>
          <strong>Configurar IA editorial →</strong>
        </button>
      )}
    </section>
  );
}

function formatCountdown(value: string, now: number) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  const seconds = Math.max(0, Math.floor((date.getTime() - now) / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  return days
    ? `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}min`
    : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
