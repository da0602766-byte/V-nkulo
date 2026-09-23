import { getD1 } from "../../db";

export type LandingPlan = {
  name: string;
  price: string;
  period?: string;
  description: string;
  items: string[];
  cta: string;
  featured?: boolean;
  contact?: boolean;
};

export const DEFAULT_LANDING_PLANS: LandingPlan[] = [
  { name: "Comunidade", price: "Gratuito", description: "Para igrejas em início de organização digital.", items: ["Até 100 membros cadastrados", "Módulos: Fio, Agenda, Pedidos", "1 administrador", "Suporte por e-mail"], cta: "Começar grátis", featured: false, contact: false },
  { name: "Crescimento", price: "R$ 89", period: "/mês", description: "Para igrejas em expansão que precisam de mais controle.", items: ["Membros ilimitados", "Todos os módulos", "Até 5 administradores", "Células e relatórios", "Suporte prioritário"], cta: "Experimentar 30 dias grátis", featured: true, contact: false },
  { name: "Rede", price: "Fale conosco", description: "Para redes de igrejas com múltiplas unidades.", items: ["Múltiplas comunidades", "Painel de rede unificado", "Customização de cor e marca", "Suporte dedicado", "Treinamento de equipe"], cta: "Falar com o time", featured: false, contact: true },
];

const CONFIG_KEY = "platform_landing_plans";

function text(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

export function parseLandingPlans(value: unknown): LandingPlan[] {
  return parseConfiguredLandingPlans(value) ?? DEFAULT_LANDING_PLANS;
}

// Administrative reads and writes must never invent commercial values.
export function parseConfiguredLandingPlans(value: unknown): LandingPlan[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;
  if (value.some((source) => !source || typeof source !== "object" || Array.isArray(source)
    || typeof source.name !== "string" || !source.name.trim()
    || typeof source.price !== "string" || !source.price.trim()
    || typeof source.cta !== "string" || !source.cta.trim()
    || !Array.isArray(source.items))) return null;
  return value.map((source) => {
    const item = source as Record<string, unknown>;
    const items = (item.items as unknown[]).map((entry) => text(entry, 100)).filter(Boolean).slice(0, 8);
    return {
      name: text(item.name, 50),
      price: text(item.price, 50),
      period: text(item.period, 20),
      description: text(item.description, 180),
      items,
      cta: text(item.cta, 70),
      featured: Boolean(item.featured),
      contact: Boolean(item.contact),
    };
  });
}

export async function getConfiguredLandingPlans() {
  const row = await getD1().prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1").bind(CONFIG_KEY).first<{ valor: string }>();
  if (!row) return [];
  const plans = parseConfiguredLandingPlans(JSON.parse(row.valor));
  if (!plans) throw new Error("Configuração de planos inválida.");
  return plans;
}

export async function getLandingPlans() {
  try {
    const row = await getD1().prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1").bind(CONFIG_KEY).first<{ valor: string }>();
    return parseLandingPlans(row?.valor ? JSON.parse(row.valor) : null);
  } catch {
    return DEFAULT_LANDING_PLANS;
  }
}

export { CONFIG_KEY };
