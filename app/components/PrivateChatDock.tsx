"use client";
import { useEffect, useRef, useState } from "react";
import PrivateChatWorkspace from "./PrivateChatWorkspace";

export default function PrivateChatDock({ initialTargetUserId, onClose }: { initialTargetUserId: number | null; onClose: () => void }) {
  const [minimized, setMinimized] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const minimizeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    minimizeRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { setMinimized(false); }, [initialTargetUserId]);
  useEffect(() => {
    if (minimized) restoreRef.current?.focus();
    else minimizeRef.current?.focus();
  }, [minimized]);
  return <div className="pilot-message-popover-backdrop chat-dock-layer">
    <section ref={dockRef} className={`pilot-message-popover chat-dock ${minimized ? "is-minimized" : ""}`} role={minimized ? "region" : "dialog"} aria-modal="false" aria-label="Conversas privadas" onKeyDown={event => {
      if (event.key === "Escape" && !minimized) { event.stopPropagation(); setMinimized(true); }
    }}>
      <header className="chat-dock-heading">
        {minimized ? <button ref={restoreRef} className="chat-restore" type="button" onClick={() => setMinimized(false)} aria-label="Restaurar conversas"><span className="chat-dock-brand" aria-hidden="true">✦</span><span><strong>Conversas</strong><small>Toque para continuar</small></span><span aria-hidden="true">↗</span></button> : <><div className="chat-dock-title"><span className="chat-dock-brand" aria-hidden="true">✦</span><div><h2>Conversas</h2><p>Mais perto, mesmo de longe</p></div></div><div className="chat-dock-actions"><button ref={minimizeRef} type="button" onClick={() => setMinimized(true)} aria-label="Minimizar conversas" title="Minimizar"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button></div></>}
        <button className="chat-dock-close" type="button" onClick={onClose} aria-label="Fechar mensagens" title="Fechar">×</button>
      </header>
      <div className="chat-dock-content" hidden={minimized}>
        <PrivateChatWorkspace initialTargetUserId={initialTargetUserId} visible={!minimized} />
      </div>
    </section>
  </div>;
}
