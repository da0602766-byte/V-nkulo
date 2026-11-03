"use client";
import SafeImage from "./SafeImage";


import { useEffect, useState } from "react";
import FeedImageLightbox from "./feed/FeedImageLightbox";
import FeedImageActions from "./feed/FeedImageActions";

type FeedImageProps = {
  src: string;
  thumbnail?: string;
  alt: string;
  width?: number;
  height?: number;
  presentation?: "attachment" | "photo";
};

export default function ResponsiveFeedImage(props: FeedImageProps) {
  // Changing the publication image resets dimensions, errors and its dialog.
  return <FeedImage key={`${props.src}:${props.thumbnail || ""}`} {...props} />;
}

function FeedImage({
  src,
  thumbnail,
  alt,
  width,
  height,
  presentation = "attachment",
}: FeedImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);
  const [requestedLoad, setRequestedLoad] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

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
  const imageWidth = naturalSize?.width || (Number.isFinite(width) && Number(width) > 0 ? width! : 1280);
  const imageHeight = naturalSize?.height || (Number.isFinite(height) && Number(height) > 0 ? height! : 720);
  const ratio = imageWidth / imageHeight;

  return (
    <figure
      className={`feed-responsive-image feed-image-attachment ${presentation === "photo" ? "worship-photo" : ""} ${showImage && !failed ? "feed-photo-fit" : ""} ${loaded ? "is-loaded" : ""}`}
      style={{ aspectRatio: "auto", "--photo-ratio": ratio, "--feed-media-ratio": ratio } as React.CSSProperties}
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
          A prévia não abriu. Use as opções da imagem para tentar novamente ou baixar.
        </p>
      ) : (
        <>
          <span className="feed-image-placeholder" aria-hidden="true" />
          <button type="button" className="feed-image-preview" onClick={() => setLightboxOpen(true)} aria-label={`Ampliar imagem: ${alt || "publicação"}`}>

          <SafeImage
            src={optimizedSource}
            srcSet={
              !dataSaver && thumbnail && thumbnail !== src
                ? `${thumbnail} 480w, ${src} 1280w`
                : undefined
            }
            sizes="(max-width: 680px) 100vw, (max-width: 1100px) 75vw, 720px"
            alt={alt || "Imagem da publicação"}
            width={imageWidth}
            height={imageHeight}
            loading="lazy"
            decoding="async"
            onLoad={event => {
              const image = event.currentTarget;
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
              }
              setLoaded(true);
            }}
            onError={() => setFailed(true)}
          />
          </button>
        </>
      )}
      <FeedImageActions source={src} overlay={showImage && !failed}
        canEnlarge={showImage && !failed}
        onView={() => {
          if (showImage && !failed) setLightboxOpen(true);
          else { setFailed(false); setLoaded(false); setRequestedLoad(true); }
        }} />
      {lightboxOpen && <FeedImageLightbox src={src} alt={alt} onClose={() => setLightboxOpen(false)} />}
    </figure>
  );
}
