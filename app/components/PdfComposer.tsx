"use client";

import { FormEvent, useMemo, useState } from "react";

function buildUrl(baseUrl: string, title: string, note: string, download: boolean) {
  const separator = baseUrl.includes("?") ? "&" : "?";
  const params = new URLSearchParams({ titulo: title, nota: note, download: download ? "1" : "0" });
  return `${baseUrl}${separator}${params.toString()}`;
}

export default function PdfComposer({ baseUrl, initialTitle, onClose }: { baseUrl: string; initialTitle: string; onClose: () => void }) {
  const [title, setTitle] = useState(initialTitle);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(() => buildUrl(baseUrl, initialTitle, "", false));
  const downloadUrl = useMemo(() => buildUrl(baseUrl, title, note, true), [baseUrl, title, note]);

  function updatePreview(event: FormEvent) {
    event.preventDefault();
    setPreview(buildUrl(baseUrl, title, note, false));
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal pdf-modal" role="dialog" aria-modal="true" aria-label="Preparar PDF"><div className="modal-header"><div><p className="eyebrow">PDF PERSONALIZÁVEL</p><h2>Editar e visualizar antes de baixar</h2></div><button onClick={onClose} aria-label="Fechar">×</button></div><form className="pdf-editor" onSubmit={updatePreview}><label>Título do PDF<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} /></label><label>Texto ou observação adicional<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} placeholder="Digite uma mensagem, orientação ou observação para aparecer no PDF." /></label><div className="pdf-actions"><button className="secondary-button">Atualizar visualização</button><a className="primary-link" href={downloadUrl}>⇩ Baixar este PDF</a></div></form><iframe className="pdf-preview-frame" src={preview} title="Visualização do PDF" /></section></div>;
}
