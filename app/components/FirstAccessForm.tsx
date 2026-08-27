"use client";

import { FormEvent, useState } from "react";

export default function FirstAccessForm({ token, login }: { token: string; login: string }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");
    if (password !== confirmPassword) {
      setMessage("As novas senhas não conferem.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/primeiro-acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          token,
          email: data.get("email"),
          temporaryPassword: data.get("temporaryPassword"),
          password,
          confirmPassword,
        }),
      });
      const result = await response.json() as { error?: string; redirect?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir o primeiro acesso.");
      window.location.href = result.redirect || "/painel";
    } catch (error) {
      setMessage((error as Error).message);
      setLoading(false);
    }
  }

  return (
    <form className="setup-form first-access-form" onSubmit={handle}>
      <label>Login<input name="email" type="email" required defaultValue={login} autoComplete="username" /></label>
      <label>Senha temporária<input name="temporaryPassword" type="password" required autoComplete="current-password" /></label>
      <div className="first-access-divider"><span>Crie sua senha definitiva</span></div>
      <label>Nova senha<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
      <label>Confirmar nova senha<input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" /></label>
      <p>Use pelo menos 8 caracteres, com letras e números. A nova senha deve ser diferente da temporária.</p>
      {message && <div className="login-feedback" role="alert">{message}</div>}
      <button className="login-submit" disabled={loading}>{loading ? "Atualizando com segurança…" : "Atualizar senha e entrar"}</button>
    </form>
  );
}
