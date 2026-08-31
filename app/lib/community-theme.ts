import { getD1 } from "../../db";

export type CommunityPaletteId =
  | "CLASSICO"
  | "MODERNO"
  | "CORPORATIVO"
  | "ACOLHEDOR"
  | "SERENIDADE"
  | "CELEBRACAO"
  | "NOITE_CARMESIM"
  | "NOITE_OCEANO"
  | "NOITE_DOURADA";

export type CommunityThemeTokens = {
  background: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  line: string;
  primary: string;
  secondary: string;
  accent: string;
  shadow: string;
};

export type CommunityPalette = {
  id: CommunityPaletteId;
  name: string;
  description: string;
  light: CommunityThemeTokens;
  dark: CommunityThemeTokens;
};

export type CommunityTheme = {
  paletteId: CommunityPaletteId;
  logoUrl: string;
  bannerUrl: string;
  wallpaperUrl: string;
};

export const COMMUNITY_PALETTES: CommunityPalette[] = [
  {
    id: "CLASSICO",
    name: "Clássico",
    description: "Azul profundo, dourado discreto e leitura confortável.",
    light: {
      background: "#f3f1ec",
      surface: "#fbfaf7",
      surface2: "#ebe8e1",
      text: "#1d2733",
      muted: "#65707d",
      line: "#d8d5ce",
      primary: "#153b5b",
      secondary: "#3d6683",
      accent: "#b47b23",
      shadow: "0 20px 55px rgba(32, 43, 56, 0.10)",
    },
    dark: {
      background: "#080c12",
      surface: "#10161e",
      surface2: "#171f29",
      text: "#f4f2ec",
      muted: "#a4adba",
      line: "#27313d",
      primary: "#d7a143",
      secondary: "#6ca9d1",
      accent: "#e4b45d",
      shadow: "0 22px 65px rgba(0, 0, 0, 0.38)",
    },
  },
  {
    id: "MODERNO",
    name: "Moderno",
    description: "Violeta e ciano inspirados na referência oficial.",
    light: {
      background: "#f1f2f6",
      surface: "#fafbfc",
      surface2: "#e8ebf2",
      text: "#1b2332",
      muted: "#687284",
      line: "#d6dae4",
      primary: "#6243d7",
      secondary: "#327fc4",
      accent: "#159aa0",
      shadow: "0 22px 58px rgba(39, 48, 73, 0.11)",
    },
    // O modo escuro troca o violeta por grafite neutro nas superfícies, mas
    // mantém um acento vivo: a seriedade vem do fundo, não da falta de cor.
    // A identidade violeta permanece no modo claro.
    dark: {
      background: "#0b0d10",
      surface: "#15181d",
      surface2: "#1e232a",
      text: "#edf1f5",
      muted: "#98a3b0",
      line: "#2e353e",
      primary: "#4d9fff",
      secondary: "#3d84e0",
      accent: "#3fc9b0",
      shadow: "0 24px 72px rgba(0, 0, 0, 0.55)",
    },
  },
  {
    id: "CORPORATIVO",
    name: "Corporativo",
    description: "Azul-petróleo e verde com acabamento sóbrio.",
    light: {
      background: "#eff3f3",
      surface: "#f9fbfb",
      surface2: "#e3eaea",
      text: "#17282c",
      muted: "#607277",
      line: "#cfdddd",
      primary: "#174e59",
      secondary: "#2e7080",
      accent: "#28856f",
      shadow: "0 20px 55px rgba(24, 59, 64, 0.10)",
    },
    dark: {
      background: "#071012",
      surface: "#0e191d",
      surface2: "#152328",
      text: "#eef6f5",
      muted: "#9badaf",
      line: "#25383d",
      primary: "#43a2ad",
      secondary: "#69b4c4",
      accent: "#5bc4a3",
      shadow: "0 24px 68px rgba(0, 0, 0, 0.40)",
    },
  },
  {
    id: "ACOLHEDOR",
    name: "Acolhedor",
    description: "Terracota, areia e vinho suave para comunidades próximas.",
    light: {
      background: "#f6f0ea",
      surface: "#fffaf6",
      surface2: "#eee1d7",
      text: "#34241f",
      muted: "#79675f",
      line: "#e0d0c4",
      primary: "#9b4938",
      secondary: "#bf735f",
      accent: "#d89a4a",
      shadow: "0 20px 56px rgba(91, 51, 38, 0.11)",
    },
    dark: {
      background: "#120c0b",
      surface: "#1d1412",
      surface2: "#2a1d1a",
      text: "#fff3eb",
      muted: "#c4aaa0",
      line: "#45302a",
      primary: "#e88a70",
      secondary: "#d2a28e",
      accent: "#efb35d",
      shadow: "0 24px 70px rgba(0, 0, 0, 0.42)",
    },
  },
  {
    id: "SERENIDADE",
    name: "Serenidade",
    description: "Azul névoa, lavanda e verde-sálvia de baixo contraste.",
    light: {
      background: "#eef3f5",
      surface: "#fbfdfd",
      surface2: "#e1eaed",
      text: "#21343c",
      muted: "#667a82",
      line: "#cfdbdf",
      primary: "#416f82",
      secondary: "#7775a5",
      accent: "#5f927e",
      shadow: "0 20px 56px rgba(45, 73, 83, 0.10)",
    },
    dark: {
      background: "#081012",
      surface: "#101b1f",
      surface2: "#18272c",
      text: "#edf7f7",
      muted: "#9db2b7",
      line: "#2a3e44",
      primary: "#78b2c8",
      secondary: "#aaa6dc",
      accent: "#7fc0a7",
      shadow: "0 24px 68px rgba(0, 0, 0, 0.41)",
    },
  },
  {
    id: "CELEBRACAO",
    name: "Celebração",
    description: "Índigo, coral e âmbar para uma identidade mais vibrante.",
    light: {
      background: "#f3f1f8",
      surface: "#fcfbff",
      surface2: "#e8e4f2",
      text: "#262238",
      muted: "#6f6980",
      line: "#d9d3e5",
      primary: "#5742a6",
      secondary: "#a64d68",
      accent: "#c8862d",
      shadow: "0 21px 58px rgba(62, 48, 105, 0.12)",
    },
    dark: {
      background: "#0b0912",
      surface: "#151221",
      surface2: "#211b31",
      text: "#f8f3ff",
      muted: "#b3a9c5",
      line: "#352d49",
      primary: "#9b7cf5",
      secondary: "#ed789b",
      accent: "#f0b258",
      shadow: "0 24px 72px rgba(0, 0, 0, 0.44)",
    },
  },
  {
    id: "NOITE_CARMESIM",
    name: "Preto & Carmesim",
    description: "Preto profundo, vermelho carmesim e contraste marcante.",
    light: {
      background: "#f5f2f2",
      surface: "#fffafa",
      surface2: "#eee5e6",
      text: "#211719",
      muted: "#756467",
      line: "#dfd1d3",
      primary: "#8e2439",
      secondary: "#3a252a",
      accent: "#c44258",
      shadow: "0 22px 60px rgba(62, 20, 29, 0.13)",
    },
    dark: {
      background: "#050506",
      surface: "#0d0b0c",
      surface2: "#181113",
      text: "#fff5f6",
      muted: "#bea7ab",
      line: "#352126",
      primary: "#ff526f",
      secondary: "#d73d59",
      accent: "#ff8799",
      shadow: "0 26px 78px rgba(0, 0, 0, 0.68)",
    },
  },
  {
    id: "NOITE_OCEANO",
    name: "Preto & Elétrico",
    description: "Preto, azul elétrico e ciano para uma presença tecnológica.",
    light: {
      background: "#eef3f8",
      surface: "#fbfdff",
      surface2: "#e1eaf3",
      text: "#132331",
      muted: "#607486",
      line: "#ccd9e5",
      primary: "#075db5",
      secondary: "#163e67",
      accent: "#008da2",
      shadow: "0 22px 60px rgba(17, 63, 105, 0.13)",
    },
    dark: {
      background: "#030609",
      surface: "#081019",
      surface2: "#0d1c2a",
      text: "#f0f8ff",
      muted: "#98afc4",
      line: "#17324a",
      primary: "#38a0ff",
      secondary: "#167bd8",
      accent: "#31d8e8",
      shadow: "0 26px 78px rgba(0, 0, 0, 0.68)",
    },
  },
  {
    id: "NOITE_DOURADA",
    name: "Preto & Dourado",
    description: "Preto elegante, dourado e areia com leitura sofisticada.",
    light: {
      background: "#f4f1e9",
      surface: "#fffdf8",
      surface2: "#ebe5d7",
      text: "#282218",
      muted: "#756d5f",
      line: "#dcd3c0",
      primary: "#8a6215",
      secondary: "#4e4431",
      accent: "#bd8822",
      shadow: "0 22px 60px rgba(65, 49, 20, 0.13)",
    },
    dark: {
      background: "#050504",
      surface: "#0e0d0a",
      surface2: "#1b1810",
      text: "#fff9e9",
      muted: "#beb49d",
      line: "#38301e",
      primary: "#f1bd4f",
      secondary: "#c99028",
      accent: "#ffdb81",
      shadow: "0 26px 78px rgba(0, 0, 0, 0.68)",
    },
  },
];

