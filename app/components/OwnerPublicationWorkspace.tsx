"use client";

import { useCallback, useEffect, useState } from "react";
import SupabaseIntegrationForm from "./SupabaseIntegrationForm";
import SupabaseTenantFoundation from "./SupabaseTenantFoundation";
import SupabaseTenantCatalog from "./SupabaseTenantCatalog";
import SupabaseProfileCatalog from "./SupabaseProfileCatalog";
import SupabaseMembershipCatalog from "./SupabaseMembershipCatalog";
import SupabaseReadBenchmark from "./SupabaseReadBenchmark";
import SupabaseAutoSync from "./SupabaseAutoSync";

type Audit = { id: number; evento: string; resultado: string; criado_em: string; usuario_nome?: string };
type ConnectionState = { ativa?: boolean; lastCheck?: { ok: boolean; checkedAt: string } | null } | null;

export default function OwnerPublicationWorkspace() {
  const [audit, setAudit] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<ConnectionState>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/proprietario", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "Esta área é exclusiva do proprietário do sistema." : "Não foi possível consultar a trilha de publicação. Tente novamente.");
      const data = await response.json();
      setAudit((data.audit || []).filter((item: Audit) => /PUBLICACAO|INTEGRACAO_SUPABASE/.test(item.evento)));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "A conexão com o Vínkulo foi interrompida. Tente novamente.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    const update=(event:Event)=>setConnection((event as CustomEvent<ConnectionState>).detail);
    window.addEventListener("vinkulo:supabase-status",update);
    return () => {clearTimeout(timer);window.removeEventListener("vinkulo:supabase-status",update);};
  }, [load]);
  const generalStatus=error || connection?.lastCheck?.ok===false ? "Falha" : connection?.lastCheck?.ok ? "Tudo certo" : "Atenção";

  return <section className="owner-publication">
    <header className="workspace-heading">
      <div><p className="pilot-kicker">PUBLICAÇÃO E INTEGRAÇÕES</p><h2>Publicação do sistema</h2><p>Acompanhe a conexão dos serviços e os registros de alterações da plataforma.</p></div>
      <div><span className="publication-status" role="status">{generalStatus}</span>{connection?.lastCheck?.ok && <small>Última verificação: {new Date(connection.lastCheck.checkedAt).toLocaleString("pt-BR")}</small>}</div>
    </header>
    <article className="control-summary-card"><h3>Estado atual</h3><p>A publicação de novas versões é realizada pela hospedagem, após a validação do código.</p><p>Esta tela não tem uma fila de versões conectada. Nenhuma aprovação ou publicação é simulada aqui.</p></article>
    <article className="feature-flag-card"><h3>Publicações da comunidade</h3><p>A automação editorial cuida do conteúdo das comunidades. Ela é administrada na aba IA Editorial e não publica novas versões do sistema.</p></article>
    <SupabaseIntegrationForm />
    <SupabaseTenantFoundation />
    <SupabaseTenantCatalog />
    <SupabaseProfileCatalog />
    <SupabaseMembershipCatalog />
    <SupabaseAutoSync />
    <SupabaseReadBenchmark />
    <footer className="publication-panel" aria-busy={loading}>
      <h3>Auditoria de publicação e integrações</h3>
      <div aria-live="polite">
        {loading ? <p>Consultando os registros de publicação e integrações…</p> : error ? <p role="alert">{error}</p> : audit.length ? <ul>{audit.map(item => <li key={item.id}><strong>{item.evento.replaceAll("_", " ")}</strong><p>{item.usuario_nome || "Usuário registrado"} · {item.criado_em} · {item.resultado}</p></li>)}</ul> : <p>Nenhuma alteração de publicação ou integração no histórico recente.</p>}
      </div>
      <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>Atualizar registros</button>
    </footer>
  </section>;
}
