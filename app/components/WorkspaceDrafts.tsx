"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";

type DraftRegistry = { update: (id: string, label: string, dirty: boolean) => void };
const DraftContext = createContext<DraftRegistry | null>(null);

/** Lives outside Activity so drafts in hidden tabs still protect document navigation. */
export function WorkspaceDrafts({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const update = useCallback((id: string, label: string, dirty: boolean) => {
    setDrafts(current => {
      if ((dirty && current[id] === label) || (!dirty && !(id in current))) return current;
      const next = { ...current };
      if (dirty) next[id] = label; else delete next[id];
      return next;
    });
  }, []);
  const registry = useMemo(() => ({ update }), [update]);
  const hasDrafts = Object.keys(drafts).length > 0;
  useEffect(() => {
    if (!hasDrafts) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [hasDrafts]);
  return <DraftContext.Provider value={registry}>{children}</DraftContext.Provider>;
}

export function useWorkspaceDraft(dirty: boolean, label: string) {
  const id = useId();
  const registry = useContext(DraftContext);
  useEffect(() => {
    registry?.update(id, label, dirty);
    // Hiding an Activity cleans effects but keeps its draft. The scope provider
    // is destroyed on logout or a change of user/community/permissions.
  }, [registry, id, label, dirty]);
}
