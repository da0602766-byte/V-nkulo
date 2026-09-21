"use client";
import { useCallback, useEffect, useState } from "react";
import type { publicIntegration } from "../lib/supabase-integration";

type PublicIntegration = ReturnType<typeof publicIntegration>;
const empty = {ambiente:"PRODUCAO",url:"",projectRef:"",anonKey:"",schema:"public",bucket:"",ativa:false,serviceRoleKey:"",jwtSecret:""};
export default function SupabaseIntegrationForm() {
  const [form,setForm] = useState(empty);
  const [saved,setSaved] = useState<PublicIntegration | null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [updated,setUpdated] = useState("");
  const [check,setCheck] = useState<PublicIntegration["lastCheck"]>(null);
  const apply = useCallback((data: {integration:PublicIntegration | null; updatedAt?:string; updatedBy?:string}) => {
    setSaved(data.integration);
    setForm(data.integration ? {...data.integration,serviceRoleKey:"",jwtSecret:""} : empty);
    setUpdated(data.updatedAt ? data.updatedAt + " · usuário " + data.updatedBy : "");
    setCheck(data.integration?.lastCheck || null);
  },[]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response=await fetch("/api/proprietario/integracoes/supabase",{cache:"no-store"});
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || "A configuração do Supabase está indisponível.");
      apply(data);
    } catch (failure) {setError(failure instanceof Error ? failure.message : "Não foi possível conectar ao Vínkulo para ler a integração.");}
    finally {setLoading(false);}
  },[apply]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return ()=>clearTimeout(timer);},[load]);
  async function save() {
    if (!window.confirm("Salvar estas configurações da integração Supabase?")) return;
    setBusy(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/proprietario/integracoes/supabase",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,confirm:true})});
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a conexão.");
      apply(data);setNotice("Conexão salva. Os segredos permanecem protegidos no servidor.");
    } catch(failure){setError(failure instanceof Error ? failure.message : "A gravação não foi confirmada. Recarregue a configuração antes de tentar novamente.");}
    finally {setBusy(false);setForm(current=>({...current,serviceRoleKey:"",jwtSecret:""}));}
  }
  async function remove() {
    if (!window.confirm("Remover a configuração Supabase e os segredos salvos no Vínkulo? Os dados do projeto Supabase não serão apagados.")) return;
    setBusy(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/proprietario/integracoes/supabase",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:"REMOVER_INTEGRACAO_SUPABASE"})});
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível remover a conexão.");
      apply(data);setNotice("Configuração removida.");
    } catch(failure){setError(failure instanceof Error ? failure.message : "A remoção não foi confirmada. Atualize para conferir o estado.");}
    finally {setBusy(false);}
  }
  async function testConnection() {
    if (!window.confirm("Executar agora uma verificação de leitura no projeto Supabase configurado?")) return;
    setBusy(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/proprietario/integracoes/supabase/test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:true})});
      const data=await response.json();
      if (data.check) setCheck(data.check);
      if (!response.ok) throw new Error(data.check?.message || data.error || "A conexão não foi validada.");
      setNotice(data.check.message);
    } catch(failure){setError(failure instanceof Error ? failure.message : "O teste da conexão não pôde ser concluído.");}
    finally {setBusy(false);}
  }
  return <section className="publication-panel" aria-busy={loading || busy}>
    <h3>Conexão com o Supabase</h3>
    <p>Configure o projeto para verificar a disponibilidade dos serviços. A conexão não transfere dados nem altera o login do Vínkulo.</p>
    <div aria-live="polite">{loading && <p>Consultando a configuração protegida do Supabase…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</div>
    {!loading && <>
      {!saved && <p>Nenhuma conexão cadastrada. A integração começa desligada.</p>}
      {updated && <p>Última alteração: {updated}</p>}
      {check && <div className={`publication-check ${check.ok ? "success" : "danger"}`} role="status"><strong>{check.ok ? "Conexão verificada" : "Verificação com falha"}</strong><p>{check.message}</p><small>{check.latencyMs} ms · Auth {check.authStatus || "sem resposta"} · REST {check.restStatus || "sem resposta"}{check.storageStatus !== null ? ` · Storage ${check.storageStatus}` : ""} · {new Date(check.checkedAt).toLocaleString("pt-BR")}</small></div>}
      <form onSubmit={event=>{event.preventDefault();void save();}}>
        <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}>
          <div className="publication-fields">
            <label htmlFor="supabase-ambiente">Ambiente<select id="supabase-ambiente" value={form.ambiente} onChange={e=>setForm({...form,ambiente:e.target.value})}><option value="PRODUCAO">Produção</option><option value="HOMOLOGACAO">Homologação</option></select></label>
            {([{key:"url",label:"URL do projeto",type:"url",required:true},{key:"projectRef",label:"Referência do projeto",type:"text"},{key:"anonKey",label:"Chave pública (anon)",type:"text",required:true},{key:"serviceRoleKey",label:"Chave secreta do servidor",type:"password",required:!saved?.serviceRoleKey.defined},{key:"jwtSecret",label:"Segredo do JWT (opcional)",type:"password"},{key:"schema",label:"Schema padrão",type:"text"},{key:"bucket",label:"Bucket do Storage (opcional)",type:"text"}] as const).map(field=><label key={field.key} htmlFor={"supabase-"+field.key}>{field.label}<input id={"supabase-"+field.key} type={field.type} value={form[field.key]} required={"required" in field && field.required} autoComplete={field.type==="password" ? "new-password" : "off"} maxLength={4096} spellCheck={false} onChange={e=>setForm({...form,[field.key]:e.target.value})}/>{field.type==="password" && <small>{saved?.[field.key as "serviceRoleKey" | "jwtSecret"].defined ? "Configurado: " + saved[field.key as "serviceRoleKey" | "jwtSecret"].mask + ". Deixe vazio para manter." : "Ainda não configurado."}</small>}</label>)}
          </div>
          <label className="publication-toggle" htmlFor="supabase-ativa"><input id="supabase-ativa" type="checkbox" checked={form.ativa} onChange={e=>setForm({...form,ativa:e.target.checked})}/>Integração ativa</label>
          <p className="sensitive-action-note">Com a integração desligada, nenhuma chamada ao Supabase é feita. A chave secreta é cifrada no servidor e nunca é devolvida ao navegador.</p>
          <div className="publication-actions"><button type="submit">{busy ? "Aguarde…" : "Salvar conexão"}</button>{saved && <button type="button" className="secondary" onClick={()=>void testConnection()}>Testar conexão</button>}<button type="button" className="secondary" onClick={()=>void load()}>Recarregar configuração</button>{saved && <button type="button" className="danger" onClick={()=>void remove()}>Remover conexão</button>}</div>
        </fieldset>
      </form>
    </>}
  </section>;
}
