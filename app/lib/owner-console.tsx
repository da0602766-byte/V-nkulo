import type { OwnerOperationsScreen } from "../components/OwnerOperationsWorkspace";

export type OwnerData = {
  generatedAt?: string;
  owner: { id: number; nome: string; email: string };
  metrics: Record<string, number>;
  requests: Record<string, unknown>[];
  communities: Record<string, unknown>[];
  users: Record<string, unknown>[];
  audit: Record<string, unknown>[];
  feedback: Record<string, unknown>[];
  auditRetention?: { days: number; visibleLimit: number };
  ownerLayout?: { gridPreset?: OwnerGridPreset; metricOrder?: OwnerMetricKey[] };
};

export type OwnerTab =
  | "overview"
  | "decisions"
  | "requests"
  | "communities"
  | "users"
  | "audit"
  | "feedback"
  | "editorial"
  | "statistics"
  | "optimization"
  | "appearance"
  | "plans"
  | "controls"
  | "laboratory"
  | "integrations"
  | OwnerOperationsScreen;
export type OwnerGridPreset = "2x2" | "2x4" | "4x2" | "4x4";
export type OwnerMetricKey =
  | "comunidades_ativas"
  | "usuarios_ativos"
  | "ministerios_ativos"
  | "solicitacoes_pendentes"
  | "eventos_futuros"
  | "conversas_semana";

export const TABS: { id: OwnerTab; label: string }[] = [
  { id: "overview", label: "Visão executiva" },
  { id: "decisions", label: "Pendências" },
  { id: "requests", label: "Solicitações" },
  { id: "communities", label: "Comunidades" },
  { id: "users", label: "Pessoas" },
  { id: "audit", label: "Segurança e auditoria" },
  { id: "feedback", label: "Feedback e denúncias" },
  { id: "editorial", label: "IA Editorial" },
  { id: "statistics", label: "Crescimento" },
  { id: "optimization", label: "Otimização" },
  { id: "appearance", label: "Aparência" },
  { id: "plans", label: "Planos" },
  { id: "laboratory", label: "Laboratório" },
  { id: "passwords", label: "Redefinições de senha" },
  { id: "deleted", label: "Contas excluídas" },
  { id: "finance", label: "Financeiro" },
  { id: "realtime", label: "Tempo real" },
  { id: "performance", label: "Saúde & incidentes" },
  { id: "publication", label: "Releases & dados" },
  { id: "integrations", label: "Integrações" },
  { id: "incidents", label: "Incidentes" },
  { id: "controls", label: "Controles & módulos" },
];

export const OWNER_NAV_SECTIONS: { id: string; label: string; items: OwnerTab[] }[] = [
  { id: "command", label: "Comando", items: ["overview", "decisions"] },
  { id: "operation", label: "Operação", items: ["communities", "users", "finance", "statistics"] },
  { id: "reliability", label: "Confiabilidade", items: ["performance", "realtime", "audit"] },
  { id: "platform", label: "Plataforma", items: ["controls", "appearance", "plans", "editorial", "optimization"] },
  { id: "system", label: "Sistema", items: ["integrations", "publication", "laboratory"] },
];

function OwnerSectionIcon({ section }: { section: string }) {
  const common = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (section) {
    case "command": return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "network": return <svg {...common}><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M10.8 7.2 6.2 15.7M13.2 7.2l4.6 8.5M7.5 18h9" /></svg>;
    case "product": return <svg {...common}><path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5" /></svg>;
    case "operation": return <svg {...common}><path d="M3 17h4l3-7 4 4 3-7h4" /><path d="M17 4h4v4" /></svg>;
    default: return <svg {...common}><path d="M12 2 4 5v6c0 5.2 3.4 9 8 11 4.6-2 8-5.8 8-11V5l-8-3Z" /><path d="m8.5 11.5 2.5 2.5 4.5-5" /></svg>;
  }
}

export function OwnerTabIcon({ tab }: { tab: OwnerTab }) {
  const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (tab) {
    case "overview": return <OwnerSectionIcon section="command" />;
    case "communities": return <OwnerSectionIcon section="network" />;
    case "plans": return <OwnerSectionIcon section="product" />;
    case "performance": return <OwnerSectionIcon section="operation" />;
    case "audit": return <OwnerSectionIcon section="governance" />;
    case "decisions":
    case "requests": return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6" /></svg>;
    case "users": return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M16 6a3 3 0 0 1 0 6M17 15a4 4 0 0 1 3.5 4v1" /></svg>;
    case "feedback": return <svg {...common}><path d="M4 4h16v12H9l-5 4V4Z" /><path d="M8 9h8M8 13h5" /></svg>;
    case "editorial": return <svg {...common}><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2ZM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z" /></svg>;
    case "statistics": return <svg {...common}><path d="M4 20V12h4v8M10 20V4h4v16M16 20v-9h4v9M2 20h20" /></svg>;
    case "optimization": return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5M5.5 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.5-2" /></svg>;
    case "appearance": return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18V3Z" /></svg>;
    case "laboratory": return <svg {...common}><path d="M9 3h6M10 3v7l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3M8 15h8" /></svg>;
    case "passwords": return <svg {...common}><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9 2 2-2 2 1 1-2 2-1-1-4 4" /></svg>;
    case "deleted": return <svg {...common}><circle cx="8" cy="8" r="3" /><path d="M2 20v-2a6 6 0 0 1 9-5.2M15 16l6 6M21 16l-6 6" /></svg>;
    case "finance": return <svg {...common}><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></svg>;
    case "realtime": return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h5l2-4 4 8 2-4h5" /></svg>;
    case "publication": return <svg {...common}><path d="M12 16V3m-4 4 4-4 4 4M4 14v6h16v-6" /></svg>;
    case "incidents": return <svg {...common}><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5M12 18h.01" /></svg>;
    default: return <svg {...common}><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /><circle cx="8" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="16" cy="17" r="2" fill="currentColor" stroke="none" /></svg>;
  }
}
