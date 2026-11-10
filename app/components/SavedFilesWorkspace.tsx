"use client";
import { useEffect, useRef, useState } from "react";
import FileSaveActions from "./FileSaveActions";
import TransientFeedback from "./TransientFeedback";
import { listLocalMedia, type LocalMedia } from "../lib/local-media";
import { syncFileToDrive } from "../lib/device-files";

type DriveCopy = { hash: string; id: string; name: string; size: number; type: string };
export default function SavedFilesWorkspace({ userId, profile, connected }: { userId: number; profile: string; connected: boolean }) {
  const [local, setLocal] = useState<LocalMedia[]>([]);
  const [drive, setDrive] = useState<DriveCopy[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [tab, setTab] = useState<"local" | "drive">("local");
  const [selected, setSelected] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("");
  const syncing = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);
  async function loadDrive(cursor?: string) {
    const response = await fetch(`/api/storage/copies${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível listar o Drive.");
    setDrive(current => cursor ? [...current, ...result.files.filter((file: DriveCopy) => !current.some(item => item.hash === file.hash))] : result.files);
    setNext(result.next || null);
  }
  useEffect(() => {
    const refresh = async () => {
      setLoading(true);
      const results = await Promise.allSettled([
        listLocalMedia(userId, profile).then(setLocal),
        connected ? loadDrive() : Promise.resolve().then(() => { setDrive([]); setNext(null); }),
      ]);
      const failures = results.filter(result => result.status === "rejected");
      setError(failures.length ? "Alguns arquivos não puderam ser carregados. Verifique a conexão e se o navegador permite armazenamento local." : "");
      setLoading(false);
    };
    void refresh();
    window.addEventListener("vinkulo:files-changed", refresh);
    return () => window.removeEventListener("vinkulo:files-changed", refresh);
  }, [userId, profile, connected]);
  async function syncLocal() {
    if (syncing.current) return;
    syncing.current = true; setIsSyncing(true); setError("");
    let completed = 0;
    try {
      for (const record of local) {
        setProgress(`Sincronizando ${completed + 1} de ${local.length}…`);
        await syncFileToDrive(new File([record.blob], record.name, { type: record.type }), false);
        completed++;
      }
      setProgress(`${completed} arquivo(s) conferidos no Drive. As cópias locais foram mantidas.`);
    } catch (cause) {
      setProgress("");
      setError(`${completed} de ${local.length} concluídos. ${(cause as Error).message} Você pode tentar novamente sem duplicar os arquivos já enviados.`);
    } finally { syncing.current = false; setIsSyncing(false); window.dispatchEvent(new Event("vinkulo:files-changed")); }
  }
  return <section className="saved-files-workspace" data-page-loading={loading && !local.length && !drive.length || undefined} aria-labelledby="saved-files-title">
    <header><div><h3 id="saved-files-title">Fotos e arquivos</h3><p>Baixe no celular sem precisar do Drive ou salve uma cópia na sua Conta Google.</p></div>
      <button type="button" disabled={loading || isSyncing} onClick={() => window.dispatchEvent(new Event("vinkulo:files-changed"))}>Atualizar lista</button></header>
    <p>Nas fotos do mural e nos PDFs, use as opções de salvar. Guardar no navegador permite recuperar a cópia neste aparelho; baixar permite guardar na pasta Arquivos ou Downloads.</p>
    <label className="saved-file-upload"><strong>Adicionar arquivo deste aparelho</strong><small>Até 20 MB por arquivo. Escolha o destino após selecionar.</small>
      <input type="file" disabled={isSyncing} onChange={event => { setSelected(event.target.files?.[0] || null); event.target.value = ""; }} />
    </label>
    {selected && <div className="saved-file-row"><strong>{selected.name}</strong><FileSaveActions key={`${selected.name}:${selected.lastModified}`} file={selected} ownerId={userId} /><button type="button" onClick={() => setSelected(null)}>Fechar seleção</button></div>}
    {profile && !profile.startsWith("/local-media/") && <div className="saved-file-row"><strong>Sua foto de perfil</strong><FileSaveActions source={profile} name="foto-de-perfil" ownerId={userId} /></div>}
    <div className="saved-files-tabs" aria-label="Destino dos arquivos"><button type="button" aria-pressed={tab === "local"} onClick={() => setTab("local")}>Neste navegador · {local.length}</button><button type="button" aria-pressed={tab === "drive"} onClick={() => setTab("drive")}>Cópias no Drive</button></div>
    {loading && <p role="status">Carregando arquivos…</p>}
    {tab === "local" ? <>
      {local.length > 0 && connected && <button type="button" disabled={isSyncing} onClick={() => void syncLocal()}>{isSyncing ? "Sincronizando…" : `Sincronizar ${local.length} arquivo(s) com o Drive`}</button>}
      {!loading && !local.length && <p>Nenhuma cópia guardada neste navegador. Use “Guardar no navegador” em uma foto ou arquivo.</p>}
      {local.map(record => <div className="saved-file-row" key={record.id}><div><strong>{record.name}</strong><small>{sizeLabel(record.size)} · Guardado neste aparelho</small></div><FileSaveActions source={`/local-media/${record.id}`} name={record.name} ownerId={userId} /></div>)}
      <small>Limpar os dados do navegador pode apagar estas cópias. Faça o download ou sincronize com o Drive para conservá-las.</small>
    </> : <>
      {!connected ? <p>Conecte o Drive abaixo para guardar cópias e acessá-las em outros aparelhos. O download no celular continua disponível.</p> : !loading && !drive.length ? <p>Nenhuma cópia enviada por esta opção ainda.</p> : null}
      {drive.map(record => <div className="saved-file-row" key={record.hash}><div><strong>{record.name}</strong><small>{sizeLabel(record.size)} · Cópia no Drive</small></div><FileSaveActions source={`/api/storage/copies?file=${record.hash}`} name={record.name} downloadOnly /><a href={`https://drive.google.com/file/d/${encodeURIComponent(record.id)}/view`} target="_blank" rel="noopener noreferrer">Abrir no Drive</a></div>)}
      {next && <button type="button" disabled={loading} onClick={() => { setLoading(true); void loadDrive(next).catch(cause => setError(cause.message)).finally(() => setLoading(false)); }}>Carregar mais</button>}
    </>}
    <p>Sincronização de cópias: arquivos iguais são reaproveitados; conteúdos diferentes são guardados separadamente. Alterações no Drive não substituem publicações ou cadastros do sistema.</p>
    {progress && <TransientFeedback tone="info" onDismiss={() => { if (!syncing.current) setProgress(""); }}>{progress}</TransientFeedback>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
function sizeLabel(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
