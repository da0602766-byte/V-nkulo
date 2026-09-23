"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ConnectorStatus, IntegrationCatalog } from "../lib/integration-catalog";
const SupabaseIntegrationForm = dynamic(() => import("./SupabaseIntegrationForm"), { loading: () => <p role="status">Carregando configuração…</p> });
const SupabaseAutoSync = dynamic(() => import("./SupabaseAutoSync"), { loading: () => <p role="status">Carregando sincronização…</p> });
const FirebaseIntegrationForm = dynamic(() => import("./FirebaseIntegrationForm"), { loading: () => <p role="status">Carregando Firebase…</p> });
const labels: Record<ConnectorStatus, string> = { connected: "Conectado", not_connected: "Não conectado", paused: "Desativado", attention: "Requer atenção", unavailable: "Não disponível" };
function date(value: string | null) { return value ? new Date(value).toLocaleString("pt-BR") : "Ainda não registrado"; }

export default function OwnerIntegrationsWorkspace() {
  const [catalog, setCatalog] = useState<IntegrationCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  const detail = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/proprietario/integracoes", { cache: "no-store", signal: controller.signal });
      if (response.status === 401 || response.status === 403) {
        setCatalog(null); setSelected(null);
        throw new Error("Acesso indisponível. Entre com a conta do proprietário.");
      }
      if (!response.ok) throw new Error("Não foi possível consultar as integrações. Tente novamente.");
      const result = await response.json() as IntegrationCatalog;
      if (!controller.signal.aborted) setCatalog(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Conexão indisponível.");
    } finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    const update = () => void load();
    window.addEventListener("vinkulo:supabase-status", update);
    window.addEventListener("vinkulo:firebase-status", update);
    return () => { clearTimeout(timer); request.current?.abort(); request.current = null; window.removeEventListener("vinkulo:supabase-status", update); window.removeEventListener("vinkulo:firebase-status", update); };
  }, [load]);
  useEffect(() => { if (selected) detail.current?.focus(); }, [selected]);

  return <div className="ops-stack owner-integrations">
    <section className="ops-panel"><header className="ops-panel-title"><div><h2>Central de integrações</h2><p>Conecte serviços pela interface e acompanhe o estado confirmado de cada conexão.</p></div><button className="oc-button" disabled={loading} onClick={() => void load()}>{loading ? "Consultando…" : "Atualizar conexões"}</button></header>
      <div className="oi-intro"><p>As conexões disponíveis nesta etapa têm escopo da plataforma e acesso exclusivo do proprietário. Nenhuma credencial é compartilhada com os administradores das comunidades.</p>
        <ol><li>Escolha o conector</li><li>Preencha a configuração</li><li>Teste a conexão</li><li>Ative os recursos desejados</li></ol>
        {catalog && <small>Última consulta: {date(catalog.generatedAt)}</small>}
        {error && <p role="alert">{error}{catalog ? " Exibindo a última consulta válida." : ""}</p>}
      </div>
    </section>
    <div className="oi-catalog">{catalog?.connectors.map(connector => <article className="ops-panel oi-card" key={connector.id}>
      <header><h3>{connector.name}</h3><span className={`oi-status ${connector.status}`}>{labels[connector.status]}</span></header>
      <p>{connector.description}</p><p className="oi-message">{connector.message}</p>
      {connector.available && <><dl><div><dt>Último teste</dt><dd>{date(connector.checkedAt)}</dd></div>{connector.id === "supabase" && <><div><dt>Última sincronização</dt><dd>{date(connector.lastSyncAt)}</dd></div><div><dt>Último agendamento</dt><dd>{date(connector.lastHeartbeatAt)}</dd></div></>}</dl>
        <p className="oi-capabilities">{connector.capabilities.join(" · ")}</p><button type="button" className="oc-button" aria-expanded={selected === connector.id} aria-controls="connector-settings" onClick={() => setSelected(selected === connector.id ? null : connector.id)}>{selected === connector.id ? "Fechar configuração" : connector.id === "firebase" ? "Configurar Firebase" : "Configurar Supabase"}</button></>}
    </article>)}</div>
    {selected === "firebase" && <section id="connector-settings" className="owner-publication oi-settings" aria-labelledby="connector-settings-title"><h2 id="connector-settings-title" ref={detail} tabIndex={-1}>Configurar Firebase</h2><FirebaseIntegrationForm /></section>}
    {selected === "supabase" && <section id="connector-settings" className="owner-publication oi-settings" aria-labelledby="connector-settings-title">
      <h2 id="connector-settings-title" ref={detail} tabIndex={-1}>Configurar Supabase</h2>
      <p>Salvar, testar e remover usam a conexão existente. Remover a configuração não apaga os dados armazenados no Supabase.</p>
      <SupabaseIntegrationForm />
      <button type="button" className="oc-button" aria-expanded={syncOpen} aria-controls="connector-sync" onClick={() => setSyncOpen(value => !value)}>{syncOpen ? "Ocultar sincronização" : "Ver sincronização e diagnóstico"}</button>
      {syncOpen && <div id="connector-sync"><SupabaseAutoSync /></div>}
    </section>}
  </div>;
}
