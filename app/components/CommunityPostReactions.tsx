"use client";

import { useMemo, useRef, useState } from "react";

const REACTIONS = [
  { type: "AMEM", icon: "🙏", label: "Amém" },
  { type: "CORACAO", icon: "♥", label: "Amei" },
  { type: "ORACAO", icon: "✦", label: "Estou orando" },
  { type: "ALEGRIA", icon: "☺", label: "Que alegria" },
] as const;

type ReactionType = (typeof REACTIONS)[number]["type"];

function parseTypes(value?: string) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is ReactionType => REACTIONS.some((reaction) => reaction.type === item))
      : [];
  } catch {
    return [];
  }
}

function parseCounts(value?: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object") return {} as Record<ReactionType, number>;
    return Object.fromEntries(
      REACTIONS.map((reaction) => [reaction.type, Math.max(0, Number((parsed as Record<string, unknown>)[reaction.type]) || 0)]),
    ) as Record<ReactionType, number>;
  } catch {
    return {} as Record<ReactionType, number>;
  }
}

export default function CommunityPostReactions({
  postId,
  initialCounts,
  initialMine,
}: {
  postId: number;
  initialCounts?: string;
  initialMine?: string;
}) {
  const [counts, setCounts] = useState(() => parseCounts(initialCounts));
  const [mine, setMine] = useState(() => new Set(parseTypes(initialMine)));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [working, setWorking] = useState<ReactionType | null>(null);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const total = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts],
  );

  async function toggle(type: ReactionType) {
    if (working) return;
    setError("");
    const hadReaction = mine.has(type);
    setWorking(type);
    setMine((current) => {
      const next = new Set(current);
      if (hadReaction) next.delete(type);
      else next.add(type);
      return next;
    });
    setCounts((current) => ({
      ...current,
      [type]: Math.max(0, (current[type] || 0) + (hadReaction ? -1 : 1)),
    }));
    try {
      const response = await fetch(`/api/pilot/publicacoes/${postId}/reacoes`, {
        method: hadReaction ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: type }),
      });
      const payload = await response.json() as { error?: string; contagens?: Record<ReactionType, number>; minhas?: ReactionType[] };
      if (!response.ok) throw new Error(payload.error || "Não foi possível registrar a reação.");
      if (payload.contagens) setCounts(payload.contagens);
      if (payload.minhas) setMine(new Set(payload.minhas));
      setPickerOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a reação. Tente novamente.");
      setMine((current) => {
        const next = new Set(current);
        if (hadReaction) next.add(type);
        else next.delete(type);
        return next;
      });
      setCounts((current) => ({
        ...current,
        [type]: Math.max(0, (current[type] || 0) + (hadReaction ? 1 : -1)),
      }));
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="community-reactions" data-open={pickerOpen ? "true" : undefined} onKeyDown={(event) => {
      if (event.key === "Escape" && pickerOpen) { event.stopPropagation(); setPickerOpen(false); triggerRef.current?.focus({ preventScroll: true }); }
    }}>
      <div className="community-reaction-summary" aria-label={total ? `${total} reações` : "Ainda não há reações"}>
        {REACTIONS.filter((reaction) => counts[reaction.type]).slice(0, 3).map((reaction) => (
          <span key={reaction.type} aria-hidden="true">{reaction.icon}</span>
        ))}
        {total > 0 && <small>{total} {total === 1 ? "reação" : "reações"}</small>}
      </div>
      <button
        type="button"
        ref={triggerRef}
        className="community-reactions-trigger"
        aria-expanded={pickerOpen}
        aria-controls={`reaction-picker-${postId}`}
        onClick={() => setPickerOpen((open) => !open)}
      >
        <span aria-hidden="true">♡</span>{mine.size ? "Reagiu" : "Reagir"}
      </button>
      <div id={`reaction-picker-${postId}`} className="community-reaction-picker" role="group" aria-label="Reagir à publicação" hidden={!pickerOpen}>
        {REACTIONS.map((reaction) => (
          <button
            key={reaction.type}
            type="button"
            title={reaction.label}
            aria-label={`${reaction.label}${mine.has(reaction.type) ? ", remover reação" : ""}`}
            aria-pressed={mine.has(reaction.type)}
            disabled={working !== null}
            onClick={() => void toggle(reaction.type)}
          >
            <span aria-hidden="true">{reaction.icon}</span>
            <small>{reaction.label}</small>
          </button>
        ))}
      </div>
      {error && <small className="community-reaction-error" role="alert">{error}</small>}
    </div>
  );
}
