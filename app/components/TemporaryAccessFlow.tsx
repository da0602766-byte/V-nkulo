"use client";

import Link from "./StableLink";
import { useEffect, useMemo, useState } from "react";

type Status =
  | "PENDENTE"
  | "AGUARDANDO_HORARIO"
  | "ATIVO"
  | "EXPIRADO"
  | "CANCELADO"
  | "NEGADO";

type AccessSnapshot = {
  status: Status;
  serverNow: number;
  authenticated: boolean;
  userMatches: boolean;
  communityMatches: boolean;
  beneficiaryName: string;
  assignmentStatus: string;
  replacementCandidates: ReplacementCandidate[];
};

type ReplacementCandidate = {
  voluntarioId: number;
  usuarioId: number;
  nome: string;
  funcao: string;
  fotoPerfil: string | null;
};

export default function TemporaryAccessFlow({
  token,
  resourceLabel,
  communityName,
  scheduleTitle,
  startsAt,
  endsAt,
  initialStatus,
  serverNow,
  authenticated,
  userMatches,
  communityMatches,
  beneficiaryName,
  assignmentStatus,
}: {
  token: string;
  resourceLabel: string;
  communityName: string;
  scheduleTitle: string;
  startsAt: string;
  endsAt: string;
  initialStatus: Status;
  serverNow: number;
  authenticated: boolean;
  userMatches: boolean;
  communityMatches: boolean;
  beneficiaryName: string;
  assignmentStatus: string;
}) {
  const [snapshot, setSnapshot] = useState<AccessSnapshot>({
    status: initialStatus,
    serverNow,
    authenticated,
    userMatches,
    communityMatches,
    beneficiaryName,
    assignmentStatus,
    replacementCandidates: [],
  });
  const [now, setNow] = useState(serverNow);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [responseLoading, setResponseLoading] = useState("");
  const [verificationState, setVerificationState] = useState<
    "checking" | "verified" | "failed"
  >("checking");
  const [replacementStatus, setReplacementStatus] = useState<
    "INDISPONIVEL" | "SUBSTITUICAO_SOLICITADA" | ""
  >("");
  const [replacementVolunteerId, setReplacementVolunteerId] = useState(0);
  const startsAtMs = useMemo(() => Date.parse(startsAt), [startsAt]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/acesso-temporario/${token}`, {
          cache: "no-store",
        });
        const result = (await response.json()) as AccessSnapshot & {
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "Falha ao validar acesso.");
        if (cancelled) return;
        setSnapshot(result);
        setNow(result.serverNow);
        setVerificationState("verified");
        setError("");
      } catch (cause) {
        if (!cancelled) {
          setVerificationState("failed");
          setError((cause as Error).message);
        }
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setNow((current) => current + 1_000),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  async function activate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/acesso-temporario/${token}`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        destination?: string;
        error?: string;
      };
      if (!response.ok || !result.destination) {
        throw new Error(result.error || "Não foi possível ativar o acesso.");
      }
      window.location.assign(result.destination);
    } catch (cause) {
      setError((cause as Error).message);
      setLoading(false);
    }
  }

  async function respondToSchedule(
    status: "CONFIRMADA" | "INDISPONIVEL" | "SUBSTITUICAO_SOLICITADA",
    substitutoVoluntarioId?: number,
  ) {
    setResponseLoading(status);
    setError("");
    try {
      const response = await fetch(`/api/acesso-temporario/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESPONDER_ESCALA",
          status,
          substitutoVoluntarioId,
        }),
      });
      const result = (await response.json()) as {
        assignmentStatus?: string;
        mayEnter?: boolean;
        error?: string;
      };
      if (!response.ok || !result.assignmentStatus) {
        throw new Error(result.error || "Não foi possível registrar sua resposta.");
      }
      setSnapshot((current) => ({
        ...current,
        assignmentStatus: result.assignmentStatus!,
        status: result.mayEnter ? current.status : "CANCELADO",
      }));
      setReplacementStatus("");
      setReplacementVolunteerId(0);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setResponseLoading("");
    }
  }

  const remaining = Math.max(0, startsAtMs - now);
  const statusCopy = statusMessage(snapshot.status);
  const canActivate =
    verificationState === "verified" &&
    snapshot.status === "ATIVO" &&
    snapshot.authenticated &&
    snapshot.userMatches &&
    snapshot.communityMatches &&
    snapshot.assignmentStatus === "CONFIRMADA";
  const needsScheduleResponse =
    verificationState === "verified" &&
    snapshot.status === "ATIVO" &&
    snapshot.authenticated &&
    snapshot.userMatches &&
    snapshot.communityMatches &&
    snapshot.assignmentStatus === "PENDENTE";

  return (
    <main className="temporary-access-page">
      <section className="temporary-access-card">
        <header>
          <span aria-hidden="true">V+</span>
          <div>
            <p>VÍNKULO · ACESSO TEMPORÁRIO</p>
            <strong>{communityName}</strong>
          </div>
        </header>
        <div className="temporary-access-resource">
          <small>RECURSO AUTORIZADO</small>
          <h1>{resourceLabel}</h1>
          <p>{scheduleTitle}</p>
        </div>
        <section className="temporary-access-person" aria-label="Pessoa autorizada">
          <span aria-hidden="true">{initials(snapshot.beneficiaryName || beneficiaryName)}</span>
          <div><small>ACESSO PESSOAL PARA</small><strong>{snapshot.beneficiaryName || beneficiaryName}</strong></div>
        </section>
        <dl>
          <div><dt>Início</dt><dd>{formatDate(startsAt)}</dd></div>
          <div><dt>Término</dt><dd>{formatDate(endsAt)}</dd></div>
        </dl>

        {verificationState === "checking" && (
          <div className="temporary-access-verification" role="status" aria-live="polite">
            <strong>Verificando perfil e autorização…</strong>
            <p>O acesso só será liberado após a confirmação do servidor.</p>
          </div>
        )}

        {verificationState === "failed" && (
          <div className="temporary-access-verification verification-failed" role="alert">
            <strong>Não foi possível confirmar sua autorização.</strong>
            <p>Nenhum acesso foi liberado. Verifique sua conexão e atualize a página.</p>
          </div>
        )}

        {verificationState === "verified" && snapshot.status === "AGUARDANDO_HORARIO" && (
          <div className="temporary-access-countdown" aria-live="polite">
            <small>Disponível em</small>
            <strong>{formatCountdown(remaining)}</strong>
            <p>Ao chegar a zero, o servidor confirmará a autorização.</p>
          </div>
        )}

        {verificationState === "verified" && snapshot.status !== "AGUARDANDO_HORARIO" && (
          <div className={`temporary-access-status status-${snapshot.status.toLowerCase()}`} role="status">
            <strong>{statusCopy.title}</strong>
            <p>{statusCopy.detail}</p>
          </div>
        )}

        {verificationState === "verified" && snapshot.status === "ATIVO" && !snapshot.authenticated && (
          <div className="temporary-access-login-entry">
            <Link
              className="temporary-access-primary"
              href={`/login?returnTo=${encodeURIComponent(`/acesso/${token}`)}`}
            >
              Entrar como {beneficiaryName}
            </Link>
            <small>Após o login, você voltará automaticamente para confirmar esta escala.</small>
          </div>
        )}
        {verificationState === "verified" && snapshot.status === "ATIVO" && snapshot.authenticated && !snapshot.userMatches && (
          <p className="temporary-access-error" role="alert">
            Esta conta não é a pessoa autorizada pela escala.
          </p>
        )}
        {verificationState === "verified" && snapshot.status === "ATIVO" && snapshot.userMatches && !snapshot.communityMatches && (
          <p className="temporary-access-error" role="alert">
            Sua conta não possui vínculo ativo com esta comunidade.
          </p>
        )}
        {needsScheduleResponse && (
          <section className="temporary-schedule-confirmation" aria-labelledby="schedule-confirmation-title">
            <header><small>CONFIRMAÇÃO DA ESCALA</small><strong id="schedule-confirmation-title">Você poderá participar?</strong><p>Sua resposta será registrada e enviada à liderança do ministério.</p></header>
            <div className="temporary-schedule-actions">
              <button type="button" disabled={Boolean(responseLoading)} onClick={() => void respondToSchedule("CONFIRMADA")}>
                {responseLoading === "CONFIRMADA" ? "Confirmando…" : "Sim, confirmo"}
              </button>
              <button type="button" className="secondary" disabled={Boolean(responseLoading)} onClick={() => setReplacementStatus("INDISPONIVEL")}>
                Não posso
              </button>
              <button type="button" className="secondary" disabled={Boolean(responseLoading)} onClick={() => setReplacementStatus("SUBSTITUICAO_SOLICITADA")}>
                Solicitar substituição
              </button>
            </div>
            {replacementStatus && (
              <div className="temporary-substitute-picker">
                <strong>Quem pode ficar no seu lugar?</strong>
                <p>Escolha uma pessoa ativa do mesmo ministério. Ela receberá a escala para confirmar.</p>
                {snapshot.replacementCandidates.length ? (
                  <div className="temporary-substitute-options">
                    {snapshot.replacementCandidates.map((candidate) => (
                      <label key={candidate.voluntarioId}>
                        <input
                          type="radio"
                          name="temporary-substitute"
                          value={candidate.voluntarioId}
                          checked={replacementVolunteerId === candidate.voluntarioId}
                          onChange={() => setReplacementVolunteerId(candidate.voluntarioId)}
                        />
                        {candidate.fotoPerfil ? (
                          <img src={candidate.fotoPerfil} alt="" />
                        ) : (
                          <span aria-hidden="true">{initials(candidate.nome)}</span>
                        )}
                        <span><b>{candidate.nome}</b><small>{candidate.funcao}</small></span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="temporary-access-error">Não há outra pessoa disponível neste ministério. Fale com a liderança.</p>
                )}
                <div className="temporary-substitute-actions">
                  <button
                    type="button"
                    disabled={!replacementVolunteerId || Boolean(responseLoading)}
                    onClick={() => void respondToSchedule(replacementStatus, replacementVolunteerId)}
                  >
                    {responseLoading ? "Registrando…" : "Confirmar substituição"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={Boolean(responseLoading)}
                    onClick={() => {
                      setReplacementStatus("");
                      setReplacementVolunteerId(0);
                    }}
                  >Cancelar</button>
                </div>
              </div>
            )}
          </section>
        )}
        {verificationState === "verified" && snapshot.assignmentStatus === "CONFIRMADA" && snapshot.status === "ATIVO" && (
          <p className="temporary-access-confirmed" role="status">✓ Presença confirmada nesta escala.</p>
        )}
        {verificationState === "verified" && snapshot.assignmentStatus === "SUBSTITUICAO_SOLICITADA" && (
          <p className="temporary-access-response-note" role="status">Solicitação de substituição enviada à liderança.</p>
        )}
        {verificationState === "verified" && snapshot.assignmentStatus === "INDISPONIVEL" && (
          <p className="temporary-access-response-note" role="status">Indisponibilidade registrada para esta escala.</p>
        )}
        {canActivate && (
          <button
            className="temporary-access-primary"
            type="button"
            disabled={loading}
            onClick={() => void activate()}
          >
            {loading ? "Validando…" : `Entrar em ${resourceLabel}`}
          </button>
        )}
        {error && <p className="temporary-access-error" role="alert">{error}</p>}
        <footer>
          Esta autorização não altera seu cargo nem concede acesso a outras abas.
        </footer>
      </section>
    </main>
  );
}

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "V";
}

function statusMessage(status: Status) {
  return {
    PENDENTE: {
      title: "Aguardando autorização",
      detail: "O responsável ainda precisa concluir a aprovação.",
    },
    ATIVO: {
      title: "Acesso liberado",
      detail: "Entre com a conta indicada na escala para continuar.",
    },
    EXPIRADO: {
      title: "Acesso encerrado",
      detail: "O horário autorizado terminou. Solicite um novo acesso ao responsável.",
    },
    CANCELADO: {
      title: "Acesso cancelado",
      detail: "O responsável cancelou esta autorização ou a escala não está mais ativa.",
    },
    NEGADO: {
      title: "Acesso negado",
      detail: "A solicitação não foi autorizada.",
    },
    AGUARDANDO_HORARIO: { title: "", detail: "" },
  }[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatCountdown(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Confirmando…";
  const totalSeconds = Math.ceil(value / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
