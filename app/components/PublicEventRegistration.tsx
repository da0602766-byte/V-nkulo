"use client";

import { useState } from "react";

export default function PublicEventRegistration({
  eventId,
  eventTitle,
  isSignedIn,
  isMember,
  userName,
  userEmail,
}: {
  eventId: number;
  eventTitle: string;
  isSignedIn: boolean;
  isMember: boolean;
  userName?: string;
  userEmail?: string;
}) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  if (isMember) {
    return (
      <a className="public-event-registration-link" href={`/painel?view=eventos&evento=${eventId}`}>
        Ver evento e confirmar presença
        <span aria-hidden="true">→</span>
      </a>
    );
  }

  async function register() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/eventos-publicos/${eventId}/inscricao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível confirmar a inscrição.");
      setConfirmed(true);
    } catch (registerError) {
      setError((registerError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="public-event-registration-link"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Inscrever-se / ver detalhes
        <span aria-hidden="true">→</span>
      </button>
      {open && (
        <div
          className="public-event-registration-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !working) setOpen(false);
          }}
        >
          <section
            className="public-event-registration-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`inscricao-evento-${eventId}`}
          >
            <header>
              <div>
                <small>INSCRIÇÃO NO EVENTO</small>
                <h2 id={`inscricao-evento-${eventId}`}>{eventTitle}</h2>
              </div>
              <button type="button" aria-label="Fechar" disabled={working} onClick={() => setOpen(false)}>×</button>
            </header>
            {!isSignedIn ? (
              <div className="public-event-registration-signin">
                <span aria-hidden="true">↗</span>
                <strong>Entre na sua conta para continuar</strong>
                <p>Assim, seus dados são preenchidos com segurança e a comunidade recebe sua inscrição.</p>
                <a href="/login">Entrar e continuar</a>
              </div>
            ) : confirmed ? (
              <div className="public-event-registration-success" role="status">
                <span aria-hidden="true">✓</span>
                <strong>Inscrição confirmada</strong>
                <p>A organização verá que você está participando como pessoa externa à comunidade.</p>
                <button type="button" onClick={() => setOpen(false)}>Concluir</button>
              </div>
            ) : (
              <>
                <p className="public-event-registration-notice">
                  Você ainda não faz parte desta comunidade. Seus dados serão enviados automaticamente e sua inscrição ficará identificada como participante externo.
                </p>
                <div className="public-event-registration-fields">
                  <label>Nome<input readOnly value={userName || "Usuário identificado"} /></label>
                  <label>E-mail<input readOnly value={userEmail || "E-mail protegido"} /></label>
                </div>
                {error && <p className="public-event-registration-error" role="alert">{error}</p>}
                <footer>
                  <button type="button" className="secondary-button" disabled={working} onClick={() => setOpen(false)}>Cancelar</button>
                  <button type="button" disabled={working} onClick={() => void register()}>{working ? "Confirmando…" : "Confirmar inscrição"}</button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
