"use client";

import { Children, isValidElement, useEffect, useId, useRef, useState, useSyncExternalStore, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createFeedbackStore, type FeedbackEntry, type FeedbackTone } from "../lib/transient-feedback-store";
import "../transient-feedback.css";

const store = createFeedbackStore<ReactNode>();
const empty: FeedbackEntry<ReactNode>[] = [];
const serverSnapshot = () => empty;

function describe(children: ReactNode): { text: string; actions: number } {
  let text = "";
  let actions = 0;
  Children.forEach(children, child => {
    if (typeof child === "string" || typeof child === "number") text += ` ${child}`;
    else if (isValidElement<{ children?: ReactNode }>(child)) {
      if (child.type === "button") actions += 1;
      else { const nested = describe(child.props.children); text += nested.text; actions += nested.actions; }
    }
  });
  return { text: text.replace(/\s+/g, " ").trim(), actions };
}

/** Declarative replacement for an inline operational notice. Callbacks remain React-owned. */
export default function TransientFeedback({ children, className = "", role, tone }: HTMLAttributes<HTMLDivElement> & { tone?: FeedbackTone }) {
  const id = useId();
  useEffect(() => {
    const description = describe(children);
    if (!description.text) { store.remove(id); return; }
    const kind = tone ?? (/error|erro|danger/.test(className) || role === "alert" ? "error" : "info");
    store.publish({ id, content: children, tone: kind, actions: description.actions,
      fingerprint: `${kind}:${description.text}` });
  }, [children, className, id, role, tone]);
  useEffect(() => () => store.remove(id), [id]);
  return null;
}

function ToastCard({ entry, history = false }: { entry: FeedbackEntry<ReactNode>; history?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const duration = entry.tone === "error" || entry.actions ? 9000 : 5500;
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
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <span className="app-toast-symbol" aria-hidden="true">{entry.tone === "error" ? "!" : entry.tone === "success" ? "✓" : "i"}</span>
    <div className="app-toast-content">{entry.content}</div>
    {!history && <button type="button" className="app-toast-close" aria-label="Dispensar aviso" onClick={() => store.dismiss(entry.fingerprint)}>×</button>}
  </div>;
}

export function TransientFeedbackViewport() {
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!historyOpen) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !region.current?.contains(event.target)) setHistoryOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setHistoryOpen(false); historyButton.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [historyOpen]);
  if (!entries.length) return null;
  const visible = entries.filter(entry => !entry.dismissed).slice(0, 3);
  return createPortal(<aside className="app-toast-viewport" aria-label="Avisos do sistema" ref={region}>
    {historyOpen ? <section id="app-toast-history" className="app-toast-history" aria-label="Avisos desta tela">
      <header><strong>Avisos desta tela</strong><button type="button" aria-label="Fechar avisos recentes" onClick={() => { setHistoryOpen(false); historyButton.current?.focus(); }}>×</button></header>
      <div>{entries.map(entry => <ToastCard key={entry.id + entry.revision} entry={entry} history />)}</div>
    </section> : <div className="app-toast-stack">{visible.map(entry => <ToastCard key={entry.id + entry.revision} entry={entry} />)}</div>}
    <button ref={historyButton} type="button" className="app-toast-history-toggle" aria-expanded={historyOpen} aria-controls="app-toast-history" onClick={() => setHistoryOpen(value => !value)}>
      <span aria-hidden="true">◷</span> {historyOpen ? "Fechar avisos" : `Avisos recentes · ${entries.length}`}
    </button>
  </aside>, document.body);
}
