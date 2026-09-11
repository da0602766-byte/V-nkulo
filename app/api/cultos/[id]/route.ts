import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";
import { normalizeCustomFields } from "../../../lib/cultos";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("CULTOS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = (await request.json()) as {
    titulo?: string;
    dataCulto?: string;
    horario?: string;
    equipeId?: number | string;
    registradorUsuarioId?: number | string;
    camposExtras?: unknown;
    observacoes?: string;
    status?: string;
  };
  const titulo = String(payload.titulo || "")
    .trim()
    .slice(0, 120);
  const equipeId = Number(payload.equipeId) || 0;
  const registradorId = Number(payload.registradorUsuarioId) || 0;
  if (!id || !titulo || !payload.dataCulto || !equipeId || !registradorId) {
    return Response.json(
      {
        error:
          "Título, data, equipe e responsável pelo registro são obrigatórios.",
      },
      { status: 400 },
    );
  }
  const db = getD1();
  const [routine, team, recorder] = await Promise.all([
    db.prepare("SELECT id FROM culto_rotinas WHERE id = ?").bind(id).first(),
    db
      .prepare("SELECT id FROM diaconia_equipes WHERE id = ? AND ativo = 1")
      .bind(equipeId)
      .first(),
    db
      .prepare("SELECT id FROM usuarios WHERE id = ? AND ativo = 1")
      .bind(registradorId)
      .first(),
  ]);
  if (!routine)
    return Response.json({ error: "Rotina não encontrada." }, { status: 404 });
  if (!team || !recorder) {
    return Response.json(
      { error: "Escolha uma equipe e uma pessoa cadastrada e ativa." },
      { status: 400 },
    );
  }

  await db
    .prepare(
      `UPDATE culto_rotinas SET titulo = ?, data_culto = ?, horario = ?, equipe_id = ?,
       registrador_usuario_id = ?, campos_extras = ?, observacoes = ?, status = ?,
       atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
    )
    .bind(
      titulo,
      payload.dataCulto,
      String(payload.horario || "").trim() || null,
      equipeId,
      registradorId,
      JSON.stringify(normalizeCustomFields(payload.camposExtras)),
      String(payload.observacoes || "").trim() || null,
      payload.status === "ENCERRADA" ? "ENCERRADA" : "ABERTA",
      id,
    )
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("CULTOS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!id) return Response.json({ error: "Rotina inválida." }, { status: 400 });
  await getD1()
    .prepare("DELETE FROM culto_rotinas WHERE id = ?")
    .bind(id)
    .run();
  return Response.json({ ok: true });
}
