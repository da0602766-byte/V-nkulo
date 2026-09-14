import { getD1 } from "../../../../../db";
import {
  canManageSchedule,
  hasScheduleConflict,
} from "../../../../lib/ministry-access";
import {
  cleanAction,
  parseAssignmentPayload,
  parseCustomFieldAnswers,
  parseFioSteps,
  parseSchedulePayload,
  type MinistryCustomField,
} from "../../../../lib/ministry-validation";
import { notifyUser } from "../../../../lib/pilot-notifications";
import { assignScheduleSubstitute } from "../../../../lib/schedule-substitution";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";
import {
  getTemporaryAccessById,
  recordTemporaryAccessAudit,
} from "../../../../lib/temporary-access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireTenantPermission("schedules.view");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Escala inválida." }, { status: 400 });
  }
  const payload = (await request.json()) as Record<string, unknown>;
  const action = cleanAction(payload.acao);
  const db = getD1();
  const schedule = await db
    .prepare(
      `SELECT id, ministerio_id, equipe_id, titulo, inicia_em, termina_em,
        status, responsavel_usuario_id, criado_por, modelo_snapshot,
        campos_respostas, share_token, fio_etapas
      FROM escalas_ministerio
      WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(id, access.context.comunidadeId)
    .first<{
      id: number;
      ministerio_id: number;
      equipe_id: number | null;
      titulo: string;
      inicia_em: string;
      termina_em: string;
      status: string;
      responsavel_usuario_id: number | null;
      criado_por: number | null;
      modelo_snapshot: string;
      campos_respostas: string;
      share_token: string | null;
      fio_etapas: string;
    }>();
  if (!schedule) {
    return Response.json({ error: "Escala não encontrada." }, { status: 404 });
  }

  if (action === "EXCLUIR") {
    const canDelete =
      access.user.system_owner === true ||
      (await canManageSchedule(db, access.context, access.user.id, id));
    if (!canDelete) {
      return Response.json(
        { error: "Você não pode excluir esta escala." },
        { status: 403 },
      );
    }
    await db.batch([
      db
        .prepare(
          `UPDATE escalas_ministerio
           SET status = 'ARQUIVADA', share_token = NULL, atualizado_por = ?,
             atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(access.user.id, id, access.context.comunidadeId),
      db
        .prepare(
          `UPDATE escala_designacoes SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
           WHERE escala_id = ? AND comunidade_id = ?`,
        )
        .bind(id, access.context.comunidadeId),
    ]);
    await audit("ESCALA_V472_ARQUIVADA", {
      escalaId: id,
      ministerioId: schedule.ministerio_id,
    });
    await cancelTemporaryAccessForSchedule("ESCALA_ARQUIVADA");
    return Response.json({ ok: true });
  }

  if (action === "RESPONDER") {
    if (!access.context.permissions.includes("schedules.respond")) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    const status = String(payload.status || "").trim().toUpperCase();
    if (!["CONFIRMADA", "INDISPONIVEL"].includes(status)) {
      return Response.json({ error: "Resposta inválida." }, { status: 400 });
    }
    if (schedule.status !== "PUBLICADA") {
      return Response.json(
        { error: "Somente escalas publicadas aceitam resposta." },
        { status: 409 },
      );
    }
    const assignment = await db
      .prepare(
        `SELECT id, status FROM escala_designacoes
        WHERE escala_id = ? AND comunidade_id = ?
          AND usuario_id = ? AND ativo = 1`,
      )
      .bind(id, access.context.comunidadeId, access.user.id)
      .first<{ id: number; status: string }>();
    if (!assignment) {
      return Response.json(
        { error: "Você não possui designação nesta escala." },
        { status: 404 },
      );
    }
    let replacement:
      | Awaited<ReturnType<typeof assignScheduleSubstitute>>
      | undefined;
    if (status === "CONFIRMADA") {
      if (await hasScheduleConflict(db, {
        comunidadeId: access.context.comunidadeId,
        usuarioId: access.user.id,
        iniciaEm: schedule.inicia_em,
        terminaEm: schedule.termina_em,
        excludeScheduleId: id,
      })) {
        return Response.json(
          { error: "Existe conflito de horário com outra escala desta comunidade." },
          { status: 409 },
        );
      }
      const update = await db
        .prepare(
          `UPDATE escala_designacoes
           SET status = 'CONFIRMADA', resposta_em = CURRENT_TIMESTAMP,
             atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ? AND usuario_id = ?
             AND ativo = 1 AND status = 'PENDENTE'`,
        )
        .bind(assignment.id, access.context.comunidadeId, access.user.id)
        .run();
      if (!Number(update.meta.changes)) {
        return Response.json(
          { error: "A designação foi alterada enquanto você respondia. Atualize a página." },
          { status: 409 },
        );
      }
    } else {
      const substitutoVoluntarioId = Number(payload.substitutoVoluntarioId || 0);
      if (!Number.isInteger(substitutoVoluntarioId) || substitutoVoluntarioId <= 0) {
        return Response.json(
          { error: "Escolha quem poderá ficar no seu lugar antes de continuar." },
          { status: 400 },
        );
      }
      replacement = await assignScheduleSubstitute(db, {
        comunidadeId: access.context.comunidadeId,
        escalaId: id,
        designacaoOriginalId: assignment.id,
        usuarioOriginalId: access.user.id,
        substitutoVoluntarioId,
        statusOriginal: "INDISPONIVEL",
      });
      if ("error" in replacement) {
        return Response.json({ error: replacement.error }, { status: 409 });
      }
    }
    await audit("DESIGNACAO_V45_RESPONDIDA", {
      escalaId: id,
      status,
      substitutoUsuarioId:
        replacement && !("error" in replacement)
          ? replacement.candidate.usuarioId
          : undefined,
    });
    if (status === "INDISPONIVEL") {
      await cancelTemporaryAccessForDesignation(
        assignment.id,
        "DESIGNACAO_INDISPONIVEL",
      );
      if (replacement && !("error" in replacement)) {
        await notifyUser(db, {
          userId: replacement.candidate.usuarioId,
          title: "Pedido de substituição em escala",
          message: `${access.user.nome} indicou você para “${schedule.titulo}”. Confirme se poderá participar.`,
          entityId: id,
          area: "ESCALAS",
          destination: "/painel?view=ministerios",
          createdBy: String(access.user.id),
        });
      }
    }
    if (status === "CONFIRMADA") {
      const [recipients, checklistState] = await Promise.all([
        db
          .prepare(
            `SELECT DISTINCT usuario_id FROM (
               SELECT criado_por AS usuario_id
               FROM escalas_ministerio
               WHERE id = ? AND comunidade_id = ?
               UNION
               SELECT responsavel_usuario_id AS usuario_id
               FROM escalas_ministerio
               WHERE id = ? AND comunidade_id = ?
               UNION
               SELECT responsavel_usuario_id AS usuario_id
               FROM ministerios_comunidade
               WHERE id = ? AND comunidade_id = ?
               UNION
               SELECT usuario_id
               FROM ministerio_voluntarios
               WHERE ministerio_id = ? AND comunidade_id = ?
                 AND papel = 'LIDER' AND ativo = 1
             ) WHERE usuario_id IS NOT NULL AND usuario_id != ?`,
          )
          .bind(
            id,
            access.context.comunidadeId,
            id,
            access.context.comunidadeId,
            schedule.ministerio_id,
            access.context.comunidadeId,
            schedule.ministerio_id,
            access.context.comunidadeId,
            access.user.id,
          )
          .all<{ usuario_id: number }>(),
        db
          .prepare(
            `SELECT COUNT(*) AS total
             FROM ministerio_checklist_itens
             WHERE escala_id = ? AND comunidade_id = ? AND status = 'PENDENTE'`,
          )
          .bind(id, access.context.comunidadeId)
          .first<{ total: number }>(),
      ]);
      const pendingChecklist = Number(checklistState?.total || 0);
      const checklistMessage = pendingChecklist
        ? ` A escala possui ${pendingChecklist} ${pendingChecklist === 1 ? "item pendente" : "itens pendentes"} no checklist.`
        : " O checklist não possui pendências.";
      await Promise.all(
        recipients.results.map((recipient) =>
          notifyUser(db, {
            userId: Number(recipient.usuario_id),
            title: "Participação confirmada na escala",
            message: `${access.user.nome} confirmou presença em “${schedule.titulo}”.${checklistMessage}`,
            entityId: id,
            area: "ESCALAS",
            destination: `/painel?view=ministerios&ministry=${schedule.ministerio_id}`,
            createdBy: String(access.user.id),
          }),
        ),
      );
    } else if (status === "INDISPONIVEL") {
      const managers = await db
        .prepare(
          `SELECT DISTINCT usuario_id FROM (
             SELECT responsavel_usuario_id AS usuario_id
             FROM escalas_ministerio
             WHERE id = ? AND comunidade_id = ?
             UNION
             SELECT responsavel_usuario_id AS usuario_id
             FROM ministerios_comunidade
             WHERE id = ? AND comunidade_id = ?
             UNION
             SELECT usuario_id
             FROM ministerio_voluntarios
             WHERE ministerio_id = ? AND comunidade_id = ?
               AND papel = 'LIDER' AND ativo = 1
           ) WHERE usuario_id IS NOT NULL AND usuario_id != ?`,
        )
        .bind(
          id,
          access.context.comunidadeId,
          schedule.ministerio_id,
          access.context.comunidadeId,
          schedule.ministerio_id,
          access.context.comunidadeId,
          access.user.id,
        )
        .all<{ usuario_id: number }>();
      await Promise.all(
        managers.results.map((manager) =>
          notifyUser(db, {
            userId: Number(manager.usuario_id),
            title: "Substituição necessária na escala",
            message: `${access.user.nome} informou que não poderá participar e indicou ${replacement && !("error" in replacement) ? replacement.candidate.nome : "um substituto"}.`,
            entityId: id,
            area: "ESCALAS",
            destination: `/painel?view=ministerios&ministry=${schedule.ministerio_id}`,
            createdBy: String(access.user.id),
          }),
        ),
      );
    }
    return Response.json({
      ok: true,
      status,
      replacement:
        replacement && !("error" in replacement) ? replacement : undefined,
    });
  }

  // A etapa do Fio tem sua própria regra logo abaixo: além da liderança,
  // quem está escalado pode confirmar o trabalho que executou. Não deixe a
  // guarda das ações administrativas rejeitar esse caso antes de ela rodar.
  if (
    action !== "FIO_ETAPA" &&
    !(await canManageSchedule(
      db,
      access.context,
      access.user.id,
      id,
    ))
  ) {
    return Response.json(
      { error: "Você não administra esta escala." },
      { status: 403 },
    );
  }

  if (action === "PUBLICAR") {
    if (schedule.status !== "RASCUNHO") {
      return Response.json(
        { error: "Somente escalas em rascunho podem ser publicadas por esta ação." },
        { status: 409 },
      );
    }
    if (!schedule.responsavel_usuario_id) {
      return Response.json(
        { error: "Defina um responsável antes de publicar a escala." },
        { status: 400 },
      );
    }
    const responsible = await db
      .prepare(
        `SELECT id FROM ministerio_voluntarios
         WHERE comunidade_id = ? AND ministerio_id = ?
           AND usuario_id = ? AND ativo = 1`,
      )
      .bind(
        access.context.comunidadeId,
        schedule.ministerio_id,
        schedule.responsavel_usuario_id,
      )
      .first<{ id: number }>();
    if (!responsible) {
      return Response.json(
        { error: "O responsável precisa continuar ativo neste ministério." },
        { status: 409 },
      );
    }
    const recipients = await db
      .prepare(
        `SELECT DISTINCT usuario_id FROM escala_designacoes
         WHERE escala_id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(id, access.context.comunidadeId)
      .all<{ usuario_id: number }>();
    if (!recipients.results.length) {
      return Response.json(
        { error: "Adicione pelo menos um integrante antes de publicar a escala." },
        { status: 400 },
      );
    }
    const updated = await db
      .prepare(
        `UPDATE escalas_ministerio
         SET status = 'PUBLICADA', publicar_em = NULL, atualizado_por = ?,
           atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ? AND status = 'RASCUNHO'`,
      )
      .bind(access.user.id, id, access.context.comunidadeId)
      .run();
    if (!Number(updated.meta.changes)) {
      return Response.json(
        { error: "A escala foi alterada enquanto você publicava. Atualize a página." },
        { status: 409 },
      );
    }
    const notificationResults = await Promise.allSettled(
      recipients.results.map((recipient) =>
        notifyUser(db, {
          userId: Number(recipient.usuario_id),
          title: "Nova escala ministerial",
          message: `Você foi escalado para “${schedule.titulo}”.`,
          entityId: id,
          area: "ESCALAS",
          destination: "/painel?view=ministerios",
          createdBy: String(access.user.id),
        }),
      ),
    );
    if (notificationResults.some((item) => item.status === "rejected")) {
      console.error(`Escala ${id} publicada, mas uma ou mais notificações falharam.`);
    }
    await audit("ESCALA_V213_PUBLICADA", {
      escalaId: id,
      ministerioId: schedule.ministerio_id,
      destinatarios: recipients.results.length,
    }).catch((auditError) => console.error(`Escala ${id} publicada sem registro de auditoria:`, auditError));
    return Response.json({ ok: true, status: "PUBLICADA" });
  }

  if (action === "DEFINIR_STATUS_DESIGNACAO") {
    const assignmentId = Number(payload.designacaoId);
    const status = String(payload.status || "").trim().toUpperCase();
    if (
      !Number.isInteger(assignmentId) ||
      !["PENDENTE", "CONFIRMADA", "INDISPONIVEL", "AUSENTE"].includes(status)
    ) {
      return Response.json(
        { error: "Designação ou situação inválida." },
        { status: 400 },
      );
    }
    const assignment = await db
      .prepare(
        `SELECT id, usuario_id FROM escala_designacoes
         WHERE id = ? AND escala_id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(assignmentId, id, access.context.comunidadeId)
      .first<{ id: number; usuario_id: number }>();
    if (!assignment) {
      return Response.json(
        { error: "Designação não encontrada nesta escala." },
        { status: 404 },
      );
    }
    await db
      .prepare(
        `UPDATE escala_designacoes
         SET status = ?, resposta_em = CURRENT_TIMESTAMP,
           atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND escala_id = ? AND comunidade_id = ?`,
      )
      .bind(status, assignmentId, id, access.context.comunidadeId)
      .run();
    await notifyUser(db, {
      userId: assignment.usuario_id,
      title: "Situação da escala atualizada",
      message: `Sua participação foi definida como ${status.toLowerCase()}.`,
      entityId: id,
      area: "ESCALAS",
      destination: "/painel?view=ministerios",
      createdBy: String(access.user.id),
    });
    await audit("DESIGNACAO_V474_STATUS_DEFINIDO", {
      escalaId: id,
      usuarioId: assignment.usuario_id,
      status,
    });
    if (["INDISPONIVEL", "AUSENTE"].includes(status)) {
      await cancelTemporaryAccessForDesignation(
        assignmentId,
        "DESIGNACAO_INDISPONIVEL",
      );
    }
    return Response.json({ ok: true, status });
  }

  if (action === "GERAR_LINK_COMPARTILHAVEL") {
    if (schedule.status !== "PUBLICADA") {
      return Response.json(
        { error: "Publique a escala antes de gerar o link compartilhável." },
        { status: 409 },
      );
    }
    const now = Date.now();
    const opensAt = payload.abreEm ? Date.parse(String(payload.abreEm)) : now;
    const scheduleEndsAt = Date.parse(schedule.termina_em);
    const defaultClose = Math.max(
      now + 60 * 60 * 1000,
      Number.isFinite(scheduleEndsAt)
        ? scheduleEndsAt + 12 * 60 * 60 * 1000
        : now + 7 * 24 * 60 * 60 * 1000,
    );
    const closesAt = payload.fechaEm ? Date.parse(String(payload.fechaEm)) : defaultClose;
    const maximumWindow = 31 * 24 * 60 * 60 * 1000;
    if (
      !Number.isFinite(opensAt) ||
      !Number.isFinite(closesAt) ||
      closesAt <= opensAt ||
      closesAt - opensAt > maximumWindow
    ) {
      return Response.json(
        { error: "Defina uma abertura anterior ao fechamento, com duração máxima de 31 dias." },
        { status: 400 },
      );
    }
    const token = schedule.share_token || crypto.randomUUID().replaceAll("-", "");
    const shareWindow = {
      abreEm: new Date(opensAt).toISOString(),
      fechaEm: new Date(closesAt).toISOString(),
      modo: "LINK_TEMPORARIO_SOMENTE_LEITURA",
    };
    await db.batch([
      db.prepare(
        `UPDATE escalas_ministerio
         SET share_token = ?, compartilhado_em = CURRENT_TIMESTAMP,
           atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ?`,
      )
        .bind(token, access.user.id, id, access.context.comunidadeId),
      db.prepare(
        `INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(chave) DO UPDATE SET
           valor = excluded.valor,
           atualizado_por = excluded.atualizado_por,
           atualizado_em = CURRENT_TIMESTAMP`,
      ).bind(
        `schedule_share_access:${access.context.comunidadeId}:${id}`,
        JSON.stringify(shareWindow),
        String(access.user.id),
      ),
    ]);
    await audit("ESCALA_V472_LINK_COMPARTILHAVEL_GERADO", {
      escalaId: id,
      abreEm: shareWindow.abreEm,
      fechaEm: shareWindow.fechaEm,
    });
    return Response.json({ ok: true, token, ...shareWindow });
  }
  if (!["RASCUNHO", "PUBLICADA"].includes(schedule.status)) {
    return Response.json(
      {
        error:
          "Escalas encerradas ou com checklist liberado permanecem somente como histórico operacional.",
      },
      { status: 409 },
    );
  }

  if (action === "CANCELAR") {
    await db
      .prepare(
        `UPDATE escalas_ministerio
        SET status = 'CANCELADA', atualizado_por = ?,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(access.user.id, id, access.context.comunidadeId)
      .run();
    await audit("ESCALA_V45_CANCELADA", {
      escalaId: id,
      ministerioId: schedule.ministerio_id,
    });
    await cancelTemporaryAccessForSchedule("ESCALA_CANCELADA");
    return Response.json({ ok: true });
  }

  if (action === "ATUALIZAR") {
    const parsed = parseSchedulePayload(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    if (parsed.ministerioId !== Number(schedule.ministerio_id)) {
      return Response.json(
        { error: "Uma escala não pode ser movida para outro ministério." },
        { status: 400 },
      );
    }
    if (parsed.responsavelUsuarioId) {
      const responsible = await db
        .prepare(
          `SELECT id FROM ministerio_voluntarios
           WHERE usuario_id = ? AND ministerio_id = ?
             AND comunidade_id = ? AND ativo = 1`,
        )
        .bind(
          parsed.responsavelUsuarioId,
          schedule.ministerio_id,
          access.context.comunidadeId,
        )
        .first<{ id: number }>();
      if (!responsible) {
        return Response.json(
          { error: "O responsável precisa integrar o ministério da escala." },
          { status: 400 },
        );
      }
    }
    for (const selectedTeam of parsed.equipes) {
      const team = await db
        .prepare(
          `SELECT id FROM ministerio_equipes
           WHERE id = ? AND ministerio_id = ? AND comunidade_id = ? AND ativo = 1`,
        )
        .bind(
          selectedTeam.equipeId,
          schedule.ministerio_id,
          access.context.comunidadeId,
        )
        .first<{ id: number }>();
      if (!team) {
        return Response.json(
          { error: "Uma das equipes selecionadas não pertence a este ministério." },
          { status: 400 },
        );
      }
    }
    const modelSnapshot = parseObject(schedule.modelo_snapshot);
    const customFields = Array.isArray(modelSnapshot.camposPersonalizados)
      ? (modelSnapshot.camposPersonalizados as MinistryCustomField[])
      : [];
    const parsedAnswers = parseCustomFieldAnswers(
      parsed.camposRespostas,
      customFields,
    );
    if ("error" in parsedAnswers) {
      return Response.json({ error: parsedAnswers.error }, { status: 400 });
    }
    const assignments = await db
      .prepare(
        `SELECT usuario_id, voluntario_id, equipe_id
        FROM escala_designacoes
        WHERE escala_id = ? AND comunidade_id = ?
          AND ativo = 1 AND status != 'INDISPONIVEL'`,
      )
      .bind(id, access.context.comunidadeId)
      .all<{ usuario_id: number; voluntario_id: number; equipe_id: number | null }>();
    for (const assignment of assignments.results) {
      if (assignment.equipe_id && !parsed.equipes.some((team) => team.equipeId === Number(assignment.equipe_id))) {
        return Response.json(
          { error: "Remova ou mova as pessoas da equipe antes de retirar esta equipe da escala." },
          { status: 409 },
        );
      }
      if (assignment.equipe_id) {
        const teamMember = await db
          .prepare(
            `SELECT id FROM ministerio_equipe_membros
             WHERE equipe_id = ? AND ministerio_id = ? AND comunidade_id = ?
               AND voluntario_id = ?`,
          )
          .bind(
            assignment.equipe_id,
            schedule.ministerio_id,
            access.context.comunidadeId,
            assignment.voluntario_id,
          )
          .first<{ id: number }>();
        if (!teamMember) {
          return Response.json(
            { error: "Uma pessoa já designada não pertence à equipe registrada para ela." },
            { status: 409 },
          );
        }
      }
      if (
        await hasScheduleConflict(db, {
          comunidadeId: access.context.comunidadeId,
          usuarioId: Number(assignment.usuario_id),
          iniciaEm: parsed.iniciaEm,
          terminaEm: parsed.terminaEm,
          excludeScheduleId: id,
        })
      ) {
        return Response.json(
          {
            error:
              "O novo horário conflita com outra escala de uma pessoa designada.",
          },
          { status: 409 },
        );
      }
    }
    await db.batch([
      db.prepare(
        `UPDATE escalas_ministerio
        SET titulo = ?, inicia_em = ?, termina_em = ?, local = ?,
          status = ?, observacoes = ?, repertorio = ?, links_recursos = ?,
          responsavel_usuario_id = ?, equipe_id = ?, campos_respostas = ?, atualizado_por = ?,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND comunidade_id = ?`,
      ).bind(
        parsed.titulo,
        parsed.iniciaEm,
        parsed.terminaEm,
        parsed.local,
        parsed.status,
        parsed.observacoes,
        JSON.stringify(parsed.repertorio),
        JSON.stringify(parsed.links),
        parsed.responsavelUsuarioId,
        parsed.equipeId,
        JSON.stringify(parsedAnswers.value),
        access.user.id,
        id,
        access.context.comunidadeId,
      ),
      db.prepare(
        `DELETE FROM escala_equipes
         WHERE escala_id = ? AND comunidade_id = ?`,
      ).bind(id, access.context.comunidadeId),
      ...parsed.equipes.map((team) =>
        db.prepare(
          `INSERT INTO escala_equipes
           (comunidade_id, escala_id, equipe_id, funcao, ponto_encontro, horario_encontro)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(
          access.context.comunidadeId,
          id,
          team.equipeId,
          team.funcao,
          team.pontoEncontro,
          team.horarioEncontro,
        ),
      ),
    ]);
    await audit("ESCALA_V45_ATUALIZADA", {
      escalaId: id,
      status: parsed.status,
    });
    if (parsed.status === "PUBLICADA") {
      for (const assignment of assignments.results) {
        await notifyUser(db, {
          userId: Number(assignment.usuario_id),
          title: "Escala ministerial atualizada",
          message: `A escala “${parsed.titulo}” recebeu atualizações.`,
          entityId: id,
          area: "ESCALAS",
          destination: "/painel?view=ministerios",
          createdBy: String(access.user.id),
        });
      }
    }
    return Response.json({ ok: true });
  }

  if (action === "ADICIONAR_DESIGNACAO") {
    const parsed = parseAssignmentPayload(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const volunteer = await db
      .prepare(
        `SELECT id, usuario_id
        FROM ministerio_voluntarios
        WHERE id = ? AND comunidade_id = ? AND ministerio_id = ? AND ativo = 1`,
      )
      .bind(
        parsed.voluntarioId,
        access.context.comunidadeId,
        schedule.ministerio_id,
      )
      .first<{ id: number; usuario_id: number }>();
    if (!volunteer) {
      return Response.json(
        { error: "Voluntário não pertence a este ministério." },
        { status: 404 },
      );
    }
    const scheduleTeams = await db
      .prepare(
        `SELECT equipe_id FROM escala_equipes
         WHERE escala_id = ? AND comunidade_id = ?`,
      )
      .bind(id, access.context.comunidadeId)
      .all<{ equipe_id: number }>();
    const assignmentTeamId = parsed.equipeId || (
      scheduleTeams.results.length === 1
        ? Number(scheduleTeams.results[0].equipe_id)
        : null
    );
    if (scheduleTeams.results.length > 0 && !assignmentTeamId) {
      return Response.json(
        { error: "Escolha a equipe de origem desta pessoa." },
        { status: 400 },
      );
    }
    if (assignmentTeamId && !scheduleTeams.results.some((team) => Number(team.equipe_id) === assignmentTeamId)) {
      return Response.json(
        { error: "A equipe escolhida não participa desta escala." },
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
          schedule.ministerio_id,
          access.context.comunidadeId,
          volunteer.id,
        )
        .first<{ id: number }>();
      if (!teamMember) {
        return Response.json(
          { error: "A pessoa não pertence à equipe escolhida para ela." },
          { status: 409 },
        );
      }
    }
    if (
      await hasScheduleConflict(db, {
        comunidadeId: access.context.comunidadeId,
        usuarioId: Number(volunteer.usuario_id),
        iniciaEm: schedule.inicia_em,
        terminaEm: schedule.termina_em,
        excludeScheduleId: id,
      })
    ) {
      return Response.json(
        { error: "A pessoa já está designada em outra escala nesse horário." },
        { status: 409 },
      );
    }
    await db
      .prepare(
        `INSERT INTO escala_designacoes
        (comunidade_id, escala_id, voluntario_id, usuario_id,
         equipe_id, funcao, status, ativo)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', 1)
        ON CONFLICT(escala_id, voluntario_id) DO UPDATE SET
          usuario_id = excluded.usuario_id,
          equipe_id = excluded.equipe_id,
          funcao = excluded.funcao,
          status = 'PENDENTE',
          ativo = 1,
          resposta_em = NULL,
          atualizado_em = CURRENT_TIMESTAMP`,
      )
      .bind(
        access.context.comunidadeId,
        id,
        volunteer.id,
        volunteer.usuario_id,
        assignmentTeamId,
        parsed.funcao,
      )
      .run();
    await audit("DESIGNACAO_V45_ADICIONADA", {
      escalaId: id,
      usuarioId: volunteer.usuario_id,
    });
    await notifyUser(db, {
      userId: volunteer.usuario_id,
      title: "Nova designação ministerial",
      message: "Você foi adicionado a uma escala e precisa confirmar sua participação.",
      entityId: id,
      area: "ESCALAS",
      destination: "/painel?view=ministerios",
      createdBy: String(access.user.id),
    });
    return Response.json({ ok: true });
  }

  if (action === "REMOVER_DESIGNACAO") {
    const assignmentId = Number(payload.designacaoId);
    const assignment = await db
      .prepare(
        `SELECT id, usuario_id
        FROM escala_designacoes
        WHERE id = ? AND escala_id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(assignmentId, id, access.context.comunidadeId)
      .first<{ id: number; usuario_id: number }>();
    if (!assignment) {
      return Response.json(
        { error: "Designação não encontrada." },
        { status: 404 },
      );
    }
    await db
      .prepare(
        `UPDATE escala_designacoes
        SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND escala_id = ? AND comunidade_id = ?`,
      )
      .bind(assignmentId, id, access.context.comunidadeId)
      .run();
    await audit("DESIGNACAO_V45_REMOVIDA", {
      escalaId: id,
      usuarioId: assignment.usuario_id,
    });
    await cancelTemporaryAccessForDesignation(
      assignmentId,
      "DESIGNACAO_REMOVIDA",
    );
    return Response.json({ ok: true });
  }

  // ── Fio do Ministério ───────────────────────────────────────────────────
  // Marcar uma etapa é trabalho de quem está na escala, não só de quem a
  // administra: o som quem testa é quem opera o som. Por isso a permissão
  // aqui aceita tanto quem gerencia a escala quanto quem está escalado nela.
  if (action === "FIO_ETAPA") {
    const stepId = String(payload.etapaId || "").trim().slice(0, 60);
    const done = payload.feito === true || payload.feito === "true";
    if (!stepId) {
      return Response.json({ error: "Etapa do fio inválida." }, { status: 400 });
    }
    const manages = await canManageSchedule(
      db,
      access.context,
      access.user.id,
      id,
    );
    let allowed = manages;
    if (!allowed) {
      const assignment = await db
        .prepare(
          `SELECT id FROM escala_designacoes
           WHERE escala_id = ? AND comunidade_id = ? AND usuario_id = ? AND ativo = 1`,
        )
        .bind(id, access.context.comunidadeId, access.user.id)
        .first<{ id: number }>();
      allowed = Boolean(assignment);
    }
    if (!allowed) {
      return Response.json(
        { error: "Somente a liderança ou quem está escalado pode mexer no fio." },
        { status: 403 },
      );
    }
    const steps = parseFioSteps(schedule.fio_etapas);
    if ("error" in steps) {
      return Response.json({ error: steps.error }, { status: 400 });
    }
    const target = steps.value.find((step) => step.id === stepId);
    if (!target) {
      return Response.json(
        { error: "Esta etapa não existe nesta escala." },
        { status: 404 },
      );
    }
    target.feito = done;
    target.feitoEm = done ? new Date().toISOString() : null;
    target.feitoPor = done ? access.user.id : null;
    await db
      .prepare(
        `UPDATE escalas_ministerio
         SET fio_etapas = ?, atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(
        JSON.stringify(steps.value),
        access.user.id,
        id,
        access.context.comunidadeId,
      )
      .run();
    await audit("FIO_MINISTERIO_ETAPA_ATUALIZADA", {
      escalaId: id,
      etapaId: stepId,
      feito: done,
    });
    return Response.json({ ok: true, fioEtapas: steps.value });
  }

  // Redefinir as etapas é da liderança, e preserva o que já foi marcado nas
  // etapas que permanecem — editar o fio no meio da semana não apaga progresso.
  if (action === "FIO_ETAPAS_DEFINIR") {
    if (!(await canManageSchedule(db, access.context, access.user.id, id))) {
      return Response.json(
        { error: "Somente a liderança do ministério pode redefinir o fio." },
        { status: 403 },
      );
    }
    const incoming = parseFioSteps(payload.fioEtapas);
    if ("error" in incoming) {
      return Response.json({ error: incoming.error }, { status: 400 });
    }
    const current = parseFioSteps(schedule.fio_etapas);
    const previous = new Map(
      ("error" in current ? [] : current.value).map((step) => [step.id, step]),
    );
    const merged = incoming.value.map((step) => {
      const before = previous.get(step.id);
      if (!before || step.feito) return step;
      return { ...step, feito: before.feito, feitoEm: before.feitoEm, feitoPor: before.feitoPor };
    });
    await db
      .prepare(
        `UPDATE escalas_ministerio
         SET fio_etapas = ?, atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(
        JSON.stringify(merged),
        access.user.id,
        id,
        access.context.comunidadeId,
      )
      .run();
    await audit("FIO_MINISTERIO_ETAPAS_DEFINIDAS", {
      escalaId: id,
      etapas: merged.length,
    });
    return Response.json({ ok: true, fioEtapas: merged });
  }

  return Response.json({ error: "Ação inválida." }, { status: 400 });

  async function audit(
    event: string,
    metadata: Record<string, unknown>,
  ) {
    return recordTenantAudit(
      db,
      access.context!,
      access.user!.id,
      event,
      "SUCESSO",
      metadata,
    );
  }

  async function cancelTemporaryAccessForSchedule(reason: string) {
    const rows = await db
      .prepare(
        `SELECT id FROM acessos_temporarios
         WHERE comunidade_id = ? AND escala_id = ?
           AND status IN ('PENDENTE','AGUARDANDO_HORARIO','ATIVO')`,
      )
      .bind(access.context!.comunidadeId, id)
      .all<{ id: number }>();
    if (!rows.results.length) return;
    await db
      .prepare(
        `UPDATE acessos_temporarios
         SET status = 'CANCELADO', cancelado_por = ?,
           cancelado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
         WHERE comunidade_id = ? AND escala_id = ?
           AND status IN ('PENDENTE','AGUARDANDO_HORARIO','ATIVO')`,
      )
      .bind(access.user!.id, access.context!.comunidadeId, id)
      .run();
    for (const row of rows.results) {
      const grant = await getTemporaryAccessById(db, Number(row.id), {
        sync: false,
      });
      if (grant) {
        await recordTemporaryAccessAudit(
          db,
          grant,
          "ACESSO_TEMPORARIO_CANCELADO",
          "SUCESSO",
          access.user!.id,
          { motivo: reason },
        );
      }
    }
  }

  async function cancelTemporaryAccessForDesignation(
    designationId: number,
    reason: string,
  ) {
    const rows = await db
      .prepare(
        `SELECT id FROM acessos_temporarios
         WHERE comunidade_id = ? AND escala_id = ? AND designacao_id = ?
           AND status IN ('PENDENTE','AGUARDANDO_HORARIO','ATIVO')`,
      )
      .bind(access.context!.comunidadeId, id, designationId)
      .all<{ id: number }>();
    if (!rows.results.length) return;
    await db
      .prepare(
        `UPDATE acessos_temporarios
         SET status = 'CANCELADO', cancelado_por = ?,
           cancelado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
         WHERE comunidade_id = ? AND escala_id = ? AND designacao_id = ?
           AND status IN ('PENDENTE','AGUARDANDO_HORARIO','ATIVO')`,
      )
      .bind(
        access.user!.id,
        access.context!.comunidadeId,
        id,
        designationId,
      )
      .run();
    for (const row of rows.results) {
      const grant = await getTemporaryAccessById(db, Number(row.id), {
        sync: false,
      });
      if (grant) {
        await recordTemporaryAccessAudit(
          db,
          grant,
          "ACESSO_TEMPORARIO_CANCELADO",
          "SUCESSO",
          access.user!.id,
          { motivo: reason },
        );
      }
    }
  }
}

function parseObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
