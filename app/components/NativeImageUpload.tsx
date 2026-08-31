"use client";

import { DragEvent, useId, useRef, useState } from "react";
import { saveImageOutsidePlatform } from "../lib/media-upload-client";

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
      const result = await saveImageOutsidePlatform(file, purpose, resourceId);
      onChange(result.url);
      setMessageTone("success");
      setMessage(
        result.storage === "LOCAL"
          ? "Imagem salva somente neste aparelho. O Vínkulo não recebeu uma cópia."
          : result.storage === "PUBLICATION"
            ? "Imagem anexada. Na publicação, cada pessoa poderá visualizar ou baixar."
            : "Imagem otimizada e salva no Google Drive. O Vínkulo não mantém uma cópia.",
      );
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
