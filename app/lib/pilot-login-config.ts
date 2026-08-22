import { getD1 } from "../../db";

export const PILOT_LOGIN_CONFIG_KEY = "pilot_login_config";

export type PilotSignupField = {
  id: string;
  label: string;
  type: "text" | "tel" | "number" | "date" | "textarea";
  placeholder: string;
  required: boolean;
  enabled: boolean;
};

export type PilotLoginConfig = {
  siteName: string;
  kicker: string;
  titulo: string;
  subtitulo: string;
  logoUrl: string;
  backgroundImageUrl: string;
  backgroundColor: string;
  accentColor: string;
  cardColor: string;
  layout: "IMAGE_LEFT" | "IMAGE_RIGHT" | "CENTERED";
  cardStyle: "SOLID" | "GLASS" | "MINIMAL";
  backgroundPosition: "CENTER" | "TOP" | "BOTTOM";
  backgroundFit: "SMART" | "COVER";
  overlayStrength: number;
  themeMode: "AUTO" | "CLARO" | "ESCURO";
  rememberMeEnabled: boolean;
  loginButtonText: string;
  signupLinkText: string;
  recoveryLinkText: string;
  exploreLinkText: string;
  socialTitle: string;
  facebookUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  whatsappUrl: string;
  cadastroHabilitado: boolean;
  recuperacaoHabilitada: boolean;
  explorarComunidadesHabilitado: boolean;
  avisoPilotoHabilitado: boolean;
  signupFields: PilotSignupField[];
};

export const DEFAULT_PILOT_SIGNUP_FIELDS: PilotSignupField[] = [
  {
    id: "telefone",
    label: "Telefone ou WhatsApp",
    type: "tel",
    placeholder: "(00) 00000-0000",
    required: false,
    enabled: true,
  },
  {
    id: "cep",
    label: "CEP",
    type: "text",
    placeholder: "00000-000",
    required: false,
    enabled: true,
  },
  {
    id: "endereco",
    label: "Endereço",
    type: "text",
    placeholder: "Rua ou avenida",
    required: false,
    enabled: true,
  },
  {
    id: "numero",
    label: "Número",
    type: "text",
    placeholder: "Número ou complemento",
    required: false,
    enabled: true,
  },
  {
    id: "cidade",
    label: "Cidade",
    type: "text",
    placeholder: "Sua cidade",
    required: false,
    enabled: true,
  },
  {
    id: "estado",
    label: "Estado",
    type: "text",
    placeholder: "UF",
    required: false,
    enabled: true,
  },
];

export const DEFAULT_PILOT_LOGIN_CONFIG: PilotLoginConfig = {
  siteName: "Vínkulo",
  kicker: "PORTAL DA COMUNIDADE",
  titulo: "Bem-vindo ao Vínkulo",
  subtitulo: "Acesso individual e protegido à sua comunidade.",
  logoUrl: "",
  backgroundImageUrl: "",
  backgroundColor: "#050817",
  accentColor: "#23cbd1",
  cardColor: "#ffffff",
  layout: "CENTERED",
  cardStyle: "GLASS",
  backgroundPosition: "CENTER",
  backgroundFit: "SMART",
  overlayStrength: 68,
  themeMode: "AUTO",
  rememberMeEnabled: true,
  loginButtonText: "Entrar",
  signupLinkText: "Criar minha conta",
  recoveryLinkText: "Esqueci minha senha",
  exploreLinkText: "Explorar comunidades",
  socialTitle: "Acompanhe nossas redes",
  facebookUrl: "",
  instagramUrl: "",
  youtubeUrl: "",
  whatsappUrl: "",
  cadastroHabilitado: true,
  recuperacaoHabilitada: true,
  explorarComunidadesHabilitado: true,
  avisoPilotoHabilitado: true,
  signupFields: DEFAULT_PILOT_SIGNUP_FIELDS,
};

function cleanText(value: unknown, fallback: string, maxLength: number) {
  const text = String(value ?? "").trim().slice(0, maxLength);
  return text || fallback;
}

function cleanColor(value: unknown, fallback: string) {
  const color = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback;
}

