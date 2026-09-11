import { getD1 } from "../../db";

export type PlatformBranding = {
  siteName: string;
  logoUrl: string;
  feedBannerUrl: string;
  themePreset: PlatformThemePreset;
};

export type PlatformThemePreset =
  | "COBRE"
  | "VIOLETA"
  | "ESMERALDA"
  | "AURORA"
  | "GRAFITE";

export const PLATFORM_THEME_PRESETS: PlatformThemePreset[] = [
  "COBRE",
  "VIOLETA",
  "ESMERALDA",
  "AURORA",
  "GRAFITE",
];

export const DEFAULT_PLATFORM_BRANDING: PlatformBranding = {
  siteName: "VÍNKULO",
  logoUrl: "",
  feedBannerUrl: "",
  // Cobre é o acento único da Reforma Visual V5. Violeta continua disponível
  // como preset nomeado para quem já o escolheu.
  themePreset: "COBRE",
};

function safeText(value: unknown, fallback: string, maximum: number) {
  const candidate = String(value || "").trim().slice(0, maximum);
  return candidate || fallback;
}

function safeAsset(value: unknown, purpose: "platform-logo" | "platform-feed-banner") {
  const candidate = String(value || "").trim().slice(0, 900);
  return (/^\/api\/storage\/media\/[A-Za-z0-9_.-]+$/i.test(candidate) || new RegExp(
    `^/api/pilot/uploads/images/${purpose}/\\d+/[0-9a-f-]+\\.(jpg|png|webp)$`,
    "i",
  ).test(
    candidate,
  ))
    ? candidate
    : "";
}

export function parsePlatformBranding(value: unknown): PlatformBranding {
  const source =
    value && typeof value === "object"
      ? (value as Partial<PlatformBranding>)
      : {};
  const candidate = String(source.themePreset || "").toUpperCase();
  const themePreset = (
    PLATFORM_THEME_PRESETS as string[]
  ).includes(candidate)
    ? (candidate as PlatformThemePreset)
    : DEFAULT_PLATFORM_BRANDING.themePreset;
  return {
    siteName: safeText(source.siteName, DEFAULT_PLATFORM_BRANDING.siteName, 60),
    logoUrl: safeAsset(source.logoUrl, "platform-logo"),
    feedBannerUrl: safeAsset(source.feedBannerUrl, "platform-feed-banner"),
    themePreset,
  };
}

export async function getPlatformBranding() {
  try {
    const row = await getD1()
      .prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
      .bind("platform_branding")
      .first<{ valor: string }>();
    return parsePlatformBranding(row?.valor ? JSON.parse(row.valor) : null);
  } catch {
    return DEFAULT_PLATFORM_BRANDING;
  }
}
