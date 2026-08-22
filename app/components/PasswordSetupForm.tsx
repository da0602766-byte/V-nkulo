"use client";

import { FormEvent, useState } from "react";

export default function PasswordSetupForm({ endpoint, token }: { endpoint: string; token?: string }) {
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const senha = String(form.get("senha") || ""); const confirmacao = String(form.get("confirmacao") || "");
    if (senha !== confirmacao) return setMessage("As duas senhas precisam ser iguais.");
    setLoading(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha, token }) });
      const text = await response.text();
      let body: { error?: string } = {};
      try { body = text ? JSON.parse(text) as { error?: string } : {}; } catch { body = {}; }
      if (!response.ok) throw new Error(body.error || "O servidor não conseguiu salvar a senha. Tente novamente.");
      setDone(true); setMessage("Senha criada com sucesso.");
    } catch (error) { setMessage((error as Error).message || "Não foi possível alterar a senha."); }
    finally { setLoading(false); }
  }
  return <form className="setup-form" onSubmit={handle}><label>Nova senha<input name="senha" type="password" minLength={8} required autoComplete="new-password" disabled={loading || done} /></label><label>Confirmar nova senha<input name="confirmacao" type="password" minLength={8} required autoComplete="new-password" disabled={loading || done} /></label><p>Use pelo menos 8 caracteres, com letras e números.</p>{message && <div className="login-feedback" role="status">{message}</div>}{done ? <button type="button" className="login-submit" onClick={() => { window.location.href = "/"; }}>Entrar no VÍNKULO</button> : <button className="login-submit" disabled={loading}>{loading ? "Salvando com segurança…" : "Salvar nova senha"}</button>}</form>;
}
