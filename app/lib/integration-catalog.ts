import { getD1 } from "../../db";
import { readIntegration } from "./supabase-integration";
import { getAutoSyncStatus } from "./supabase-auto-sync";
import { getScheduleStatus } from "./supabase-schedule";
import { readFirebaseConfig } from "./firebase-integration";

export type ConnectorStatus = "connected" | "not_connected" | "paused" | "attention" | "unavailable";
export type ConnectorSummary = {
  id: string; name: string; description: string; scope: "platform"; available: boolean;
  status: ConnectorStatus; message: string; checkedAt: string | null; lastSyncAt: string | null;
  lastHeartbeatAt: string | null; capabilities: string[];
};
export type IntegrationCatalog = { generatedAt: string; connectors: ConnectorSummary[] };
type ConnectorAdapter = { id: string; name: string; description: string; available: boolean; capabilities: string[];
  read: () => Promise<Pick<ConnectorSummary, "status" | "message" | "checkedAt" | "lastSyncAt" | "lastHeartbeatAt">> };

function recent(value: string | null | undefined, maxAge: number) {
  const timestamp = Date.parse(value || "");
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= maxAge;
}

const supabase: ConnectorAdapter = {
  id: "supabase", name: "Supabase", available: true,
  description: "Conexão protegida e sincronização dos catálogos de comunidades, perfis e vínculos.",
  capabilities: ["Configurar", "Testar conexão", "Sincronizar catálogos", "Desconectar"],
  async read() {
    const [saved, sync, schedule] = await Promise.all([readIntegration(), getAutoSyncStatus(getD1()), getScheduleStatus(getD1())]);
    const config = saved?.config;
    const timestamps = { checkedAt: config?.lastCheck?.checkedAt || null,
      lastSyncAt: config ? sync.lastSuccessAt : null, lastHeartbeatAt: config ? schedule.lastHeartbeatAt : null };
    if (!config) return { ...timestamps, status: "not_connected", message: "Selecione Configurar para cadastrar e testar a conexão." };
    if (!config.ativa) return { ...timestamps, status: "paused", message: "A conexão está desativada na configuração." };
    if (!config.serviceRoleKey || config.lastCheck?.ok === false || (sync.enabled && sync.lastError)) {
      return { ...timestamps, status: "attention", message: "Revise as credenciais e o diagnóstico da conexão ou da sincronização." };
    }
    if (sync.enabled && !recent(schedule.lastHeartbeatAt, 12 * 60_000)) {
      return { ...timestamps, status: "attention", message: "A sincronização está habilitada, mas o agendamento não tem confirmação recente." };
    }
    const verified = config.lastCheck?.ok && recent(config.lastCheck.checkedAt, 24 * 60 * 60_000);
    const updatedAt = saved?.updatedAt ? Date.parse(saved.updatedAt.includes("T") ? saved.updatedAt : `${saved.updatedAt.replace(" ", "T")}Z`) : Infinity;
    const synced = sync.enabled && recent(sync.lastSuccessAt, 12 * 60_000) && Date.parse(sync.lastSuccessAt || "") >= updatedAt;
    return { ...timestamps, status: verified || synced ? "connected" : "attention",
      message: verified || synced ? "Conexão confirmada por teste ou sincronização recente." : "Não há verificação recente. Teste a conexão para confirmar o acesso." };
  },
};

function planned(id: string, name: string, description: string, requirement: string): ConnectorAdapter {
  return { id, name, description, available: false, capabilities: [],
    read: async () => ({ status: "unavailable", message: requirement, checkedAt: null, lastSyncAt: null, lastHeartbeatAt: null }) };
}

// Registro fechado: novos conectores implementam este contrato no servidor.
// Não executa URLs, scripts ou módulos fornecidos pelo navegador.
const adapters: ConnectorAdapter[] = [
  { id: "firebase", name: "Firebase · Android", description: "Envio de notificações para o APK, com credencial cadastrada pelo celular.", available: true,
    capabilities: ["Cadastrar arquivo JSON", "Verificar acesso", "Testar no aparelho", "Desconectar"],
    async read() {
      const config = await readFirebaseConfig();
      return { status: !config ? "not_connected" : recent(config.checkedAt, 24 * 60 * 60_000) ? "connected" : "attention",
        message: !config ? "Cadastre a chave de Contas de serviço pelo botão Configurar Firebase." : recent(config.checkedAt, 24 * 60 * 60_000) ? "Acesso ao FCM verificado. Confirme a entrega usando o teste no aparelho." : "Credencial cadastrada. Verifique o acesso para atualizar o diagnóstico.",
        checkedAt: config?.checkedAt || null, lastSyncAt: null, lastHeartbeatAt: null };
    } },
  supabase,
  planned("whatsapp", "WhatsApp Business", "Mensagens e eventos da conta comercial.", "Conector ainda não implementado. Exige configuração da conta comercial e autorização na API oficial; compartilhar pelo WhatsApp não é uma conexão de API."),
  planned("booking", "Booking.com", "Disponibilidade e reservas de hospedagem.", "Conector ainda não implementado. O acesso e as permissões da API precisam ser confirmados com o provedor antes da implementação."),
  planned("airbnb", "Airbnb", "Reservas e disponibilidade dos anúncios.", "Conector ainda não implementado. Depende de acesso autorizado pelo provedor; esta tela não solicita senha nem simula uma conexão."),
];

export async function getIntegrationCatalog(): Promise<IntegrationCatalog> {
  const connectors = await Promise.all(adapters.map(async adapter => {
    const { id, name, description, available, capabilities } = adapter;
    try { return { id, name, description, available, capabilities, scope: "platform" as const, ...await adapter.read() }; }
    catch { return { id, name, description, available, capabilities, scope: "platform" as const,
      status: "attention" as const, message: "Não foi possível consultar o estado deste conector. Atualize para tentar novamente.",
      checkedAt: null, lastSyncAt: null, lastHeartbeatAt: null }; }
  }));
  return { generatedAt: new Date().toISOString(), connectors };
}
