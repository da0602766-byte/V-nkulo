import FeedIcon from "./FeedIcon";

export type ComposerIntent = "text" | "image" | "event";

export default function FeedComposerBar({ hasEvents, onOpen, onRequest }: {
  hasEvents: boolean;
  onOpen: (intent: ComposerIntent) => void;
  onRequest?: () => void;
}) {
  return (
    <>
      <div className="worship-composer-tools">
        <button type="button" onClick={() => onOpen("text")}><FeedIcon name="text" /><span>Texto</span></button>
        <button type="button" onClick={() => onOpen("image")}><FeedIcon name="image" /><span>Foto</span></button>
        {hasEvents && <button type="button" onClick={() => onOpen("event")}><FeedIcon name="calendar" /><span>Evento</span></button>}
        {onRequest && <button type="button" onClick={onRequest}><FeedIcon name="heart" /><span>Pedido</span></button>}

      </div>
    </>
  );
}
