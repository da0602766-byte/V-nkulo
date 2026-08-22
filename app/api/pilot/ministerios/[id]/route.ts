import { getD1 } from "../../../../../db";
import {
  canManageMinistry,
  hasGlobalMinistryManagement,
} from "../../../../lib/ministry-access";
import {
  cleanAction,
  parseAvailabilityPayload,
  parseMinistryPayload,
  parseVolunteerPayload,
} from "../../../../lib/ministry-validation";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireTenantPermission("ministries.view");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Ministério inválido." }, { status: 400 });
  }
  const payload = (await request.json()) as Record<string, unknown>;
  const action = cleanAction(payload.acao);
  const db = getD1();
  const ministry = await db
    .prepare(
      `SELECT id, status, categoria FROM ministerios_comunidade
      WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(id, access.context.comunidadeId)
    .first<{ id: number; status: string; categoria: string }>();
  if (!ministry) {
    return Response.json({ error: "Ministério não encontrado." }, { status: 404 });
  }

  if (action === "ATUALIZAR_MINHA_DISPONIBILIDADE") {
    const parsed = parseAvailabilityPayload(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const result = await db
      .prepare(
        `UPDATE ministerio_voluntarios
        SET dias_disponiveis = ?, periodo_preferido = ?,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE ministerio_id = ? AND comunidade_id = ?
          AND usuario_id = ? AND ativo = 1`,
      )
      .bind(
        JSON.stringify(parsed.diasDisponiveis),
        parsed.periodoPreferido,
        id,
        access.context.comunidadeId,
        access.user.id,
      )
      .run();
    if (!result.meta.changes) {
      return Response.json(
        { error: "Você não participa deste ministério." },
        { status: 404 },
      );
    }
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "DISPONIBILIDADE_V45_ATUALIZADA",
      "SUCESSO",
      { ministerioId: id },
    );
    return Response.json({ ok: true });
  }

  const canManage = await canManageMinistry(
    db,
    access.context,
    access.user.id,
    id,
  );
  if (!canManage) {
    return Response.json(
      { error: "Você não administra este ministério." },
      { status: 403 },
    );
  }
  const globalManager = hasGlobalMinistryManagement(access.context);

  if (action === "ATUALIZAR_LIMITE_ESCALAS") {
    const volunteerId = Number(payload.voluntarioId);
    const limit = Number(payload.limiteEscalas);
    if (
      !Number.isInteger(volunteerId) ||
      volunteerId <= 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 52
    ) {
      return Response.json(
        { error: "Informe um limite entre 1 e 52 escalas futuras." },
        { status: 400 },
      );
    }
    const result = await db
      .prepare(
        `UPDATE ministerio_voluntarios
         SET limite_escalas = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND ministerio_id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(limit, volunteerId, id, access.context.comunidadeId)
      .run();
    if (!result.meta.changes) {
      return Response.json({ error: "Integrante não encontrado." }, { status: 404 });
    }
    await audit("LIMITE_DE_ESCALAS_ATUALIZADO", {
      ministerioId: id,
      voluntarioId: volunteerId,
      limiteEscalas: limit,
    });
    return Response.json({ ok: true });
  }

  if (action === "ARQUIVAR_DIACONIA") {
    if (ministry.categoria !== "DIACONIA") {
      return Response.json(
        { error: "Somente uma Diaconia pode usar esta ação." },
        { status: 400 },
      );
    }
    if (!(globalManager || access.user.system_owner)) {
      return Response.json(
        { error: "Você não pode arquivar esta Diaconia." },
        { status: 403 },
      );
    }
    await db.batch([
      db
        .prepare(
          `UPDATE ministerios_comunidade
           SET status = 'ARQUIVADO', atualizado_por = ?,
             atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(access.user.id, id, access.context.comunidadeId),
      db
        .prepare(
          `UPDATE escalas_ministerio
           SET status = 'ARQUIVADA', share_token = NULL, atualizado_por = ?,
             atualizado_em = CURRENT_TIMESTAMP
           WHERE ministerio_id = ? AND comunidade_id = ?`,
        )
        .bind(access.user.id, id, access.context.comunidadeId),
      db
        .prepare(
          `UPDATE ministerio_voluntarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
           WHERE ministerio_id = ? AND comunidade_id = ?`,
        )
        .bind(id, access.context.comunidadeId),
      db
        .prepare(
          `UPDATE escala_designacoes SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
           WHERE comunidade_id = ? AND escala_id IN (
             SELECT id FROM escalas_ministerio
             WHERE ministerio_id = ? AND comunidade_id = ?
           )`,
        )
        .bind(
          access.context.comunidadeId,
          id,
          access.context.comunidadeId,
        ),
    ]);
    await audit("DIACONIA_V472_ARQUIVADA", { ministerioId: id });
    return Response.json({ ok: true });
  }

  if (action === "ATUALIZAR") {
    const parsed = parseMinistryPayload(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    if (!globalManager && parsed.status !== ministry.status) {
      return Response.json(
        { error: "Apenas a gestão global pode alterar o status do ministério." },
        { status: 403 },
      );
    }
    if (parsed.responsavelUsuarioId) {
      const responsible = await db
        .prepare(
          `SELECT uc.id FROM usuario_comunidades uc
           JOIN usuarios u ON u.id = uc.usuario_id
           WHERE uc.usuario_id = ? AND uc.comunidade_id = ?
             AND uc.status = 'ATIVO' AND u.ativo = 1`,
        )
        .bind(parsed.responsavelUsuarioId, access.context.comunidadeId)
        .first<{ id: number }>();
      if (!responsible) {
        return Response.json(
          { error: "O responsável deve pertencer à comunidade ativa." },
          { status: 400 },
        );
      }
    }
    try {
      await db
        .prepare(
          `UPDATE ministerios_comunidade
          SET nome = ?, descricao = ?, categoria = ?, status = ?,
            youtube_url = ?, spotify_url = ?, banner_url = ?,
            responsavel_usuario_id = ?,
            atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
          WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(
          parsed.nome,
          parsed.descricao,
          parsed.categoria,
          parsed.status,
          parsed.youtubeUrl,
          parsed.spotifyUrl,
          parsed.bannerUrl,
          parsed.responsavelUsuarioId,
          access.user.id,
          id,
          access.context.comunidadeId,
        )
        .run();
      if (parsed.responsavelUsuarioId) {
        await db
          .prepare(
            `INSERT INTO ministerio_voluntarios
             (comunidade_id, ministerio_id, usuario_id, funcao, papel,
              dias_disponiveis, periodo_preferido, ativo)
             VALUES (?, ?, ?, 'Líder do ministério', 'LIDER', '[]', 'FLEXIVEL', 1)
             ON CONFLICT(ministerio_id, usuario_id)
             DO UPDATE SET papel = 'LIDER', ativo = 1,
               atualizado_em = CURRENT_TIMESTAMP`,
          )
          .bind(
            access.context.comunidadeId,
            id,
            parsed.responsavelUsuarioId,
          )
          .run();
      }
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        return Response.json(
          { error: "Já existe um ministério com esse nome nesta comunidade." },
          { status: 409 },
        );
      }
      throw error;
    }
    await audit("MINISTERIO_V45_ATUALIZADO", { ministerioId: id });
    return Response.json({ ok: true });
  }

  if (action === "DESATIVAR") {
    if (!globalManager) {
      return Response.json(
        { error: "Apenas a gestão pastoral ou administrativa pode desativar." },
        { status: 403 },
      );
    }
    const activeSchedule = await db
      .prepare(
        `SELECT id FROM escalas_ministerio
        WHERE ministerio_id = ? AND comunidade_id = ?
          AND status != 'CANCELADA'
        LIMIT 1`,
      )
      .bind(id, access.context.comunidadeId)
      .first<{ id: number }>();
    if (activeSchedule) {
      return Response.json(
        { error: "Cancele as escalas ativas antes de desativar o ministério." },
        { status: 409 },
      );
    }
    await db
      .prepare(
        `UPDATE ministerios_comunidade
        SET status = 'INATIVO', atualizado_por = ?,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(access.user.id, id, access.context.comunidadeId)
      .run();
    await audit("MINISTERIO_V45_DESATIVADO", { ministerioId: id });
    return Response.json({ ok: true });
  }

  if (action === "ADICIONAR_VOLUNTARIO") {
    const parsed = parseVolunteerPayload(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const membership = await db
      .prepare(
        `SELECT uc.id
        FROM usuario_comunidades uc
        JOIN usuarios u ON u.id = uc.usuario_id
        WHERE uc.usuario_id = ? AND uc.comunidade_id = ?
          AND uc.status = 'ATIVO' AND u.ativo = 1`,
      )
      .bind(parsed.usuarioId, access.context.comunidadeId)
      .first<{ id: number }>();
    if (!membership) {
      return Response.json(
        { error: "Pessoa não pertence à comunidade ativa." },
        { status: 404 },
      );
    }
    await db
      .prepare(
        `INSERT INTO ministerio_voluntarios
        (comunidade_id, ministerio_id, usuario_id, funcao, papel,
         dias_disponiveis, periodo_preferido, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(ministerio_id, usuario_id) DO UPDATE SET
          funcao = excluded.funcao,
          papel = excluded.papel,
          dias_disponiveis = excluded.dias_disponiveis,
          periodo_preferido = excluded.periodo_preferido,
          ativo = 1,
          atualizado_em = CURRENT_TIMESTAMP`,
      )
      .bind(
        access.context.comunidadeId,
        id,
        parsed.usuarioId,
        parsed.funcao,
        parsed.papel,
        JSON.stringify(parsed.diasDisponiveis),
        parsed.periodoPreferido,
      )
      .run();
    await audit("VOLUNTARIO_V45_ADICIONADO", {
      ministerioId: id,
      usuarioId: parsed.usuarioId,
      papel: parsed.papel,
    });
    return Response.json({ ok: true });
  }

  if (action === "REMOVER_VOLUNTARIO") {
    const volunteerId = Number(payload.voluntarioId);
    const volunteer = await db
      .prepare(
        `SELECT id, usuario_id, papel
        FROM ministerio_voluntarios
        WHERE id = ? AND ministerio_id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(volunteerId, id, access.context.comunidadeId)
      .first<{ id: number; usuario_id: number; papel: string }>();
    if (!volunteer) {
      return Response.json({ error: "Voluntário não encontrado." }, { status: 404 });
    }
    if (volunteer.papel === "LIDER" && !globalManager) {
      return Response.json(
        { error: "Líderes só podem ser removidos pela gestão global." },
        { status: 403 },
      );
    }
    const activeAssignment = await db
      .prepare(
        `SELECT d.id
        FROM escala_designacoes d
        JOIN escalas_ministerio s
          ON s.id = d.escala_id
         AND s.comunidade_id = d.comunidade_id
        WHERE d.voluntario_id = ? AND d.comunidade_id = ?
          AND d.ativo = 1 AND s.status != 'CANCELADA'
        LIMIT 1`,
      )
      .bind(volunteerId, access.context.comunidadeId)
      .first<{ id: number }>();
    if (activeAssignment) {
      return Response.json(
        { error: "Remova as designações ativas antes de retirar esta pessoa." },
        { status: 409 },
      );
    }
    await db
      .prepare(
        `DELETE FROM ministerio_voluntarios
        WHERE id = ? AND ministerio_id = ? AND comunidade_id = ?`,
      )
      .bind(volunteerId, id, access.context.comunidadeId)
      .run();
    await audit("VOLUNTARIO_V472_EXCLUIDO", {
      ministerioId: id,
      usuarioId: volunteer.usuario_id,
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Ação inválida." }, { status: 400 });

  async function audit(
    event: string,
    metadata: Record<string, string | number | boolean | null>,
  ) {
    return recordTenantAudit(
      db,
      access.context,
      access.user.id,
      event,
      "SUCESSO",
      metadata,
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  const access = await requireTenantPermission("ministries.view");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Ministério inválido." }, { status: 400 });
  }
  const db = getD1();
  const ministry = await db
    .prepare(
      `SELECT id, nome FROM ministerios_comunidade
       WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(id, access.context.comunidadeId)
    .first<{ id: number; nome: string }>();
  if (!ministry) {
    return Response.json({ error: "Ministério não encontrado." }, { status: 404 });
  }
  if (
    !access.user.system_owner &&
    !(await canManageMinistry(db, access.context, access.user.id, id))
  ) {
    return Response.json(
      { error: "Você não pode excluir este ministério." },
      { status: 403 },
    );
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "MINISTERIO_V472_EXCLUIDO",
    "SUCESSO",
    { ministerioId: id, nome: ministry.nome },
  );
  await db
    .prepare(
      `DELETE FROM ministerios_comunidade
       WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(id, access.context.comunidadeId)
    .run();
  return Response.json({ ok: true });
}
