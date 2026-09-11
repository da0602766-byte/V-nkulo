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
  if (!Array.isArray(value) || value.length !== DEFAULT_LANDING_PLANS.length) return DEFAULT_LANDING_PLANS;
  return DEFAULT_LANDING_PLANS.map((fallback, index) => {
    const source = value[index];
    if (!source || typeof source !== "object" || Array.isArray(source)) return fallback;
    const item = source as Record<string, unknown>;
    const items = Array.isArray(item.items)
      ? item.items.map((entry) => text(entry, 100)).filter(Boolean).slice(1, 8)
      : fallback.items;
    return {
      name: text(item.name, 50) || fallback.name,
      price: text(item.price, 50) || fallback.price,
      period: text(item.period, 20),
      description: text(item.description, 180) || fallback.description,
      items: items.length ? items : fallback.items,
      cta: text(item.cta, 70) || fallback.cta,
      featured: Boolean(item.featured),
      contact: Boolean(item.contact),
    };
  });
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
