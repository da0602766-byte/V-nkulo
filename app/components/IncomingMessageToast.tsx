"use client";

import { useEffect } from "react";

export type IncomingMessage = {
  // Muda a cada mensagem nova: serve de `key` para a animação recomeçar
  // quando um aviso substitui o anterior.
  key: number;
  userId: number;
  name: string;
  photo: string | null;
  preview: string;
  count: number;
};

const VISIBLE_MS = 6_000;

export default function IncomingMessageToast({
  message,
  onOpen,
  onDismiss,
}: {
  message: IncomingMessage;
  onOpen: (userId: number) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [message.key, onDismiss]);

  return (
    <div className="message-arrival-toast" role="status" aria-live="polite">
      <button
        type="button"
        className="message-arrival-open"
        onClick={() => onOpen(message.userId)}
      >
        <span className="message-arrival-avatar" aria-hidden="true">
          {message.photo ? <img loading="lazy" src={message.photo} alt="" /> : initials(message.name)}
          <i />
          <i />
        </span>
        <span className="message-arrival-text">
          <strong>{message.name}</strong>
          <small>{message.preview || "Enviou uma mensagem"}</small>
        </span>
        {message.count > 1 && <b>{message.count}</b>}
      </button>
      <button type="button" className="message-arrival-close" onClick={onDismiss} aria-label="Dispensar aviso">
        ×
      </button>
      <span className="message-arrival-timer" aria-hidden="true" />
    </div>
  );
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}
