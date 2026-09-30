import SafeImage from "../SafeImage";
import { useEffect, useState } from "react";
import FeedIcon from "./FeedIcon";

type Highlight = { id: number; titulo: string; categoria: string; imagem_url?: string; imagem_thumbnail_url?: string };

export default function FeedHighlights({ items, onSelect, onCreate }: {
  items: Highlight[];
  onSelect: (id: number) => void;
  onCreate?: () => void;
}) {
  const [imagesEnabled, setImagesEnabled] = useState(false);
  useEffect(() => {
    const sync = () => setImagesEnabled(document.documentElement.dataset.dataSaver !== "true" && document.documentElement.dataset.network !== "slow");
    sync();
    window.addEventListener("vinkulo:network-mode", sync);
    return () => window.removeEventListener("vinkulo:network-mode", sync);
  }, []);
  if (!items.length) return null;
  return (
    <section className="worship-highlights" aria-label="Destaques da comunidade">
      <header><h2>Momentos da nossa comunidade</h2><span aria-hidden="true">✦</span></header>
      <div className="worship-stories">
        {onCreate && <button type="button" className="worship-story worship-story-create" onClick={onCreate}><span className="worship-story-ring"><FeedIcon name="plus" /></span><span>Publicar</span></button>}
        {items.map((item) => (
          <button className="worship-story" key={item.id} type="button" onClick={() => onSelect(item.id)} aria-label={`Abrir publicação: ${item.titulo}`} title={item.titulo}>
            <span className="worship-story-ring">
              {imagesEnabled && item.imagem_url ? <SafeImage src={item.imagem_thumbnail_url || item.imagem_url} alt="" width="60" height="60" loading="lazy" decoding="async" /> : <span className="worship-story-initial">{item.titulo.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>}
            </span>
            <span>{item.titulo}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
