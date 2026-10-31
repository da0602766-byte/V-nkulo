"use client";
import { authorizeGoogle } from '../lib/google-authorization-client';

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../storage-onboarding.css";

type StorageStatus = {
  needsOnboarding: boolean;
  googleAvailable: boolean;
  google: { connected: boolean } | null;
};

export default function StorageOnboarding({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/storage/preferences", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) { onComplete(); return; }
        const data = await response.json() as StorageStatus;
        if (controller.signal.aborted) return;
        if (data.needsOnboarding) setStatus(data);
        else onComplete();
      })
      .catch(() => { if (!controller.signal.aborted) onComplete(); });
    return () => controller.abort();
  }, [onComplete]);
  if (!status?.needsOnboarding) return null;
  return <StorageChoice status={status} onComplete={onComplete} />;
}

function StorageChoice({ status, onComplete }: { status: StorageStatus; onComplete: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current!;
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

  async function choose(provider: "LOCAL" | "GOOGLE_DRIVE") {
    if (busy) return;
    setBusy(true);
    setError("");
    if (provider === "GOOGLE_DRIVE" && !status.google?.connected) {
      // Consent is recorded by the OAuth callback only after successful authorization.
      try { await authorizeGoogle("/api/auth/google/start?purpose=drive&returnTo=%2Fpainel%3Fview%3Dconta"); }
      catch (error) { setError((error as Error).message); }
      finally { setBusy(false); }
      return;
    }
    try {
      const response = await fetch("/api/storage/preferences", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, autoLoadRecent: true, autoDownloadFiles: false }),
      });
      if (!response.ok) throw new Error("Não foi possível salvar sua escolha. Tente novamente.");
      onComplete();
    } catch {
      setError("Não foi possível salvar sua escolha. Verifique a conexão e tente novamente.");
    } finally { setBusy(false); }
  }

  return createPortal(<dialog ref={dialogRef} className="storage-onboarding" aria-labelledby="storage-choice-title"
    aria-describedby="storage-choice-description" onCancel={event => { event.preventDefault(); if (!busy) onComplete(); }}>
    <button className="storage-choice-close" type="button" aria-label="Decidir depois" disabled={busy} onClick={onComplete}>×</button>
    <span className="storage-choice-mark" aria-hidden="true">☁</span>
    <p className="storage-choice-eyebrow">BEM-VINDO À COMUNIDADE</p>
    <h2 id="storage-choice-title">Onde guardar suas fotos e arquivos?</h2>
    <p id="storage-choice-description">Conecte seu Google Drive para acessar seus arquivos pessoais em outros aparelhos ou mantenha-os somente neste celular. Você pode mudar essa escolha em Minha conta.</p>
    <div className="storage-choice-actions" aria-busy={busy}>
      <button type="button" autoFocus className="storage-choice-primary" disabled={busy || !status.googleAvailable} onClick={() => void choose("GOOGLE_DRIVE")}>Sincronizar Google Drive</button>
      <button type="button" disabled={busy} onClick={() => void choose("LOCAL")}>Manter no celular</button>
    </div>
    {!status.googleAvailable && <p>A conexão com o Google Drive ainda não foi ativada nesta plataforma.</p>}
    <small>Arquivos locais não são sincronizados e podem ser perdidos ao limpar os dados do aplicativo ou trocar de celular.</small>
    {error && <p className="storage-choice-error" role="alert">{error}</p>}
  </dialog>, document.body);
}
