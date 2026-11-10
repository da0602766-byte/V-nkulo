"use client";

import { useEffect, useRef, useState } from "react";
type Status = { configured: boolean; projectId: string; clientEmail: string | null; checkedAt: string | null; myDevices: number };
const endpoint = "/api/proprietario/integracoes/firebase";
export default function FirebaseIntegrationForm() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar o Firebase.");
      if (!controller.signal.aborted) setStatus(result);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  async function action(method: string, payload: unknown) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir a solicitação.");
      if (typeof result.configured === "boolean") setStatus(result);
      setMessage(result.message || (method === "DELETE" ? "Firebase desconectado." : "Credencial verificada. O servidor está autorizado a enviar notificações."));
      window.dispatchEvent(new Event("vinkulo:firebase-status"));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha de conexão."); }
    finally { setBusy(false); setRemoving(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file || file.size > 16_384 || !confirmed) { setError("Selecione o JSON da conta de serviço (até 16 KB) e marque a autorização."); return; }
    setBusy(true); setError("");
    try { await action("PATCH", { credential: await file.text(), confirm: true }); }
    catch { setError("Não foi possível ler o arquivo selecionado."); setBusy(false); }
    finally { if (fileInput.current) fileInput.current.value = ""; setSelected(false); setConfirmed(false); }
  }
  return <section className="ops-panel oi-firebase" aria-label="Configuração Firebase">
    <h3>Notificações Android com Firebase</h3>
    <p>Selecione a chave da conta de serviço do projeto <strong>vinkulo-256e8</strong>. O arquivo será enviado por HTTPS e guardado cifrado no servidor. A chave não será exibida novamente.</p>
    <ol><li>Abra <a href="https://console.firebase.google.com/project/vinkulo-256e8/settings/serviceaccounts/adminsdk" target="_blank" rel="noopener noreferrer">Contas de serviço no Firebase</a>.</li>
      <li>Toque em “Gerar nova chave privada” e salve o JSON nos Downloads do celular.</li><li>Selecione esse arquivo abaixo e toque em “Verificar e salvar”.</li></ol>
    <p>Use a chave da conta de serviço. O arquivo google-services.json usado no APK é diferente.</p>
    {status && <dl><div><dt>Estado</dt><dd>{status.configured ? "Credencial cadastrada" : "Aguardando credencial"}</dd></div>
      <div><dt>Última verificação</dt><dd>{status.checkedAt ? new Date(status.checkedAt).toLocaleString("pt-BR") : "Ainda não verificado"}</dd></div>
      <div><dt>Meus aparelhos registrados</dt><dd>{status.myDevices}</dd></div></dl>}
    <form onSubmit={event => void save(event)}>
      <label htmlFor="firebase-key-file">Arquivo JSON da conta de serviço</label>
      <input ref={fileInput} id="firebase-key-file" type="file" accept=".json,application/json" disabled={busy} onChange={event => { setSelected(!!event.target.files?.length); setError(""); }} />
      <label className="oi-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Autorizo o Vínkulo a usar esta credencial para enviar notificações Android.</label>
      <button type="submit" className="oc-button" disabled={busy || !selected || !confirmed}>{busy ? "Processando…" : "Verificar e salvar"}</button>
    </form>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {status?.configured && <div className="oi-actions"><button className="oc-button" disabled={busy} onClick={() => void action("POST", { action: "verify" })}>Verificar acesso</button>
      <button className="oc-button" disabled={busy || !status.myDevices} onClick={() => void action("POST", { action: "test-device" })}>Enviar teste ao meu APK</button>
      <button className="oc-button" disabled={busy} onClick={() => setRemoving(value => !value)}>Desconectar Firebase</button></div>}
    {removing && <div role="alert"><p>A desconexão interrompe novos envios pelo Firebase. Ela não remove seu projeto nem revoga a chave no Google.</p><button className="oc-button" disabled={busy} onClick={() => void action("DELETE", { confirm: "REMOVER_FIREBASE" })}>Confirmar desconexão</button></div>}
    <p>Após cadastrar a credencial, <a href="/downloads/VINKULO_ANDROID_1.24.0_HOMOLOGACAO.apk" download>baixe e instale o APK 1.24.0</a>, permita notificações e entre na sua conta. Abra esta configuração dentro do APK e use o botão de teste para confirmar o recebimento no aparelho.</p>
  </section>;
}
