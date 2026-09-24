import { getD1 } from "../../db";
import { listCommercialPlans } from "./commerce";
import { formatPlanPrice, PLAN_LIMITS, PLAN_RESOURCES } from "./commerce-types";
import { COMMUNITY_MODULES } from "./community-modules";

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

export const DEFAULT_LANDING_PLANS: LandingPlan[] = [];

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

export async function getLandingPlans(): Promise<LandingPlan[]> {
  try {
    return (await listCommercialPlans()).filter(p=>p.ativo&&p.contratavel).map(p=>({
      name:p.nome,price:formatPlanPrice(p),description:p.descricao,featured:p.destaque,contact:p.personalizado,cta:'Solicitar comunidade',
      items:[...p.modulos.map(key=>COMMUNITY_MODULES.find(m=>m.key===key)!.label),...p.recursos.map(key=>PLAN_RESOURCES.find(r=>r.key===key)!.label),
        ...PLAN_LIMITS.map(({key,label})=>label+': '+(p.limites[key]===null?'sem limite definido':p.limites[key]))],
    }));
  } catch { return []; }
}

export { CONFIG_KEY };
