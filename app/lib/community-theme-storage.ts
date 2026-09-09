import { getD1 } from "../../db";
import {
  DEFAULT_COMMUNITY_THEME,
  parseCommunityTheme,
  type CommunityTheme,
} from "./community-theme";

// Fica separado de `community-theme.ts` de proposito: esta e a unica funcao do
// tema que toca no banco, e `community-theme.ts` e importado por componentes de
// cliente (PilotDashboard, CommunityThemeEditor). Enquanto as duas coisas
// moravam no mesmo arquivo, o import de `getD1` arrastava o Drizzle ORM e o
// schema inteiro para o bundle do navegador.
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
