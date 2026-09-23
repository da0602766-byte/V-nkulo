"use client";

import { useState } from "react";

type Scope = "communities" | "profiles" | "memberships";
type Kind = "MISSING" | "DIFFERENT" | "EXTRA" | "UNTRACKED";
type Counts = { source: number; destination: number; missing: number; different: number; extra: number; untracked: number };
type Issue = { scope: Scope; kind: Kind; legacyId: number | null; fields: string[] };
type Report = { checkedAt: string; ready: boolean; counts: Record<Scope, Counts>; issues: Issue[]; omittedIssueCount: number };

const scopeLabels: Record<Scope, string> = { communities: "Comunidades", profiles: "Perfis", memberships: "Vínculos" };
const kindLabels: Record<Kind, string> = {
  MISSING: "Ausente no Supabase", DIFFERENT: "Campos diferentes",
  EXTRA: "Existe só no Supabase", UNTRACKED: "Sem ID D1 no Supabase",
};

export default function SupabaseDivergences() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function review() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/proprietario/integracoes/supabase/divergences", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível conferir os catálogos.");
      setReport(body.report);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível conferir os catálogos."); }
    finally { setLoading(false); }
  }

  return <article className="publication-panel" aria-busy={loading}>
    <h3>Revisão de divergências</h3>
    <p>Compare comunidades, perfis e vínculos com o D1. Esta revisão mostra apenas IDs e nomes dos campos diferentes; não exibe nomes, e-mails nem valores pessoais. Não altera ou exclui registros.</p>
    <div aria-live="polite">
      {loading && <p>Conferindo os três catálogos…</p>}
      {error && <p role="alert">{error}</p>}
      {report && <div className={`publication-check ${report.ready ? "success" : "danger"}`} role="status">
        <strong>{report.ready ? "Nenhuma divergência encontrada" : "Divergências para revisão manual"}</strong>
        <p>Conferido em {new Date(report.checkedAt).toLocaleString("pt-BR")}.</p>
        <ul>{(["communities", "profiles", "memberships"] as Scope[]).map(scope => {
          const count = report.counts[scope];
          return <li key={scope}>{scopeLabels[scope]}: D1 {count.source}, Supabase {count.destination}; {count.missing} ausentes, {count.different} diferentes, {count.extra} extras, {count.untracked} sem ID.</li>;
        })}</ul>
        {report.issues.length > 0 && <ul>{report.issues.map((issue, index) => <li key={`${issue.scope}-${issue.kind}-${issue.legacyId ?? "sem-id"}-${index}`}>
          {scopeLabels[issue.scope]} · {kindLabels[issue.kind]} · {issue.legacyId === null ? "ID D1 ausente" : `ID D1 ${issue.legacyId}`}
          {issue.fields.length > 0 && ` · campos: ${issue.fields.join(", ")}`}
        </li>)}</ul>}
        {report.omittedIssueCount > 0 && <p>Mais {report.omittedIssueCount} divergências não exibidas nesta lista; as contagens acima incluem todas.</p>}
        {!report.ready && <p>Registros extras continuam bloqueando a sincronização. Nenhuma exclusão será feita automaticamente; a política de remoção precisa ser aprovada separadamente.</p>}
      </div>}
    </div>
    <button type="button" className="secondary" disabled={loading} onClick={() => void review()}>{report ? "Conferir novamente" : "Verificar divergências"}</button>
  </article>;
}
