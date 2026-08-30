import { getD1 } from "../../../../db";
import { OFFICIAL_PERMISSION_CATALOG } from "../../../lib/tenant-policy.mjs";
import { parseOfficialUpdate } from "../../../lib/people-validation";
import { isSystemOwnerAccount } from "../../../lib/local-auth";
import { notifyUser } from "../../../lib/pilot-notifications";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

export async function GET() {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const canDeleteGlobal = access.user.system_owner === true;
  const canRemoveCommunity = canDeleteGlobal || access.context.papel === "PASTOR";
  const canViewPeople =
    access.context.permissions.includes("people.view") || canDeleteGlobal;
  const db = getD1();
  const me = await db
    .prepare(
      `SELECT u.id, u.nome, u.email, u.telefone, u.data_nascimento,
        u.criado_em AS owner_criado_em,
        u.endereco,
        COALESCE((
          SELECT group_concat(ministerio_nome, ', ')
          FROM (
            SELECT DISTINCT m.nome AS ministerio_nome
            FROM ministerio_voluntarios mv
            JOIN ministerios_comunidade m
              ON m.id = mv.ministerio_id
             AND m.comunidade_id = mv.comunidade_id
            WHERE mv.comunidade_id = ?
              AND mv.usuario_id = u.id
              AND mv.ativo = 1
              AND m.status = 'ATIVO'
            ORDER BY m.nome
          )
        ), u.ministerio, '') AS ministerio,
        u.foto_perfil,
        COALESCE((
          SELECT group_concat(c.nome, ', ')
          FROM celulas c, json_each(c.membros) membro
          WHERE c.comunidade_id = ?
            AND c.ativo = 1
            AND c.escopo_confirmado = 1
            AND json_extract(membro.value, '$.kind') = 'COMMUNITY'
            AND CAST(json_extract(membro.value, '$.userId') AS INTEGER) = u.id
        ), '') AS celula_vinculada,
        COALESCE(uc.id, ?) AS membership_id,
        COALESCE(uc.papel, ?) AS papel,
        CASE WHEN oc.id IS NULL THEN 0 ELSE 1 END AS oficial,
        COALESCE(oc.titulo, '') AS titulo_oficial,
        COALESCE(uc.status, 'ATIVO') AS status
       FROM usuarios u
       LEFT JOIN usuario_comunidades uc
         ON uc.usuario_id = u.id
        AND uc.comunidade_id = ?
        AND uc.status = 'ATIVO'
       LEFT JOIN oficiais_comunidade oc
         ON oc.usuario_comunidade_id = uc.id
       WHERE u.id = ?
       LIMIT 1`,
    )
    .bind(
      access.context.comunidadeId,
      access.context.comunidadeId,
      access.context.membershipId,
      access.context.papel,
      access.context.comunidadeId,
      access.user.id,
    )
    .first<Record<string, unknown>>();

  const verifiedMe = withOwnerVerification(me);

  if (!canViewPeople) {
    return Response.json(
      {
        me: verifiedMe,
        people: [],
        canViewPeople: false,
        canManage: false,
        canDeleteGlobal,
        canRemoveCommunity,
        canEditSelfHierarchy: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await db
    .prepare(
      `SELECT uc.id AS membership_id, u.id AS usuario_id, u.nome, u.email,
        u.criado_em AS owner_criado_em,
        u.telefone, u.foto_perfil, uc.papel,
        CASE WHEN oc.id IS NULL THEN 0 ELSE 1 END AS oficial,
        COALESCE(oc.titulo, '') AS titulo_oficial,
        COALESCE(oc.permissoes, '') AS permissoes,
        uc.status, uc.criado_em,
        COALESCE(oc.atualizado_em, uc.criado_em) AS atualizado_em
       FROM usuario_comunidades uc
       JOIN usuarios u ON u.id = uc.usuario_id
       LEFT JOIN oficiais_comunidade oc
         ON oc.usuario_comunidade_id = uc.id
       WHERE uc.comunidade_id = ? AND u.ativo = 1
       ORDER BY oficial DESC, u.nome ASC, uc.id ASC`,
    )
    .bind(access.context.comunidadeId)
    .all<Record<string, unknown>>();
  return Response.json(
    {
      me: verifiedMe,
      people: result.results.map(withOwnerVerification),
      canViewPeople: true,
      canManage: access.context.permissions.includes("officials.manage"),
      canDeleteGlobal,
      canRemoveCommunity,
      canEditSelfHierarchy:
        access.context.isOwner &&
        access.context.communityAccess === "OWNER",
      permissionCatalog: OFFICIAL_PERMISSION_CATALOG,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function withOwnerVerification(row: Record<string, unknown> | null) {
  if (!row) return row;
  const { owner_criado_em, ...safeRow } = row;
  return {
    ...safeRow,
    owner_verified: isSystemOwnerAccount({
      email: String(row.email || ""),
      criado_em: String(owner_criado_em || ""),
    }),
  };
}

export async function DELETE(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const canDeleteGlobal = access.user.system_owner === true;
  const canRemoveCommunity = canDeleteGlobal || access.context.papel === "PASTOR";
  if (!canRemoveCommunity) {
    return Response.json(
      { error: "Somente o proprietário ou um pastor pode remover pessoas da comunidade." },
      { status: 403 },
    );
  }
  const payload = (await request.json()) as Record<string, unknown>;
  const membershipId = Number(payload.membershipId);
  const action = String(payload.action || "").trim().toUpperCase();
  if (
    !Number.isInteger(membershipId) ||
    !["REMOVE_COMMUNITY", "DEACTIVATE_ACCOUNT", "DELETE_ACCOUNT"].includes(action)
  ) {
    return Response.json({ error: "Solicitação inválida." }, { status: 400 });
  }
  if (!canDeleteGlobal && action !== "REMOVE_COMMUNITY") {
    return Response.json(
      { error: "Pastores podem remover a pessoa apenas da comunidade atual." },
      { status: 403 },
    );
  }
  const db = getD1();
  const target = await db
    .prepare(
      `SELECT uc.id, uc.usuario_id, u.nome, u.email
       FROM usuario_comunidades uc
       JOIN usuarios u ON u.id = uc.usuario_id
       WHERE uc.id = ? AND uc.comunidade_id = ? AND uc.status = 'ATIVO'
       LIMIT 1`,
    )
    .bind(membershipId, access.context.comunidadeId)
    .first<{
      id: number;
      usuario_id: number;
      nome: string;
      email: string;
    }>();
  if (!target) {
    return Response.json(
      { error: "Pessoa não encontrada na comunidade ativa." },
      { status: 404 },
    );
  }
  if (target.usuario_id === access.user.id) {
    return Response.json(
      { error: "A conta proprietária não pode remover a si mesma." },
      { status: 409 },
    );
  }

  if (action === "REMOVE_COMMUNITY") {
    const [releasedSchedules, releasedMinistries] = await Promise.all([
      db
        .prepare(
          `SELECT DISTINCT s.id, s.titulo, COALESCE(s.atualizado_por, s.criado_por) AS responsavel_id
           FROM escala_designacoes d
           JOIN escalas_ministerio s
             ON s.id = d.escala_id AND s.comunidade_id = d.comunidade_id
           WHERE d.usuario_id = ? AND d.comunidade_id = ? AND d.ativo = 1`,
        )
        .bind(target.usuario_id, access.context.comunidadeId)
        .all<{ id: number; titulo: string; responsavel_id: number | null }>(),
      db
        .prepare(
          `SELECT DISTINCT m.id, m.nome, m.responsavel_usuario_id AS responsavel_id
           FROM ministerio_voluntarios mv
           JOIN ministerios_comunidade m
             ON m.id = mv.ministerio_id AND m.comunidade_id = mv.comunidade_id
           WHERE mv.usuario_id = ? AND mv.comunidade_id = ? AND mv.ativo = 1`,
        )
        .bind(target.usuario_id, access.context.comunidadeId)
        .all<{ id: number; nome: string; responsavel_id: number | null }>(),
    ]);
    await db.batch([
      db
        .prepare(
          `UPDATE usuario_comunidades SET status = 'REMOVIDO'
           WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(membershipId, access.context.comunidadeId),
      db
        .prepare(
          `UPDATE ministerio_voluntarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
           WHERE usuario_id = ? AND comunidade_id = ? AND ativo = 1`,
        )
        .bind(target.usuario_id, access.context.comunidadeId),
      db
        .prepare(
          `UPDATE escala_designacoes SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
           WHERE usuario_id = ? AND comunidade_id = ? AND ativo = 1`,
        )
        .bind(target.usuario_id, access.context.comunidadeId),
    ]);
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      canDeleteGlobal ? "PROPRIETARIO_REMOVEU_MEMBRO_DA_COMUNIDADE" : "PASTOR_REMOVEU_MEMBRO_DA_COMUNIDADE",
      "SUCESSO",
      { usuarioId: target.usuario_id, membershipId },
    );
    await Promise.all([
      ...releasedSchedules.results
        .filter((item) => Number(item.responsavel_id || 0) > 0 && Number(item.responsavel_id) !== target.usuario_id)
        .map((item) =>
          notifyUser(db, {
            userId: Number(item.responsavel_id),
            title: "Participante liberado da escala",
            message: `${target.nome} foi removido de “${item.titulo}” pelo VÍNKULO após o encerramento do vínculo com a comunidade.`,
            entityId: Number(item.id),
            area: "ESCALAS",
            destination: "/painel?view=escalas",
            createdBy: "VÍNKULO",
          }),
        ),
      ...releasedMinistries.results
        .filter((item) => Number(item.responsavel_id || 0) > 0 && Number(item.responsavel_id) !== target.usuario_id)
        .map((item) =>
          notifyUser(db, {
            userId: Number(item.responsavel_id),
            title: "Integrante removido do ministério",
            message: `${target.nome} foi retirado de “${item.nome}” pelo VÍNKULO após o encerramento do vínculo com a comunidade.`,
            entityId: Number(item.id),
            area: "USUARIOS",
            destination: "/painel?view=ministerios",
            createdBy: "VÍNKULO",
          }),
        ),
    ]);
    return Response.json({
      ok: true,
      action,
      message: "Pessoa removida da comunidade. Funções e escalas foram liberadas, os responsáveis foram avisados e o histórico foi preservado.",
    });
  }

  if (action === "DEACTIVATE_ACCOUNT") {
    await db.batch([
      db
        .prepare(
          "UPDATE usuarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(target.usuario_id),
      db
        .prepare(
          "UPDATE usuario_comunidades SET status = 'REMOVIDO' WHERE usuario_id = ?",
        )
        .bind(target.usuario_id),
      db
        .prepare(
          "UPDATE ministerio_voluntarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE usuario_id = ?",
        )
        .bind(target.usuario_id),
      db
        .prepare(
          "UPDATE escala_designacoes SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE usuario_id = ?",
        )
        .bind(target.usuario_id),
      db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(target.usuario_id),
    ]);
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "PROPRIETARIO_DESATIVOU_CONTA",
      "SUCESSO",
      { usuarioId: target.usuario_id, membershipId },
    );
    return Response.json({ ok: true, action });
  }

  const protectedRecords = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM comunidades WHERE proprietario_usuario_id = ?) AS comunidades,
        (SELECT COUNT(*) FROM auditoria_piloto WHERE usuario_id = ?) AS auditoria,
        (SELECT COUNT(*) FROM publicacoes_piloto WHERE criado_por = ?) AS publicacoes,
        (SELECT COUNT(*) FROM comentarios_publicacao WHERE usuario_id = ?) AS comentarios,
        (SELECT COUNT(*) FROM escalas_ministerio WHERE criado_por = ? OR atualizado_por = ?) AS escalas,
        (SELECT COUNT(*) FROM ministerios_comunidade WHERE criado_por = ? OR atualizado_por = ?) AS ministerios,
        (SELECT COUNT(*) FROM estacionamento_movimentacoes WHERE criado_por = ? OR atualizado_por = ?) AS estacionamento_movimentacoes,
        (SELECT COUNT(*) FROM estacionamento_ocorrencias WHERE criado_por = ?) AS estacionamento_ocorrencias`,
    )
    .bind(
      target.usuario_id,
      target.usuario_id,
      target.usuario_id,
      target.usuario_id,
      target.usuario_id,
      target.usuario_id,
      target.usuario_id,
      target.usuario_id,
      target.usuario_id,
      target.usuario_id,
      target.usuario_id,
    )
    .first<Record<string, number>>();
  const blockers = buildRemovalBlockers(protectedRecords || {});
  const protectedTotal = Object.values(protectedRecords || {}).reduce((total, value) => total + Number(value || 0), 0);
  if (protectedTotal > 0) {
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "EXCLUSAO_DEFINITIVA_DE_CONTA_BLOQUEADA",
      "NEGADO",
      { usuarioId: target.usuario_id, registrosProtegidos: protectedTotal },
    );
    return Response.json(
      {
        error:
          "Existem vínculos ou históricos que precisam permanecer auditáveis. Abra um dos locais abaixo ou escolha remover da comunidade para o VÍNKULO liberar automaticamente funções e escalas.",
        blockers,
      },
      { status: 409 },
    );
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "PROPRIETARIO_EXCLUIU_CONTA_SEM_HISTORICO",
    "SUCESSO",
    { usuarioId: target.usuario_id, membershipId },
  );
  await db.batch([
    db.prepare("DELETE FROM usuario_comunidades WHERE usuario_id = ?").bind(target.usuario_id),
    db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(target.usuario_id),
    db.prepare("DELETE FROM redefinicoes_senha WHERE usuario_id = ?").bind(target.usuario_id),
    db.prepare("DELETE FROM usuarios WHERE id = ?").bind(target.usuario_id),
  ]);
  return Response.json({ ok: true, action });
}

function buildRemovalBlockers(counts: Record<string, number>) {
  const blockers: Array<{ label: string; detail: string; href: string }> = [];
  const add = (count: number, label: string, href: string) => {
    if (count > 0) blockers.push({ label, detail: `${count} registro${count === 1 ? "" : "s"} relacionado${count === 1 ? "" : "s"}`, href });
  };
  add(Number(counts.comunidades || 0), "Comunidades sob responsabilidade", "/proprietario");
  add(Number(counts.auditoria || 0), "Histórico de auditoria", "/proprietario?view=auditoria");
  add(Number(counts.publicacoes || 0) + Number(counts.comentarios || 0), "Publicações e comentários", "/painel?view=inicio#mural");
  add(Number(counts.escalas || 0), "Escalas", "/painel?view=escalas");
  add(Number(counts.ministerios || 0), "Ministérios", "/painel?view=ministerios");
  add(Number(counts.estacionamento_movimentacoes || 0) + Number(counts.estacionamento_ocorrencias || 0), "Estacionamento", "/painel?view=estacionamento");
  return blockers;
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("officials.manage");
  if ("error" in access) return access.error;
  const parsed = parseOfficialUpdate(await request.json());
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  if (
    parsed.data.membershipId === access.context.membershipId &&
    !(
      access.context.isOwner &&
      access.context.communityAccess === "OWNER"
    )
  ) {
    return Response.json(
      { error: "Você não pode alterar a própria hierarquia." },
      { status: 409 },
    );
  }

  const allowedRoles =
    access.context.papel === "SUPERADMIN"
      ? ["MEMBRO", "LIDER", "PASTOR", "ADMIN_COMUNIDADE"]
      : access.context.papel === "ADMIN_COMUNIDADE"
        ? ["MEMBRO", "LIDER", "PASTOR"]
        : ["MEMBRO", "LIDER"];
  if (!allowedRoles.includes(parsed.data.papel)) {
    return Response.json(
      { error: "Seu perfil não pode conceder essa função." },
      { status: 403 },
    );
  }
  const permissions = parsed.data.permissions.filter((permission) =>
    access.context.permissions.includes(permission),
  );
  if (permissions.length !== parsed.data.permissions.length) {
    return Response.json(
      { error: "Você tentou conceder uma permissão que não possui." },
      { status: 403 },
    );
  }

  const db = getD1();
  const target = await db
    .prepare(
      `SELECT uc.id, uc.usuario_id, uc.papel,
        CASE WHEN oc.id IS NULL THEN 0 ELSE 1 END AS oficial
       FROM usuario_comunidades uc
       JOIN usuarios u ON u.id = uc.usuario_id
       LEFT JOIN oficiais_comunidade oc
         ON oc.usuario_comunidade_id = uc.id
       WHERE uc.id = ? AND uc.comunidade_id = ?
         AND uc.status = 'ATIVO' AND u.ativo = 1
       LIMIT 1`,
    )
    .bind(parsed.data.membershipId, access.context.comunidadeId)
    .first<{
      id: number;
      usuario_id: number;
      papel: string;
      oficial: number;
    }>();
  if (!target) {
    return Response.json(
      { error: "Pessoa não encontrada nesta comunidade." },
      { status: 404 },
    );
  }

  const membershipUpdate = db
    .prepare(
      `UPDATE usuario_comunidades
       SET papel = ?
       WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(
      parsed.data.papel,
      parsed.data.membershipId,
      access.context.comunidadeId,
    );
  const officialUpdate = parsed.data.oficial
    ? db
        .prepare(
          `INSERT INTO oficiais_comunidade (
            usuario_comunidade_id, titulo, permissoes, atualizado_por
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(usuario_comunidade_id) DO UPDATE SET
            titulo = excluded.titulo,
            permissoes = excluded.permissoes,
            atualizado_por = excluded.atualizado_por,
            atualizado_em = CURRENT_TIMESTAMP`,
        )
        .bind(
          parsed.data.membershipId,
          parsed.data.titulo,
          permissions.join(","),
          access.user.id,
        )
    : db
        .prepare(
          `DELETE FROM oficiais_comunidade
           WHERE usuario_comunidade_id = ?`,
        )
        .bind(parsed.data.membershipId);
  await db.batch([membershipUpdate, officialUpdate]);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "OFICIAL_COMUNIDADE_ATUALIZADO",
    "SUCESSO",
    {
      membershipId: target.id,
      usuarioId: target.usuario_id,
      papelAnterior: target.papel,
      papelNovo: parsed.data.papel,
      oficial: parsed.data.oficial,
      totalPermissoes: permissions.length,
    },
  );
  return Response.json({ updated: true });
}
