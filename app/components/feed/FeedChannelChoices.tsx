import "./feed-interactions.css";

const CHANNELS = [
  { value: "feed", title: "Feed", description: "Na lista principal de publicações." },
  { value: "sidebar", title: "Lateral", description: "No painel “Assistente e avisos”." },
  { value: "both", title: "Feed e lateral", description: "Nos dois espaços, com a mesma publicação." },
] as const;

export default function FeedChannelChoices() {
  return (
    <fieldset className="feed-channel-choices composer-wide">
      <legend>Onde deve aparecer</legend>
      <p>Escolha o espaço. O público continua sendo o definido em “Quem verá”.</p>
      <div className="feed-channel-options">
        {CHANNELS.map((channel) => (
          <label key={channel.value} className="feed-channel-choice">
            <input type="radio" name="publicationChannel" value={channel.value} defaultChecked={channel.value === "feed"} required />
            <svg viewBox="0 0 40 32" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="38" height="30" rx="5" stroke="currentColor" />
              <rect x="5" y="6" width="18" height="20" rx="2" fill="currentColor" opacity={channel.value === "sidebar" ? ".15" : ".8"} />
              <rect x="27" y="6" width="8" height="20" rx="2" fill="currentColor" opacity={channel.value === "feed" ? ".15" : ".8"} />
            </svg>
            <span><strong>{channel.title}</strong><small>{channel.description}</small></span>
          </label>
        ))}
      </div>
      <small>Para aparecer também no mural, escolha “Feed e lateral”.</small>
    </fieldset>
  );
}
