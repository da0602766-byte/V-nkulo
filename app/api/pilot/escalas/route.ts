import { getD1 } from "../../../../db";
import {
  canManageMinistry,
  hasScheduleConflict,
  hasGlobalMinistryManagement,
} from "../../../lib/ministry-access";
import {
  parseCustomFieldAnswers,
  parseSchedulePayload,
  seedFioSteps,
  type MinistryCustomField,
} from "../../../lib/ministry-validation";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";
import { notifyUser } from "../../../lib/pilot-notifications";
import { isSystemOwnerAccount } from "../../../lib/local-auth";
import { listScheduleSubstitutionCandidatesBatch } from "../../../lib/schedule-substitution";

type ScheduleRow = Record<string, unknown> & { id: number };
type AssignmentRow = Record<string, unknown> & { escala_id: number };
type ScheduleTeamRow = Record<string, unknown> & { escala_id: number };

// Lote pedido a cada carregamento. O teto anterior era 150 escalas de uma vez,
// sem forma de pedir as seguintes: passado esse número, as mais distantes
// simplesmente não apareciam.
const SCHEDULE_PAGE_SIZE = 150;
const SCHEDULE_MAX_PAGE_SIZE = 200;

// Blocos da busca de designações. O D1 limita os parâmetros por consulta, e o
// `IN (...)` cresce com o tamanho do lote de escalas.
const ASSIGNMENT_ID_CHUNK = 90;

// O cursor guarda o par (inicia_em, id), que é a ordenação da consulta.
type ScheduleCursor = { inicio: string; id: number };

