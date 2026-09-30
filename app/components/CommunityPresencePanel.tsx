"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import VerifiedOwnerName from "./VerifiedOwnerName";
import FeedPresencePopover from "./feed/FeedPresencePopover";
import TransientFeedback from "./TransientFeedback";
import "./feed/feed-interactions.css";

type PresencePerson = {
  userId: number;
  name: string;
  avatarUrl?: string | null;
  hierarchy: string;
  online: boolean;
  lastSeen?: string | null;
  sharesLastSeen: boolean;
  biography: string;
  canMessage: boolean;
  communicationGroup: "MEMBRO" | "OFICIAL";
  ownerVerified?: boolean;
};

type PresenceResponse = {
  people?: PresencePerson[];
  currentUserSharesLastSeen?: boolean;
  currentUserId?: number;
  error?: string;
};

export default function CommunityPresencePanel() {
  const [people, setPeople] = useState<PresencePerson[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingPrivacy, setUpdatingPrivacy] = useState(false);
  const [shareLastSeen, setShareLastSeen] = useState(true);
  const [error, setError] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [showBiography, setShowBiography] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(0);
  const profileId = useId();
  const selectedRowRef = useRef<HTMLDivElement>(null);
  const selectedTriggerRef = useRef<HTMLButtonElement>(null);

  function closeProfile() {
    setSelectedPersonId(null);
    selectedTriggerRef.current?.focus({ preventScroll: true });
  }

  const applyResult = useCallback((result: PresenceResponse) => {
    setPeople(result.people || []);
    setShareLastSeen(result.currentUserSharesLastSeen !== false);
    setCurrentUserId(Number(result.currentUserId || 0));
  }, []);

  const syncPresence = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/api/pilot/presenca", {
        method: "POST",
        cache: "no-store",
      });
      const result = (await response.json()) as PresenceResponse;
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível atualizar a presença.");
      }
      applyResult(result);
      setError("");
    } catch (syncError) {
      setError((syncError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [applyResult]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void syncPresence(), 0);
    const timer = window.setInterval(() => void syncPresence(), 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void syncPresence();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncPresence]);

  async function updatePrivacy(nextValue: boolean) {
    setUpdatingPrivacy(true);
    try {
      const response = await fetch("/api/pilot/presenca", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareLastSeen: nextValue }),
      });
      const result = (await response.json()) as PresenceResponse;
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível salvar a privacidade.");
      }
      applyResult(result);
      setError("");
    } catch (privacyError) {
      setError((privacyError as Error).message);
    } finally {
      setUpdatingPrivacy(false);
    }
  }

  // O diálogo próprio de conversa saiu com os módulos legados em 08/09/2026. A
  // conversa viva hoje é o popover de mensagens do PilotDashboard, que renderiza
  // PrivateChatWorkspace; o painel pede a abertura por evento para não duplicar
  // uma segunda tela de chat.
  function openChatWith(person: PresencePerson) {
    window.dispatchEvent(
      new CustomEvent("vinkulo:open-chat", { detail: { userId: person.userId } }),
    );
    setSelectedPersonId(null);
  }

  const visiblePeople = useMemo(
    () => (expanded ? people : people.slice(0, 8)),
    [expanded, people],
  );
  const onlineCount = people.filter((person) => person.online).length;

  return (
    <section className="community-presence-panel" aria-labelledby="presence-title">
      <header>
        <div>
          <p className="pilot-kicker">PESSOAS</p>
          <strong id="presence-title">Quem está online</strong>
        </div>
        <span>{onlineCount} online</span>
      </header>

      {loading ? (
        <div className="presence-loading" role="status">
          <i />
          <i />
          <i />
          <small>Verificando presença…</small>
        </div>
      ) : visiblePeople.length ? (
        <div className="presence-list">
          {visiblePeople.map((person) => (
            <div key={person.userId} className="feed-presence-row" data-selected={selectedPersonId === person.userId} ref={selectedPersonId === person.userId ? selectedRowRef : undefined} onKeyDown={(event) => {
              if (event.key === "Escape" && selectedPersonId === person.userId) {
                event.preventDefault();
                event.stopPropagation();
                closeProfile();
              }
            }}>
            <button
              type="button"
              className="presence-person"
              onClick={(event) => {
                selectedTriggerRef.current = event.currentTarget;
                setSelectedPersonId((current) => current === person.userId ? null : person.userId);
                setShowBiography(false);
              }}
              aria-expanded={selectedPersonId === person.userId}
              aria-controls={selectedPersonId === person.userId ? `${profileId}-${person.userId}` : undefined}
              aria-label={`Abrir perfil de ${person.name}`}
            >
              <span className="presence-avatar" aria-hidden="true">
                {person.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" src={person.avatarUrl} alt="" />
                ) : (
                  initials(person.name)
                )}
                <i className={person.online ? "online" : ""} />
              </span>
              <div>
                <VerifiedOwnerName name={person.name} verified={Boolean(person.ownerVerified)} />
                <small>{formatHierarchy(person.hierarchy)}</small>
              </div>
              <em className={person.online ? "online" : ""}>
                {person.online
                  ? "Online"
                  : person.lastSeen
                    ? formatRelativeTime(person.lastSeen)
                    : "Atividade oculta"}
              </em>
            </button>
            {selectedPersonId === person.userId && (
              <FeedPresencePopover id={`${profileId}-${person.userId}`} label={`Perfil de ${person.name}`} anchorRef={selectedRowRef} triggerRef={selectedTriggerRef} onClose={closeProfile} onDismiss={() => setSelectedPersonId(null)}>
                <header>
                  <div>
                    <VerifiedOwnerName name={person.name} verified={Boolean(person.ownerVerified)} />
                    <small>{formatHierarchy(person.hierarchy)}</small>
                  </div>
                  <button type="button" onClick={closeProfile} aria-label="Fechar perfil">×</button>
                </header>
                <div className="presence-profile-actions">
                  <button type="button" disabled={!person.canMessage} onClick={() => openChatWith(person)}>Mensagem</button>
                  <button type="button" onClick={() => setShowBiography((value) => !value)} aria-expanded={showBiography} aria-controls={`${profileId}-${person.userId}-biography`}>Biografia</button>
                </div>
                {!person.canMessage && (
                  <small className="presence-message-rule">
                    {person.userId === currentUserId
                      ? "Este é o seu perfil. Edite a biografia em Minha conta."
                      : "Conversas são permitidas apenas entre membros ou entre oficiais."}
                  </small>
                )}
                <p id={`${profileId}-${person.userId}-biography`} className="presence-biography" hidden={!showBiography}>
                  {person.biography || "Esta pessoa ainda não adicionou uma biografia."}
                </p>
              </FeedPresencePopover>
            )}
            </div>
          ))}
        </div>
      ) : (
        <p className="home-rail-empty">Nenhuma presença registrada ainda.</p>
      )}

      {people.length > 8 && (
        <button
          className="presence-expand"
          type="button"
          onClick={() => { setExpanded((current) => !current); setSelectedPersonId(null); }}
          aria-expanded={expanded}
        >
          {expanded ? "Mostrar menos" : `Ver todos (${people.length})`}
        </button>
      )}

      <label className="presence-privacy">
        <input
          type="checkbox"
          checked={shareLastSeen}
          disabled={updatingPrivacy}
          onChange={(event) => void updatePrivacy(event.currentTarget.checked)}
        />
        <span>Permitir que vejam minha última atividade</span>
      </label>
      {error && <TransientFeedback className="presence-error" role="alert">{error}</TransientFeedback>}
    </section>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatHierarchy(value: string) {
  return value
    .replaceAll("_", " ")
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value.endsWith("Z") ? value : `${value}Z`);
  if (!Number.isFinite(timestamp)) return "Offline";
  const elapsedMinutes = Math.max(
    1,
    Math.floor((Date.now() - timestamp) / 60_000),
  );
  if (elapsedMinutes < 60) return `Visto há ${elapsedMinutes} min`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `Visto há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Visto ontem";
  if (days < 30) return `Visto há ${days} dias`;
  return "Offline";
}
