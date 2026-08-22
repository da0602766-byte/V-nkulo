import { getD1 } from "../../../../db";
import {
  canManageMinistry,
  hasScheduleConflict,
  hasGlobalMinistryManagement,
} from "../../../lib/ministry-access";
import {
  parseCustomFieldAnswers,
  parseSchedulePayload,
  type MinistryCustomField,
} from "../../../lib/ministry-validation";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";
import { notifyUser } from "../../../lib/pilot-notifications";
import { isSystemOwnerAccount } from "../../../lib/local-auth";
import { listScheduleSubstitutionCandidates } from "../../../lib/schedule-substitution";

type ScheduleRow = Record<string, unknown> & { id: number };
type AssignmentRow = Record<string, unknown> & { escala_id: number };

export async function GET() {
  const access = await requireTenantPermission("schedules.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const globalManager = hasGlobalMinistryManagement(access.context);
  const visibilitySql = `(
    ? = 1
    OR s.responsavel_usuario_id = ?
    OR EXISTS (
      SELECT 1 FROM ministerios_comunidade responsible_ministry
      WHERE responsible_ministry.id = s.ministerio_id
        AND responsible_ministry.comunidade_id = s.comunidade_id
        AND responsible_ministry.responsavel_usuario_id = ?
    )
    OR EXISTS (
      SELECT 1 FROM ministerio_voluntarios own_leadership
      WHERE own_leadership.ministerio_id = s.ministerio_id
        AND own_leadership.comunidade_id = s.comunidade_id
        AND own_leadership.usuario_id = ?
        AND own_leadership.papel = 'LIDER'
        AND own_leadership.ativo = 1
    )
    OR (
      s.status = 'PUBLICADA'
      AND EXISTS (
        SELECT 1 FROM escala_designacoes own_assignment
        WHERE own_assignment.escala_id = s.id
          AND own_assignment.comunidade_id = s.comunidade_id
          AND own_assignment.usuario_id = ?
          AND own_assignment.ativo = 1
      )
    )
  )`;
  const schedulesResult = await db
    .prepare(
      `SELECT s.id, s.ministerio_id, m.nome AS ministerio_nome,
        m.categoria AS ministerio_categoria,
        s.equipe_id, equipe.nome AS equipe_nome,
        s.titulo, s.inicia_em, s.termina_em, s.local, s.status,
        s.observacoes, s.modelo_snapshot, s.campos_respostas,
        s.repertorio, s.links_recursos, s.responsavel_usuario_id,
        responsavel.nome AS responsavel_nome, s.share_token,
        (SELECT configuracao.valor
         FROM configuracoes configuracao
         WHERE configuracao.chave = 'schedule_share_access:' || s.comunidade_id || ':' || s.id
         LIMIT 1) AS share_access_window,
        s.criado_por, s.criado_em, s.atualizado_em,
        CASE WHEN ? = 1 OR EXISTS (
          SELECT 1 FROM ministerios_comunidade responsible_ministry
          WHERE responsible_ministry.id = s.ministerio_id
            AND responsible_ministry.comunidade_id = s.comunidade_id
            AND responsible_ministry.responsavel_usuario_id = ?
        ) OR EXISTS (
          SELECT 1 FROM ministerio_voluntarios own_leadership
          WHERE own_leadership.ministerio_id = s.ministerio_id
            AND own_leadership.comunidade_id = s.comunidade_id
            AND own_leadership.usuario_id = ?
            AND own_leadership.papel = 'LIDER'
            AND own_leadership.ativo = 1
        ) THEN 1 ELSE 0 END AS can_manage,
        CASE WHEN ? = 1 OR s.criado_por = ? OR EXISTS (
          SELECT 1 FROM ministerios_comunidade delete_ministry
          WHERE delete_ministry.id = s.ministerio_id
            AND delete_ministry.comunidade_id = s.comunidade_id
            AND delete_ministry.responsavel_usuario_id = ?
        ) OR EXISTS (
          SELECT 1 FROM ministerio_voluntarios delete_leadership
          WHERE delete_leadership.ministerio_id = s.ministerio_id
            AND delete_leadership.comunidade_id = s.comunidade_id
            AND delete_leadership.usuario_id = ?
            AND delete_leadership.papel = 'LIDER'
            AND delete_leadership.ativo = 1
        ) THEN 1 ELSE 0 END AS can_delete
      FROM escalas_ministerio s
      JOIN ministerios_comunidade m
        ON m.id = s.ministerio_id
       AND m.comunidade_id = s.comunidade_id
      LEFT JOIN ministerio_equipes equipe
        ON equipe.id = s.equipe_id
       AND equipe.comunidade_id = s.comunidade_id
       AND equipe.ministerio_id = s.ministerio_id
      LEFT JOIN usuarios responsavel ON responsavel.id = s.responsavel_usuario_id
      WHERE s.comunidade_id = ? AND s.status != 'ARQUIVADA' AND ${visibilitySql}
      ORDER BY s.inicia_em ASC, s.id ASC
      LIMIT 150`,
    )
    .bind(
      globalManager ? 1 : 0,
      access.user.id,
      access.user.id,
      globalManager || access.user.system_owner ? 1 : 0,
      access.user.id,
      access.user.id,
      access.user.id,
      access.context.comunidadeId,
      globalManager ? 1 : 0,
      access.user.id,
      access.user.id,
      access.user.id,
      access.user.id,
    )
    .all<ScheduleRow>();
  const assignmentsResult = await db
    .prepare(
      `SELECT d.id, d.escala_id, d.voluntario_id, d.usuario_id,
        u.nome, u.telefone, u.foto_perfil, u.email AS owner_email,
        u.criado_em AS owner_criado_em, d.funcao, d.status,
        CASE WHEN d.usuario_id = ? THEN 1 ELSE 0 END AS is_mine
      FROM escala_designacoes d
      JOIN escalas_ministerio s
        ON s.id = d.escala_id
       AND s.comunidade_id = d.comunidade_id
      JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.comunidade_id = ? AND d.ativo = 1 AND ${visibilitySql}
      ORDER BY u.nome ASC`,
    )
    .bind(
      access.user.id,
      access.context.comunidadeId,
      globalManager ? 1 : 0,
      access.user.id,
      access.user.id,
      access.user.id,
      access.user.id,
    )
    .all<AssignmentRow>();
  const manageableScheduleIds = new Set(
    schedulesResult.results
      .filter((schedule) => Boolean(schedule.can_manage))
      .map((schedule) => Number(schedule.id)),
  );
  const assignmentsBySchedule = new Map<number, AssignmentRow[]>();
  for (const assignment of assignmentsResult.results) {
    const scheduleId = Number(assignment.escala_id);
    if (
      !manageableScheduleIds.has(scheduleId) &&
      !Boolean(assignment.is_mine)
    ) {
      continue;
    }
    const items = assignmentsBySchedule.get(scheduleId) || [];
    const visibleAssignment = {
      ...assignment,
      owner_verified: isSystemOwnerAccount({
        email: String(assignment.owner_email || ""),
        criado_em: String(assignment.owner_criado_em || ""),
      }),
    };
    delete visibleAssignment.owner_email;
    delete visibleAssignment.owner_criado_em;
    if (!manageableScheduleIds.has(scheduleId)) delete visibleAssignment.telefone;
    items.push(visibleAssignment);
    assignmentsBySchedule.set(scheduleId, items);
  }
  const volunteersResult = await db
    .prepare(
      `SELECT mv.id, mv.ministerio_id, mv.usuario_id, u.nome,
        mv.funcao, mv.papel, mv.dias_disponiveis, mv.periodo_preferido,
        mv.limite_escalas
      FROM ministerio_voluntarios mv
      JOIN usuarios u ON u.id = mv.usuario_id
      WHERE mv.comunidade_id = ?
        AND mv.ativo = 1
        AND (
          ? = 1
          OR EXISTS (
            SELECT 1 FROM ministerios_comunidade responsible_ministry
            WHERE responsible_ministry.id = mv.ministerio_id
              AND responsible_ministry.comunidade_id = mv.comunidade_id
              AND responsible_ministry.responsavel_usuario_id = ?
          )
          OR EXISTS (
            SELECT 1 FROM ministerio_voluntarios own_leadership
            WHERE own_leadership.ministerio_id = mv.ministerio_id
              AND own_leadership.comunidade_id = mv.comunidade_id
              AND own_leadership.usuario_id = ?
              AND own_leadership.papel = 'LIDER'
              AND own_leadership.ativo = 1
          )
        )
      ORDER BY u.nome ASC`,
    )
    .bind(
      access.context.comunidadeId,
      globalManager ? 1 : 0,
      access.user.id,
      access.user.id,
    )
    .all<Record<string, unknown>>();
  const substitutionCandidatesBySchedule = new Map<
    number,
    Awaited<ReturnType<typeof listScheduleSubstitutionCandidates>>
  >();
  await Promise.all(
    schedulesResult.results.map(async (schedule) => {
      const scheduleId = Number(schedule.id);
      const hasPendingOwnAssignment = (
        assignmentsBySchedule.get(scheduleId) || []
      ).some(
        (assignment) =>
          Boolean(assignment.is_mine) && assignment.status === "PENDENTE",
      );
      if (!hasPendingOwnAssignment || schedule.status !== "PUBLICADA") return;
      substitutionCandidatesBySchedule.set(
        scheduleId,
        await listScheduleSubstitutionCandidates(db, {
          comunidadeId: access.context.comunidadeId,
          escalaId: scheduleId,
          usuarioAtualId: access.user.id,
        }),
      );
    }),
  );
  return Response.json(
    {
      escalas: schedulesResult.results.map((schedule) => {
        const accessWindow = parseObject(schedule.share_access_window);
        const visibleSchedule = { ...schedule };
        delete visibleSchedule.share_access_window;
        return {
          ...visibleSchedule,
          share_opens_at: typeof accessWindow.abreEm === "string" ? accessWindow.abreEm : null,
          share_expires_at: typeof accessWindow.fechaEm === "string" ? accessWindow.fechaEm : null,
          modelo_snapshot: parseObject(schedule.modelo_snapshot),
          campos_respostas: parseObject(schedule.campos_respostas),
          repertorio: parseArray(schedule.repertorio),
          links_recursos: parseArray(schedule.links_recursos),
          designacoes: assignmentsBySchedule.get(Number(schedule.id)) || [],
          substitution_candidates:
            substitutionCandidatesBySchedule.get(Number(schedule.id)) || [],
        };
      }),
      voluntarios: volunteersResult.results.map((volunteer) => ({
        ...volunteer,
        dias_disponiveis: parseDays(volunteer.dias_disponiveis),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    return await createSchedule(request);
  } catch (error) {
    const reference = crypto.randomUUID().slice(0, 8).toUpperCase();
    console.error(
      `Falha inesperada ao criar escala ministerial [${reference}]: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return Response.json(
      {
        error:
          `Falha interna ao salvar a escala. Nenhum dado parcial foi confirmado. Referência: ${reference}.`,
        code: "SCHEDULE_PERSISTENCE_FAILED",
      },
      { status: 500 },
    );
  }
}

async function createSchedule(request: Request) {
  const access = await requireTenantPermission("schedules.view");
  if ("error" in access) return access.error;
  const payload = (await request.json()) as Record<string, unknown>;
  const parsed = parseSchedulePayload(payload);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const db = getD1();
  if (
    !(await canManageMinistry(
      db,
      access.context,
      access.user.id,
      parsed.ministerioId,
    ))
  ) {
    return Response.json(
      { error: "Você não administra este ministério." },
      { status: 403 },
    );
  }
  if (parsed.equipeId) {
    const team = await db
      .prepare(
        `SELECT id FROM ministerio_equipes
         WHERE id = ? AND ministerio_id = ? AND comunidade_id = ? AND ativa = 1`,
      )
      .bind(
        parsed.equipeId,
        parsed.ministerioId,
        access.context.comunidadeId,
      )
      .first<{ id: number }>();
    if (!team) {
      return Response.json(
        { error: "A equipe selecionada não pertence a este ministério." },
        { status: 400 },
      );
    }
  }
  if (parsed.responsavelUsuarioId) {
    const responsible = await db
      .prepare(
        `SELECT mv.id FROM ministerio_voluntarios mv
         WHERE mv.usuario_id = ? AND mv.ministerio_id = ?
           AND mv.comunidade_id = ? AND mv.ativo = 1`,
      )
      .bind(
        parsed.responsavelUsuarioId,
        parsed.ministerioId,
        access.context.comunidadeId,
      )
      .first<{ id: number }>();
    if (!responsible) {
      return Response.json(
        { error: "O responsável precisa integrar o ministério selecionado." },
        { status: 400 },
      );
    }
  }
  const validatedAssignments: Array<{
    id: number;
    usuarioId: number;
    funcao: string;
  }> = [];
  for (const assignment of parsed.designacoes) {
    const volunteer = await db
      .prepare(
        `SELECT id, usuario_id, funcao, limite_escalas FROM ministerio_voluntarios
         WHERE id = ? AND ministerio_id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(
        assignment.voluntarioId,
        parsed.ministerioId,
        access.context.comunidadeId,
      )
      .first<{ id: number; usuario_id: number; funcao: string; limite_escalas: number }>();
    if (!volunteer) {
      return Response.json(
        { error: "Um integrante selecionado não pertence ao ministério." },
        { status: 400 },
      );
    }
    if (parsed.equipeId) {
      const teamMember = await db
        .prepare(
          `SELECT id FROM ministerio_equipe_membros
           WHERE equipe_id = ? AND ministerio_id = ? AND comunidade_id = ?
             AND voluntario_id = ?`,
        )
        .bind(
          parsed.equipeId,
          parsed.ministerioId,
          access.context.comunidadeId,
          volunteer.id,
        )
        .first<{ id: number }>();
      if (!teamMember) {
        return Response.json(
          { error: "Todos os integrantes da escala devem pertencer à equipe selecionada." },
          { status: 400 },
        );
      }
    }
    const capacity = await db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM escala_designacoes d
         JOIN escalas_ministerio s
           ON s.id = d.escala_id AND s.comunidade_id = d.comunidade_id
         WHERE d.voluntario_id = ? AND d.comunidade_id = ? AND d.ativo = 1
           AND s.status IN ('PUBLICADA', 'AGUARDANDO_CHECKLIST')
           AND datetime(s.termina_em) >= datetime('now')`,
      )
      .bind(volunteer.id, access.context.comunidadeId)
      .first<{ total: number }>();
    if (Number(capacity?.total || 0) >= Number(volunteer.limite_escalas || 4)) {
      return Response.json(
        {
          error:
            "Um integrante atingiu o limite configurado de escalas futuras. Ajuste o limite ou remova uma designação.",
        },
        { status: 409 },
      );
    }
    if (
      await hasScheduleConflict(db, {
        comunidadeId: access.context.comunidadeId,
        usuarioId: Number(volunteer.usuario_id),
        iniciaEm: parsed.iniciaEm,
        terminaEm: parsed.terminaEm,
      })
    ) {
      return Response.json(
        { error: "Um integrante selecionado possui conflito de horário." },
        { status: 409 },
      );
    }
    validatedAssignments.push({
      id: Number(volunteer.id),
      usuarioId: Number(volunteer.usuario_id),
      funcao: assignment.funcao || String(volunteer.funcao),
    });
  }
  const modelId = positiveInteger(payload.modeloId);
  let checklist: string[] = [];
  let customFields: MinistryCustomField[] = [];
  let modelSnapshot: Record<string, unknown> = {};
  let customAnswers: Record<string, string | number | boolean> = {};
  if (modelId) {
    const template = await db
      .prepare(
        `SELECT id, nome, titulo, duracao_minutos, local, observacoes,
          checklist_modelo, campos_personalizados, versao
         FROM ministerio_modelos_escala
         WHERE id = ? AND comunidade_id = ? AND ministerio_id = ? AND ativo = 1`,
      )
      .bind(modelId, access.context.comunidadeId, parsed.ministerioId)
      .first<Record<string, unknown>>();
    if (!template) {
      return Response.json(
        { error: "Modelo não pertence ao ministério selecionado." },
        { status: 404 },
      );
    }
    checklist = parseChecklist(template.checklist_modelo);
    customFields = parseCustomFields(template.campos_personalizados);
    const parsedAnswers = parseCustomFieldAnswers(
      parsed.camposRespostas,
      customFields,
    );
    if ("error" in parsedAnswers) {
      return Response.json({ error: parsedAnswers.error }, { status: 400 });
    }
    customAnswers = parsedAnswers.value;
    modelSnapshot = {
      id: Number(template.id),
      nome: String(template.nome || ""),
      titulo: String(template.titulo || ""),
      duracaoMinutos: Number(template.duracao_minutos),
      local: String(template.local || ""),
      observacoes: String(template.observacoes || ""),
      checklist,
      camposPersonalizados: customFields,
      versao: Number(template.versao) || 1,
    };
  }
  const result = await db
    .prepare(
      `INSERT INTO escalas_ministerio
      (comunidade_id, ministerio_id, equipe_id, titulo, inicia_em, termina_em,
       local, status, observacoes, repertorio, links_recursos,
       responsavel_usuario_id, modelo_snapshot, campos_respostas,
       criado_por, atualizado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      access.context.comunidadeId,
      parsed.ministerioId,
      parsed.equipeId,
      parsed.titulo,
      parsed.iniciaEm,
      parsed.terminaEm,
      parsed.local,
      parsed.status,
      parsed.observacoes,
      JSON.stringify(parsed.repertorio),
      JSON.stringify(parsed.links),
      parsed.responsavelUsuarioId,
      JSON.stringify(modelSnapshot),
      JSON.stringify(customAnswers),
      access.user.id,
      access.user.id,
    )
    .run();
  const scheduleId = Number(result.meta.last_row_id);
  const assignmentIds = new Map<number, number>();
  for (const assignment of validatedAssignments) {
    const assignmentResult = await db
      .prepare(
        `INSERT INTO escala_designacoes
         (comunidade_id, escala_id, voluntario_id, usuario_id, funcao, status, ativo)
         VALUES (?, ?, ?, ?, ?, 'PENDENTE', 1)`,
      )
      .bind(
        access.context.comunidadeId,
        scheduleId,
        assignment.id,
        assignment.usuarioId,
        assignment.funcao,
      )
      .run();
    assignmentIds.set(
      assignment.id,
      Number(assignmentResult.meta.last_row_id),
    );
    if (parsed.status === "PUBLICADA") {
      await notifyUser(db, {
        userId: assignment.usuarioId,
        title: "Nova escala ministerial",
        message: `Você foi escalado para “${parsed.titulo}”.`,
        entityId: scheduleId,
        area: "ESCALAS",
        destination: "/painel?view=ministerios",
        createdBy: String(access.user.id),
      });
    }
  }
  const effectiveChecklist = [
    ...checklist.map((tarefa) => ({ tarefa, voluntarioId: null })),
    ...parsed.checklist,
  ];
  for (const task of effectiveChecklist) {
    await db
      .prepare(
        `INSERT INTO ministerio_checklist_itens
         (comunidade_id, escala_id, designacao_id, tarefa, atualizado_por)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        access.context.comunidadeId,
        scheduleId,
        task.voluntarioId
          ? assignmentIds.get(task.voluntarioId) || null
          : null,
        task.tarefa,
        access.user.id,
      )
      .run();
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "ESCALA_V45_CRIADA",
    "SUCESSO",
    {
      escalaId: scheduleId,
      ministerioId: parsed.ministerioId,
      equipeId: parsed.equipeId,
      status: parsed.status,
      modeloId: modelId,
      checklistItens: checklist.length,
      designacoes: parsed.designacoes.length,
      repertorioItens: parsed.repertorio.length,
      links: parsed.links.length,
    },
  );
  return Response.json({ id: scheduleId }, { status: 201 });
}

function parseDays(value: unknown) {
  try {
    const days = JSON.parse(String(value || "[]"));
    return Array.isArray(days) ? days : [];
  } catch {
    return [];
  }
}

function parseChecklist(value: unknown) {
  try {
    const items = JSON.parse(String(value || "[]"));
    return Array.isArray(items)
      ? items.map((item) => String(item).trim().slice(0, 180)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function parseCustomFields(value: unknown): MinistryCustomField[] {
  try {
    const fields = JSON.parse(String(value || "[]"));
    return Array.isArray(fields) ? (fields as MinistryCustomField[]) : [];
  } catch {
    return [];
  }
}

function parseObject(value: unknown) {
  try {
    const object = JSON.parse(String(value || "{}"));
    return object && typeof object === "object" && !Array.isArray(object)
      ? object
      : {};
  } catch {
    return {};
  }
}

function parseArray(value: unknown) {
  try {
    const array = JSON.parse(String(value || "[]"));
    return Array.isArray(array) ? array : [];
  } catch {
    return [];
  }
}
