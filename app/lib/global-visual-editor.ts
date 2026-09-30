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
  kind?: "text" | "callout" | "link";
  href?: string;
};

export type VisualAppearance = Pick<GlobalVisualConfig, "accentColor" | "surfaceColor" | "density" | "textScale" | "radius">;
export type VisualScreenConfig = { appearance: Partial<VisualAppearance>; rules: Record<string, VisualRule> };

export type GlobalVisualConfig = {
  accentColor: string;
  surfaceColor: string;
  density: "compact" | "comfortable" | "expanded";
  textScale: number;
  radius: number;
  rules: Record<string, VisualRule>;
  textBoxes: VisualTextBox[];
  screens: Record<string, VisualScreenConfig>;
  removedTextBoxIds: string[];
};

export const DEFAULT_GLOBAL_VISUAL_CONFIG: GlobalVisualConfig = {
  accentColor: "#6558f5",
  surfaceColor: "",
  density: "comfortable",
  textScale: 1,
  radius: 16,
  rules: {},
  textBoxes: [],
  screens: {},
  removedTextBoxIds: [],
};

const HEX = /^#[0-9a-f]{6}$/i;
const SAFE_KEY = /^[a-zA-Z0-9:_-]{1,180}$/;
const SAFE_SCREEN = /^[a-zA-Z0-9:/_-]{1,180}$/;
const safeName = (value: string) => !["__proto__", "constructor", "prototype"].includes(value);

// Only explicit HTTPS destinations and same-origin paths; no script/data URLs.
export function safeVisualHref(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 600 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return undefined;
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Invalid destinations remain non-interactive. */ }
  return undefined;
}

export function parseGlobalVisualConfig(value: unknown): GlobalVisualConfig {
  const source =
    value && typeof value === "object"
      ? (value as Partial<GlobalVisualConfig>)
      : {};
  const rules: Record<string, VisualRule> = {};
  if (source.rules && typeof source.rules === "object") {
    for (const [key, raw] of Object.entries(source.rules).slice(0, 400)) {
      if (!SAFE_KEY.test(key) || !safeName(key) || !raw || typeof raw !== "object") continue;
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
        !SAFE_KEY.test(String(item.id || "")) || !safeName(String(item.id)) ||
        !SAFE_SCREEN.test(String(item.screen || ""))
      ) {
        continue;
      }
      textBoxes.push({
        id: String(item.id),
        screen: String(item.screen),
        text: String(item.text ?? "Novo texto").slice(0, 500),
        kind: item.kind === "callout" || item.kind === "link" ? item.kind : "text",
        ...(safeVisualHref(item.href) ? { href: safeVisualHref(item.href) } : {}),
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
  const screens: Record<string, VisualScreenConfig> = {};
  if (source.screens && typeof source.screens === "object") {
    for (const [screen, raw] of Object.entries(source.screens).slice(0, 40)) {
      if (!SAFE_SCREEN.test(screen) || !safeName(screen) || !raw || typeof raw !== "object") continue;
      // Construct a nonrecursive input: nested screens and unknown fields are ignored.
      const normalized = parseGlobalVisualConfig({ ...raw.appearance, screens: undefined, rules: raw.rules, textBoxes: [] });
      const appearance: Partial<VisualAppearance> = {};
      for (const field of ["accentColor", "surfaceColor", "density", "textScale", "radius"] as const) {
        if (raw.appearance && Object.hasOwn(raw.appearance, field)) Object.assign(appearance, { [field]: normalized[field] });
      }
      screens[screen] = { appearance, rules: normalized.rules };
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
    screens,
    removedTextBoxIds: Array.isArray(source.removedTextBoxIds)
      ? [...new Set(source.removedTextBoxIds.filter((id) => typeof id === "string" && SAFE_KEY.test(id) && safeName(id)))].slice(0, 160)
      : [],
  };
}

export function resolveVisualConfig(config: GlobalVisualConfig, screen: string): GlobalVisualConfig {
  const local = config.screens[screen];
  return { ...config, ...local?.appearance, rules: { ...config.rules, ...local?.rules } };
}

export function setVisualRules(config: GlobalVisualConfig, screen: string | null, rules: Record<string, VisualRule>): GlobalVisualConfig {
  return screen === null ? { ...config, rules } : {
    ...config, screens: { ...config.screens, [screen]: { appearance: config.screens[screen]?.appearance || {}, rules } },
  };
}

export function mergeVisualConfigs(...configs: Array<GlobalVisualConfig | null>): GlobalVisualConfig {
  let merged = DEFAULT_GLOBAL_VISUAL_CONFIG;
  for (const config of configs) {
    if (!config) continue;
    const screens = { ...merged.screens };
    for (const [screen, local] of Object.entries(config.screens)) {
      screens[screen] = { appearance: { ...screens[screen]?.appearance, ...local.appearance }, rules: { ...screens[screen]?.rules, ...local.rules } };
    }
    const removed = new Set([...merged.removedTextBoxIds, ...config.removedTextBoxIds]);
    const boxes = new Map(merged.textBoxes.map((box) => [box.id, box]));
    for (const box of config.textBoxes) boxes.set(box.id, box);
    merged = { ...merged, ...config, screens, rules: { ...merged.rules, ...config.rules },
      removedTextBoxIds: [...removed], textBoxes: [...boxes.values()].filter((box) => !removed.has(box.id)) };
  }
  return parseGlobalVisualConfig(merged);
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
