import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";

export async function PATCH(request: Request) {
  const access = await requireApiPermission("DIACONIA_RANKING_PUBLICAR");
  if (access.error) return access.error;
  const { publicado } = await request.json() as { publicado?: boolean };
  const value = JSON.stringify({ publicado: Boolean(publicado) });
  await getD1().prepare(
    "INSERT INTO configuracoes (chave, valor, atualizado_por) VALUES ('diaconia_ranking', ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP",
  ).bind(value, access.user!.email).run();
  return Response.json({ publicado: Boolean(publicado) });
}