function encodeScheduleCursor(cursor: ScheduleCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeScheduleCursor(value: string | null): ScheduleCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ScheduleCursor>;
    const id = Number(parsed.id);
    if (typeof parsed.inicio !== "string" || !Number.isInteger(id) || id <= 0) {
      return null;
    }
    return { inicio: parsed.inicio, id };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const access = await requireTenantPermission("schedules.view");
  if ("error" in access) return access.error;
  const db = getD1();
  await publishDueSchedules(db, access.context.comunidadeId);
  await notifyUpcomingPendingConfirmations(db, access.context.comunidadeId);
  const scheduleAddress = new URL(request.url);
  const scheduleCursor = decodeScheduleCursor(
    scheduleAddress.searchParams.get("cursor"),
  );
  const requestedScheduleSize = Number(
    scheduleAddress.searchParams.get("limite") || 0,
  );
  const pageSize =
    Number.isInteger(requestedScheduleSize) && requestedScheduleSize > 0
      ? Math.min(requestedScheduleSize, SCHEDULE_MAX_PAGE_SIZE)
      : SCHEDULE_PAGE_SIZE;
  // A Central mostra só as escalas em que a pessoa tem participação pendente, e
  // mostrava quatro depois de baixar o teto inteiro. Com o filtro no SQL ela
  // pede exatamente o que exibe.
  const onlyMyPending =
    scheduleAddress.searchParams.get("filtro") === "minhas-pendentes";
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
        s.titulo, s.inicia_em, s.termina_em, s.local, s.status, s.publicar_em,
        s.observacoes, s.modelo_snapshot, s.campos_respostas,
        s.repertorio, s.links_recursos, s.fio_etapas, s.responsavel_usuario_id,
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
        AND (
          ? = 0
          OR (
            s.status IN ('PUBLICADA', 'AGUARDANDO_CHECKLIST')
            AND datetime(s.termina_em) >= datetime('now')
            AND EXISTS (
              SELECT 1 FROM escala_designacoes pendente
              WHERE pendente.escala_id = s.id
                AND pendente.comunidade_id = s.comunidade_id
                AND pendente.usuario_id = ?
                AND pendente.status = 'PENDENTE'
                AND pendente.ativo = 1
            )
          )
        )
        AND (
          ? = 0
          OR s.inicia_em > ?
          OR (s.inicia_em = ? AND s.id > ?)
        )
      ORDER BY s.inicia_em ASC, s.id ASC
      LIMIT ?`,
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
      onlyMyPending ? 1 : 0,
      access.user.id,
      scheduleCursor ? 1 : 0,
      scheduleCursor?.inicio ?? "",
      scheduleCursor?.inicio ?? "",
      scheduleCursor?.id ?? 0,
      pageSize + 1,
    )
    .all<ScheduleRow>();

  const hasMoreSchedules = schedulesResult.results.length > pageSize;
  if (hasMoreSchedules) schedulesResult.results.length = pageSize;
  const lastSchedule =
    schedulesResult.results[schedulesResult.results.length - 1];
  const nextScheduleCursor =
    hasMoreSchedules && lastSchedule
      ? encodeScheduleCursor({
          inicio: String(lastSchedule.inicia_em ?? ""),
          id: Number(lastSchedule.id),
        })
      : null;
  const loadedScheduleIds = schedulesResult.results.map((schedule) =>
    Number(schedule.id),
  );
  // Esta consulta não tinha limite nenhum: trazia as designações de todas as
  // escalas visíveis da comunidade e o JavaScript logo abaixo descartava as que
  // não pertenciam às escalas carregadas. Buscar só as escalas do lote resolve
  // no SQL o que era descarte em memória. As escalas do lote já passaram pela
  // regra de visibilidade, então a repetição dela aqui deixa de ser necessária;
  // o filtro por comunidade continua, como segunda barreira.
  // A busca é fatiada porque o número de marcadores `?` cresce com o tamanho do
  // lote: 150 escalas gerariam 152 parâmetros numa consulta só, acima do limite
  // de parâmetros por consulta que o D1 impõe. O projeto já trata esse limite
  // com cortes em 100 noutros pontos. Blocos de 90 deixam margem para os dois
  // parâmetros fixos. Cada bloco continua filtrando por comunidade.
  const assignmentRows: AssignmentRow[] = [];
  const scheduleTeamRows: ScheduleTeamRow[] = [];
  for (let inicio = 0; inicio < loadedScheduleIds.length; inicio += ASSIGNMENT_ID_CHUNK) {
    const bloco = loadedScheduleIds.slice(inicio, inicio + ASSIGNMENT_ID_CHUNK);
    const marcadores = bloco.map(() => "?").join(", ");
    const parcial = await db
      .prepare(
        `SELECT d.id, d.escala_id, d.voluntario_id, d.usuario_id, d.equipe_id,
          u.nome, u.telefone, u.foto_perfil, u.email AS owner_email,
          (SELECT official.titulo FROM oficiais_comunidade official JOIN usuario_comunidades membership ON membership.id=official.usuario_comunidade_id WHERE membership.usuario_id=d.usuario_id AND membership.comunidade_id=d.comunidade_id AND membership.status='ATIVO' LIMIT 1) AS titulo_oficial,
          u.criado_em AS owner_criado_em, d.funcao, d.status,
          equipe.nome AS equipe_nome, equipe.cor AS equipe_cor,
          CASE WHEN d.usuario_id = ? THEN 1 ELSE 0 END AS is_mine
        FROM escala_designacoes d
        JOIN usuarios u ON u.id = d.usuario_id
        LEFT JOIN ministerio_equipes equipe
          ON equipe.id = d.equipe_id
         AND equipe.comunidade_id = d.comunidade_id
        WHERE d.comunidade_id = ? AND d.ativo = 1
          AND d.escala_id IN (${marcadores})
        ORDER BY u.nome ASC`,
      )
      .bind(access.user.id, access.context.comunidadeId, ...bloco)
      .all<AssignmentRow>();
    assignmentRows.push(...parcial.results);
    const teamsPartial = await db
      .prepare(
        `SELECT se.escala_id, se.equipe_id, se.funcao, se.ponto_encontro, se.horario_encontro,
          equipe.nome AS equipe_nome, equipe.cor AS equipe_cor, equipe.ordem AS equipe_ordem
         FROM escala_equipes se
         JOIN ministerio_equipes equipe
           ON equipe.id = se.equipe_id
          AND equipe.comunidade_id = se.comunidade_id
         WHERE se.comunidade_id = ? AND se.escala_id IN (${marcadores})
         ORDER BY se.escala_id ASC, equipe.ordem ASC, equipe.nome ASC`,
      )
      .bind(access.context.comunidadeId, ...bloco)
      .all<ScheduleTeamRow>();
    scheduleTeamRows.push(...teamsPartial.results);
  }
  const assignmentsResult = { results: assignmentRows };
  const teamsBySchedule = new Map<number, ScheduleTeamRow[]>();
  for (const team of scheduleTeamRows) {
    const scheduleId = Number(team.escala_id);
    const items = teamsBySchedule.get(scheduleId) || [];
    items.push(team);
    teamsBySchedule.set(scheduleId, items);
  }
  // O fallback só protege uma implantação em que a leitura chegue antes da
  // migração terminar; registros legados são copiados pela migração 0073.
  for (const schedule of schedulesResult.results) {
    const scheduleId = Number(schedule.id);
    if (!teamsBySchedule.has(scheduleId) && Number(schedule.equipe_id || 0) > 0) {
      teamsBySchedule.set(scheduleId, [{
        escala_id: scheduleId,
        equipe_id: Number(schedule.equipe_id),
        equipe_nome: schedule.equipe_nome || "Equipe",
        equipe_cor: "#7357e8",
        equipe_ordem: 0,
        funcao: "",
        ponto_encontro: "",
        horario_encontro: "",
      }]);
    }
  }
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
    const visibleAssignment: AssignmentRow & { owner_verified: boolean } = {
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
  const schedulesNeedingSubstitutes = schedulesResult.results
    .filter((schedule) => {
      const hasPendingOwnAssignment = (
        assignmentsBySchedule.get(Number(schedule.id)) || []
      ).some(
        (assignment) =>
          Boolean(assignment.is_mine) && assignment.status === "PENDENTE",
      );
      return hasPendingOwnAssignment && schedule.status === "PUBLICADA";
    })
    .map((schedule) => Number(schedule.id));
  const substitutionCandidatesBySchedule =
    await listScheduleSubstitutionCandidatesBatch(db, {
      comunidadeId: access.context.comunidadeId,
      escalaIds: schedulesNeedingSubstitutes,
      usuarioAtualId: access.user.id,
    });
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
          fio_etapas: parseArray(schedule.fio_etapas),
          equipes: (teamsBySchedule.get(Number(schedule.id)) || []).map((team) => ({
            equipe_id: Number(team.equipe_id),
            equipe_nome: String(team.equipe_nome || "Equipe"),
            equipe_cor: String(team.equipe_cor || "#7357e8"),
            funcao: String(team.funcao || ""),
          })),
          designacoes: assignmentsBySchedule.get(Number(schedule.id)) || [],
          substitution_candidates:
            substitutionCandidatesBySchedule.get(Number(schedule.id)) || [],
        };
      }),
      voluntarios: volunteersResult.results.map((volunteer) => ({
        ...volunteer,
        dias_disponiveis: parseDays(volunteer.dias_disponiveis),
      })),
      // Nulo quando o lote alcançou a última escala visível.
      nextCursor: nextScheduleCursor,
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
  for (const selectedTeam of parsed.equipes) {
    const team = await db
      .prepare(
        `SELECT id FROM ministerio_equipes
         WHERE id = ? AND ministerio_id = ? AND comunidade_id = ? AND ativa = 1`,
      )
      .bind(
        selectedTeam.equipeId,
        parsed.ministerioId,
        access.context.comunidadeId,
      )
      .first<{ id: number }>();
    if (!team) {
      return Response.json(
        {
          error: parsed.equipes.length === 1
            ? "A equipe selecionada não pertence a este ministério."
            : "Uma das equipes selecionadas não pertence a este ministério.",
        },
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
    equipeId: number | null;
  }> = [];
  const voluntarioIds = Array.from(
    new Set(parsed.designacoes.map((assignment) => assignment.voluntarioId)),
  );
  const volunteersById = new Map<
    number,
    { id: number; usuario_id: number; funcao: string; limite_escalas: number }
  >();
  if (voluntarioIds.length > 0) {
    const placeholders = voluntarioIds.map(() => "?").join(", ");
    const volunteersResult = await db
      .prepare(
        `SELECT id, usuario_id, funcao, limite_escalas FROM ministerio_voluntarios
         WHERE ministerio_id = ? AND comunidade_id = ? AND ativo = 1
           AND id IN (${placeholders})`,
      )
      .bind(parsed.ministerioId, access.context.comunidadeId, ...voluntarioIds)
      .all<{ id: number; usuario_id: number; funcao: string; limite_escalas: number }>();
    for (const volunteer of volunteersResult.results) {
      volunteersById.set(Number(volunteer.id), volunteer);
    }
  }
  for (const assignment of parsed.designacoes) {
    const volunteer = volunteersById.get(assignment.voluntarioId);
    if (!volunteer) {
      return Response.json(
        { error: "Um integrante selecionado não pertence ao ministério." },
        { status: 400 },
      );
    }
    const assignmentTeamId = assignment.equipeId || (
      parsed.equipes.length === 1 ? parsed.equipes[0].equipeId : null
    );
    if (parsed.equipes.length > 0 && !assignmentTeamId) {
      return Response.json(
        { error: "Escolha a equipe de cada integrante desta escala." },
        { status: 400 },
      );
    }
    if (assignmentTeamId && !parsed.equipes.some((team) => team.equipeId === assignmentTeamId)) {
      return Response.json(
        { error: "Um integrante foi associado a uma equipe fora desta escala." },
        { status: 400 },
      );
    }
    if (assignmentTeamId) {
      const teamMember = await db
        .prepare(
          `SELECT id FROM ministerio_equipe_membros
           WHERE equipe_id = ? AND ministerio_id = ? AND comunidade_id = ?
             AND voluntario_id = ?`,
        )
        .bind(
          assignmentTeamId,
          parsed.ministerioId,
          access.context.comunidadeId,
          volunteer.id,
        )
        .first<{ id: number }>();
      if (!teamMember) {
        return Response.json(
          { error: "Cada integrante precisa pertencer à equipe escolhida para ele." },
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
           AND s.status IN ('AGENDADA', 'PUBLICADA', 'AGUARDANDO_CHECKLIST')
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
      equipeId: assignmentTeamId,
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
  // O Fio da escala: usa o que veio do formulário (cada escala pode variar) e,
  // quando o formulário não mandou nada, cai no modelo do próprio ministério.
  let fioEtapas = parsed.fioEtapas;
  if (!fioEtapas.length) {
    const ministry = await db
      .prepare(
        `SELECT fio_habilitado, fio_etapas FROM ministerios_comunidade
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(parsed.ministerioId, access.context.comunidadeId)
      .first<{ fio_habilitado: number; fio_etapas: string }>();
    if (ministry && Number(ministry.fio_habilitado) === 1) {
      const template = parseArray(ministry.fio_etapas).map(String);
      fioEtapas = seedFioSteps(template);
    }
  }
  const result = await db
    .prepare(
      `INSERT INTO escalas_ministerio
      (comunidade_id, ministerio_id, equipe_id, titulo, inicia_em, termina_em,
       local, status, observacoes, repertorio, links_recursos, fio_etapas,
       responsavel_usuario_id, publicar_em, modelo_snapshot, campos_respostas,
       criado_por, atualizado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      JSON.stringify(fioEtapas),
      parsed.responsavelUsuarioId,
      parsed.publicarEm,
      JSON.stringify(modelSnapshot),
      JSON.stringify(customAnswers),
      access.user.id,
      access.user.id,
    )
    .run();
  const scheduleId = Number(result.meta.last_row_id);
  const assignmentIds = new Map<number, number>();
  const notificationRecipients: number[] = [];
  try {
    for (const team of parsed.equipes) {
      await db
        .prepare(
          `INSERT INTO escala_equipes
           (comunidade_id, escala_id, equipe_id, funcao, ponto_encontro, horario_encontro)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          access.context.comunidadeId,
          scheduleId,
          team.equipeId,
          team.funcao,
          team.pontoEncontro,
          team.horarioEncontro,
        )
        .run();
    }
    for (const assignment of validatedAssignments) {
      const assignmentResult = await db
        .prepare(
          `INSERT INTO escala_designacoes
           (comunidade_id, escala_id, voluntario_id, usuario_id, equipe_id, funcao, status, ativo)
           VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', 1)`,
        )
        .bind(
          access.context.comunidadeId,
          scheduleId,
          assignment.id,
          assignment.usuarioId,
          assignment.equipeId,
          assignment.funcao,
        )
        .run();
      assignmentIds.set(
        assignment.id,
        Number(assignmentResult.meta.last_row_id),
      );
      notificationRecipients.push(assignment.usuarioId);
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
  } catch (error) {
    await db.batch([
      db.prepare("DELETE FROM ministerio_checklist_itens WHERE escala_id = ? AND comunidade_id = ?").bind(scheduleId, access.context.comunidadeId),
      db.prepare("DELETE FROM escala_designacoes WHERE escala_id = ? AND comunidade_id = ?").bind(scheduleId, access.context.comunidadeId),
      db.prepare("DELETE FROM escalas_ministerio WHERE id = ? AND comunidade_id = ?").bind(scheduleId, access.context.comunidadeId),
    ]).catch((cleanupError) => console.error("Falha ao limpar escala incompleta:", cleanupError));
    throw error;
  }
  if (parsed.status === "PUBLICADA") {
    const notificationResults = await Promise.allSettled(
      notificationRecipients.map((userId) => notifyUser(db, {
        userId,
        title: "Nova escala ministerial",
        message: `Você foi escalado para “${parsed.titulo}”.`,
        entityId: scheduleId,
        area: "ESCALAS",
        destination: "/painel?view=ministerios",
        createdBy: String(access.user.id),
      })),
    );
    if (notificationResults.some((item) => item.status === "rejected")) {
      console.error(`Escala ${scheduleId} publicada, mas uma ou mais notificações falharam.`);
    }
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
      equipeIds: parsed.equipes.map((team) => team.equipeId),
      status: parsed.status,
      modeloId: modelId,
      checklistItens: checklist.length,
      designacoes: parsed.designacoes.length,
      repertorioItens: parsed.repertorio.length,
      links: parsed.links.length,
    },
  ).catch((auditError) => console.error(`Escala ${scheduleId} salva sem registro de auditoria:`, auditError));
  return Response.json({ id: scheduleId }, { status: 201 });
}

