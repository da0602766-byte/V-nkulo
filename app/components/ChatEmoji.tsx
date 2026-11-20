"use client";
import { CHAT_EMOJIS } from "../lib/chat-emojis";
import type { ReactNode } from "react";

const byEmoji = new Map<string, (typeof CHAT_EMOJIS)[number]>(CHAT_EMOJIS.map(item => [item.emoji.replaceAll("\ufe0f", ""), item]));
const graphemeSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter !== "undefined"
  ? new Intl.Segmenter("pt-BR", { granularity: "grapheme" })
  : null;

export default function ChatEmoji({ emoji }: { emoji: string }) {
  const item = byEmoji.get(emoji.replaceAll("\ufe0f", ""));
  if (!item) return <>{emoji}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="chat-emoji-art" src={`/chat-emoji/${item.id}.svg`} alt={emoji} title={item.label} width={28} height={28} draggable={false} />;
}

export function EmojiText({ children }: { children: string }) {
  if (!graphemeSegmenter) return <>{children}</>;
  // Segment whole graphemes, so skin tones and joined emoji stay intact.
  const parts: ReactNode[] = [];
  let text = "";
  for (const { segment } of graphemeSegmenter.segment(children)) {
    if (byEmoji.has(segment.replaceAll("\ufe0f", ""))) {
      if (text) parts.push(text);
      text = "";
      parts.push(<ChatEmoji key={parts.length} emoji={segment} />);
    } else text += segment;
  }
  if (text) parts.push(text);
  return <>{parts}</>;
}
