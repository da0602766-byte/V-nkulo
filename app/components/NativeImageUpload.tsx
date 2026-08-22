"use client";

import { DragEvent, useId, useRef, useState } from "react";
import { prepareImageForUpload } from "../lib/client-image";

type UploadPurpose =
  | "community-logo"
  | "community-banner"
  | "ministry-banner"
  | "login-logo"
  | "login-background"
  | "visual-editor-image"
  | "post-image"
  | "profile-photo"
  | "platform-logo"
  | "platform-feed-banner";

export default function NativeImageUpload({
  label,
  value,
  purpose,
  onChange,
  resourceId,
  previewMode = "square",
  help = "Imagens de até 50 MB. Conversão automática para WebP, mantendo a melhor qualidade possível.",
}: {
  label: string;
  value: string;
  purpose: UploadPurpose;
  onChange: (url: string) => void;
  resourceId?: number;
  previewMode?: "square" | "banner";
  help?: string;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const prepared = await prepareImageForUpload(file, purpose);
      const form = new FormData();
      form.set("purpose", purpose);
      form.set("file", prepared);
      if (resourceId) form.set("resourceId", String(resourceId));
      const response = await fetch("/api/pilot/uploads", {
        method: "POST",
        body: form,
      });
      const result = await readUploadResponse(response);
      if (!response.ok || !result.url) {
        throw new Error(result.error || "Não foi possível enviar a imagem.");
      }
      onChange(result.url);
      setMessageTone("success");
      setMessage("Imagem convertida para WebP, otimizada e enviada com segurança.");
    } catch (error) {
      setMessageTone("error");
      setMessage((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files?.[0]);
  }

  return (
    <div className={`native-image-upload ${previewMode}`} aria-busy={uploading}>
      <span>{label}</span>
      <label
        className={`native-image-upload-picker${dragging ? " dragging" : ""}`}
        htmlFor={id}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        {value ? <img src={value} alt="Prévia da imagem selecionada" /> : <b>＋</b>}
        <span>
          <strong>{uploading ? "Enviando…" : "Arraste ou escolha uma imagem"}</strong>
          <small>{help}</small>
        </span>
      </label>
      <input
        ref={inputRef}
        id={id}
        className="native-image-upload-input"
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void upload(file);
        }}
      />
      <div className="native-image-upload-actions">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Enviando…" : value ? "Trocar imagem" : "Escolher imagem"}
        </button>
      {value && (
        <button type="button" onClick={() => onChange("")}>
          Remover imagem
        </button>
      )}
      </div>
      {message && (
        <small className={`native-image-upload-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>
          {message}
        </small>
      )}
    </div>
  );
}

async function readUploadResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as { url?: string; error?: string };
  } catch {
    if (response.status === 413 || /payload too large/i.test(text)) {
      return {
        error:
          "A imagem ficou grande demais para o envio. Escolha outra foto ou tente uma versão menor.",
      };
    }
    return {
      error:
        text.trim().slice(0, 180) || "O servidor não conseguiu processar a imagem.",
    };
  }
}
