import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { CONFIG_KEY, getLandingPlans, parseLandingPlans } from "../../../lib/platform-plans";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.ativo || !user.system_owner) return Response.json({ error: "Apenas o proprietário pode consultar os planos." }, { status: 403 });
  return Response.json({ plans: await getLandingPlans() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user?.ativo || !user.system_owner) return Response.json({ error: "Apenas o proprietário pode alterar os planos." }, { status: 403 });
  const body = await request.json().catch(() => null) as { plans?: unknown } | null;
  const plans = parseLandingPlans(body?.plans);
  await getD1().prepare(
    `INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`,
  ).bind(CONFIG_KEY, JSON.stringify(plans), String(user.id)).run();
  return Response.json({ ok: true, plans });
}
