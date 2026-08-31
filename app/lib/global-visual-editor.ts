export type VisualRule = {
  text?: string;
  color?: string;
  background?: string;
  fontSize?: number;
  borderRadius?: number;
  width?: number;
  order?: number;
  columns?: number;
  hiddenDesktop?: boolean;
  hiddenMobile?: boolean;
  imageUrl?: string;
  shadow?: "NONE" | "SOFT" | "MEDIUM" | "GLOW";
  hoverEffect?: "NONE" | "LIFT" | "GLOW" | "SCALE";
  gradient?: "NONE" | "PURPLE_GOLD" | "PURPLE_BLUE" | "OCEAN" | "SUNSET";
};

export type VisualTextBox = {
  id: string;
  screen: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string;
  background: string;
};

export type GlobalVisualConfig = {
  accentColor: string;
  surfaceColor: string;
  density: "compact" | "comfortable" | "expanded";
  textScale: number;
  radius: number;
  rules: Record<string, VisualRule>;
  textBoxes: VisualTextBox[];
};

export const DEFAULT_GLOBAL_VISUAL_CONFIG: GlobalVisualConfig = {
  accentColor: "#6558f5",
  surfaceColor: "",
  density: "comfortable",
  textScale: 1,
  radius: 16,
  rules: {},
  textBoxes: [],
};

const HEX = /^#[0-9a-f]{6}$/i;
const SAFE_KEY = /^[a-zA-Z0-9:_-]{1,180}$/;
const SAFE_SCREEN = /^[a-zA-Z0-9:/_-]{1,180}$/;

export function parseGlobalVisualConfig(value: unknown): GlobalVisualConfig {
  const source =
    value && typeof value === "object"
      ? (value as Partial<GlobalVisualConfig>)
      : {};
  const rules: Record<string, VisualRule> = {};
  if (source.rules && typeof source.rules === "object") {
    for (const [key, raw] of Object.entries(source.rules).slice(0, 400)) {
      if (!SAFE_KEY.test(key) || !raw || typeof raw !== "object") continue;
      const item = raw as VisualRule;
      const rule: VisualRule = {};
      if (typeof item.text === "string") rule.text = item.text.slice(0, 500);
      if (HEX.test(String(item.color))) rule.color = String(item.color);
      if (HEX.test(String(item.background))) {
        rule.background = String(item.background);
      }
      if (Number.isFinite(item.fontSize)) {
        rule.fontSize = Math.min(48, Math.max(8, Number(item.fontSize)));
      }
      if (Number.isFinite(item.borderRadius)) {
        rule.borderRadius = Math.min(
          48,
          Math.max(0, Number(item.borderRadius)),
        );
      }
      if (Number.isFinite(item.width)) {
        rule.width = Math.min(100, Math.max(20, Number(item.width)));
      }
      if (Number.isFinite(item.order)) {
        rule.order = Math.min(200, Math.max(-200, Number(item.order)));
      }
      if (Number.isFinite(item.columns)) {
        rule.columns = Math.min(6, Math.max(1, Number(item.columns)));
      }
      if (typeof item.hiddenDesktop === "boolean") {
        rule.hiddenDesktop = item.hiddenDesktop;
      }
      if (typeof item.hiddenMobile === "boolean") {
        rule.hiddenMobile = item.hiddenMobile;
      }
      if (
        typeof item.imageUrl === "string" &&
        (
          item.imageUrl === "" ||
          /^https:\/\//i.test(item.imageUrl) ||
          /^\/api\/pilot\/uploads\/images\/[a-z-]+\/\d+\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(item.imageUrl) ||
          /^\/api\/storage\/media\/[A-Za-z0-9_.-]+$/i.test(item.imageUrl)
        )
      ) {
        rule.imageUrl = item.imageUrl.slice(0, 600);
      }
      if (["NONE", "SOFT", "MEDIUM", "GLOW"].includes(String(item.shadow))) {
        rule.shadow = item.shadow;
      }
      if (["NONE", "LIFT", "GLOW", "SCALE"].includes(String(item.hoverEffect))) {
        rule.hoverEffect = item.hoverEffect;
      }
      if (
        ["NONE", "PURPLE_GOLD", "PURPLE_BLUE", "OCEAN", "SUNSET"].includes(
          String(item.gradient),
        )
      ) {
        rule.gradient = item.gradient;
      }
      rules[key] = rule;
    }
  }
  const textBoxes: VisualTextBox[] = [];
  if (Array.isArray(source.textBoxes)) {
    for (const raw of source.textBoxes.slice(0, 80)) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Partial<VisualTextBox>;
      if (
        !SAFE_KEY.test(String(item.id || "")) ||
        !SAFE_SCREEN.test(String(item.screen || ""))
      ) {
        continue;
      }
      textBoxes.push({
        id: String(item.id),
        screen: String(item.screen),
        text: String(item.text || "Novo texto").slice(0, 500),
        x: clampNumber(item.x, 0, 96, 12),
        y: clampNumber(item.y, 0, 96, 18),
        width: clampNumber(item.width, 10, 100, 32),
        fontSize: clampNumber(item.fontSize, 8, 72, 18),
        color: HEX.test(String(item.color)) ? String(item.color) : "#172033",
        background: HEX.test(String(item.background))
          ? String(item.background)
          : "#ffffff",
      });
    }
  }
  return {
    accentColor: HEX.test(String(source.accentColor))
      ? String(source.accentColor)
      : DEFAULT_GLOBAL_VISUAL_CONFIG.accentColor,
    surfaceColor:
      source.surfaceColor === "" || HEX.test(String(source.surfaceColor))
        ? String(source.surfaceColor || "")
        : "",
    density: ["compact", "expanded"].includes(String(source.density))
      ? (source.density as "compact" | "expanded")
      : "comfortable",
    textScale: Number.isFinite(source.textScale)
      ? Math.min(1.3, Math.max(0.8, Number(source.textScale)))
      : 1,
    radius: Number.isFinite(source.radius)
      ? Math.min(28, Math.max(0, Number(source.radius)))
      : 16,
    rules,
    textBoxes,
  };
}

function clampNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Number(value)))
    : fallback;
}
