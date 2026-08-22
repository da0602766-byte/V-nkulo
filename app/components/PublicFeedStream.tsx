"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicFeedPage } from "../lib/pilot-data";
import PublicFeedCard from "./PublicFeedCard";

const MAX_RENDERED_POSTS = 60;

export default function PublicFeedStream({
  initialPage,
  communityId,
}: {
  initialPage: PublicFeedPage;
  communityId?: number;
}) {
  const [posts, setPosts] = useState(initialPage.posts);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const scrollKey = `vinkulo-feed-scroll:${communityId || "plataforma"}`;

  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || loading || posts.length >= MAX_RENDERED_POSTS) {
      return;
    }
    setLoading(true);
    setError("");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestRef.current;
    try {
      const params = new URLSearchParams({ cursor, limit: "10" });
      if (communityId) params.set("communityId", String(communityId));
      const response = await fetch(`/api/feed/publico?${params}`, {
        signal: controller.signal,
      });
      const result = (await response.json()) as PublicFeedPage & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar mais.");
      }
      if (requestId !== requestRef.current) return;
      setPosts((current) => {
        const existing = new Set(current.map((post) => post.id));
        return [
          ...current,
          ...result.posts.filter((post) => !existing.has(post.id)),
        ].slice(0, MAX_RENDERED_POSTS);
      });
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (loadError) {
      if ((loadError as Error).name !== "AbortError") {
        setError((loadError as Error).message);
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [communityId, cursor, hasMore, loading, posts.length]);

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
      abortRef.current?.abort();
    };
  }, [scrollKey]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  if (!posts.length) {
    return (
      <div
        className="public-feed-empty"
        data-editor-key="feed-publico-vazio"
      >
        <span aria-hidden="true">◇</span>
        <strong>Ainda não há publicações públicas</strong>
        <p>Feeds internos permanecem protegidos e não aparecem neste espaço.</p>
      </div>
    );
  }

  const limitReached = posts.length >= MAX_RENDERED_POSTS && hasMore;
  return (
    <div
      className="public-feed-editor-surface"
      data-editor-key="publicacoes-feed-publico"
    >
      <div className="social-feed-list" aria-live="polite">
        {posts.map((post) => (
          <PublicFeedCard key={post.id} post={post} />
        ))}
        {loading && <FeedSkeleton />}
      </div>
      <div className="feed-pagination-controls">
        <div ref={sentinelRef} className="feed-load-sentinel" aria-hidden="true" />
        {error && (
          <p role="alert">
            {error}{" "}
            <button type="button" onClick={() => void loadMore()}>
              Tentar novamente
            </button>
          </p>
        )}
        {hasMore && !limitReached && (
          <button type="button" disabled={loading} onClick={() => void loadMore()}>
            {loading ? "Carregando…" : "Carregar mais"}
          </button>
        )}
        {limitReached && (
          <p>
            Limite de 60 publicações mantidas nesta tela para preservar o
            desempenho. Recarregue para voltar ao início.
          </p>
        )}
        {!hasMore && <small>Você chegou ao fim das publicações carregadas.</small>}
      </div>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="feed-skeleton" role="status">
      <span />
      <span />
      <span />
      <small>Carregando próximas publicações…</small>
    </div>
  );
}
