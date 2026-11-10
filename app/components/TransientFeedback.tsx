"use client";

import { Children, isValidElement, useEffect, useId, useRef, useState, useSyncExternalStore, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createFeedbackStore, type FeedbackEntry, type FeedbackTone } from "../lib/transient-feedback-store";
import "../transient-feedback.css";
import useFeedbackPosition from "./useFeedbackPosition";
import VinkuloActionMark from "./VinkuloActionMark";

const store = createFeedbackStore<ReactNode>();
const empty: FeedbackEntry<ReactNode>[] = [];
const serverSnapshot = () => empty;

function describe(children: ReactNode): { text: string; actions: number } {
  let text = "";
  let actions = 0;
  Children.forEach(children, child => {
    if (typeof child === "string" || typeof child === "number") text += ` ${child}`;
    else if (isValidElement<{ children?: ReactNode }>(child)) {
      if (child.type === "button" || child.type === "a") actions += 1;
      else { const nested = describe(child.props.children); text += nested.text; actions += nested.actions; }
    }
  });
  return { text: text.replace(/\s+/g, " ").trim(), actions };
}

/** Declarative replacement for an inline operational notice. Callbacks remain React-owned. */
export default function TransientFeedback({ children, className = "", role, tone, onDismiss, durationMs, noticeKey = "" }: HTMLAttributes<HTMLDivElement> & { tone?: FeedbackTone; onDismiss?: () => void; durationMs?: number; noticeKey?: string }) {
  const id = useId();
  useEffect(() => {
    const description = describe(children);
    if (!description.text) { store.remove(id); return; }
    const kind = tone ?? (/error|erro|danger/.test(className) || role === "alert" ? "error" : /success/.test(className) ? "success" : "info");
    store.publish({ id, content: children, tone: kind, actions: description.actions, onDismiss, durationMs,
      fingerprint: `${kind}:${noticeKey}:${description.text}` });
  }, [children, className, id, role, tone, onDismiss, durationMs, noticeKey]);
  useEffect(() => () => store.remove(id), [id]);
  return null;
}

function ToastCard({ entry, history = false }: { entry: FeedbackEntry<ReactNode>; history?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const duration = entry.durationMs ?? (entry.tone === "error" || entry.actions ? 9000 : 5500);
  const paused = hovered || focused;
  useEffect(() => {
    if (history || paused) return;
    const timer = window.setTimeout(() => setLeaving(true), duration);
    return () => window.clearTimeout(timer);
  }, [duration, history, paused, entry.revision]);
  useEffect(() => {
    if (!leaving || history || paused) return;
    const timer = window.setTimeout(() => store.dismiss(entry.fingerprint), 200);
    return () => window.clearTimeout(timer);
  }, [leaving, history, paused, entry.fingerprint]);
  return <div ref={card} className={`app-toast-card is-${entry.tone}${leaving && !paused ? " is-leaving" : ""}`}
    role={history ? undefined : entry.tone === "error" ? "alert" : "status"}
    onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <span className="app-toast-symbol" aria-hidden="true"><VinkuloActionMark state={entry.tone === "info" ? "idle" : entry.tone} size={36} animate={!history} /></span>
    <div className="app-toast-content" onClick={event => { if ((event.target as HTMLElement).closest("button,a")) store.acknowledge(entry.fingerprint); }}>{entry.content}</div>
    <button type="button" className="app-toast-close" aria-label={history ? "Excluir aviso" : "Fechar aviso"} onClick={() => store.acknowledge(entry.fingerprint)}><span aria-hidden="true">×</span> {history ? "Excluir" : "Fechar"}</button>
  </div>;
}

export function TransientFeedbackViewport() {
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLElement>(null);
  useFeedbackPosition(region);
  const newestRevision = entries[0]?.revision;
  useEffect(() => {
    if (!entries.length) return;
    // The history affordance has its own lifetime; rerenders do not restart it.
    // Give keyboard users time to finish interacting with actions.
    const expire = () => {
      if (region.current?.contains(document.activeElement) && document.activeElement?.matches(":focus-visible") && !historyOpen) {
        timer = window.setTimeout(expire, 1000);
        return;
      }
      store.acknowledge();
      setHistoryOpen(false);
    };
    let timer = window.setTimeout(expire, historyOpen ? 10000 : 18000);
    return () => window.clearTimeout(timer);
  // Contents can rerender without representing a new notice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestRevision, historyOpen]);
  useEffect(() => {
    if (!historyOpen) return;
    const close = () => { setHistoryOpen(false); store.acknowledge(); };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !region.current?.contains(event.target)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [historyOpen]);
  if (!entries.length) return null;
  const visible = entries.filter(entry => !entry.dismissed).slice(0, 1);
  return createPortal(<aside className={`app-toast-viewport${visible.length || historyOpen ? " has-active-notice" : ""}`} aria-label="Avisos do sistema" ref={region}>
    {historyOpen ? <section id="app-toast-history" className="app-toast-history" aria-label="Avisos desta tela">
      <header><strong>Avisos desta tela</strong><button type="button" aria-label="Fechar avisos recentes" onClick={() => { setHistoryOpen(false); store.acknowledge(); }}>×</button></header>
      <div>{entries.map(entry => <ToastCard key={entry.id + entry.revision} entry={entry} history />)}</div>
    </section> : <div className="app-toast-stack">{visible.map(entry => <ToastCard key={entry.id + entry.revision} entry={entry} />)}</div>}
    <button ref={historyButton} type="button" className="app-toast-history-toggle" aria-expanded={historyOpen} aria-controls="app-toast-history" onClick={() => { setHistoryOpen(!historyOpen); if (historyOpen) store.acknowledge(); }}>
      <span aria-hidden="true">◷</span> {historyOpen ? "Fechar avisos" : `Avisos recentes · ${entries.length}`}
    </button>
  </aside>, document.body);
}
