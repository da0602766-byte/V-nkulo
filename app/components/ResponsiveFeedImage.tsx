"use client";

import { useEffect, useState } from "react";
import FeedImageLightbox from "./feed/FeedImageLightbox";

export default function ResponsiveFeedImage({
  src,
  thumbnail,
  alt,
  width,
  height,
  presentation = "attachment",
}: {
  src: string;
  thumbnail?: string;
  alt: string;
  width?: number;
  height?: number;
  presentation?: "attachment" | "photo";
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);
  const [requestedLoad, setRequestedLoad] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const root = document.documentElement;
      setDataSaver(
        root.dataset.dataSaver === "true" || root.dataset.network === "slow",
      );
      setPreferenceReady(true);
    };
    sync();
    window.addEventListener("vinkulo:network-mode", sync);
    return () => window.removeEventListener("vinkulo:network-mode", sync);
  }, []);

  if (!src) return null;
  const optimizedSource = dataSaver && thumbnail ? thumbnail : src;
  const showImage = requestedLoad || (presentation === "photo" && preferenceReady && !dataSaver);
  const downloadUrl = src.startsWith("/api/")
    ? `${src}${src.includes("?") ? "&" : "?"}download=1`
    : src;

  return (
    <figure
      className={`feed-responsive-image feed-image-attachment ${presentation === "photo" ? "worship-photo" : ""} ${loaded ? "is-loaded" : ""}`}
      style={presentation === "photo" ? { aspectRatio: "auto", "--photo-ratio": `${width || 1280} / ${height || 720}` } as React.CSSProperties : undefined}
      aria-busy={showImage && !loaded && !failed}
    >
      {presentation === "photo" && !preferenceReady ? (
        <div className="worship-photo-pending" role="status" aria-label="Preparando imagem" />
      ) : !showImage ? (
        <div className="feed-image-attachment-summary">
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
            </svg>
          </span>
          <div>
            <strong>Imagem da publicação</strong>
            <small>Abra quando quiser ou baixe uma cópia no aparelho.</small>
          </div>
        </div>
      ) : failed ? (
        <p className="feed-image-attachment-error" role="alert">
          A prévia não abriu. O arquivo ainda pode ser baixado.
        </p>
      ) : (
        <>
          <span className="feed-image-placeholder" aria-hidden="true" />
          <button type="button" className="feed-image-preview" onClick={() => setLightboxOpen(true)} aria-label={`Ampliar imagem: ${alt || "publicação"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={optimizedSource}
            srcSet={
              !dataSaver && thumbnail && thumbnail !== src
                ? `${thumbnail} 480w, ${src} 1280w`
                : undefined
            }
            sizes="(max-width: 680px) 100vw, (max-width: 1100px) 75vw, 720px"
            alt={alt || "Imagem da publicação"}
            width={width || 1280}
            height={height || 720}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
          </button>
        </>
      )}
      <div className="feed-image-attachment-actions">
        {presentation === "photo" && showImage && !failed ? <button type="button" onClick={() => setLightboxOpen(true)}>Ampliar imagem</button> : (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setRequestedLoad((current) => !current);
          }}
        >
          {requestedLoad ? "Fechar imagem" : "Visualizar imagem"}
        </button>
        )}
        <a href={downloadUrl} download>
          Baixar imagem
        </a>
      </div>
      {lightboxOpen && <FeedImageLightbox src={src} alt={alt} onClose={() => setLightboxOpen(false)} />}
    </figure>
  );
}
