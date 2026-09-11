import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";

export async function GET() {
  const access = await requireTenantPermission("platform.stats.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const [totals, activity, conversion, userGrowth, communityGrowth] =
    await Promise.all([
      db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM usuarios WHERE ativo = 1) AS usuarios,
            (SELECT COUNT(*) FROM comunidades WHERE status = 'ATIVA') AS comunidades`,
        )
        .first<Record<string, number>>(),
      db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM publicacoes_piloto
              WHERE status = 'PUBLICADA') AS publicacoes,
            (SELECT COUNT(*) FROM eventos_comunidade
              WHERE status = 'PUBLICADO') AS eventos,
            (SELECT COUNT(*) FROM confirmacoes_evento
              WHERE status = 'CONFIRMADO') AS confirmacoes`,
        )
        .first<Record<string, number>>(),
      db
        .prepare(
          `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'INTEGRADO' THEN 1 ELSE 0 END) AS integrados
          FROM visitantes
          WHERE ativo = 1 AND escopo_confirmado = 1`,
        )
        .first<{ total: number; integrados: number }>(),
      db
        .prepare(
          `SELECT substr(criado_em, 1, 7) AS mes, COUNT(*) AS total
          FROM usuarios
          WHERE date(criado_em) >= date('now', '-6 months')
          GROUP BY substr(criado_em, 1, 7)
          ORDER BY mes`,
        )
        .all<{ mes: string; total: number }>(),
      db
        .prepare(
          `SELECT substr(criado_em, 1, 7) AS mes, COUNT(*) AS total
          FROM comunidades
          WHERE date(criado_em) >= date('now', '-6 months')
          GROUP BY substr(criado_em, 1, 7)
          ORDER BY mes`,
        )
        .all<{ mes: string; total: number }>(),
    ]);
  const visitors = Number(conversion?.total || 0);
  const integrated = Number(conversion?.integrados || 0);
  return Response.json(
    {
      totals: {
        users: Number(totals?.usuarios || 0),
        communities: Number(totals?.comunidades || 0),
      },
      activity: {
        posts: Number(activity?.publicacoes || 0),
        events: Number(activity?.eventos || 0),
        confirmations: Number(activity?.confirmacoes || 0),
      },
      conversion: {
        visitors,
        members: integrated,
        rate: visitors ? Math.round((integrated / visitors) * 1000) / 10 : 0,
      },
      growth: {
        users: userGrowth.results,
        communities: communityGrowth.results,
      },
      scope: "PLATAFORMA",
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
