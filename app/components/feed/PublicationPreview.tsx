"use client";
import { useState } from "react";
import SafeImage from "../SafeImage";

export default function PublicationPreview({ image, audience }: { image: string; audience: string }) {
  const [preview, setPreview] = useState<{ title: string; text: string; category: string; links: string } | null>(null);
  return <div className="publication-review composer-wide">
    <button type="button" onClick={event => {
      const form = event.currentTarget.closest("form");
      if (!form) return;
      const values = new FormData(form);
      setPreview({ title: String(values.get("titulo") || "Sem título"), text: String(values.get("conteudo") || "Sem texto"), category: String(values.get("categoria") || "COMUNIDADE"), links: String(values.get("links") || "") });
    }}>{preview ? "Atualizar prévia" : "Conferir antes de enviar"}</button>
    {preview && <section className="publication-review-content" aria-label="Prévia da publicação">
      <div><small>PRÉVIA · {preview.category.replaceAll("_", " ")}</small><button type="button" onClick={() => setPreview(null)} aria-label="Fechar prévia">Fechar</button></div>
      <p className="publication-review-audience">Destinatários: {audience}</p>
      <h3>{preview.title}</h3><p>{preview.text}</p>
      {image && <SafeImage src={image} alt="Imagem selecionada para a publicação" loading="lazy" />}
      {preview.links && <p>{preview.links}</p>}
      <small>Confira o texto e o público. Para concluir, use Salvar publicação.</small>
    </section>}
  </div>;
}
