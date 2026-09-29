"use client";

import { useState } from "react";

type Counts = { tenants: number; profiles: number; memberships: number;
  profile_details: number; linked_auth: number };
const endpoint = "/api/proprietario/integracoes/supabase/catalog-copies";

export default function SupabaseCatalogCopies() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function review() {
    setBusy(true); setError(""); setRemoved(false);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível conferir as cópias dos catálogos.");
      setCounts(data.counts);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível conferir as cópias dos catálogos."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!counts || counts.linked_auth || !window.confirm("Remover do Supabase todas as cópias de comunidades, perfis, vínculos e detalhes cadastrais mostradas abaixo? O D1 e as contas Auth serão preservados.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "REMOVER_COPIAS_CATALOGOS_SUPABASE", expected: {
          tenants: counts.tenants, profiles: counts.profiles,
          memberships: counts.memberships, profile_details: counts.profile_details,
        } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível remover as cópias dos catálogos.");
      setCounts(data.counts); setRemoved(true);
      window.dispatchEvent(new Event("vinkulo:supabase-integration-changed"));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível remover as cópias dos catálogos."); }
    finally { setBusy(false); }
  }

  const total = counts ? counts.tenants + counts.profiles + counts.memberships + counts.profile_details : 0;
  return <article className="publication-panel" aria-busy={busy}>
    <h3>Remoção das cópias dos catálogos</h3>
    <p>Confira as quantidades no Supabase antes de remover as réplicas. A operação preserva o D1 e não exclui contas do Supabase Auth. A conexão é pausada após a conferência da remoção.</p>
    <div aria-live="polite">
      {busy && <p>Conferindo as cópias…</p>}
      {error && <p role="alert">{error}</p>}
      {counts && <div className={`publication-check ${counts.linked_auth ? "danger" : total ? "" : "success"}`} role="status">
        <p>Supabase: {counts.tenants} comunidades, {counts.profiles} perfis, {counts.memberships} vínculos e {counts.profile_details} detalhes cadastrais.</p>
        <p>Contas Auth criadas ou vinculadas: {counts.linked_auth}.</p>
        {counts.linked_auth > 0 && <p>Revise essas contas Auth antes de remover os catálogos.</p>}
        {removed && <p>As cópias foram removidas e a integração foi pausada.</p>}
      </div>}
    </div>
    <div className="publication-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => void review()}>Conferir cópias</button>
      <button type="button" className="secondary" disabled={busy || !counts || !total || counts.linked_auth > 0} onClick={() => void remove()}>Remover cópias dos catálogos</button>
    </div>
  </article>;
}
