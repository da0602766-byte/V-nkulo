"use client";
import SafeImage from "./SafeImage";


import Link from "./StableLink";
import CommunityPresencePanel from "./CommunityPresencePanel";
import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import ResponsiveFeedImage from "./ResponsiveFeedImage";
import NativeImageUpload from "./NativeImageUpload";
import CommunityPostInteractions from "./CommunityPostInteractions";
import CommunityPostShare from "./CommunityPostShare";
import CommunityPostReactions from "./CommunityPostReactions";
import VerifiedOwnerName from "./VerifiedOwnerName";
import FeedHighlights from "./feed/FeedHighlights";
import FeedComposerBar, { type ComposerIntent } from "./feed/FeedComposerBar";
import FeedIcon from "./feed/FeedIcon";
import useFeedDialog from "./feed/useFeedDialog";
import FeedChannelChoices from "./feed/FeedChannelChoices";
import TransientFeedback from "./TransientFeedback";
import introStyles from "./EventsAgenda.module.css";

type FeedItem = {
  id: number;
  titulo: string;
  resumo: string;
  conteudo: string;
  categoria: string;
  visibilidade: "COMUNIDADE" | "PLATAFORMA";
  status: "RASCUNHO" | "EM_ANALISE" | "PUBLICADA";
  origem: string;
  criado_em: string;
  criado_por?: number | null;
  comentarios_habilitados?: number;
  can_edit?: number;
  can_hide?: number;
  can_delete?: number;
  autor_nome?: string | null;
  autor_foto?: string | null;
  autor_papel?: string | null;
  autor_verificado?: number;
  total_comentarios?: number;
  reacoes_json?: string;
  minhas_reacoes_json?: string;
  imagem_url?: string;
  imagem_thumbnail_url?: string;
  imagem_alt?: string;
  imagem_width?: number;
  imagem_height?: number;
  links_json?: string;
  audiencia_tipo?: "PUBLICO" | "MINISTERIOS";
  ministerios_json?: string;
  canal_feed?: number;
  canal_lateral?: number;
};

type MinistryOption = { id: number; nome: string };

type EventItem = {
  id: number;
  titulo: string;
  descricao?: string;
  inicia_em: string;
  termina_em?: string | null;
  local: string;
  status: string;
  criado_por?: number | null;
  categoria?: string;
};

type ScheduleAssignment = {
  id: number;
  usuario_id: number;
  nome: string;
  funcao: string;
  status: "PENDENTE" | "CONFIRMADA" | "INDISPONIVEL" | "AUSENTE";
  is_mine: number;
  owner_verified?: number;
};

type ScheduleItem = {
  id: number;
  ministerio_id: number;
  ministerio_nome: string;
  titulo: string;
  inicia_em: string;
  termina_em: string;
  local: string;
  status: string;
  designacoes: ScheduleAssignment[];
  substitution_candidates: ReplacementCandidate[];
};

type ReplacementCandidate = {
  voluntarioId: number;
  usuarioId: number;
  nome: string;
  funcao: string;
  fotoPerfil: string | null;
};

