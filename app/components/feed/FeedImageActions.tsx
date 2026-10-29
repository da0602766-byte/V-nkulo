"use client";

import { useEffect, useId, useRef, useState } from "react";
import FileSaveActions from "../FileSaveActions";
import FeedIcon from "./FeedIcon";
import "./feed-image-actions.css";

export default function FeedImageActions({ source, overlay, canEnlarge, onView }: {
  source: string;
  overlay: boolean;
  canEnlarge: boolean;
  onView: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    if (!panel) return;
    const overflow = document.body.style.overflow;
    panel.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      panel.close();
      document.body.style.overflow = overflow;
    };
  }, [open]);

  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  return <>
    <button ref={trigger} type="button"
      className={`feed-image-options-trigger${overlay ? " is-overlay" : ""}`}
      title="Opções da imagem" aria-label="Opções da imagem"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      {!overlay && <span>Opções da imagem</span>}
    </button>
    <dialog ref={dialog} id={id} className="feed-image-options-dialog"
      aria-labelledby={`${id}-title`} onCancel={close} onClose={() => setOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="feed-image-options-content">
        <header>
          <div><h2 id={`${id}-title`}>Opções da imagem</h2><p>Escolha o que deseja fazer</p></div>
          <button type="button" className="feed-image-options-close" onClick={close} aria-label="Fechar opções da imagem"><FeedIcon name="close" /></button>
        </header>
        <FileSaveActions source={source} name="imagem-da-publicacao" imageToolbar inlineFeedback leadingAction={
          <button type="button" autoFocus onClick={() => { close(); onView(); }}>
            <FeedIcon name={canEnlarge ? "expand" : "image"} /><span>{canEnlarge ? "Ampliar" : "Visualizar imagem"}</span>
          </button>
        } />
      </div>
    </dialog>
  </>;
}
