"use client";

import { useCallback, useEffect, useState } from "react";

type Check = {
  ready: boolean;
  checkedAt: string;
  latencyMs: number;
  status: number;
  message: string;
  tables: Record<"tenants" | "profiles" | "memberships" | "migrationRuns", boolean>;
};

const labels = { tenants: "Comunidades", profiles: "Perfis", memberships: "Vínculos", migrationRuns: "Controle de migração" };

export default function SupabaseTenantFoundation() {
  const [check, setCheck] = useState<Check | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (audit = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/proprietario/integracoes/supabase/tenant-foundation", audit ? { method: "POST", headers: { "Content-Type": "application/json" } } : { cache: "no-store" });
      const data = await response.json();
      if (data.check) setCheck(data.check);
      if (!response.ok && !data.check) throw new Error(data.error || "Não foi possível verificar a fundação de comunidades.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível verificar a fundação de comunidades.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  return <article className="publication-panel" aria-busy={loading}>
    <h3>Fundação de comunidades</h3>
    <p>Estrutura paralela para migrar dados por comunidade com isolamento no banco. Perfis e vínculos são comparados em etapas próprias; arquivos e logins seguem onde estão.</p>
    <div aria-live="polite">
      {loading && <p>Verificando as tabelas protegidas no Supabase.</p>}
      {error && <p role="alert">{error}</p>}
      {check && <div className={`publication-check ${check.ready ? "success" : "danger"}`} role="status">
        <strong>{check.ready ? "Fundação pronta" : "Fundação pendente"}</strong>
        <p>{check.message}</p>
        <ul className="publication-foundation-list">{Object.entries(check.tables).map(([key, ready]) => <li key={key}>{ready ? "✓" : "—"} {labels[key as keyof typeof labels]}</li>)}</ul>
        <small>{check.latencyMs} ms · HTTP {check.status || "sem resposta"} · {new Date(check.checkedAt).toLocaleString("pt-BR")}</small>
      </div>}
    </div>
    <button type="button" className="secondary" disabled={loading} onClick={() => void load(true)}>Verificar fundação</button>
  </article>;
}
