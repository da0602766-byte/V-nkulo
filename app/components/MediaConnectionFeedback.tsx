"use client";

import { useEffect, useState } from "react";
import { MEDIA_FAILURE_EVENT, type MediaFailure } from "../lib/media-feedback";
import TransientFeedback from "./TransientFeedback";

export default function MediaConnectionFeedback() {
  const [failure, setFailure] = useState<MediaFailure | null>(null);
  useEffect(() => {
    const receive = (event: Event) => setFailure((event as CustomEvent<MediaFailure>).detail);
    window.addEventListener(MEDIA_FAILURE_EVENT, receive);
    return () => window.removeEventListener(MEDIA_FAILURE_EVENT, receive);
  }, []);
  if (!failure) return null;
  return <TransientFeedback>
    {failure === "DRIVE_RECONNECT" ? <>
      <p>Reconecte o Google Drive para visualizar suas fotos e arquivos.</p>
      <a href="/api/auth/google/start?purpose=drive&returnTo=%2Fpainel%3Fview%3Dconta">Reconectar Google Drive</a>
    </> : <p>Algumas mídias estão indisponíveis. A pessoa responsável pelos arquivos precisa reconectar o Google Drive.</p>}
  </TransientFeedback>;
}
