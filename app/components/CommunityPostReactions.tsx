"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import TransientFeedback from "./TransientFeedback";
import ReactionSymbol from "./feed/ReactionSymbol";
import "./feed/feed-interactions.css";

const REACTIONS = [
  { type: "AMEM", label: "Amém" },
  { type: "CORACAO", label: "Amei" },
  { type: "ORACAO", label: "Estou orando" },
  { type: "ALEGRIA", label: "Que alegria" },
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
  const [announcement, setAnnouncement] = useState("");
  const pickerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inFlightRef = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusOnOpen = useRef(true);
  const [placement, setPlacement] = useState("above");

  function cancelHover() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }

  function openPicker(focus = true) {
    cancelHover();
    focusOnOpen.current = focus;
    setPlacement((triggerRef.current?.getBoundingClientRect().top || 0) < 220 ? "below" : "above");
    setPickerOpen(true);
  }

  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const picker = pickerRef.current;
    if (focusOnOpen.current) (picker?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') || picker?.querySelector<HTMLButtonElement>('[data-reaction]'))?.focus({ preventScroll: true });
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setPickerOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [pickerOpen]);

  const total = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts],
  );

  async function toggle(type: ReactionType) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError("");
    setAnnouncement("Salvando reação…");
    const hadReaction = mine.has(type);
    const previousMine = new Set(mine);
    const previousCounts = { ...counts };
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
      const label = REACTIONS.find((reaction) => reaction.type === type)?.label;
      setAnnouncement(`${label}: reação ${hadReaction ? "removida" : "adicionada"}.`);
      const restoreFocus = pickerRef.current?.contains(document.activeElement);
      setPickerOpen(false);
      if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
    } catch (cause) {
      setAnnouncement("");
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a reação. Tente novamente.");
      setMine(previousMine);
      setCounts(previousCounts);
    } finally {
      inFlightRef.current = false;
      setWorking(null);
    }
  }

  const selected = REACTIONS.filter((reaction) => mine.has(reaction.type));

  return (
    <div ref={rootRef} className="community-reactions feed-reactions" data-open={pickerOpen ? "true" : undefined}
      onPointerEnter={cancelHover}
      onPointerLeave={(event) => {
        cancelHover();
        if (event.pointerType === "mouse" && !rootRef.current?.contains(document.activeElement)) {
          hoverTimer.current = setTimeout(() => setPickerOpen(false), 260);
        }
      }} onKeyDown={(event) => {
      if (event.key === "Escape" && pickerOpen) { event.preventDefault(); event.stopPropagation(); setPickerOpen(false); triggerRef.current?.focus({ preventScroll: true }); }
    }}>
      <button
        type="button"
        ref={triggerRef}
        className="community-reactions-trigger"
        data-reacted={mine.size > 0}
        aria-haspopup="dialog"
        aria-label={selected.length ? `Suas reações: ${selected.map((reaction) => reaction.label).join(", ")}. Alterar reações` : "Reagir à publicação"}
        aria-expanded={pickerOpen}
        aria-controls={pickerId}
        onPointerEnter={(event) => {
          cancelHover();
          if (event.pointerType === "mouse" && !pickerOpen) hoverTimer.current = setTimeout(() => openPicker(false), 180);
        }}
        onClick={() => { cancelHover(); if (pickerOpen) setPickerOpen(false); else openPicker(); }}
        onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); openPicker(); } }}
      >
        {selected[0] ? <ReactionSymbol type={selected[0].type} /> : <span aria-hidden="true">♡</span>}{selected.length === 1 ? selected[0].label : selected.length ? "Reagiu" : "Reagir"}
      </button>
      {total > 0 && <div className="community-reaction-summary" role="img" aria-label={`${total} ${total === 1 ? "reação" : "reações"}: ${REACTIONS.filter((reaction) => counts[reaction.type]).map((reaction) => `${reaction.label}: ${counts[reaction.type]}`).join(", ")}`}>
        {REACTIONS.filter((reaction) => counts[reaction.type]).map((reaction) => (
          <ReactionSymbol key={reaction.type} type={reaction.type} />
        ))}
        <small aria-hidden="true">{total}</small>
      </div>}
      <div ref={pickerRef} id={pickerId} className="community-reaction-picker" data-placement={placement} role="dialog" aria-labelledby={`${pickerId}-title`} aria-describedby={`${pickerId}-hint`} hidden={!pickerOpen}>
        <div className="feed-reaction-heading">
          <strong id={`${pickerId}-title`}>Um gesto de carinho</strong>
          <button type="button" className="feed-reaction-close" aria-label="Fechar reações" onClick={() => { setPickerOpen(false); triggerRef.current?.focus({ preventScroll: true }); }}>×</button>
        </div>
        <span id={`${pickerId}-hint`} className="feed-interaction-sr-only">Escolha uma ou mais reações. Toque novamente para remover.</span>
        <div className="feed-reaction-options" role="group" aria-label="Reações" aria-busy={working !== null} onKeyDown={(event) => {
          const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
          if (!keys.includes(event.key)) return;
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
          event.preventDefault();
          buttons[next]?.focus();
        }}>
        {REACTIONS.map((reaction) => (
          <button
            key={reaction.type}
            type="button"
            title={reaction.label}
            aria-label={`${reaction.label}${mine.has(reaction.type) ? ", remover reação" : ""}`}
            aria-pressed={mine.has(reaction.type)}
            aria-disabled={working !== null}
            data-reaction={reaction.type}
            onClick={() => void toggle(reaction.type)}
          >
            <ReactionSymbol type={reaction.type} />
            <small>{reaction.label}</small>
            {mine.has(reaction.type) && <span className="feed-reaction-check" aria-hidden="true">✓</span>}
          </button>
        ))}
        </div>
      </div>
      <span className="feed-interaction-sr-only" role="status" aria-live="polite">{announcement}</span>
      {error && <TransientFeedback className="community-reaction-error" role="alert">{error}</TransientFeedback>}
    </div>
  );
}
