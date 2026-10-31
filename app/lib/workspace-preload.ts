// Preload code only, never private API data. React's dynamic import consumes
// the same module promise when the user enters the workspace.
const loaders: Record<string, () => Promise<unknown>> = {
  conta: () => import("../components/AccountProfileWorkspace"),
  comunidade: () => import("../components/CommunityAdminWorkspace"),
  continuidade: () => import("../components/CommunityLifecycleWorkspace"),
  fio: () => import("../components/DayThreadWorkspace"),
  eventos: () => import("../components/EventsWorkspace"),
  lider: () => import("../components/LeadershipWorkspace"),
  redes: () => import("../components/NetworkWorkspace"),
  estacionamento: () => import("../components/ParkingWorkspace"),
  pessoas: () => import("../components/PeopleWorkspace"),
  mensagens: () => import("../components/PrivateChatDock"),
  solicitacoes: () => import("../components/RequestsWorkspace"),
  ministerios: () => import("../components/SecretaryMinisterialWorkspace"),
  celulas: () => import("../components/CellsWorkspace"),
};
const pending = new Map<string, Promise<unknown>>();
export function preloadWorkspace(view: string) {
  if (typeof navigator === "undefined" || !loaders[view]) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "") || document.documentElement.dataset.dataSaver === "true") return;
  if (!pending.has(view)) pending.set(view, loaders[view]().catch(() => { pending.delete(view); }));
}