export const DEFAULT_COMMUNITY_THEME: CommunityTheme = {
  paletteId: "MODERNO",
  logoUrl: "",
  bannerUrl: "",
  wallpaperUrl: "",
};

export function getCommunityPalette(id: CommunityPaletteId) {
  return (
    COMMUNITY_PALETTES.find((palette) => palette.id === id) ||
    COMMUNITY_PALETTES[1]
  );
}

function assetUrl(value: unknown) {
  const candidate = String(value || "").trim().slice(0, 900);
  if (!candidate) return "";
  if (
    /^\/api\/pilot\/uploads\/images\/[a-z-]+\/\d+\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(candidate) ||
    /^\/api\/storage\/media\/[A-Za-z0-9_.-]+$/i.test(candidate)
  ) {
    return candidate;
  }
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function parseCommunityTheme(
  source: Partial<CommunityTheme> | null | undefined,
): CommunityTheme {
  const paletteId = String(source?.paletteId || "").toUpperCase();
  return {
    paletteId: COMMUNITY_PALETTES.some((palette) => palette.id === paletteId)
      ? (paletteId as CommunityPaletteId)
      : DEFAULT_COMMUNITY_THEME.paletteId,
    logoUrl: assetUrl(source?.logoUrl),
    bannerUrl: assetUrl(source?.bannerUrl),
    wallpaperUrl: assetUrl(source?.wallpaperUrl),
  };
}

export async function getCommunityTheme(communityId: number) {
  try {
    const row = await getD1()
      .prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
      .bind(`community_theme:${communityId}`)
      .first<{ valor: string }>();
    return parseCommunityTheme(
      row?.valor
        ? (JSON.parse(row.valor) as Partial<CommunityTheme>)
        : DEFAULT_COMMUNITY_THEME,
    );
  } catch {
    return DEFAULT_COMMUNITY_THEME;
  }
}
