"use client";

import Link from "./StableLink";
import { FormEvent, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Solicitação aguardando análise",
  APROVADA: "Solicitação aprovada",
  RECUSADA: "Solicitação não aprovada",
};

export default function JoinCommunityCard({
  communityId,
  isSignedIn,
  isMember,
  initialStatus,
}: {
  communityId: number;
  isSignedIn: boolean;
  isMember: boolean;
  initialStatus: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback("");
    try {
      const response = await fetch(
        `/api/pilot/comunidades/${communityId}/solicitacao`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensagem: message }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        status?: string;
      };
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar.");
      setStatus(result.status || "PENDENTE");
      setFeedback("Solicitação enviada com segurança.");
      setMessage("");
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (isMember) {
    return (
      <aside className="join-community-card success">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Você já participa desta comunidade</strong>
          <p>O feed interno continua disponível somente no seu painel.</p>
          <Link href="/painel">Abrir meu painel</Link>
        </div>
      </aside>
    );
  }

  if (!isSignedIn) {
    return (
      <aside className="join-community-card">
        <span aria-hidden="true">+</span>
        <div>
          <strong>Quer participar?</strong>
          <p>
            Entre na sua conta e envie uma solicitação. A comunidade decide o
            que mantém privado.
          </p>
          <Link href="/login">Entrar para solicitar</Link>
        </div>
      </aside>
    );
  }

  if (status === "PENDENTE" || status === "APROVADA") {
    return (
      <aside className="join-community-card success">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>{STATUS_LABELS[status]}</strong>
          <p>
            {status === "PENDENTE"
              ? "Um responsável da comunidade fará a análise."
              : "Atualize seu painel para acessar a comunidade."}
          </p>
          {status === "APROVADA" && <Link href="/painel">Abrir painel</Link>}
        </div>
      </aside>
    );
  }

  return (
    <form className="join-community-form" onSubmit={submit}>
      <div>
        <strong>Solicitar entrada</strong>
        <p>O envio não concede acesso automaticamente.</p>
      </div>
      <label>
        Mensagem para a comunidade (opcional)
        <textarea
          value={message}
          maxLength={500}
          rows={3}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Conte brevemente como conheceu a comunidade."
        />
      </label>
      <button disabled={loading}>
        {loading ? "Enviando…" : "Enviar solicitação"}
      </button>
      {feedback && <p role="status">{feedback}</p>}
      {status === "RECUSADA" && (
        <small>Você pode enviar uma nova solicitação.</small>
      )}
    </form>
  );
}
