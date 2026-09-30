"use client";
import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { imagePlaceholder, reportMediaFailure } from "../lib/media-feedback";

type Props = ImgHTMLAttributes<HTMLImageElement> & { fallbackName?: string; fallbackKind?: "avatar" | "image" };

/** Keeps existing image geometry and retries automatically when the source changes. */
export default function SafeImage(props: Props) {
  return <ImageWithFallback key={`${props.src}:${props.srcSet}`} {...props} />;
}

function ImageWithFallback({ src, srcSet, alt = "", fallbackName, fallbackKind = "image", onError, onLoad, style, ...props }: Props) {
  const [failed, setFailed] = useState(!src);
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // Cached images may finish (or fail) before React attaches its event handlers.
    const frame = requestAnimationFrame(() => {
      const image = imageRef.current;
      if (!image?.complete) return;
      if (image.naturalWidth > 0) setLoaded(true);
      else if (src) {
        setFailed(true);
        void reportMediaFailure(image.currentSrc || String(src), window.location.origin);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [src]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} ref={imageRef} alt={alt} src={failed ? imagePlaceholder(fallbackName, fallbackKind) : src}
      srcSet={failed ? undefined : srcSet}
      data-image-fallback={failed || undefined}
      style={{ ...style, backgroundColor: failed ? "#eee8f6" : style?.backgroundColor, opacity: loaded ? style?.opacity : 0 }}
      onLoad={event => { setLoaded(true); if (!failed) onLoad?.(event); }}
      onError={event => {
        // Hide synchronously, before React commits, so the browser error icon never paints.
        event.currentTarget.style.opacity = "0";
        if (failed) return;
        setLoaded(false);
        setFailed(true);
        void reportMediaFailure(event.currentTarget.currentSrc || String(src || ""), window.location.origin);
        onError?.(event);
      }} />
  );
}
