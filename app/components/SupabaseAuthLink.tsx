"use client";

import { useState } from "react";

type Status = { enabled: boolean; profiles: number; linked: number; activeAttempts: number };
const endpoint = "/api/proprietario/integracoes/supabase/auth-link";

export default function SupabaseAuthLink() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function review() {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível conferir os vínculos Auth.");
      setStatus(data.status);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível conferir os vínculos Auth."); }
    finally { setBusy(false); }
  }

  async function act(action: "ENABLE" | "DISABLE") {
    if (action === "ENABLE" && !window.confirm("Criar ou conferir a conta no Supabase Auth após login válido com CPF ou Google? No CPF, a senha validada será sincronizada. No Google, nenhuma senha será criada ou alterada. As sessões atuais continuarão no D1.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirm: action === "ENABLE" ? "ATIVAR_VINCULO_AUTH" : undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar o vínculo Auth.");
      setStatus(data.status);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível alterar o vínculo Auth."); }
    finally { setBusy(false); }
  }

  return <article className="publication-panel" aria-busy={busy}>
    <h3>Vínculo progressivo com Supabase Auth</h3>
    <p>Após login válido com CPF ou Google, primeiro acesso ou redefinição de senha, o servidor cria ou confere a conta correspondente no Supabase Auth. O Google não cria nem altera senhas. Conflitos de identidade ficam para revisão. As contas são preparadas para a migração; o aplicativo ainda emite e revoga sessões pelo D1.</p>
    <div aria-live="polite">
      {busy && <p>Conferindo os vínculos Auth…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <div className={`publication-check ${status.enabled ? "success" : ""}`} role="status">
        <strong>{status.enabled ? "Vínculo progressivo ativo" : "Vínculo progressivo pausado"}</strong>
        <p>{status.linked} conta(s) Auth criadas ou vinculadas; {status.profiles} perfil(is) copiados; {status.activeAttempts} tentativa(s) em andamento.</p>
      </div>}
    </div>
    <div className="publication-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => void review()}>Conferir vínculos</button>
      {status?.enabled
        ? <button type="button" className="secondary" disabled={busy} onClick={() => void act("DISABLE")}>Pausar vínculos</button>
        : <button type="button" className="secondary" disabled={busy || !status} onClick={() => void act("ENABLE")}>Ativar após login</button>}
    </div>
  </article>;
}
