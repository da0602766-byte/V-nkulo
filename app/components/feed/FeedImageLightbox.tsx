"use client";
import SafeImage from "../SafeImage";


import { useEffect, useRef, useState } from "react";

export default function FeedImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="feed-image-lightbox" aria-label="Imagem ampliada" onCancel={onClose} onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <header><span>Imagem da publicação</span><button type="button" autoFocus onClick={onClose} aria-label="Fechar imagem ampliada">× <span>Fechar</span></button></header>
      {failed ? <p role="alert">Não foi possível abrir a imagem. Feche e tente novamente.</p> : (
        // Full resolution is requested only after the user chooses to enlarge.
        <SafeImage src={src} alt={alt || "Imagem da publicação"} onError={() => setFailed(true)} />
      )}
    </dialog>
  );
}
