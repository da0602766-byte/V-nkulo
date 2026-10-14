"use client";
import { useEffect, useState } from "react";
type Config = { spreadsheet_id: string; habilitada: number; versao: number; versao_sincronizada: number; sincronizado_em: string | null; ultimo_erro: string | null };
export function VisitorSheetSettings({ canManage }: { canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!open || !canManage) return;
    const controller = new AbortController();
    fetch("/api/pilot/visitantes/planilha", { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao consultar a planilha.");
      setConfig(data.config);
      if (data.config) setUrl(`https://docs.google.com/spreadsheets/d/${data.config.spreadsheet_id}/edit`);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [open, canManage]);
  if (!canManage) return null;
  async function act(action: string) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/pilot/visitantes/planilha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, url }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
      if (action === "authorize") { window.location.assign(data.url); return; }
      if (action === "pause") { setConfig(c => c ? { ...c, habilitada: 0 } : c); setMessage("Sincronização pausada. A cópia existente continua no Google Drive."); }
      else { setConfig(data.config); setMessage(data.config?.ultimo_erro ? "Os cadastros estão salvos; a planilha precisa de atenção." : "Planilha atualizada."); }
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  return <details className="visitor-sheets-panel" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>Planilha Google · sincronização automática</summary>
    <p>Use uma planilha existente, restrita à equipe. A aba <strong>Vínkulo — Pessoas</strong> recebe todas as fichas desta comunidade, inclusive arquivadas. Faça as alterações no Vínkulo: edições nessa aba serão substituídas na próxima sincronização. As demais abas são preservadas.</p>
    <p>Após conectar, cada alteração entra na fila de sincronização. Falhas ficam pendentes para nova tentativa durante o uso do sistema. O cadastro permanece salvo mesmo se o Google estiver indisponível.</p>
    <form onSubmit={e => { e.preventDefault(); void act("connect"); }}>
      <label>Link da planilha<input type="url" value={url} onChange={e => setUrl(e.target.value)} required placeholder="https://docs.google.com/spreadsheets/d/…/edit" /></label>
      <div className="visitor-sheets-actions"><button type="button" disabled={busy} onClick={() => void act("authorize")}>1. Autorizar Planilhas Google</button><button disabled={busy}>{busy ? "Aguarde…" : "2. Conectar e sincronizar"}</button></div>
    </form>
    <p>A autorização do Google permite editar planilhas e consultar seus compartilhamentos. O Vínkulo usa somente o arquivo informado aqui. Compartilhe esse arquivo apenas com pessoas ou grupos autorizados; o login do site não controla os acessos concedidos no Google.</p>
    {config && <><p><strong>{config.habilitada ? config.versao > config.versao_sincronizada ? "Atualização pendente" : "Sincronizada" : "Pausada"}</strong>{config.sincronizado_em && ` · Última atualização: ${new Date(config.sincronizado_em.replace(" ", "T") + "Z").toLocaleString("pt-BR")}`}</p><div className="visitor-sheets-actions"><a href={`https://docs.google.com/spreadsheets/d/${config.spreadsheet_id}/edit`} target="_blank" rel="noreferrer">Abrir planilha</a>{Boolean(config.habilitada) && <><button type="button" disabled={busy} onClick={() => void act("sync")}>Sincronizar agora</button><button type="button" disabled={busy} onClick={() => void act("pause")}>Pausar</button></>}</div>{config.ultimo_erro && <p role="alert">{config.ultimo_erro}</p>}</>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </details>;
}
