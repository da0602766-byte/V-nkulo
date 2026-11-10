"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./EventsAgenda.module.css";
import VinkuloActionMark from "./VinkuloActionMark";

export default function AgendaDialog({ title, children, onClose, busy = false, wide = false, eyebrow = "AGENDA", closeLabel = "Fechar dia selecionado" }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean; eyebrow?: string; closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    dialog.showModal();
    root.style.overflow = "hidden";
    return () => { dialog.close(); root.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`${styles.dayDialog}${wide ? ` ${styles.wideDialog}` : ""}`} aria-busy={busy} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}>
    <header className={styles.dialogHeading}><div className="vinkulo-dialog-title"><VinkuloActionMark state={busy ? "pending" : "idle"} size={38}/><div><small>{eyebrow}</small><h2 id={titleId}>{title}</h2></div></div><button type="button" disabled={busy} onClick={onClose} aria-label={closeLabel}>×</button></header>
    <div className={styles.dialogContent}>{children}</div>
  </dialog>;
}
