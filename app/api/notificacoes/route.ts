import { getD1 } from "../../../db";
import {
  hasPermission,
  requireApiPermission,
  type AppUser,
} from "../../lib/access";

function allowedAreas(user: AppUser) {
  const areas = ["MENU"];
  if (hasPermission(user, "VISITANTES_VER")) areas.push("VISITANTES");
  if (hasPermission(user, "CULTOS_VER")) areas.push("CULTOS");
  if (hasPermission(user, "USUARIOS_GERENCIAR")) areas.push("USUARIOS");
  if (hasPermission(user, "MODULOS_PERSONALIZADOS_VER")) areas.push("MODULOS");
  if (hasPermission(user, "DIACONIA_VER")) areas.push("DIACONIA");
  return areas;
}

export async function GET() {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  const areas = allowedAreas(access.user!);
  const placeholders = areas.map(() => "?").join(",");
  const result = await getD1()
    .prepare(
      `SELECT n.*,
       EXISTS(
         SELECT 1 FROM notificacoes_lidas l
         WHERE l.notificacao_id = n.id AND l.usuario_id = ?
       ) AS lida
       FROM notificacoes_sistema n
       WHERE (n.usuario_id IS NULL AND n.area IN (${placeholders}))
          OR n.usuario_id = ?
       ORDER BY n.criado_em DESC, n.id DESC LIMIT 60`,
    )
    .bind(access.user!.id, ...areas, access.user!.id)
    .all<Record<string, unknown>>();
  return Response.json({
    notificacoes: result.results,
    naoLidas: result.results.filter((item) => !Number(item.lida)).length,
  });
}

export async function PATCH(request: Request) {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  const payload = (await request.json()) as { id?: number; todas?: boolean };
  const db = getD1();
  const areas = allowedAreas(access.user!);

  if (payload.todas) {
    const placeholders = areas.map(() => "?").join(",");
    const result = await db
      .prepare(
        `SELECT id FROM notificacoes_sistema
         WHERE (usuario_id IS NULL AND area IN (${placeholders}))
            OR usuario_id = ? ORDER BY id DESC LIMIT 60`,
      )
      .bind(...areas, access.user!.id)
      .all<{ id: number }>();
    await Promise.all(
      result.results.map((item) =>
        db
          .prepare(
            `INSERT INTO notificacoes_lidas (notificacao_id, usuario_id)
             VALUES (?, ?) ON CONFLICT DO NOTHING`,
          )
          .bind(item.id, access.user!.id)
          .run(),
      ),
    );
    return Response.json({ ok: true });
  }

  const id = Number(payload.id || 0);
  if (!id)
    return Response.json({ error: "Notificação inválida." }, { status: 400 });
  const item = await db
    .prepare("SELECT id, area, usuario_id FROM notificacoes_sistema WHERE id = ?")
    .bind(id)
    .first<{ id: number; area: string; usuario_id: number | null }>();
  if (
    !item ||
    (item.usuario_id !== null
      ? item.usuario_id !== access.user!.id
      : !areas.includes(item.area))
  )
    return Response.json(
      { error: "Notificação não encontrada." },
      { status: 404 },
    );
  await db
    .prepare(
      `INSERT INTO notificacoes_lidas (notificacao_id, usuario_id)
       VALUES (?, ?) ON CONFLICT DO NOTHING`,
    )
    .bind(id, access.user!.id)
    .run();
  return Response.json({ ok: true });
}