async function publishDueSchedules(db: D1Database, communityId: number) {
  const due = await db.prepare(
    `SELECT id,titulo FROM escalas_ministerio
     WHERE comunidade_id=? AND status='AGENDADA' AND publicar_em IS NOT NULL
       AND datetime(publicar_em)<=datetime('now') LIMIT 40`,
  ).bind(communityId).all<{ id: number; titulo: string }>();
  for (const schedule of due.results) {
    const updated = await db.prepare(
      `UPDATE escalas_ministerio SET status='PUBLICADA',atualizado_em=CURRENT_TIMESTAMP
       WHERE id=? AND comunidade_id=? AND status='AGENDADA'`,
    ).bind(schedule.id,communityId).run();
    if (!Number((updated.meta as { changes?: number }).changes || 0)) continue;
    const recipients = await db.prepare(
      `SELECT DISTINCT usuario_id FROM escala_designacoes
       WHERE escala_id=? AND comunidade_id=? AND ativo=1`,
    ).bind(schedule.id,communityId).all<{ usuario_id: number }>();
    const notificationResults = await Promise.allSettled(recipients.results.map((recipient) => notifyUser(db, {
      userId: Number(recipient.usuario_id),
      title: "Nova escala ministerial",
      message: `Você foi escalado para “${schedule.titulo}”.`,
      entityId: Number(schedule.id),
      area: "ESCALAS",
      destination: "/painel?view=ministerios",
      createdBy: "publicacao-agendada",
    })));
    if (notificationResults.some((item) => item.status === "rejected")) {
      console.error(`Escala agendada ${schedule.id} publicada, mas uma ou mais notificações falharam.`);
    }
  }
}

