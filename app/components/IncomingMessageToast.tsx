"use client";

import TransientFeedback from "./TransientFeedback";

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
  return <TransientFeedback noticeKey={String(message.key)} durationMs={6000} onDismiss={onDismiss}>
    <strong>{message.name}{message.count > 1 ? ` · ${message.count} mensagens` : ""}</strong>
    <p>{message.preview || "Enviou uma mensagem"}</p>
    <button type="button" onClick={() => { onOpen(message.userId); onDismiss(); }}>Abrir conversa</button>
  </TransientFeedback>;
}
