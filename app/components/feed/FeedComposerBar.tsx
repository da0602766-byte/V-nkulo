import FeedIcon from "./FeedIcon";

export type ComposerIntent = "text" | "image" | "event";

export default function FeedComposerBar({ name, photo, hasEvents, onOpen, onRequest }: {
  name: string;
  photo?: string;
  hasEvents: boolean;
  onOpen: (intent: ComposerIntent) => void;
  onRequest?: () => void;
}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
  return (
    <>
      <button type="button" className="worship-composer-prompt" onClick={() => onOpen("text")}>
        <span className="worship-avatar" aria-hidden="true">{photo ? <img src={photo} alt="" width="40" height="40" /> : initials}</span>
        <strong>Compartilhe algo com a comunidade…</strong>
      </button>
      <div className="worship-composer-tools">
        <button type="button" onClick={() => onOpen("text")}><FeedIcon name="text" /><span>Texto</span></button>
        <button type="button" onClick={() => onOpen("image")}><FeedIcon name="image" /><span>Foto</span></button>
        {hasEvents && <button type="button" onClick={() => onOpen("event")}><FeedIcon name="calendar" /><span>Evento</span></button>}
        {onRequest && <button type="button" onClick={onRequest}><FeedIcon name="heart" /><span>Pedido</span></button>}
        <button type="button" className="worship-publish" onClick={() => onOpen("text")}>Publicar<FeedIcon name="plus" /></button>
      </div>
    </>
  );
}
