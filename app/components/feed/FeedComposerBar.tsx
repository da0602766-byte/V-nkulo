import FeedIcon from "./FeedIcon";

export type ComposerIntent = "text" | "image" | "event";

export default function FeedComposerBar({ hasEvents, onOpen, onRequest, onEvent, onSchedule }: {
  hasEvents: boolean;
  onOpen: (intent: ComposerIntent) => void;
  onRequest?: () => void;
  onEvent?: () => void;
  onSchedule?: () => void;
}) {
  return (
    <>
      <div className="worship-composer-tools">
        <button type="button" onClick={() => onOpen("text")}><FeedIcon name="text" /><span>Texto</span></button>
        <button type="button" onClick={() => onOpen("image")}><FeedIcon name="image" /><span>Foto</span></button>
        {(hasEvents || onEvent) && <button type="button" onClick={() => hasEvents ? onOpen("event") : onEvent?.()}><FeedIcon name="calendar" /><span>Evento</span></button>}
        {onSchedule && <button type="button" onClick={onSchedule}><FeedIcon name="people" /><span>Escala</span></button>}
        {onRequest && <button type="button" onClick={onRequest}><FeedIcon name="heart" /><span>Pedido</span></button>}

      </div>
    </>
  );
}
