import { getSessionUser } from "./local-auth";

/**
 * Porta de entrada da Área do Proprietário.
 *
 * Estava embutida em app/api/proprietario/route.ts. Virou módulo quando o
 * painel de saúde passou a precisar da mesma checagem: duplicar uma regra de
 * autorização é como ela acaba divergindo entre dois endpoints, e a divergência
 * vira falha de acesso.
 */
export async function requireOwner() {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: Response.json({ error: "Faça login para continuar." }, { status: 401 }),
    } as const;
  }
  if (!user.ativo || !user.system_owner) {
    return {
      error: Response.json(
        { error: "Esta área é exclusiva do proprietário do sistema." },
        { status: 403 },
      ),
    } as const;
  }
  return { user } as const;
}