function cleanAssetUrl(value: unknown) {
  const url = String(value ?? "").trim().slice(0, 900);
  if (!url) return "";
  if (/^\/api\/pilot\/uploads\/images\/[a-z-]+\/\d+\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(url)) {
    return url;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function cleanHttpsUrl(value: unknown) {
  const url = String(value ?? "").trim().slice(0, 500);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function cleanChoice<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
) {
  const choice = String(value || "").trim().toUpperCase() as T;
  return choices.includes(choice) ? choice : fallback;
}

function cleanInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function parseSignupFields(value: unknown): PilotSignupField[] {
  if (!Array.isArray(value)) return DEFAULT_PILOT_SIGNUP_FIELDS;
  const seen = new Set<string>();
  const fields: PilotSignupField[] = [];
  for (const item of value.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const source = item as Partial<PilotSignupField>;
    const id = String(source.id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (!id || seen.has(id) || ["nome", "email", "senha", "confirmarsenha"].includes(id)) {
      continue;
    }
    const allowedTypes = ["text", "tel", "number", "date", "textarea"] as const;
    const type = allowedTypes.includes(source.type as (typeof allowedTypes)[number])
      ? source.type as PilotSignupField["type"]
      : "text";
    fields.push({
      id,
      label: cleanText(source.label, "Campo adicional", 70),
      type,
      placeholder: String(source.placeholder || "").trim().slice(0, 100),
      required: source.required === true,
      enabled: source.enabled !== false,
    });
    seen.add(id);
  }
  return fields;
}

export function parsePilotLoginConfig(
  input: Partial<PilotLoginConfig> | null | undefined,
): PilotLoginConfig {
  const source = input || {};
  const sourceLayout = cleanChoice(
    source.layout,
    ["IMAGE_LEFT", "IMAGE_RIGHT", "CENTERED"] as const,
    DEFAULT_PILOT_LOGIN_CONFIG.layout,
  );
  const legacySplitLayout = sourceLayout !== "CENTERED";
  return {
    siteName: cleanText(
      source.siteName,
      DEFAULT_PILOT_LOGIN_CONFIG.siteName,
      60,
    ),
    kicker: cleanText(source.kicker, DEFAULT_PILOT_LOGIN_CONFIG.kicker, 70),
    titulo: cleanText(
      source.titulo,
      DEFAULT_PILOT_LOGIN_CONFIG.titulo,
      100,
    ),
    subtitulo: cleanText(
      source.subtitulo,
      DEFAULT_PILOT_LOGIN_CONFIG.subtitulo,
      240,
    ),
    logoUrl: cleanAssetUrl(source.logoUrl),
    backgroundImageUrl: cleanAssetUrl(source.backgroundImageUrl),
    backgroundColor: cleanColor(
      source.backgroundColor,
      DEFAULT_PILOT_LOGIN_CONFIG.backgroundColor,
    ),
    accentColor: cleanColor(
      source.accentColor,
      DEFAULT_PILOT_LOGIN_CONFIG.accentColor,
    ),
    cardColor: cleanColor(
      source.cardColor,
      DEFAULT_PILOT_LOGIN_CONFIG.cardColor,
    ),
    layout: "CENTERED",
    cardStyle: legacySplitLayout
      ? "GLASS"
      : cleanChoice(
          source.cardStyle,
          ["SOLID", "GLASS", "MINIMAL"] as const,
          DEFAULT_PILOT_LOGIN_CONFIG.cardStyle,
        ),
    backgroundPosition: cleanChoice(
      source.backgroundPosition,
      ["CENTER", "TOP", "BOTTOM"] as const,
      DEFAULT_PILOT_LOGIN_CONFIG.backgroundPosition,
    ),
    backgroundFit: cleanChoice(
      source.backgroundFit,
      ["SMART", "COVER"] as const,
      DEFAULT_PILOT_LOGIN_CONFIG.backgroundFit,
    ),
    overlayStrength: cleanInteger(
      source.overlayStrength,
      DEFAULT_PILOT_LOGIN_CONFIG.overlayStrength,
      20,
      90,
    ),
    themeMode: cleanChoice(
      source.themeMode,
      ["AUTO", "CLARO", "ESCURO"] as const,
      DEFAULT_PILOT_LOGIN_CONFIG.themeMode,
    ),
    rememberMeEnabled:
      typeof source.rememberMeEnabled === "boolean"
        ? source.rememberMeEnabled
        : DEFAULT_PILOT_LOGIN_CONFIG.rememberMeEnabled,
    loginButtonText: cleanText(
      source.loginButtonText,
      DEFAULT_PILOT_LOGIN_CONFIG.loginButtonText,
      40,
    ),
    signupLinkText: cleanText(
      source.signupLinkText,
      DEFAULT_PILOT_LOGIN_CONFIG.signupLinkText,
      50,
    ),
    recoveryLinkText: cleanText(
      source.recoveryLinkText,
      DEFAULT_PILOT_LOGIN_CONFIG.recoveryLinkText,
      50,
    ),
    exploreLinkText: cleanText(
      source.exploreLinkText,
      DEFAULT_PILOT_LOGIN_CONFIG.exploreLinkText,
      50,
    ),
    socialTitle: cleanText(
      source.socialTitle,
      DEFAULT_PILOT_LOGIN_CONFIG.socialTitle,
      60,
    ),
    facebookUrl: cleanHttpsUrl(source.facebookUrl),
    instagramUrl: cleanHttpsUrl(source.instagramUrl),
    youtubeUrl: cleanHttpsUrl(source.youtubeUrl),
    whatsappUrl: cleanHttpsUrl(source.whatsappUrl),
    cadastroHabilitado:
      typeof source.cadastroHabilitado === "boolean"
        ? source.cadastroHabilitado
        : DEFAULT_PILOT_LOGIN_CONFIG.cadastroHabilitado,
    recuperacaoHabilitada:
      typeof source.recuperacaoHabilitada === "boolean"
        ? source.recuperacaoHabilitada
        : DEFAULT_PILOT_LOGIN_CONFIG.recuperacaoHabilitada,
    explorarComunidadesHabilitado:
      typeof source.explorarComunidadesHabilitado === "boolean"
        ? source.explorarComunidadesHabilitado
        : DEFAULT_PILOT_LOGIN_CONFIG.explorarComunidadesHabilitado,
    avisoPilotoHabilitado:
      typeof source.avisoPilotoHabilitado === "boolean"
        ? source.avisoPilotoHabilitado
        : DEFAULT_PILOT_LOGIN_CONFIG.avisoPilotoHabilitado,
    signupFields: parseSignupFields(source.signupFields),
  };
}

export async function getPilotLoginConfig() {
  try {
    const row = await getD1()
      .prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
      .bind(PILOT_LOGIN_CONFIG_KEY)
      .first<{ valor: string }>();
    if (!row?.valor) return DEFAULT_PILOT_LOGIN_CONFIG;
    return parsePilotLoginConfig(
      JSON.parse(row.valor) as Partial<PilotLoginConfig>,
    );
  } catch {
    return DEFAULT_PILOT_LOGIN_CONFIG;
  }
}
