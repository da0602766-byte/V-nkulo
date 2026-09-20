import { getD1 } from "../../../../../../db";
import { requireTenantPermission } from "../../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };
const TYPES = ["AMEM", "CORACAO", "ORACAO", "ALEGRIA"] as const;
type ReactionType = (typeof TYPES)[number];

function parseInput(value: unknown): ReactionType | null {
  const normalized = String(value || "").trim().toUpperCase();
  return TYPES.includes(normalized as ReactionType) ? normalized as ReactionType : null;
}

async function verifyPost(postId: number, context: Awaited<ReturnType<typeof requireTenantPermission>>) {
  if ("error" in context) return null;
  const post = await getD1().prepare(
    `SELECT id FROM publicacoes_piloto
     WHERE id = ? AND comunidade_id = ? AND status = 'PUBLICADA' AND canal_feed = 1
     LIMIT 1`,
  ).bind(postId, context.context.comunidadeId).first<{ id: number }>();
  return post ? context : null;
}

async function responseFor(postId: number, userId: number) {
  const db = getD1();
  const [countResult, ownResult] = await Promise.all([
    db.prepare(
      `SELECT tipo, COUNT(*) AS total FROM reacoes_publicacao
       WHERE publicacao_id = ? GROUP BY tipo`,
    ).bind(postId).all<{ tipo: ReactionType; total: number }>(),
    db.prepare(
      `SELECT tipo FROM reacoes_publicacao WHERE publicacao_id = ? AND usuario_id = ?`,
    ).bind(postId, userId).all<{ tipo: ReactionType }>(),
  ]);
  const contagens = Object.fromEntries(TYPES.map((type) => [type, 0])) as Record<ReactionType, number>;
  countResult.results.forEach((row) => { contagens[row.tipo] = Number(row.total) || 0; });
  return Response.json({ contagens, minhas: ownResult.results.map((row) => row.tipo) });
}

async function toggle(request: Request, routeContext: Context, adding: boolean) {
  const access = await requireTenantPermission("feed.view");
  if ("error" in access) return access.error;
  const postId = Number((await routeContext.params).id);
  const body = await request.json().catch(() => ({})) as { tipo?: unknown };
  const type = parseInput(body.tipo);
  if (!Number.isInteger(postId) || postId <= 0 || !type) {
    return Response.json({ error: "Reação inválida." }, { status: 400 });
  }
  const context = await verifyPost(postId, access);
  if (!context) return Response.json({ error: "Publicação não encontrada." }, { status: 404 });
  const db = getD1();
  if (adding) {
    await db.prepare(
      `INSERT OR IGNORE INTO reacoes_publicacao (publicacao_id, usuario_id, tipo)
       VALUES (?, ?, ?)`,
    ).bind(postId, context.user.id, type).run();
  } else {
    await db.prepare(
      `DELETE FROM reacoes_publicacao
       WHERE publicacao_id = ? AND usuario_id = ? AND tipo = ?`,
    ).bind(postId, context.user.id, type).run();
  }
  return responseFor(postId, context.user.id);
}

export async function POST(request: Request, context: Context) { return toggle(request, context, true); }
export async function DELETE(request: Request, context: Context) { return toggle(request, context, false); }
