"use client";

import { useState } from "react";

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
  if (!src || failed) return null;

  return (
    <figure
      className={`feed-responsive-image ${loaded ? "is-loaded" : ""}`}
      aria-busy={!loaded}
    >
      <span className="feed-image-placeholder" aria-hidden="true" />
      {/* A origem será um serviço de mídia externo; o elemento nativo preserva
          srcset, lazy loading e cancelamento sem liberar domínios arbitrários. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        srcSet={thumbnail && thumbnail !== src ? `${thumbnail} 480w, ${src} 1280w` : undefined}
        sizes="(max-width: 720px) 100vw, 720px"
        alt={alt || "Imagem da publicação"}
        width={width || 1280}
        height={height || 720}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </figure>
  );
}
