export type MinistryDataset = "ministries" | "schedules" | "resources";
export const ALL_MINISTRY_DATA: MinistryDataset[] = ["ministries", "schedules", "resources"];

// Keep aggregates and access-dependent lists in sync. Unknown/new actions use
// the conservative full refresh until their dependencies have been reviewed.
export function ministryRefreshTargets(url: string, action: unknown): MinistryDataset[] {
  if (url === "/api/pilot/ministerios/recursos") return ["resources", "schedules"];
  if (url.startsWith("/api/pilot/ministerios/equipes")) return ["schedules"];
  if (/^\/api\/pilot\/escalas\/\d+$/.test(url) &&
      ["RESPONDER", "DEFINIR_STATUS_DESIGNACAO"].includes(String(action))) {
    return ["ministries", "schedules"];
  }
  if (/^\/api\/pilot\/ministerios\/\d+$/.test(url) &&
      ["ATUALIZAR_MINHA_DISPONIBILIDADE", "ATUALIZAR_LIMITE_ESCALAS"].includes(String(action))) {
    return ["ministries"];
  }
  return ALL_MINISTRY_DATA;
}