// A listagem das escalas é carregada pela liderança durante a preparação.
// Nela reservamos, uma única vez, o lembrete de aproximadamente 24h antes do
// início, sem depender do navegador da pessoa que ainda não respondeu.
async function notifyUpcomingPendingConfirmations(db: D1Database, communityId: number) {
  const upcoming = await db.prepare(
    `SELECT s.id, s.titulo, COUNT(d.id) AS pendentes
     FROM escalas_ministerio s
     JOIN escala_designacoes d
       ON d.escala_id = s.id
      AND d.comunidade_id = s.comunidade_id
      AND d.ativo = 1
      AND d.status = 'PENDENTE'
     WHERE s.comunidade_id = ?
       AND s.status = 'PUBLICADA'
       AND datetime(s.inicia_em) BETWEEN datetime('now', '+18 hours') AND datetime('now', '+30 hours')
     GROUP BY s.id, s.titulo
     LIMIT 40`,
  ).bind(communityId).all<{ id: number; titulo: string; pendentes: number }>();

  for (const schedule of upcoming.results) {
    const recipients = await db.prepare(
      `SELECT DISTINCT usuario_id FROM (
        SELECT responsavel_usuario_id AS usuario_id
        FROM escalas_ministerio
        WHERE id = ? AND comunidade_id = ?
        UNION
        SELECT responsavel_usuario_id AS usuario_id
        FROM ministerios_comunidade
        WHERE id = (SELECT ministerio_id FROM escalas_ministerio WHERE id = ? AND comunidade_id = ?)
          AND comunidade_id = ?
        UNION
        SELECT usuario_id
        FROM ministerio_voluntarios
        WHERE ministerio_id = (SELECT ministerio_id FROM escalas_ministerio WHERE id = ? AND comunidade_id = ?)
          AND comunidade_id = ? AND ativo = 1 AND papel = 'LIDER'
      ) WHERE usuario_id IS NOT NULL`,
    ).bind(
      schedule.id, communityId,
      schedule.id, communityId, communityId,
      schedule.id, communityId, communityId,
    ).all<{ usuario_id: number }>();
    if (!recipients.results.length) continue;

    const reminderKey = `schedule_pending_reminder:${communityId}:${schedule.id}`;
    const reserved = await db.prepare(
      `INSERT OR IGNORE INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
       VALUES (?, ?, 'lembrete-escala', CURRENT_TIMESTAMP)`,
    ).bind(reminderKey, JSON.stringify({ pendentes: Number(schedule.pendentes) })).run();
    if (!Number((reserved.meta as { changes?: number }).changes || 0)) continue;

    const pendingLabel = Number(schedule.pendentes) === 1 ? "1 confirmação pendente" : `${schedule.pendentes} confirmações pendentes`;
    const results = await Promise.allSettled(recipients.results.map((recipient) => notifyUser(db, {
      userId: Number(recipient.usuario_id),
      title: "Confirmações pendentes para amanhã",
      message: `A escala “${schedule.titulo}” começa em aproximadamente 24 horas e tem ${pendingLabel}.`,
      entityId: Number(schedule.id),
      area: "ESCALAS",
      destination: "/painel?view=ministerios",
      createdBy: "lembrete-escala",
    })));
    if (results.every((result) => result.status === "rejected")) {
      await db.prepare("DELETE FROM configuracoes WHERE chave = ?").bind(reminderKey).run();
      console.error(`Lembrete da escala ${schedule.id} não pôde ser entregue; ele será tentado novamente.`);
    }
  }
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
