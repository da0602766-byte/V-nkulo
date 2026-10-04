"use client";
import { useRef, useState, type ReactNode } from "react";
import FeedIcon from "./feed/FeedIcon";
import TransientFeedback from "./TransientFeedback";
import { prepareDeviceFile, savePreparedFile, syncFileToDrive } from "../lib/device-files";
import { storeLocalMedia } from "../lib/local-media";
import { MAX_COPY_BYTES } from "../lib/file-copy";
import "../file-saving.css";

export default function FileSaveActions({ source, name = "arquivo", file, ownerId, onSaved, downloadOnly = false, leadingAction, imageToolbar = false }: {
  source?: string; name?: string; file?: File; ownerId?: number; onSaved?: () => void; downloadOnly?: boolean; leadingAction?: ReactNode; imageToolbar?: boolean;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState<File | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean; reconnect?: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  async function run(action: "download" | "drive" | "local") {
    if (lock.current) return;
    lock.current = true;
    setBusy(action); setNotice(null); setReady(null); setRevision(value => value + 1);
    try {
      // Drive authorization is checked before loading a potentially large source.
      let currentOwner = ownerId;
      if (action !== "download") {
        const response = await fetch("/api/storage/preferences", { cache: "no-store" });
        const preferences = await response.json();
        if (!response.ok) throw new Error(preferences.error || "Entre na sua conta para continuar.");
        currentOwner = preferences.userId;
        if (action === "drive" && !preferences.google?.connected) {
          setNotice({ text: "Conecte seu Google Drive em Minha conta. Você pode baixar no aparelho sem conectar o Drive.", reconnect: true });
          return;
        }
      }
      const prepared = file || await prepareDeviceFile(source!, name);
      if (!prepared.size || prepared.size > MAX_COPY_BYTES) throw new Error("Escolha um arquivo de até 20 MB.");
      if (action === "download") {
        setReady(prepared);
        setNotice({ text: "Arquivo pronto. Toque em Salvar arquivo e escolha onde guardar no celular." });
      } else if (action === "drive") {
        const result = await syncFileToDrive(prepared);
        setNotice({ text: result.alreadySaved ? "Este arquivo já está salvo no seu Drive. Nenhuma cópia duplicada foi criada." : "Cópia conferida e salva no seu Google Drive." });
        onSaved?.();
      } else {
        if (!currentOwner) throw new Error("Entre na sua conta para guardar uma cópia.");
        await storeLocalMedia(prepared, currentOwner, true);
        window.dispatchEvent(new Event("vinkulo:files-changed"));
        setNotice({ text: "Cópia guardada neste navegador. Encontre em Minha conta → Fotos e arquivos. Use Baixar para guardar também fora do aplicativo." });
        onSaved?.();
      }
    } catch (error) {
      setNotice({ text: (error as Error).message || "Não foi possível preparar o arquivo. Tente novamente.", error: true, reconnect: (error as { reconnect?: boolean }).reconnect });
    } finally { lock.current = false; setBusy(""); }
  }
  async function save() {
    if (!ready || lock.current) return;
    lock.current = true;
    try {
      const result = await savePreparedFile(ready, source);
      setNotice({ text: result === "shared" ? "Arquivo enviado à opção escolhida no celular." : "Download solicitado. Confira a pasta Downloads do aparelho." });
      setReady(null);
    } catch (error) {
      if ((error as Error).name !== "AbortError") setNotice({ text: "O celular não abriu a opção de salvar. Toque em Salvar arquivo para tentar novamente.", error: true });
    } finally { lock.current = false; }
  }
  return <span className={`file-save-actions${imageToolbar ? " file-save-actions--image" : ""}`} aria-busy={Boolean(busy)}>
    {leadingAction}
    <button type="button" className={imageToolbar && ready ? "file-save-ready" : undefined} disabled={Boolean(busy)} title={ready ? "Salvar arquivo no aparelho" : "Baixar no aparelho"} onClick={() => void (imageToolbar && ready ? save() : run("download"))}>{imageToolbar && <FeedIcon name="download" />}<span>{busy === "download" ? "Preparando…" : imageToolbar ? (ready ? "Salvar arquivo" : "Baixar") : "Baixar no aparelho"}</span></button>
    {!downloadOnly && <>
      <button type="button" disabled={Boolean(busy)} title="Salvar no Google Drive" onClick={() => void run("drive")}>{imageToolbar && <FeedIcon name="drive" />}<span>{busy === "drive" ? "Salvando…" : imageToolbar ? "Google Drive" : "Salvar no Drive"}</span></button>
      {!source?.startsWith("/local-media/") && <button type="button" disabled={Boolean(busy)} title="Guardar uma cópia neste navegador" onClick={() => void run("local")}>{imageToolbar && <FeedIcon name="browser" />}<span>{busy === "local" ? "Guardando…" : imageToolbar ? "No navegador" : "Guardar no navegador"}</span></button>}
    </>}
    {ready && !imageToolbar && <button type="button" className="file-save-ready" onClick={() => void save()}>Salvar arquivo</button>}
    {notice && <TransientFeedback tone={notice.error ? "error" : ready || notice.reconnect ? "info" : "success"} noticeKey={`${source || file?.name}:${revision}`} durationMs={ready ? 12000 : undefined} onDismiss={() => setNotice(null)}>
      <strong>{ready ? "Download pronto" : notice.error ? "Não foi possível concluir" : "Fotos e arquivos"}</strong><p>{notice.text}</p>
      {ready && <button type="button" onClick={() => void save()}>Salvar arquivo</button>}
      {notice.reconnect && <a href="/painel?view=conta#storage-privacy-title">Conectar Drive</a>}
    </TransientFeedback>}
  </span>;
}
