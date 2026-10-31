"use client";

import { useEffect, useRef, useState } from "react";
import SafeImage from "./SafeImage";
import { EmojiText } from "./ChatEmoji";

export type IncomingMessage = {
  key: number;
  userId: number;
  name: string;
  photo: string | null;
  preview: string;
  count: number;
};

export default function IncomingMessageToast({ message, onOpen, onDismiss }: {
  message: IncomingMessage;
  onOpen: (userId: number) => void;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(6000);
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);
  const paused = hovered || focused;
  useEffect(() => {
    if (paused || leaving) return;
    const started = Date.now();
    const timer = window.setTimeout(() => setLeaving(true), remaining.current);
    return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [paused, leaving]);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => dismissRef.current(), 220);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  return <aside className={`incoming-message-peek${leaving ? " is-leaving" : ""}${paused ? " is-paused" : ""}`} aria-label="Nova mensagem" onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }} onPointerLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <button type="button" className="incoming-message-avatar" aria-label={`Abrir conversa com ${message.name}`} onClick={() => onOpen(message.userId)}>
      {message.photo ? <SafeImage src={message.photo} alt="" fallbackName={message.name} fallbackKind="avatar" /> : <span>{message.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>}
      <i aria-hidden="true">{message.count > 1 ? Math.min(99, message.count) : "1"}</i>
    </button>
    <div className="incoming-message-card">
      <button type="button" className="incoming-message-preview" onClick={() => onOpen(message.userId)} aria-label={`Ler mensagem de ${message.name}`}>
        <span className="incoming-message-eyebrow">NOVA MENSAGEM <span>agora</span></span>
        <strong>{message.name}</strong>
        <span className="incoming-message-text" role="status"><EmojiText>{message.preview || "Enviou uma mensagem"}</EmojiText></span>
        <span className="incoming-message-action">Responder <span aria-hidden="true">↗</span></span>
      </button>
      <button type="button" className="incoming-message-dismiss" aria-label="Dispensar mensagem" onClick={onDismiss}>×</button>
      <span className="incoming-message-lifetime" aria-hidden="true" />
    </div>
  </aside>;
}
