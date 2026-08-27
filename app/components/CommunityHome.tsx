"use client";

import Link from "./StableLink";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import ResponsiveFeedImage from "./ResponsiveFeedImage";
import CommunityPresencePanel from "./CommunityPresencePanel";
import NativeImageUpload from "./NativeImageUpload";
import CommunityPostInteractions from "./CommunityPostInteractions";
import CommunityPostShare from "./CommunityPostShare";
import VerifiedOwnerName from "./VerifiedOwnerName";

type FeedItem = {
  id: number;
  titulo: string;
  resumo: string;
  conteudo: string;
  categoria: string;
  visibilidade: "COMUNIDADE" | "PLATAFORMA";
  status: "RASCUNHO" | "PUBLICADA";
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
  imagem_url?: string;
  imagem_thumbnail_url?: string;
  imagem_alt?: string;
  imagem_width?: number;
  imagem_height?: number;
  links_json?: string;
};

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

type CellItem = {
  id: number;
  nome: string;
  responsavel: string;
  visitantes_ativos: number;
};

type MinistryItem = {
  id: number;
  nome: string;
  categoria: string;
  voluntarios?: unknown[];
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
  readOnlyFeed = false,
}: {
  communityName: string;
  communitySlug: string;
  permissions: string[];
  initialFeed: FeedItem[];
  currentUserId: number;
  userName: string;
  readOnlyFeed?: boolean;
}) {
  const [posts, setPosts] = useState<FeedItem[]>(initialFeed);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [cells, setCells] = useState<CellItem[]>([]);
  const [ministries, setMinistries] = useState<MinistryItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [postActionsId, setPostActionsId] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerImageUrl, setComposerImageUrl] = useState("");
  const [editingImageUrl, setEditingImageUrl] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedLoadError, setFeedLoadError] = useState("");
  const [scheduleWorkingId, setScheduleWorkingId] = useState<number | null>(null);
  const [scheduleFeedback, setScheduleFeedback] = useState("");
  const [replacementScheduleId, setReplacementScheduleId] = useState<number | null>(null);
  const [replacementVolunteerId, setReplacementVolunteerId] = useState(0);
  const [renderedAt] = useState(() => Date.now());
  const feedSentinelRef = useRef<HTMLDivElement | null>(null);
  const composerTitleRef = useRef<HTMLInputElement | null>(null);
  const composerContentRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const feedAbortRef = useRef<AbortController | null>(null);
  const feedRequestRef = useRef(0);
  const canPublish = permissions.includes("feed.publish");
  const canViewCells = permissions.includes("cells.view");
  const canViewSchedules = permissions.includes("schedules.view");
  const scrollKey = `vinkulo-community-feed-scroll:${communitySlug}`;

  useEffect(() => {
    if (editingId === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editingId]);

  useEffect(() => {
    if (!composerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [composerOpen]);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [feedResponse, eventResponse, ministryResponse, cellResponse, scheduleResponse] =
        await Promise.all([
          fetch("/api/pilot/publicacoes?limit=10", { cache: "no-store" }),
          readOnlyFeed ? null : fetch("/api/pilot/eventos", { cache: "no-store" }),
          readOnlyFeed ? null : fetch("/api/pilot/ministerios", { cache: "no-store" }),
          !readOnlyFeed && canViewCells
            ? fetch("/api/pilot/celulas", { cache: "no-store" })
            : null,
          !readOnlyFeed && canViewSchedules
            ? fetch("/api/pilot/escalas", { cache: "no-store" })
            : null,
        ]);
      const [feedResult, eventResult, ministryResult, cellResult, scheduleResult] =
        await Promise.all([
          readJson<Record<string, unknown>>(feedResponse),
          eventResponse ? readJson<Record<string, unknown>>(eventResponse) : {},
          ministryResponse ? readJson<Record<string, unknown>>(ministryResponse) : {},
          cellResponse ? readJson<Record<string, unknown>>(cellResponse) : {},
          scheduleResponse ? readJson<Record<string, unknown>>(scheduleResponse) : {},
        ]);
      if (!feedResponse.ok) {
        throw new Error(
          String(feedResult.error || "Não foi possível carregar o feed."),
        );
      }
      setPosts((feedResult.publicacoes || []) as FeedItem[]);
      setFeedCursor(String(feedResult.nextCursor || "") || null);
      setFeedHasMore(Boolean(feedResult.hasMore));
      if (eventResponse?.ok) setEvents((eventResult.eventos || []) as EventItem[]);
      if (ministryResponse?.ok) setMinistries((ministryResult.ministerios || []) as MinistryItem[]);
      if (cellResponse?.ok) setCells((cellResult.celulas || []) as CellItem[]);
      if (scheduleResponse?.ok) setSchedules((scheduleResult.escalas || []) as ScheduleItem[]);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canViewCells, canViewSchedules, readOnlyFeed]);

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
        .filter((item) => item.status === "PUBLICADO")
        .sort(
          (left, right) =>
            Date.parse(left.inicia_em) - Date.parse(right.inicia_em),
        )
        .slice(0, 3),
    [events],
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
          : "Indisponibilidade registrada. A pessoa indicada recebeu a escala para confirmar.",
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
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível publicar.");
      }
      setFeedback(
        form.get("status") === "PUBLICADA"
          ? "Publicação criada."
          : "Rascunho salvo.",
      );
      formElement.reset();
      setComposerImageUrl("");
      setSelectedEventId("");
      setComposerOpen(false);
      await refreshFeed();
    } catch (saveError) {
      setError((saveError as Error).message);
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
      setFeedback("Publicação excluída pelo proprietário.");
      await refreshFeed();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="community-home" aria-busy={loading}>
      <header className="community-home-welcome community-home-command">
        <div className="community-home-intro">
          <h1>Bem-vindo, {userName.split(/\s+/)[0]}</h1>
          <p>
            Acompanhe sua comunidade, responda às próximas escalas e encontre
            o que precisa sem perder o contexto.
          </p>
        </div>
        <div className="community-home-actions">
          <Link href={`/comunidades/${communitySlug}`}>Página pública</Link>
        </div>
        <div className="community-home-kpis" aria-label="Resumo da comunidade">
          <article><span aria-hidden="true">□</span><div><strong>{upcomingEvents.length}</strong><small>próximos eventos</small></div></article>
          <article className={pendingSchedules ? "attention" : ""}><span aria-hidden="true">✓</span><div><strong>{pendingSchedules}</strong><small>escalas aguardando resposta</small></div></article>
        </div>
      </header>

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

      {canPublish && (
        <section className="community-composer">
          <button
            type="button"
            className="community-composer-trigger"
            aria-haspopup="dialog"
            aria-expanded={composerOpen}
            onClick={() => setComposerOpen(true)}
          >
            <span>+</span>
            <div>
              <strong>Criar publicação</strong>
              <small>Rascunho ou publicação interna da comunidade</small>
            </div>
          </button>
          {composerOpen && typeof document !== "undefined" && createPortal(
            <div
              className="community-composer-overlay"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !working) setComposerOpen(false);
              }}
            >
          <form className="pilot-form community-composer-dialog" role="dialog" aria-modal="true" aria-label="Criar publicação" onSubmit={createPost}>
            <header>
              <div><small>NOVA PUBLICAÇÃO</small><strong>Criar publicação</strong></div>
              <button type="button" className="community-composer-close" aria-label="Fechar criação de publicação" onClick={() => setComposerOpen(false)}>×</button>
            </header>
            <label>
              Título
              <input ref={composerTitleRef} name="titulo" required maxLength={140} />
            </label>
            <label className="composer-wide">
              Conteúdo
              <textarea ref={composerContentRef} name="conteudo" required maxLength={3000} rows={5} />
            </label>
            {myEvents.length > 0 && (
              <label className="composer-wide community-event-publish-field">
                Puxar um evento criado por você
                <select
                  name="eventId"
                  value={selectedEventId}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                >
                  <option value="">Não vincular evento</option>
                  {myEvents.map((item) => (
                    <option value={item.id} key={item.id}>{item.titulo}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary-action"
                  disabled={!selectedEventId}
                  onClick={() => {
                    const item = myEvents.find((candidate) => String(candidate.id) === selectedEventId);
                    if (!item) return;
                    if (composerTitleRef.current) composerTitleRef.current.value = item.titulo;
                    if (composerContentRef.current) {
                      composerContentRef.current.value = `${item.descricao || ""}\n\n📅 ${formatDateTime(item.inicia_em)}${item.local ? ` · ${item.local}` : ""}`.trim();
                    }
                  }}
                >Adicionar dados do evento ao rascunho</button>
                <small>O link próprio de inscrição será incluído automaticamente na publicação.</small>
              </label>
            )}
            <div className="composer-wide">
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
                <option value="PUBLICADA">Publicar agora</option>
                <option value="RASCUNHO">Salvar rascunho</option>
              </select>
            </label>
            <label className="composer-share">
              <input
                type="checkbox"
                name="comentariosHabilitados"
                defaultChecked
              />
              <span>Permitir comentários de usuários com conta ativa</span>
            </label>
            <button disabled={working}>
              {working ? "Salvando…" : "Salvar publicação"}
            </button>
          </form>
            </div>,
            document.body,
          )}
        </section>
      )}

      {(feedback || error) && (
        <p className={`operations-feedback ${error ? "error" : ""}`} role="status">
          {error || feedback}
        </p>
      )}

      <div className={`community-home-grid ${readOnlyFeed ? "feed-only" : ""}`}>
        <div className="community-feed-panel">
          <header>
            <div>
              <p className="pilot-kicker">FEED DA COMUNIDADE</p>
              <h2>Atualizações recentes</h2>
            </div>
            <span className={loading ? "community-home-loading" : "community-feed-count"}>
              {loading ? "Atualizando…" : `${posts.length}`}
              {!loading && <small> no feed</small>}
            </span>
          </header>
          {loading && !posts.length ? (
            <div className="community-feed-loading" role="status" aria-label="Carregando publicações">
              <span /><span /><span /><small>Carregando publicações…</small>
            </div>
          ) : posts.length ? (
            <div className="community-feed-list">
              {posts.map((post) => (
                <article key={post.id} id={`publicacao-${post.id}`} className="community-feed-entry">
                  <header>
                    <span className="community-feed-avatar">
                      {post.autor_foto ? <img src={post.autor_foto} alt="" /> : getInitials(post.autor_nome || communityName)}
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
                            className="community-post-actions-dialog"
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
                        className="pilot-form community-post-edit-form"
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
                          <span aria-hidden="true">↗</span><span><small>Link {index + 1}</small>{linkLabel(link, index)}</span>
                        </a>
                      ))}
                    </nav>
                  )}
                  {post.imagem_url ? (
                    <ResponsiveFeedImage
                      src={post.imagem_url}
                      thumbnail={post.imagem_thumbnail_url}
                      alt={post.imagem_alt || post.titulo}
                      width={post.imagem_width}
                      height={post.imagem_height}
                    />
                  ) : null}
                  <footer>
                    <span>
                      {post.status === "RASCUNHO" ? "Rascunho" : "Publicada"}
                    </span>
                    {post.status === "PUBLICADA" && (
                      <CommunityPostShare
                        postId={post.id}
                        title={post.titulo}
                        content={post.conteudo || post.resumo}
                        imageUrl={post.imagem_url}
                        links={parsePostLinks(post.links_json)}
                      />
                    )}
                  </footer>
                  {post.status === "PUBLICADA" && (
                    <CommunityPostInteractions postId={post.id} initialCount={Number(post.total_comentarios || 0)} />
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
            <div className="pilot-empty-state">
              <strong>Nenhuma publicação nesta comunidade</strong>
              <p>O estado vazio não busca dados de outra comunidade.</p>
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

        {!readOnlyFeed && <aside className="community-home-rail">
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
                  {myUpcomingSchedules.map((schedule) => {
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
                            >Confirmar</button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={scheduleWorkingId === schedule.id}
                              onClick={() => {
                                setReplacementScheduleId(schedule.id);
                                setReplacementVolunteerId(0);
                              }}
                            >Não posso</button>
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
                                    {candidate.fotoPerfil ? <img src={candidate.fotoPerfil} alt="" /> : <span aria-hidden="true">{getInitials(candidate.nome)}</span>}
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
          <CommunityPresencePanel />
          <section>
            <header>
              <p className="pilot-kicker">PRÓXIMOS EVENTOS</p>
              <strong>Agenda</strong>
            </header>
            {upcomingEvents.length ? (
              upcomingEvents.map((item) => (
                <article className="home-event-item" key={item.id}>
                  <time dateTime={item.inicia_em}>
                    <strong>{formatDay(item.inicia_em)}</strong>
                    <span>{formatMonth(item.inicia_em)}</span>
                  </time>
                  <div>
                    <strong>{item.titulo}</strong>
                    <small>{item.local || "Local a confirmar"}</small>
                  </div>
                </article>
              ))
            ) : (
              <p className="home-rail-empty">Nenhum evento publicado.</p>
            )}
          </section>
          <section>
            <header>
              <p className="pilot-kicker">MINISTÉRIOS</p>
              <strong>Servir e participar</strong>
            </header>
            {ministries.slice(0, 3).map((item) => (
              <article className="home-ministry-item" key={item.id}>
                <span>{item.nome.slice(0, 1)}</span>
                <div>
                  <strong>{item.nome}</strong>
                  <small>
                    {item.voluntarios?.length || 0} pessoas na equipe
                  </small>
                </div>
              </article>
            ))}
            {!ministries.length && (
              <p className="home-rail-empty">Nenhum ministério ativo.</p>
            )}
          </section>
          <section>
            <header>
              <p className="pilot-kicker">CÉLULAS</p>
              <strong>Pequenos grupos</strong>
            </header>
            {!canViewCells ? (
              <p className="home-rail-empty">
                Acesso conforme o perfil e o vínculo da pessoa.
              </p>
            ) : cells.length ? (
              cells.slice(0, 3).map((item) => (
                <article className="home-ministry-item" key={item.id}>
                  <span>◇</span>
                  <div>
                    <strong>{item.nome}</strong>
                    <small>Responsável: {item.responsavel}</small>
                  </div>
                </article>
              ))
            ) : (
              <p className="home-rail-empty">Nenhuma célula cadastrada.</p>
            )}
          </section>
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

function linkLabel(value: string, index: number) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host || `Link ${index + 1}`;
  } catch {
    return `Link ${index + 1}`;
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
