"use client";

import { FormEvent, useState } from "react";

export default function InviteAcceptanceForm({
  token,
  maskedEmail,
  communityName,
}: {
  token: string;
  maskedEmail: string;
  communityName: string;
}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch("/api/pilot/convites/aceitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, token }),
      });
      const result = (await response.json()) as {
        error?: string;
        redirect?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Não foi possível aceitar.");
      window.location.replace(result.redirect || "/painel");
    } catch (error) {
      setMessage((error as Error).message);
      setLoading(false);
    }
  }

  return (
    <form className="pilot-form" onSubmit={submit}>
      <div className="pilot-invite-summary">
        <span>Convite para membro</span>
        <strong>{communityName}</strong>
        <small>E-mail esperado: {maskedEmail}</small>
      </div>
      <label>
        Nome completo
        <input name="nome" required minLength={3} autoComplete="name" />
      </label>
      <label>
        E-mail convidado
        <input name="email" required type="email" autoComplete="email" />
      </label>
      <label>
        Senha
        <input
          name="senha"
          required
          type="password"
          minLength={8}
          autoComplete="new-password"
        />
        <small>Mínimo de 8 caracteres, com letras e número.</small>
      </label>
      {message && <p className="pilot-form-message" role="alert">{message}</p>}
      <button disabled={loading}>
        {loading ? "Validando convite…" : "Aceitar convite"}
      </button>
    </form>
  );
}

