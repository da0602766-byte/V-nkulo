"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useFeedDialog from "./feed/useFeedDialog";
import PrivateChatWorkspace from "./PrivateChatWorkspace";

export default function PrivateChatDock({ initialTargetUserId, onClose, onReadingChange, openSequence = 0 }: { initialTargetUserId: number | null; onClose: () => void; onReadingChange?: (userId: number | null) => void; openSequence?: number }) {
  const [mobile,setMobile] = useState(false);
  useEffect(()=>{const media=window.matchMedia("(max-width:760px)");const update=()=>setMobile(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  const closeMobile=useCallback(()=>onClose(),[onClose]);
  useFeedDialog(mobile?"chat-mobile":"",closeMobile,".chat-dock");
  const [minimized, setMinimized] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const minimizeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    minimizeRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const [openedFor, setOpenedFor] = useState({ initialTargetUserId, openSequence });
  if (openedFor.initialTargetUserId !== initialTargetUserId || openedFor.openSequence !== openSequence) {
    setOpenedFor({ initialTargetUserId, openSequence });
    setMinimized(false);
  }
  useEffect(() => {
    if (minimized) restoreRef.current?.focus();
    else (dockRef.current?.querySelector<HTMLButtonElement>('.private-chat-thread button[aria-label="Minimizar conversas"]') || minimizeRef.current)?.focus();
  }, [minimized]);
  if (typeof document === "undefined") return null;
  return createPortal(<div className="pilot-message-popover-backdrop chat-dock-layer">
    <section ref={dockRef} className={`pilot-message-popover chat-dock ${minimized ? "is-minimized" : ""}`} role={minimized ? "region" : "dialog"} aria-modal={mobile ? "true" : "false"} aria-label="Conversas privadas" onKeyDown={event => {
      if (event.key === "Escape" && !minimized) { event.stopPropagation(); if(mobile)onClose();else setMinimized(true); }
    }}>
      <header className="chat-dock-heading">
        {minimized ? <button ref={restoreRef} className="chat-restore" type="button" onClick={() => setMinimized(false)} aria-label="Restaurar conversas"><span className="chat-dock-brand" aria-hidden="true">✦</span><span><strong>Conversas</strong><small>Toque para continuar</small></span><span aria-hidden="true">↗</span></button> : <><div className="chat-dock-title"><span className="chat-dock-brand" aria-hidden="true">✦</span><div><h2>Conversas</h2><p>Mais perto, mesmo de longe</p></div></div><div className="chat-dock-actions"><button ref={minimizeRef} type="button" onClick={() => setMinimized(true)} aria-label="Minimizar conversas" title="Minimizar"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button></div></>}
        <button className="chat-dock-close" type="button" onClick={onClose} aria-label="Fechar mensagens" title="Fechar">×</button>
      </header>
      <div className="chat-dock-content" hidden={minimized}>
        <PrivateChatWorkspace initialTargetUserId={initialTargetUserId} openSequence={openSequence} visible={!minimized} onReadingChange={onReadingChange} onMinimize={() => mobile ? onClose() : setMinimized(true)} onClose={onClose} />
      </div>
    </section>
  </div>, document.body);
}
