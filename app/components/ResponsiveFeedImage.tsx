"use client";

import { useEffect, useState } from "react";

export default function ResponsiveFeedImage({
  src,
  thumbnail,
  alt,
  width,
  height,
}: {
  src: string;
  thumbnail?: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);
  const [allowDownload, setAllowDownload] = useState(false);
  const [autoLoadRecent, setAutoLoadRecent] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [requestedLoad, setRequestedLoad] = useState(false);
  useEffect(() => {
    const sync = () => {
      const root = document.documentElement;
      setDataSaver(root.dataset.dataSaver === "true" || root.dataset.network === "slow");
    };
    sync();
    window.addEventListener("vinkulo:network-mode", sync);
    fetch("/api/storage/preferences", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => {
        setAutoLoadRecent(value?.preference?.auto_load_recent !== 0);
        setAllowDownload(Boolean(value?.preference?.auto_download_files));
      })
      .catch(() => setAutoLoadRecent(true))
      .finally(() => setPreferenceReady(true));
    return () => window.removeEventListener("vinkulo:network-mode", sync);
  }, []);
  if (!src || failed) return null;
  const optimizedSource = dataSaver && thumbnail ? thumbnail : src;
  const shouldLoad = autoLoadRecent || requestedLoad;

  return (
    <figure
      className={`feed-responsive-image ${loaded ? "is-loaded" : ""}`}
      aria-busy={preferenceReady && shouldLoad && !loaded}
    >
      <span className="feed-image-placeholder" aria-hidden="true" />
      {preferenceReady && shouldLoad ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={optimizedSource}
          srcSet={!dataSaver && thumbnail && thumbnail !== src ? `${thumbnail} 480w, ${src} 1280w` : undefined}
          sizes="(max-width: 720px) 100vw, 720px"
          alt={alt || "Imagem da publicação"}
          width={width || 1280}
          height={height || 720}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : preferenceReady ? (
        <button type="button" className="feed-image-load" onClick={() => setRequestedLoad(true)}>
          Carregar foto do Google Drive
        </button>
      ) : null}
      {shouldLoad && allowDownload && src.startsWith("/api/storage/media/") && (
        <a
          className="feed-image-download"
          href={`${src}?download=1`}
          download
        >
          Baixar foto
        </a>
      )}
      {shouldLoad && !allowDownload && src.startsWith("/api/storage/media/") && (
        <small className="feed-image-download-disabled">Download desativado em Minha conta</small>
      )}
    </figure>
  );
}
