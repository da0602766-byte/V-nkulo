export type FeedbackTone = "info" | "error" | "success";
export type FeedbackEntry<T> = {
  id: string; fingerprint: string; content: T; tone: FeedbackTone;
  revision: number; dismissed: boolean; actions: number;
  onDismiss?: () => void;
  durationMs?: number;
};

/** Memory only: notices and their callbacks disappear with their owning screen. */
export function createFeedbackStore<T>() {
  const entries = new Map<string, FeedbackEntry<T>>();
  const listeners = new Set<() => void>();
  let revision = 0;
  let snapshot: FeedbackEntry<T>[] = [];
  const emit = () => {
    const unique = new Map<string, FeedbackEntry<T>>();
    for (const entry of entries.values()) {
      const prior = unique.get(entry.fingerprint);
      if (!prior || entry.actions > prior.actions || (entry.actions === prior.actions && entry.revision > prior.revision)) unique.set(entry.fingerprint, entry);
    }
    snapshot = [...unique.values()].sort((a, b) => b.revision - a.revision).slice(0, 12);
    listeners.forEach(listener => listener());
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    publish(input: Omit<FeedbackEntry<T>, "revision" | "dismissed">) {
      const old = entries.get(input.id);
      const same = old?.fingerprint === input.fingerprint;
      const peer = [...entries.values()].find(entry => entry.fingerprint === input.fingerprint);
      entries.set(input.id, { ...input, revision: same ? old.revision : ++revision,
        dismissed: same ? old.dismissed : peer?.dismissed ?? false });
      emit();
    },
    remove(id: string) { if (entries.delete(id)) emit(); },
    dismiss(fingerprint: string) {
      const callbacks = new Set<() => void>();
      for (const entry of entries.values()) if (entry.fingerprint === fingerprint && !entry.dismissed && entry.onDismiss) callbacks.add(entry.onDismiss);
      for (const [id, entry] of entries) if (entry.fingerprint === fingerprint) entries.set(id, { ...entry, dismissed: true });
      emit();
      callbacks.forEach(callback => callback());
    },
  };
}
