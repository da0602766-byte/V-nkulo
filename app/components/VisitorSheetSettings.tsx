"use client";
import {useBrowserSearch} from "./useBrowserSearch";
import { useEffect, useRef, useState } from "react";

type Config = { spreadsheet_id: string; sheet_id: number; habilitada: number; versao: number; versao_sincronizada: number; linhas: number; sincronizado_em: string | null; ultimo_erro: string | null };
type Snapshot = { config: Config | null; google: { authorized: boolean; available: boolean; email: string | null }; communityId: number; userId: number };
const endpoint = "/api/pilot/visitantes/planilha";
const pendingKey = (data: Snapshot) => `vinkulo:sheet-setup:${data.communityId}:${data.userId}`;

export function VisitorSheetSettings({ canManage }: { canManage: boolean }) {
  const search=useBrowserSearch();
  const [selectedOpen,setOpen]=useState<boolean|null>(null);
  const hasSetup=new URLSearchParams(search).has("sheetSetup");
  if(selectedOpen===null&&hasSetup)setOpen(true);
  const open=selectedOpen??hasSetup;
  const [data, setData] = useState<Snapshot | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [helpUrl, setHelpUrl] = useState("");
  const [message, setMessage] = useState("");
  const working = useRef(false);
  const resumed = useRef(false);
  useEffect(() => {
    if (!open || !canManage) return;
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar a conexão.");
      if (controller.signal.aborted) return;
      const snapshot = result as Snapshot;
      setData(snapshot);
      if (snapshot.config) setUrl(`https://docs.google.com/spreadsheets/d/${snapshot.config.spreadsheet_id}/edit`);
      const params = new URLSearchParams(window.location.search);
      const outcome = params.get("sheetSetup");
      if (!outcome || resumed.current) return;
      resumed.current = true;
      let pending: { url?: string; at?: number } | null = null;
      try { pending = JSON.parse(sessionStorage.getItem(pendingKey(snapshot)) || "null"); sessionStorage.removeItem(pendingKey(snapshot)); } catch { /* A conexão manual continua disponível. */ }
      const clean = new URL(window.location.href);
      for (const key of ["sheetSetup", "google", "googleErro"]) clean.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", clean);
      if (outcome === "error") { setError(params.get("googleErro") || "A autorização não foi concluída. Tente conectar novamente."); return; }
      if (!snapshot.google.authorized) { setError("O Google voltou sem todas as permissões necessárias. Conecte novamente e permita o acesso às planilhas e aos compartilhamentos."); return; }
      if (pending?.url && pending.at && Date.now() - pending.at < 15 * 60_000) { setUrl(pending.url); void act("connect", pending.url, snapshot); }
      else setMessage("Conta Google autorizada. Confirme o link abaixo para concluir a conexão.");
    }).catch(caught => { if (!controller.signal.aborted) setError(caught.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // A continuação do OAuth é consumida uma vez, depois de consultar a conta atual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canManage]);

  async function act(action: string, selectedUrl = url, snapshot = data) {
    if (working.current || !snapshot) return;
    working.current = true; setBusy(action); setError(""); setHelpUrl(""); setMessage("");
    const request = async (kind: string) => {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: kind, url: selectedUrl }) });
      const result = await response.json();
      if (!response.ok) { setHelpUrl(result.helpUrl || ""); throw new Error(result.error || "Não foi possível concluir. Tente novamente."); }
      return result;
    };
    try {
      const result = await request(action);
      if (action === "authorize" || result.authorizationRequired) {
        const authorization = action === "authorize" ? result : await request("authorize");
        sessionStorage.setItem(pendingKey(snapshot), JSON.stringify({ url: selectedUrl, at: Date.now() }));
        window.location.assign(authorization.url); return;
      }
      if (action === "pause") {
        setData(current => current ? { ...current, config: current.config ? { ...current.config, habilitada: 0 } : null } : current);
        setMessage("Atualizações pausadas. A planilha continua no Google.");
      } else {
        setData(result);
        if (!result.config?.ultimo_erro && result.config?.sincronizado_em) setMessage(`Envio concluído: ${Math.max(0, result.config.linhas - 1)} ficha(s) na aba Vínkulo — Pessoas.`);
      }
    } catch (caught) {
      setError((caught as Error).message);
      try { const response = await fetch(endpoint, { cache: "no-store" }); if (response.ok) setData(await response.json()); } catch { /* Mantém o diagnóstico original. */ }
    } finally { working.current = false; setBusy(""); }
  }
  if (!canManage) return null;
  const config = data?.config;
  const failure = error || config?.ultimo_erro;
  const active = Boolean(config?.habilitada);
  const pending = Boolean(config && config.versao > config.versao_sincronizada);
  const status = failure ? "Precisa de atenção" : active ? pending ? "Atualização pendente" : "Sincronizada" : config?.sincronizado_em ? "Pausada" : "Não conectada";
  const ready = data?.google.available && !loading && !busy;
  const lastSync = config?.sincronizado_em ? new Date(config.sincronizado_em.replace(" ", "T") + "Z").toLocaleString("pt-BR") : null;
  return <details className="visitor-sheets-panel visitor-sheets-v2" open={open} onToggle={event => { if (event.target === event.currentTarget) { if(event.currentTarget.open&&!open)setLoading(true);setOpen(event.currentTarget.open); } }}>
    <summary><span className="visitor-sheets-icon" aria-hidden="true">▤</span><span><strong>Planilha Google</strong><small>Uma cópia dos cadastros, atualizada pelo Vínkulo</small></span><span className="visitor-sheets-status" data-state={failure ? "error" : active && !pending ? "success" : "idle"}>{data ? status : "Configurar"}</span></summary>
    {open && <div className="visitor-sheets-body">
      {loading ? <p role="status">Verificando a conexão…</p> : <>
        <div className="visitor-sheets-overview"><div><h3>{active ? "Seus cadastros conectados" : config?.sincronizado_em ? "Retome as atualizações" : "Conecte sua planilha"}</h3><p>{active ? "Cadastre e edite no Vínkulo. As alterações seguem para a planilha automaticamente." : "Cole o link de uma planilha em que sua conta Google tenha acesso de edição."}</p></div>{data?.google.email && <div className="visitor-sheets-account"><small>Conta Google</small><strong>{data.google.email}</strong></div>}</div>
        {failure && <div className="visitor-sheets-feedback" role="alert"><strong>Não foi possível concluir</strong><p>{failure}</p>{helpUrl && <a href={helpUrl} target="_blank" rel="noreferrer">Abrir configuração da API no Google ↗</a>}</div>}
        {data && !data.google.available && <p role="alert">A integração Google ainda precisa ser configurada pelo administrador da plataforma.</p>}
        {!active && <form onSubmit={event => { event.preventDefault(); void act("connect"); }}>
          <label htmlFor="visitor-sheet-url">Link da planilha<input id="visitor-sheet-url" type="url" value={url} onChange={event => setUrl(event.target.value)} required autoComplete="off" placeholder="Cole aqui o link do Google Planilhas" disabled={Boolean(busy)} /></label>
          <p className="visitor-sheets-hint">Usaremos a aba <strong>Vínkulo — Pessoas</strong>. As outras abas serão preservadas. A planilha deve estar restrita às pessoas autorizadas da equipe.</p>
          <div className="visitor-sheets-actions"><button className="visitor-sheets-primary" disabled={!ready}>{busy ? "Conectando e enviando…" : config?.sincronizado_em ? "Retomar sincronização" : "Conectar planilha"}</button><small>{data?.google.authorized ? "A conta já está autorizada. Vamos verificar o arquivo e enviar as fichas." : "Se necessário, você autorizará no Google e voltará para concluir o envio."}</small></div>
        </form>}
        {config?.sincronizado_em && <div className="visitor-sheets-result"><div><small>Último envio concluído</small><strong>{lastSync}</strong></div><div><small>Fichas enviadas</small><strong>{Math.max(0, config.linhas - 1)}</strong></div><a href={`https://docs.google.com/spreadsheets/d/${config.spreadsheet_id}/edit#gid=${config.sheet_id}`} target="_blank" rel="noreferrer">Ver dados na planilha ↗</a></div>}
        {active && <div className="visitor-sheets-actions"><button className="visitor-sheets-primary" disabled={Boolean(busy)} onClick={() => void act("sync")}>{busy === "sync" ? "Atualizando…" : "Atualizar planilha agora"}</button><button disabled={Boolean(busy)} onClick={() => void act("pause")}>Pausar atualizações</button></div>}
        <details className="visitor-sheets-help"><summary>Como funciona e opções da conexão</summary><p>Enviamos todas as fichas desta comunidade, inclusive arquivadas. Altere os dados no Vínkulo: mudanças manuais na aba dedicada serão substituídas. Em caso de falha, novas tentativas acontecem durante o uso do sistema; você também pode atualizar manualmente.</p><p>A autorização permite editar planilhas e verificar seus compartilhamentos. O Vínkulo usa o arquivo informado. Ao pausar ou trocar, a cópia anterior permanece no Google.</p><div className="visitor-sheets-actions"><button disabled={!ready || !url} onClick={() => void act("authorize")}>Autorizar conta Google novamente</button>{config && !active && <button disabled={Boolean(busy)} onClick={() => setUrl("")}>Usar outra planilha</button>}</div></details>
        {message && <p className="visitor-sheets-success" role="status">{message}</p>}
        {!data && <button onClick={() => setOpen(false)}>Fechar e tentar novamente</button>}
      </>}
    </div>}
  </details>;
}
