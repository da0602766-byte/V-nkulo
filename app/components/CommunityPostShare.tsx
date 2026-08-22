"use client";

import { useMemo, useState } from "react";

export default function CommunityPostShare({
  postId,
  title,
  content,
  imageUrl,
  links,
}: {
  postId: number;
  title: string;
  content: string;
  imageUrl?: string;
  links: string[];
}) {
  const [feedback, setFeedback] = useState("");
  const shareData = useMemo(() => {
    if (typeof window === "undefined") return { pageUrl: "", image: "", message: "" };
    const pageUrl = `${window.location.origin}/compartilhar/publicacao/${postId}`;
    const image = imageUrl ? new URL(imageUrl, window.location.origin).toString() : "";
    const excerpt = content.trim().replace(/\s+/g, " ").slice(0, 320);
    const eventLinks = links.length
      ? `\n\nLinks do evento:\n${links.map((link) => `• ${link}`).join("\n")}`
      : "";
    return {
      pageUrl,
      image,
      message: `📣 ${title}\n${pageUrl}\n\n${excerpt}${eventLinks}`,
    };
  }, [content, imageUrl, links, postId, title]);

  async function nativeShare() {
    setFeedback("");
    try {
      const files: File[] = [];
      if (shareData.image) {
        const response = await fetch(shareData.image);
        if (response.ok) {
          const blob = await response.blob();
          files.push(new File([blob], `publicacao-${postId}.webp`, { type: blob.type || "image/webp" }));
        }
      }
      const payload: ShareData = { title, text: shareData.message };
      if (files.length && navigator.canShare?.({ files })) payload.files = files;
      if (!navigator.share) throw new Error("Compartilhamento nativo indisponível.");
      await navigator.share(payload);
      setFeedback(files.length && payload.files ? "Imagem e mensagem preparadas." : "Mensagem preparada para compartilhamento.");
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      await copyMessage();
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(shareData.message);
      setFeedback("Mensagem e link com prévia da imagem copiados.");
    } catch {
      setFeedback("Não foi possível copiar automaticamente.");
    }
  }

  function open(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <details className="community-post-share">
      <summary aria-label="Compartilhar publicação" title="Compartilhar publicação">
        <PaperPlaneIcon />
      </summary>
      <div>
        <header><PaperPlaneIcon /><div><strong>Compartilhar publicação</strong><p>Escolha onde enviar ou copie a mensagem pronta.</p></div></header>
        <div className="community-post-share-grid">
          <button type="button" onClick={() => void nativeShare()}><span aria-hidden="true">✦</span>Mais aplicativos</button>
          <button type="button" onClick={() => open(`https://wa.me/?text=${encodeURIComponent(shareData.message)}`)}><span aria-hidden="true">◉</span>WhatsApp</button>
          <button type="button" onClick={() => open(`https://t.me/share/url?url=${encodeURIComponent(shareData.pageUrl)}&text=${encodeURIComponent(shareData.message)}`)}><span aria-hidden="true">➤</span>Telegram</button>
          <button type="button" onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.pageUrl)}`)}><span aria-hidden="true">f</span>Facebook</button>
          <button type="button" className="copy" onClick={() => void copyMessage()}><span aria-hidden="true">⧉</span>Copiar mensagem</button>
        </div>
        {feedback && <small role="status">{feedback}</small>}
      </div>
    </details>
  );
}

function PaperPlaneIcon() {
  return (
    <svg className="paper-plane-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
