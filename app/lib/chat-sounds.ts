// Original Vínkulo chimes, synthesized locally. No audio files or network requests.
let context: AudioContext | null = null;
let preferenceKey = "";
let enabled = true;
const played = new Set<string>();
let lastReceivedAt = 0;
export const CHAT_SOUND_EVENT = "vinkulo:chat-sound-preference";
export function chatSoundsEnabled() { return enabled; }
export function setChatSoundsEnabled(value: boolean) {
  enabled = value;
  try { if (preferenceKey) localStorage.setItem(preferenceKey, String(value)); } catch {}
  window.dispatchEvent(new Event(CHAT_SOUND_EVENT));
}
export function initializeChatSounds(userId: number) {
  preferenceKey = `vinkulo:chat-sounds:${userId}`;
  try { enabled = localStorage.getItem(preferenceKey) !== "false"; } catch { enabled = true; }
  played.clear();
  window.dispatchEvent(new Event(CHAT_SOUND_EVENT));
  const unlock = () => {
    if (!enabled) return;
    try {
      context ??= new AudioContext();
      if (context.state === "suspended") void context.resume().catch(() => {});
    } catch { /* Unsupported or blocked audio must never affect messaging. */ }
  };
  const sync = (event: StorageEvent) => {
    if (event.key === preferenceKey) { enabled = event.newValue !== "false"; window.dispatchEvent(new Event(CHAT_SOUND_EVENT)); }
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("storage", sync);
    void context?.close().catch(() => {}); context = null; preferenceKey = ""; played.clear();
  };
}
export function playChatSound(kind: "sent" | "received", messageId?: number) {
  if (!enabled || !context || context.state !== "running" || document.visibilityState !== "visible") return;
  const key = `${kind}:${messageId}`;
  if (messageId && played.has(key)) return;
  if (messageId) { played.add(key); if (played.size > 400) played.delete(played.values().next().value!); }
  if (kind === "received" && Date.now() - lastReceivedAt < 900) return;
  if (kind === "received") lastReceivedAt = Date.now();
  try {
    const notes = kind === "sent" ? [659.25, 987.77] : [523.25, 783.99, 1046.5];
    notes.forEach((frequency, index) => {
      const start = context!.currentTime + index * (kind === "sent" ? .065 : .11);
      const oscillator = context!.createOscillator(), gain = context!.createGain();
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(kind === "sent" ? .035 : .055, start + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .24);
      oscillator.connect(gain); gain.connect(context!.destination);
      oscillator.start(start); oscillator.stop(start + .26);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  } catch { /* Audio is optional. */ }
}