export default function CommunityHome({
  communityName,
  communitySlug,
  permissions,
  initialFeed,
  currentUserId,
  userName,
  userPhotoUrl,
  eventsEnabled = true,
  onNavigate,
  readOnlyFeed = false,
}: {
  communityName: string;
  communitySlug: string;
  permissions: string[];
  initialFeed: FeedItem[];
  currentUserId: number;
  userName: string;
  userPhotoUrl?: string;
  eventsEnabled?: boolean;
  onNavigate?: (view: "eventos" | "solicitacoes" | "escalas", create?: boolean) => void;
  readOnlyFeed?: boolean;
}) {
  const [posts, setPosts] = useState<FeedItem[]>(initialFeed);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [postActionsId, setPostActionsId] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerIntent, setComposerIntent] = useState<ComposerIntent>("text");
  const [composerOptionsOpen, setComposerOptionsOpen] = useState(false);
  const introId = useId();
  const [introState, setIntroState] = useState<"auto" | "open" | "closed">("auto");
  const introOpen = introState !== "closed";
  useEffect(() => {
    if (introState !== "auto") return;
    const timer = window.setTimeout(() => setIntroState("closed"), 5_200);
    return () => window.clearTimeout(timer);
  }, [introState]);
  const [feedSearch, setFeedSearch] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [composerImageUrl, setComposerImageUrl] = useState("");
  const [editingImageUrl, setEditingImageUrl] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedLoadError, setFeedLoadError] = useState("");
  const [feedFilter, setFeedFilter] = useState<"TODOS" | "COMUNICADOS" | "EVENTOS" | "MINISTERIOS">("TODOS");
  const [scheduleWorkingId, setScheduleWorkingId] = useState<number | null>(null);
  const [scheduleFeedback, setScheduleFeedback] = useState("");
  const [replacementScheduleId, setReplacementScheduleId] = useState<number | null>(null);
  const [replacementVolunteerId, setReplacementVolunteerId] = useState(0);
  const [renderedAt] = useState(() => Date.now());
  const feedSentinelRef = useRef<HTMLDivElement | null>(null);
  const composerTitleRef = useRef<HTMLInputElement | null>(null);
  const composerContentRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [ministries, setMinistries] = useState<MinistryOption[]>([]);
  const [audienceType, setAudienceType] = useState<"PUBLICO" | "MINISTERIOS">("PUBLICO");
  const [selectedMinistries, setSelectedMinistries] = useState<number[]>([]);
  const feedAbortRef = useRef<AbortController | null>(null);
  const feedRequestRef = useRef(0);
  const canPublish = !readOnlyFeed && permissions.includes("feed.publish");
  const canViewSchedules = permissions.includes("schedules.view");
  const scrollKey = `vinkulo-community-feed-scroll:${communitySlug}`;

  const busyRef = useRef(working);
  useEffect(() => { busyRef.current = working; }, [working]);
  const closeDialog = useCallback(() => {
    if (busyRef.current) return;
    setComposerOpen(false);
    setEditingId(null);
    setPostActionsId(null);
  }, []);
  useFeedDialog(editingId !== null ? `edit-${editingId}` : postActionsId !== null ? `actions-${postActionsId}` : "", closeDialog);

  function openComposer(intent: ComposerIntent = "text") {
    setComposerIntent(intent);
    setComposerOpen(true);
    setComposerOptionsOpen(intent !== "text");
    requestAnimationFrame(() => {
      const form = composerTitleRef.current?.form;
      const target = intent === "event" ? form?.querySelector<HTMLElement>('[name="eventId"]') : intent === "image" ? form?.querySelector<HTMLElement>(".composer-image-option") : composerTitleRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      target?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    if (!canPublish) return;
    const open = () => {
      setComposerIntent("text"); setComposerOpen(true);
      requestAnimationFrame(() => { composerTitleRef.current?.scrollIntoView({ block: "center" }); composerTitleRef.current?.focus({ preventScroll: true }); });
    };
    window.addEventListener("vinkulo:new-publication", open);
    return () => window.removeEventListener("vinkulo:new-publication", open);
  }, [canPublish]);

  useEffect(() => {
    if (!composerOpen || ministries.length) return;
    let active = true;
    void fetch("/api/pilot/ministerios", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : {})
      .then((result: { ministerios?: Array<Record<string, unknown>> }) => {
        if (!active) return;
        setMinistries((result.ministerios || []).map((item) => ({
          id: Number(item.id), nome: String(item.nome || "Ministério"),
        })).filter((item) => item.id > 0));
      }).catch(() => undefined);
    return () => { active = false; };
  }, [composerOpen, ministries.length]);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError("");
    // O feed já possui uma primeira versão entregue pelo servidor. Atualizamos
    // publicações, eventos e escalas em paralelo, mas somente a resposta de
    // publicações controla o estado visual do mural. Assim uma agenda ou escala
    // lenta não mantém publicações já visíveis marcadas como “Atualizando…”.
    const feedTask = (async () => {
      try {
        const response = await fetch("/api/pilot/publicacoes?limit=10", { cache: "no-store" });
        const result = await readJson<Record<string, unknown>>(response);
        if (!response.ok) {
          throw new Error(
            String(result.error || "Não foi possível carregar o feed."),
          );
        }
        setPosts((result.publicacoes || []) as FeedItem[]);
        setFeedCursor(String(result.nextCursor || "") || null);
        setFeedHasMore(Boolean(result.hasMore));
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    const eventsTask = readOnlyFeed || !eventsEnabled
      ? Promise.resolve()
      : (async () => {
          try {
            const response = await fetch("/api/pilot/eventos", { cache: "no-store" });
            const result = await readJson<Record<string, unknown>>(response);
            if (!response.ok) throw new Error("Não foi possível carregar os eventos.");
            setEvents((result.eventos || []) as EventItem[]);
            setEventsError("");
          } catch {
            setEventsError("Não foi possível carregar os eventos.");
          }
        })();
    const schedulesTask = !readOnlyFeed && canViewSchedules
      ? (async () => {
          try {
            // A trilha mostra no máximo quatro escalas com participação
            // pendente; o filtro e o limite vão ao servidor em vez de
            // baixar o lote inteiro para descartar quase tudo aqui.
            const response = await fetch("/api/pilot/escalas?filtro=minhas-pendentes&limite=4", { cache: "no-store" });
            const result = await readJson<Record<string, unknown>>(response);
            if (response.ok) setSchedules((result.escalas || []) as ScheduleItem[]);
          } catch {
            // Escalas são auxiliares e não impedem a leitura do mural.
          }
        })()
      : Promise.resolve();
    await Promise.all([feedTask, eventsTask, schedulesTask]);
  }, [canViewSchedules, readOnlyFeed, eventsEnabled]);

  const refreshFeed = useCallback(async () => {
    const response = await fetch("/api/pilot/publicacoes?limit=10", { cache: "no-store" });
    const payload = await response.json() as { publicacoes?: FeedItem[]; nextCursor?: string | null; hasMore?: boolean; error?: string };
    if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar o feed.");
    setPosts(payload.publicacoes || []);
    setFeedCursor(payload.nextCursor || null);
    setFeedHasMore(Boolean(payload.hasMore));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHome(), 0);
    return () => window.clearTimeout(timer);
  }, [loadHome]);

  const loadMorePosts = useCallback(async () => {
    if (!feedCursor || !feedHasMore || feedLoadingMore || posts.length >= 60) {
      return;
    }
    setFeedLoadingMore(true);
    setFeedLoadError("");
    feedAbortRef.current?.abort();
    const controller = new AbortController();
    feedAbortRef.current = controller;
    const requestId = ++feedRequestRef.current;
    try {
      const response = await fetch(
        `/api/pilot/publicacoes?limit=10&cursor=${encodeURIComponent(feedCursor)}`,
        { cache: "no-store", signal: controller.signal },
      );
      const result = (await response.json()) as {
        publicacoes?: FeedItem[];
        nextCursor?: string | null;
        hasMore?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar mais.");
      }
      if (requestId !== feedRequestRef.current) return;
      setPosts((current) => {
        const ids = new Set(current.map((post) => post.id));
        return [
          ...current,
          ...(result.publicacoes || []).filter((post) => !ids.has(post.id)),
        ].slice(0, 60);
      });
      setFeedCursor(result.nextCursor || null);
      setFeedHasMore(Boolean(result.hasMore));
    } catch (loadError) {
      if ((loadError as Error).name !== "AbortError") {
        setFeedLoadError((loadError as Error).message);
      }
    } finally {
      if (requestId === feedRequestRef.current) setFeedLoadingMore(false);
    }
  }, [feedCursor, feedHasMore, feedLoadingMore, posts.length]);

  useEffect(() => {
    const saved = Number(sessionStorage.getItem(scrollKey) || 0);
    const restoreTimer = window.setTimeout(() => {
      if (saved > 0) window.scrollTo({ top: saved, behavior: "instant" });
    }, 0);
    const saveScroll = () =>
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      window.clearTimeout(restoreTimer);
      saveScroll();
      window.removeEventListener("scroll", saveScroll);
      feedAbortRef.current?.abort();
    };
  }, [scrollKey]);

  useEffect(() => {
    const target = feedSentinelRef.current;
    if (!target || !feedHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMorePosts();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [feedHasMore, loadMorePosts]);

  const upcomingEvents = useMemo(
    () =>
      events
        .filter((item) => item.status === "PUBLICADO" && Date.parse(item.termina_em || item.inicia_em) >= renderedAt)
        .sort(
          (left, right) =>
            Date.parse(left.inicia_em) - Date.parse(right.inicia_em),
        )
        .slice(0, 3),
    [events, renderedAt],
  );
  const myEvents = useMemo(
    () => events.filter((item) => item.criado_por === currentUserId && item.status !== "CANCELADO"),
    [currentUserId, events],
  );

  const myUpcomingSchedules = useMemo(
    () =>
      schedules
        .filter(
          (schedule) =>
            ["PUBLICADA", "AGUARDANDO_CHECKLIST"].includes(schedule.status) &&
            Date.parse(schedule.termina_em) >= renderedAt &&
            schedule.designacoes.some(
              (assignment) => Boolean(assignment.is_mine) && assignment.status === "PENDENTE",
            ),
        )
        .sort((left, right) => Date.parse(left.inicia_em) - Date.parse(right.inicia_em))
        .slice(0, 4),
    [renderedAt, schedules],
  );

  const pendingSchedules = myUpcomingSchedules.filter((schedule) =>
    schedule.designacoes.some(
      (assignment) => Boolean(assignment.is_mine) && assignment.status === "PENDENTE",
    ),
  ).length;

  const visiblePosts = useMemo(() => posts.filter((post) => {
    const query = feedSearch.trim().toLocaleLowerCase("pt-BR");
    if (query && !`${post.titulo} ${post.conteudo || post.resumo} ${post.autor_nome || communityName}`.toLocaleLowerCase("pt-BR").includes(query)) return false;
    if (feedFilter === "TODOS") return true;
    if (feedFilter === "EVENTOS") return post.categoria === "EVENTO";
    if (feedFilter === "MINISTERIOS") return post.audiencia_tipo === "MINISTERIOS" || ["JUVENTUDE", "ACAO_SOCIAL"].includes(post.categoria);
    return post.categoria !== "EVENTO" && post.audiencia_tipo !== "MINISTERIOS";
  }), [feedFilter, feedSearch, posts, communityName]);
  const [seenHighlights, setSeenHighlights] = useState<number[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved: unknown = JSON.parse(sessionStorage.getItem(`vinkulo:seen-highlights:${communitySlug}`) || "[]"); setSeenHighlights(Array.isArray(saved) ? saved.filter((id): id is number => typeof id === "number") : []); } catch { setSeenHighlights([]); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [communitySlug]);
  const highlights = useMemo(() => posts.filter((post) => post.status === "PUBLICADA" && !seenHighlights.includes(post.id)).slice(0, 8), [posts, seenHighlights]);
  function openHighlight(id: number) {
    setSeenHighlights((current) => { const next = [...new Set([...current, id])]; try { sessionStorage.setItem(`vinkulo:seen-highlights:${communitySlug}`, JSON.stringify(next)); } catch {} return next; });
    setFeedSearch("");
    setFeedFilter("TODOS");
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`publicacao-${id}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
  }

  async function respondToSchedule(
    scheduleId: number,
    status: "CONFIRMADA" | "INDISPONIVEL",
    substitutoVoluntarioId?: number,
  ) {
    setScheduleWorkingId(scheduleId);
    setScheduleFeedback("");
    try {
      const response = await fetch(`/api/pilot/escalas/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "RESPONDER", status, substitutoVoluntarioId }),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível registrar sua resposta.");
      }
      setSchedules((current) =>
        current.map((schedule) =>
          schedule.id !== scheduleId
            ? schedule
            : {
                ...schedule,
                designacoes: schedule.designacoes.map((assignment) =>
                  assignment.is_mine ? { ...assignment, status } : assignment,
                ),
              },
        ),
      );
      setReplacementScheduleId(null);
      setReplacementVolunteerId(0);
      setScheduleFeedback(
        status === "CONFIRMADA"
          ? "Presença confirmada. A liderança responsável foi avisada."
          : substitutoVoluntarioId
            ? "Indisponibilidade registrada. A pessoa indicada recebeu a escala para confirmar."
            : "Indisponibilidade registrada. A liderança responsável foi avisada.",
      );
    } catch (cause) {
      setScheduleFeedback((cause as Error).message);
    } finally {
      setScheduleWorkingId(null);
    }
  }

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setWorking(true);
    setFeedback("");
    setError("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/pilot/publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.get("titulo"),
          conteudo: form.get("conteudo"),
          categoria: form.get("categoria"),
          visibilidade: "COMUNIDADE",
          status: form.get("status"),
          comentariosHabilitados: form.get("comentariosHabilitados") === "on",
          imagemUrl: composerImageUrl,
          imagemAlt: form.get("imagemAlt"),
          links: String(form.get("links") || "").split(/\r?\n/),
          eventId: form.get("eventId") || undefined,
          audienciaTipo: audienceType,
          ministerioIds: audienceType === "MINISTERIOS" ? selectedMinistries : [],
          canalFeed: form.get("publicationChannel") !== "sidebar",
          canalLateral: form.get("publicationChannel") !== "feed",
        }),
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível publicar.");
      }
      setFeedback(result.message || (form.get("status") === "PUBLICADA" ? "Publicação enviada para aprovação." : "Rascunho salvo."));
      formElement.reset();
      setComposerImageUrl("");
      setSelectedEventId("");
      setAudienceType("PUBLICO");
      setSelectedMinistries([]);
      setComposerOpen(false);
      await refreshFeed();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function approvePost(id: number) {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/pilot/publicacoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "APROVAR" }),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível aprovar.");
      setFeedback("Publicação aprovada e liberada nos canais escolhidos.");
      await refreshFeed();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function editPost(
    event: FormEvent<HTMLFormElement>,
    post: FeedItem,
  ) {
    event.preventDefault();
    setWorking(true);
    setFeedback("");
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/pilot/publicacoes/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.get("titulo"),
          conteudo: form.get("conteudo"),
          categoria: form.get("categoria"),
          visibilidade: "COMUNIDADE",
          status: form.get("status"),
          comentariosHabilitados:
            form.get("comentariosHabilitados") === "on",
          imagemUrl: editingImageUrl,
          imagemAlt: form.get("imagemAlt"),
          links: String(form.get("links") || "").split(/\r?\n/),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível editar.");
      }
      setEditingId(null);
      setEditingImageUrl("");
      setFeedback("Publicação atualizada pelo autor.");
      await refreshFeed();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function archivePost(id: number) {
    if (!window.confirm("Arquivar esta publicação sem apagar o histórico?")) {
      return;
    }
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(`/api/pilot/publicacoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "ARQUIVAR" }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível arquivar.");
      }
      setFeedback("Publicação arquivada.");
      await refreshFeed();
    } catch (archiveError) {
      setError((archiveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function deletePost(id: number) {
    if (
      !window.confirm(
        "Excluir definitivamente esta publicação, comentários e interações vinculadas?",
      )
    ) {
      return;
    }
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(`/api/pilot/publicacoes/${id}`, {
        method: "DELETE",
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível excluir.");
      }
      setFeedback("Publicação excluída.");
      await refreshFeed();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={`worship-feed community-feed-redesign ${introStyles.workspace}`} aria-busy={loading}>
      <div className={introStyles.titlebar}>
        <h1>Mural</h1>
        <button type="button" className={introStyles.introToggle} aria-expanded={introOpen} aria-controls={introId} onClick={() => setIntroState(introOpen ? "closed" : "open")}>
          {introOpen ? "Recolher apresentação" : "Sobre a comunidade"}<span aria-hidden="true">{introOpen ? "−" : "+"}</span>
        </button>
      </div>
      <div id={introId} className={introStyles.intro} data-open={introOpen} aria-hidden={!introOpen} inert={!introOpen}>
      <div className={introStyles.introClip}>
      <header className="worship-welcome">
        <div><p className="worship-eyebrow">VIDA EM COMUNIDADE</p>
          <h2>Fé que conecta pessoas.<br />Comunidade que <em>transforma.</em></h2>
          <p className="worship-community-name">{communityName}</p>
        </div>
        <Link className="worship-signature" href={`/comunidades/${communitySlug}`} aria-label={`Página pública de ${communityName}`}>Juntos, por<br />algo maior.<FeedIcon name="heart" /></Link>
      </header>
      </div></div>
      {!readOnlyFeed && <nav className="worship-context-nav" aria-label="Acontece na comunidade">
        {eventsEnabled && <button type="button" onClick={() => onNavigate?.("eventos")}><FeedIcon name="calendar" />Agenda</button>}
        <button type="button" onClick={() => onNavigate?.("solicitacoes")}><FeedIcon name="heart" />Pedidos</button>
        <button type="button" aria-expanded={contextOpen} aria-controls="feed-community-context" onClick={() => setContextOpen((value) => !value)}><FeedIcon name="people" />Comunidade</button>
      </nav>}

      {readOnlyFeed && (
        <div className="owner-readonly-banner">
          <span aria-hidden="true">◎</span>
          <div>
            <strong>Visualização protegida</strong>
            <p>
              Esta comunidade pertence a outra pessoa. Como proprietário da
              plataforma, você pode visualizar o feed, mas não acessa membros,
              configurações ou dados internos.
            </p>
          </div>
        </div>
      )}

      {(feedback || error) && (
        <TransientFeedback className={`operations-feedback ${error ? "error" : ""}`} role="status">
          {error || feedback}
        </TransientFeedback>
      )}

      <div className={`worship-layout ${readOnlyFeed ? "feed-only" : ""}`}>
        <div className="worship-main">
          <FeedHighlights items={highlights} onSelect={openHighlight} onCreate={canPublish ? () => openComposer() : undefined} />
      {canPublish && (
        <section className="worship-composer">
          <button type="button" hidden={composerOpen} className="worship-composer-prompt" aria-label="O que você quer compartilhar?" aria-expanded={composerOpen} aria-controls="community-publication-form" disabled={working} onClick={() => openComposer()}>
            <span className="worship-avatar" aria-hidden="true">{userPhotoUrl ? <SafeImage fallbackName={userName} fallbackKind="avatar" src={userPhotoUrl} alt="" width="36" height="36" /> : userName.split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join("")}</span>
            <strong>O que você quer compartilhar?</strong><FeedIcon name="plus" />
          </button>
          <div className="composer-inline-title" hidden={!composerOpen}>
            <span className="worship-avatar" aria-hidden="true">{userPhotoUrl ? <SafeImage fallbackName={userName} fallbackKind="avatar" src={userPhotoUrl} alt="" width="36" height="36" /> : userName.split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join("")}</span>
            <input ref={composerTitleRef} form="community-publication-form" name="titulo" aria-label="Título da publicação" placeholder="O que você quer compartilhar?" required maxLength={140} />
            <button type="button" disabled={working} onClick={() => setComposerOpen(false)} aria-label="Recolher formulário de publicação">×</button>
          </div>
          <FeedComposerBar hasEvents={myEvents.length > 0} onOpen={openComposer} onEvent={eventsEnabled && onNavigate ? () => onNavigate("eventos", true) : undefined} onSchedule={permissions.includes("schedules.manage") && onNavigate ? () => onNavigate("escalas", true) : undefined} onRequest={!readOnlyFeed && onNavigate ? () => onNavigate("solicitacoes", true) : undefined} />
          <div className="community-composer-reveal" hidden={!composerOpen}>
          <form id="community-publication-form" className="pilot-form community-composer-inline" aria-label="Criar publicação" onSubmit={createPost}>
            <label className="composer-wide">
              Conteúdo
              <textarea ref={composerContentRef} name="conteudo" required maxLength={3000} rows={3} placeholder="Escreva uma mensagem para sua comunidade…" />
            </label>
            <details className="composer-options composer-wide" open={composerOptionsOpen} onToggle={(event) => setComposerOptionsOpen(event.currentTarget.open)}>
            <summary>Imagem, evento e opções de publicação</summary>
            <div className="composer-options-fields">
            {myEvents.length > 0 && (
              <label className="composer-wide community-event-publish-field">
                Puxar um evento criado por você
                <select
                  data-initial-focus={composerIntent === "event" ? "" : undefined}
                  name="eventId"
                  value={selectedEventId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedEventId(value);
                    const item = myEvents.find((candidate) => String(candidate.id) === value);
                    if (!item) return;
                    if (composerTitleRef.current) composerTitleRef.current.value = item.titulo;
                    if (composerContentRef.current) composerContentRef.current.value = `${item.descricao || ""}\n\n📅 ${formatDateTime(item.inicia_em)}${item.local ? ` · ${item.local}` : ""}`.trim();
                  }}
                >
                  <option value="">Não vincular evento</option>
                  {myEvents.map((item) => (
                    <option value={item.id} key={item.id}>{item.titulo}</option>
                  ))}
                </select>
                <small>Ao selecionar, os dados do evento e o link próprio de inscrição são incluídos automaticamente.</small>
              </label>
            )}
            <div className="composer-wide composer-image-option" tabIndex={composerIntent === "image" ? 0 : undefined}>
              <NativeImageUpload
                label="Imagem da publicação (opcional)"
                value={composerImageUrl}
                purpose="post-image"
                onChange={setComposerImageUrl}
              />
            </div>
            <label className="composer-wide">
              Links para divulgação (opcional)
              <textarea
                name="links"
                rows={3}
                maxLength={4000}
                inputMode="url"
                placeholder={"https://...\nUm link por linha · máximo de 5"}
              />
              <small>Use para inscrições, ingressos, localização ou detalhes do evento.</small>
            </label>
            <label>
              Categoria
              <select name="categoria" defaultValue="COMUNIDADE">
                <option value="COMUNIDADE">Comunidade</option>
                <option value="CULTO">Culto</option>
                <option value="EVENTO">Evento</option>
                <option value="TESTEMUNHO">Testemunho</option>
                <option value="ACAO_SOCIAL">Ação social</option>
                <option value="JUVENTUDE">Juventude</option>
                <option value="AVISO">Aviso</option>
              </select>
            </label>
            <label>
              Estado
              <select name="status" defaultValue="PUBLICADA">
                <option value="PUBLICADA">Enviar para aprovação</option>
                <option value="RASCUNHO">Salvar rascunho</option>
              </select>
            </label>
            <label>
              Quem verá
              <select value={audienceType} onChange={(event) => setAudienceType(event.target.value as "PUBLICO" | "MINISTERIOS")}>
                <option value="PUBLICO">Toda a comunidade</option>
                <option value="MINISTERIOS">Ministérios específicos</option>
              </select>
            </label>
            {audienceType === "MINISTERIOS" && (
              <fieldset className="composer-ministry-audience composer-wide">
                <legend>Escolha os ministérios</legend>
                {ministries.map((ministry) => <label key={ministry.id}><input type="checkbox" checked={selectedMinistries.includes(ministry.id)} onChange={(event) => setSelectedMinistries((current) => event.target.checked ? [...new Set([...current, ministry.id])] : current.filter((id) => id !== ministry.id))} /><span>{ministry.nome}</span></label>)}
                {!ministries.length && <small>Nenhum ministério ativo disponível.</small>}
              </fieldset>
            )}
            <FeedChannelChoices />
            <label className="composer-share">
              <input
                type="checkbox"
                name="comentariosHabilitados"
                defaultChecked
              />
              <span>Permitir comentários de usuários com conta ativa</span>
            </label>
            </div></details>
            {error && <TransientFeedback className="operations-feedback error composer-wide" role="alert">{error}</TransientFeedback>}
            <button disabled={working}>
              {working ? "Salvando…" : "Salvar publicação"}
            </button>
          </form>
          </div>
        </section>
      )}


          <header id="mural" className="worship-feed-heading">
            <h2>Feed da comunidade</h2>
            {loading && <span role="status">Atualizando…</span>}
          </header>
          <label className="worship-search"><FeedIcon name="search" /><span className="sr-only">Buscar nas publicações carregadas</span><input type="search" value={feedSearch} onChange={(event) => setFeedSearch(event.target.value)} placeholder="Buscar nas publicações carregadas…" /></label>
          <nav className="worship-tabs" aria-label="Filtrar atualizações">
            {([
              ["TODOS", "Para você"],
              ["COMUNICADOS", "Comunicados"],
              ["EVENTOS", "Eventos"],
              ["MINISTERIOS", "Ministérios"],
            ] as const).map(([filter, label]) => (
              <button key={filter} type="button" aria-pressed={feedFilter === filter} onClick={() => setFeedFilter(filter)}>{label}</button>
            ))}
          </nav>
          {loading && !posts.length ? (
            <div className="community-feed-loading" role="status" aria-label="Carregando publicações">
              <span /><span /><span /><small>Carregando publicações…</small>
            </div>
          ) : error && !posts.length ? (
            <div className="worship-empty" role="alert"><FeedIcon name="heart" /><h3>Não foi possível carregar o feed.</h3><p>{error}</p><button type="button" onClick={() => void loadHome()}>Tentar novamente</button></div>
          ) : visiblePosts.length ? (
            <div className="worship-posts">
              {visiblePosts.map((post) => (
                <article
                  key={post.id}
                  id={`publicacao-${post.id}`}
                  className="worship-post"
                  tabIndex={-1}
                >
                  <header>
                    <span className="worship-avatar">
                      {post.autor_foto ? <SafeImage fallbackName={post.autor_nome || communityName} fallbackKind="avatar" loading="lazy" src={post.autor_foto} alt="" /> : getInitials(post.autor_nome || communityName)}
                    </span>
                    <div>
                      <VerifiedOwnerName
                        name={post.autor_nome || communityName}
                        verified={Boolean(post.autor_verificado)}
                      />
                      <small>
                        {post.autor_papel ? `${roleLabel(post.autor_papel)} · ` : ""}{formatDate(post.criado_em)} ·{" "}
                        somente comunidade
                      </small>
                    </div>
                    <div className="community-post-header-actions">
                      <span>{post.categoria.replaceAll("_", " ")}</span>
                      <button
                        type="button"
                        className="community-post-top-actions-trigger"
                        aria-label="Abrir ações da publicação"
                        aria-haspopup="dialog"
                        aria-expanded={postActionsId === post.id}
                        onClick={() => setPostActionsId(post.id)}
                      >•••</button>
                      {postActionsId === post.id && typeof document !== "undefined" && createPortal(
                        <div
                          className="community-post-actions-overlay"
                          role="presentation"
                          onMouseDown={(event) => {
                            if (event.target === event.currentTarget) setPostActionsId(null);
                          }}
                        >
                          <section
                            data-feed-dialog className="community-post-actions-dialog"
                            role="dialog"
                            aria-modal="true"
                            aria-label={`Ações de ${post.titulo}`}
                          >
                            <header><strong>Ações da publicação</strong><button type="button" onClick={() => setPostActionsId(null)} aria-label="Fechar ações">×</button></header>
                            <div>
                          {(Boolean(post.can_edit) || post.criado_por === currentUserId) && (
                            <button
                              type="button"
                              disabled={working}
                              onClick={() => {
                                setPostActionsId(null);
                                if (editingId === post.id) {
                                  setEditingId(null);
                                  setEditingImageUrl("");
                                } else {
                                  setEditingId(post.id);
                                  setEditingImageUrl(post.imagem_url || "");
                                }
                              }}
                            >Editar</button>
                          )}
                          {(Boolean(post.can_hide) || post.criado_por === currentUserId || permissions.includes("feed.moderate")) && (
                            <button type="button" disabled={working} onClick={() => {
                              setPostActionsId(null);
                              void archivePost(post.id);
                            }}>Ocultar</button>
                          )}
                          {Boolean(post.can_delete) && (
                            <button type="button" className="danger-button" disabled={working} onClick={() => {
                              setPostActionsId(null);
                              void deletePost(post.id);
                            }}>Excluir</button>
                          )}
                          {post.status === "EM_ANALISE" && permissions.includes("feed.moderate") && (
                            <button type="button" disabled={working} onClick={() => { setPostActionsId(null); void approvePost(post.id); }}>Aprovar publicação</button>
                          )}
                          <button type="button" onClick={() => {
                            setPostActionsId(null);
                            window.dispatchEvent(new CustomEvent("vinkulo:open-feedback", { detail: { type: "DENUNCIA", entityType: "PUBLICACAO", entityId: post.id } }));
                          }}>Denunciar publicação</button>
                            </div>
                          </section>
                        </div>,
                        document.body,
                      )}
                    </div>
                  </header>
                  <div>
                    <h3>{post.titulo}</h3>
                    <p>{post.conteudo || post.resumo}</p>
                  </div>
                  {editingId === post.id && createPortal(
                    <div
                      className="community-post-edit-overlay"
                      role="presentation"
                      onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !working) {
                          setEditingId(null);
                          setEditingImageUrl("");
                        }
                      }}
                    >
                      <form
                        data-feed-dialog className="pilot-form community-post-edit-form"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={`editar-publicacao-${post.id}`}
                        onSubmit={(event) => editPost(event, post)}
                      >
                      <header className="community-post-edit-heading">
                        <div>
                          <small>PUBLICAÇÃO</small>
                          <strong id={`editar-publicacao-${post.id}`}>Editar publicação</strong>
                        </div>
                        <button
                          type="button"
                          aria-label="Fechar edição"
                          disabled={working}
                          onClick={() => {
                            setEditingId(null);
                            setEditingImageUrl("");
                          }}
                        >×</button>
                      </header>
                      <label>
                        Título
                        <input
                          name="titulo"
                          required
                          maxLength={140}
                          defaultValue={post.titulo}
                        />
                      </label>
                      <label className="composer-wide">
                        Conteúdo
                        <textarea
                          name="conteudo"
                          required
                          maxLength={3000}
                          rows={4}
                          defaultValue={post.conteudo || post.resumo}
                        />
                      </label>
                      <div className="composer-wide">
                        <NativeImageUpload
                          label="Imagem da publicação (opcional)"
                          value={editingImageUrl}
                          purpose="post-image"
                          onChange={setEditingImageUrl}
                        />
                        <label>
                          Descrição da imagem
                          <input
                            name="imagemAlt"
                            maxLength={180}
                            defaultValue={post.imagem_alt || ""}
                          />
                        </label>
                      </div>
                      <label className="composer-wide">
                        Links para divulgação (opcional)
                        <textarea
                          name="links"
                          rows={3}
                          maxLength={4000}
                          inputMode="url"
                          defaultValue={parsePostLinks(post.links_json).join("\n")}
                          placeholder={"https://...\nUm link por linha · máximo de 5"}
                        />
                      </label>
                      <label>
                        Categoria
                        <select name="categoria" defaultValue={post.categoria}>
                          <option value="COMUNIDADE">Comunidade</option>
                          <option value="CULTO">Culto</option>
                          <option value="EVENTO">Evento</option>
                          <option value="TESTEMUNHO">Testemunho</option>
                          <option value="ACAO_SOCIAL">Ação social</option>
                          <option value="JUVENTUDE">Juventude</option>
                          <option value="AVISO">Aviso</option>
                        </select>
                      </label>
                      <label>
                        Estado
                        <select name="status" defaultValue={post.status}>
                          <option value="PUBLICADA">Publicada</option>
                          <option value="RASCUNHO">Rascunho</option>
                        </select>
                      </label>
                      <label className="composer-share">
                        <input
                          type="checkbox"
                          name="comentariosHabilitados"
                          defaultChecked={
                            post.comentarios_habilitados !== 0
                          }
                        />
                        <span>Permitir comentários</span>
                      </label>
                      {error && <TransientFeedback className="operations-feedback error composer-wide" role="alert">{error}</TransientFeedback>}
                      <div className="community-post-edit-actions">
                        <button disabled={working}>Salvar alterações</button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                      </form>
                    </div>,
                    document.body,
                  )}
                  {parsePostLinks(post.links_json).length > 0 && (
                    <nav className="community-post-links" aria-label={`Links de ${post.titulo}`}>
                      {parsePostLinks(post.links_json).map((link, index) => (
                        <a href={link} target="_blank" rel="noreferrer" key={link} title={link}>
                          <span aria-hidden="true">↗</span><span><small>Link {index + 1}</small>{post.titulo}</span>
                        </a>
                      ))}
                    </nav>
                  )}
                  {post.imagem_url ? (
                    <ResponsiveFeedImage
                      key={post.imagem_url}
                      presentation="photo"
                      src={post.imagem_url}
                      thumbnail={post.imagem_thumbnail_url}
                      alt={post.imagem_alt || post.titulo}
                      width={post.imagem_width}
                      height={post.imagem_height}
                    />
                  ) : null}
                  <footer>
                    <span className="worship-post-status" hidden={post.status === "PUBLICADA"}>
                      {post.status === "RASCUNHO" ? "Rascunho" : post.status === "EM_ANALISE" ? "Aguardando aprovação" : "Publicada"}
                    </span>
                    {post.status === "PUBLICADA" && <CommunityPostReactions postId={post.id} initialCounts={post.reacoes_json} initialMine={post.minhas_reacoes_json} />}
                    {post.status === "PUBLICADA" && (
                      <CommunityPostShare
                        postId={post.id}
                        title={post.titulo}
                        content={post.conteudo || post.resumo}
                        showLabel
                        imageUrl={post.imagem_url}
                        links={parsePostLinks(post.links_json)}
                      />
                    )}
                  </footer>
                  {post.status === "PUBLICADA" && (
                    <CommunityPostInteractions postId={post.id} initialCount={Number(post.total_comentarios || 0)} currentUserName={userName} />
                  )}
                </article>
              ))}
              {feedLoadingMore && (
                <div className="feed-skeleton" role="status">
                  <span />
                  <span />
                  <span />
                  <small>Carregando próximas publicações…</small>
                </div>
              )}
            </div>
          ) : (
            <div className="worship-empty">
              <FeedIcon name="heart" />
              <h3>{posts.length ? "Nenhuma publicação neste filtro." : "Nenhuma publicação ainda."}</h3>
              <p>{posts.length ? "Tente outra busca ou categoria, ou carregue mais publicações." : "As histórias e novidades da sua comunidade aparecerão aqui."}</p>
              {posts.length > 0 && <button type="button" onClick={() => { setFeedSearch(""); setFeedFilter("TODOS"); }}>Limpar filtros</button>}
              {!posts.length && canPublish && <button type="button" onClick={() => openComposer()}>Criar publicação</button>}
            </div>
          )}
          <div className="feed-pagination-controls">
            <div
              ref={feedSentinelRef}
              className="feed-load-sentinel"
              aria-hidden="true"
            />
            {feedLoadError && (
              <p role="alert">
                {feedLoadError}{" "}
                <button type="button" onClick={() => void loadMorePosts()}>
                  Tentar novamente
                </button>
              </p>
            )}
            {feedHasMore && posts.length < 60 && (
              <button
                type="button"
                disabled={feedLoadingMore}
                onClick={() => void loadMorePosts()}
              >
                {feedLoadingMore ? "Carregando…" : "Carregar mais"}
              </button>
            )}
            {feedHasMore && posts.length >= 60 && (
              <small>
                Limite de itens mantidos na tela atingido para preservar o
                desempenho.
              </small>
            )}
          </div>
        </div>

        {!readOnlyFeed && <aside id="feed-community-context" className="worship-rail" data-mobile-open={contextOpen} aria-label="Acontece na comunidade">
          {!readOnlyFeed && canViewSchedules && (
            <section className="community-my-schedules" aria-labelledby="my-schedules-title">
              <header>
                <div>
                  <p className="pilot-kicker">MINHAS PRÓXIMAS ESCALAS</p>
                  <h2 id="my-schedules-title" aria-label="Confirme sua participação">Confirme sua escala</h2>
                </div>
                <span>{myUpcomingSchedules.length} próximas</span>
              </header>
              {scheduleFeedback && <p className="community-schedule-feedback" role="status">{scheduleFeedback}</p>}
              {myUpcomingSchedules.length ? (
                <div className="community-schedule-list">
                  {myUpcomingSchedules.slice(0, 1).map((schedule) => {
                    const assignment = schedule.designacoes.find((item) => Boolean(item.is_mine));
                    if (!assignment) return null;
                    const pending = assignment.status === "PENDENTE";
                    return (
                      <article key={schedule.id} data-status={assignment.status.toLowerCase()}>
                        <time dateTime={schedule.inicia_em}>
                          <strong>{formatDay(schedule.inicia_em)}</strong>
                          <span>{formatMonth(schedule.inicia_em)}</span>
                        </time>
                        <div>
                          <small>{schedule.ministerio_nome}</small>
                          <strong>{schedule.titulo}</strong>
                          <span>{formatDateTime(schedule.inicia_em)} · {schedule.local || "Local a confirmar"}</span>
                          <em>{assignment.funcao}</em>
                        </div>
                        {pending ? (
                          <div className="community-schedule-actions">
                            <button
                              type="button"
                              disabled={scheduleWorkingId === schedule.id}
                              onClick={() => void respondToSchedule(schedule.id, "CONFIRMADA")}
                              aria-label="Confirmar minha presença"
                            >Confirmar presença</button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={scheduleWorkingId === schedule.id}
                              onClick={() => void respondToSchedule(schedule.id, "INDISPONIVEL")}
                              aria-label="Não poderei participar"
                            >Não poderei ir</button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={scheduleWorkingId === schedule.id}
                              onClick={() => {
                                setReplacementScheduleId(schedule.id);
                                setReplacementVolunteerId(0);
                              }}
                            >Pedir substituição</button>
                          </div>
                        ) : (
                          <span className={`community-schedule-state ${assignment.status.toLowerCase()}`}>
                            {assignment.status === "CONFIRMADA" ? "Presença confirmada" : assignment.status === "INDISPONIVEL" ? "Indisponibilidade informada" : "Ausência registrada"}
                          </span>
                        )}
                        {pending && replacementScheduleId === schedule.id && (
                          <div className="community-substitute-picker">
                            <strong>Quem pode ficar no seu lugar?</strong>
                            <p>Escolha uma pessoa ativa do mesmo ministério.</p>
                            {schedule.substitution_candidates?.length ? (
                              <div>
                                {schedule.substitution_candidates.map((candidate) => (
                                  <label key={candidate.voluntarioId}>
                                    <input
                                      type="radio"
                                      name={`community-substitute-${schedule.id}`}
                                      checked={replacementVolunteerId === candidate.voluntarioId}
                                      onChange={() => setReplacementVolunteerId(candidate.voluntarioId)}
                                    />
                                    {candidate.fotoPerfil ? <SafeImage fallbackName={candidate.nome} fallbackKind="avatar" loading="lazy" src={candidate.fotoPerfil} alt="" /> : <span aria-hidden="true">{getInitials(candidate.nome)}</span>}
                                    <span><b>{candidate.nome}</b><small>{candidate.funcao}</small></span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <p className="community-schedule-feedback">Não há outra pessoa disponível. Fale com a liderança.</p>
                            )}
                            <div className="community-substitute-actions">
                              <button
                                type="button"
                                disabled={!replacementVolunteerId || scheduleWorkingId === schedule.id}
                                onClick={() => void respondToSchedule(schedule.id, "INDISPONIVEL", replacementVolunteerId)}
                              >Confirmar substituição</button>
                              <button type="button" className="secondary" onClick={() => setReplacementScheduleId(null)}>Cancelar</button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="community-schedule-empty"><span aria-hidden="true">✓</span><div><strong>Nenhuma escala pendente</strong><p>Quando você for escalado, a confirmação aparecerá aqui.</p></div></div>
              )}
            </section>
          )}
          {canViewSchedules && pendingSchedules > 1 && <section className="home-needs-you">
            <header><div><p className="pilot-kicker">PRECISA DE VOCÊ</p><strong>Pendências</strong></div><span>{pendingSchedules}</span></header>
            {pendingSchedules ? (
              <Link className="home-rail-card-link" href="/painel?view=ministerios"><strong>{pendingSchedules === 1 ? "Uma escala aguarda resposta" : `${pendingSchedules} escalas aguardam resposta`}</strong><p>Confirme sua presença ou avise a liderança com antecedência.</p><span>Ver todas as escalas →</span></Link>
            ) : (
              <Link className="home-rail-empty home-rail-card-link" href="/painel?view=ministerios"><strong>Nada pendente agora</strong><p>Quando uma ação depender de você, ela aparecerá aqui.</p><span>Ver ministérios →</span></Link>
            )}
          </section>}
          {eventsEnabled && <section className="worship-events">
            <header><h2>Próximos eventos</h2><button type="button" onClick={() => onNavigate?.("eventos")}>Ver todos <FeedIcon name="arrow" /></button></header>
            {upcomingEvents.length ? (
              upcomingEvents.map((item) => (
                <Link className="home-event-item home-rail-card-link" href={`/painel?view=eventos&evento=${item.id}`} key={item.id} aria-label={`Abrir evento ${item.titulo}`}>
                  <time dateTime={item.inicia_em}>
                    <strong>{formatDay(item.inicia_em)}</strong>
                    <span>{formatMonth(item.inicia_em)}</span>
                  </time>
                  <div>
                    <strong>{item.titulo}</strong>
                    <small>{formatDateTime(item.inicia_em)}</small><small>{item.local || "Local a confirmar"}</small>
                  </div>
                  <span className="home-event-open" aria-hidden="true">›</span>
                </Link>
              ))
            ) : (
              <p className="home-rail-empty">{eventsError || "Nenhum evento próximo."}{eventsError && <button type="button" onClick={() => void loadHome()}>Tentar novamente</button>}</p>
            )}
          </section>}

          <section className="worship-prayer"><FeedIcon name="heart" /><h2>Cuidar também é estar presente.</h2><p>Compartilhe seu pedido com quem pode caminhar com você.</p><button type="button" onClick={() => onNavigate?.("solicitacoes", true)}><FeedIcon name="plus" />Fazer um pedido</button></section>
          <CommunityPresencePanel />
        </aside>}
      </div>
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recentemente";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function roleLabel(value: string) {
  return ({
    MEMBRO: "Membro",
    LIDER: "Líder",
    PASTOR: "Pastoral",
    ADMIN_COMUNIDADE: "Administrador",
    SUPERADMIN: "Proprietário",
  } as Record<string, string>)[value] || value;
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date(value))
    .replace(".", "")
    .toUpperCase();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Horário a confirmar";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function parsePostLinks(value?: string) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item || ""))
      .filter((item) => /^https?:\/\//i.test(item))
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}
