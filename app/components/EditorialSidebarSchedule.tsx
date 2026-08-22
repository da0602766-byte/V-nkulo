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

const STORAGE_KEY = "adote:editorial-sidebar-visible";

export default function EditorialSidebarSchedule({ onOpen }: { onOpen: () => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
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
        const response = await fetch("/api/pilot/editorial/programacoes", { cache: "no-store" });
        if (!response.ok) return;
        const result = (await response.json()) as { queue?: QueueItem[] };
        if (active) setQueue(result.queue || []);
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
  if (!visible) {
    return (
      <button className="editorial-sidebar-restore" type="button" onClick={() => changeVisibility(true)}>
        <span>◷</span> Agenda editorial
      </button>
    );
  }

  return (
    <section className="editorial-sidebar-card" aria-label="Próxima publicação programada">
      <header>
        <div><span>◷</span><strong>Agenda editorial</strong></div>
        <button type="button" onClick={() => changeVisibility(false)} aria-label="Ocultar agenda editorial">−</button>
      </header>
      {next ? (
        <button className="editorial-sidebar-next" type="button" onClick={onOpen}>
          <small>Próxima publicação</small>
          <strong>{next.titulo}</strong>
          <span>{next.comunidade_nome}</span>
          <time>{formatCountdown(next.publicar_em, now)}</time>
        </button>
      ) : (
        <button className="editorial-sidebar-empty" type="button" onClick={onOpen}>
          <span>Nenhuma publicação autorizada.</span>
          <strong>Configurar agenda →</strong>
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
