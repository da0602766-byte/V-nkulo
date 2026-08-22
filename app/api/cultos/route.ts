import { getD1 } from "../../../db";
import { hasPermission, requireApiPermission } from "../../lib/access";
import {
  buildCultCharts,
  canViewAllCultRoutines,
  enrichCultRoutines,
  normalizeCustomFields,
  type CultEntryRow,
  type CultRoutineRow,
} from "../../lib/cultos";
import { createSystemNotification } from "../../lib/system-notifications";

export async function GET() {
  const access = await requireApiPermission("CULTOS_VER");
  if (access.error) return access.error;
  const user = access.user!;
  const db = getD1();
  const viewAll = canViewAllCultRoutines(user);
  const canManage = hasPermission(user, "CULTOS_GERENCIAR");

  const routineResult = viewAll
    ? await db
        .prepare(
          `SELECT c.*, e.nome AS equipe_nome, e.cor AS equipe_cor, u.nome AS registrador_nome
           FROM culto_rotinas c
           LEFT JOIN diaconia_equipes e ON e.id = c.equipe_id
           LEFT JOIN usuarios u ON u.id = c.registrador_usuario_id
           ORDER BY c.data_culto DESC, c.horario DESC, c.id DESC LIMIT 150`,
        )
        .all<CultRoutineRow>()
    : await db
        .prepare(
          `SELECT c.*, e.nome AS equipe_nome, e.cor AS equipe_cor, u.nome AS registrador_nome
           FROM culto_rotinas c
           LEFT JOIN diaconia_equipes e ON e.id = c.equipe_id
           LEFT JOIN usuarios u ON u.id = c.registrador_usuario_id
           WHERE c.registrador_usuario_id = ?
           ORDER BY c.data_culto DESC, c.horario DESC, c.id DESC LIMIT 150`,
        )
        .bind(user.id)
        .all<CultRoutineRow>();

  const ids = routineResult.results.map((routine) => Number(routine.id));
  const entryResult = ids.length
    ? await db
        .prepare(
          `SELECT l.* FROM culto_lancamentos l
           WHERE l.rotina_id IN (${ids.map(() => "?").join(",")})
           ORDER BY l.criado_em DESC, l.id DESC`,
        )
        .bind(...ids)
        .all<CultEntryRow>()
    : { results: [] as CultEntryRow[] };

  const [teamResult, userResult] = canManage
    ? await Promise.all([
        db
          .prepare(
            "SELECT id, nome, cor, responsavel FROM diaconia_equipes WHERE ativo = 1 ORDER BY nome",
          )
          .all(),
        db
          .prepare(
            "SELECT id, nome, titulo_eclesiastico, diaconia_equipe_id FROM usuarios WHERE ativo = 1 ORDER BY nome",
          )
          .all(),
      ])
    : [{ results: [] }, { results: [] }];

  return Response.json({
    rotinas: enrichCultRoutines(
      routineResult.results,
      entryResult.results,
      user,
    ),
    equipes: teamResult.results,
    usuarios: userResult.results,
    graficos: buildCultCharts(routineResult.results, entryResult.results),
    podeGerenciar: canManage,
  });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("CULTOS_GERENCIAR");
  if (access.error) return access.error;
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
  const status = payload.status === "ENCERRADA" ? "ENCERRADA" : "ABERTA";
  if (!titulo || !payload.dataCulto || !equipeId || !registradorId) {
    return Response.json(
      {
        error:
          "Título, data, equipe e responsável pelo registro são obrigatórios.",
      },
      { status: 400 },
    );
  }

  const db = getD1();
  const [team, recorder] = await Promise.all([
    db
      .prepare("SELECT id FROM diaconia_equipes WHERE id = ? AND ativo = 1")
      .bind(equipeId)
      .first(),
    db
      .prepare("SELECT id FROM usuarios WHERE id = ? AND ativo = 1")
      .bind(registradorId)
      .first(),
  ]);
  if (!team || !recorder) {
    return Response.json(
      { error: "Escolha uma equipe e uma pessoa cadastrada e ativa." },
      { status: 400 },
    );
  }

  const fields = normalizeCustomFields(payload.camposExtras);
  const result = await db
    .prepare(
      `INSERT INTO culto_rotinas
       (titulo, data_culto, horario, equipe_id, registrador_usuario_id, campos_extras, observacoes, status, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      titulo,
      payload.dataCulto,
      String(payload.horario || "").trim() || null,
      equipeId,
      registradorId,
      JSON.stringify(fields),
      String(payload.observacoes || "").trim() || null,
      status,
      access.user!.email,
    )
    .run();
  await createSystemNotification(db, {
    tipo: "NOVO",
    titulo: "Nova rotina dos cultos",
    mensagem: `${titulo} foi programado para ${new Date(`${payload.dataCulto}T12:00:00`).toLocaleDateString("pt-BR")}.`,
    area: "CULTOS",
    entidadeId: Number(result.meta.last_row_id),
    criadoPor: access.user!.email,
  });
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
