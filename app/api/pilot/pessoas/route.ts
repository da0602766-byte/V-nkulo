import { deleteUserAccount } from "../../../lib/delete-user-account";
import { getD1 } from "../../../../db";
import { OFFICIAL_PERMISSION_CATALOG } from "../../../lib/tenant-policy.mjs";
import { parseOfficialUpdate } from "../../../lib/people-validation";
import { isSystemOwnerAccount } from "../../../lib/local-auth";
import { notifyUser } from "../../../lib/pilot-notifications";
import { recordPromotionNotice } from "../../../lib/recepcao";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission, type TenantContext } from "../../../lib/tenant";

// Lote pedido a cada carregamento. A lista antes baixava até 2.000 pessoas de
// uma vez e paginava no navegador; agora o corte é por cursor no servidor, e a
// tela pede o próximo lote conforme a pessoa avança.
const PEOPLE_PAGE_SIZE = 30;
const PEOPLE_MAX_PAGE_SIZE = 50;

// O cursor carrega o par (nome, membership_id), que é exatamente a ordenação
// usada na consulta. Guardar a posição em vez de um deslocamento evita pular ou
// repetir alguém quando um cadastro entra ou sai entre dois lotes.
type PeopleCursor = { nome: string; id: number };

function encodePeopleCursor(cursor: PeopleCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodePeopleCursor(value: string | null): PeopleCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PeopleCursor>;
    const id = Number(parsed.id);
    if (typeof parsed.nome !== "string" || !Number.isInteger(id) || id <= 0) {
      return null;
    }
    return { nome: parsed.nome, id };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
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
        nextCursor: null,
        counts: { membros: 0, oficiais: 0, oficiaisSemTitulo: 0 },
        canViewPeople: false,
        canManage: false,
        canDeleteGlobal,
        canRemoveCommunity,
        canEditSelfHierarchy: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // A busca e a separação entre membros e oficiais saíram do navegador para o
  // SQL: filtrar depois de baixar só funcionava porque a lista inteira vinha
  // junto, que é justamente o que a paginação evita.
  const address = new URL(request.url);
  const search = (address.searchParams.get("busca") || "").trim().slice(0, 80);
  const requestedTab = address.searchParams.get("aba");
  const participation = address.searchParams.get("vinculo") || "";
  if (!["", "sem-ministerio", "com-escala", "sem-titulo"].includes(participation)) return Response.json({ error: "Filtro de acompanhamento inválido." }, { status: 400 });
  const officialsOnly = requestedTab === "todos" ? -1 : requestedTab === "oficiais" ? 1 : 0;
  const cursor = decodePeopleCursor(address.searchParams.get("cursor"));
  const requestedSize = Number(address.searchParams.get("limite") || 0);
  const pageSize =
    Number.isInteger(requestedSize) && requestedSize > 0
      ? Math.min(requestedSize, PEOPLE_MAX_PAGE_SIZE)
      : PEOPLE_PAGE_SIZE;
  const searchTerm = `%${search.replaceAll("%", "").replaceAll("_", "")}%`;

  const [rows, totals] = await Promise.all([
    db
      .prepare(
        `WITH page AS MATERIALIZED (
         SELECT uc.id
         FROM usuario_comunidades uc
         JOIN usuarios u ON u.id = uc.usuario_id
         LEFT JOIN oficiais_comunidade oc
           ON oc.usuario_comunidade_id = uc.id
         WHERE uc.comunidade_id = ? AND u.ativo = 1 AND uc.status = 'ATIVO'
           AND (? <> 'sem-ministerio' OR NOT EXISTS (SELECT 1 FROM ministerio_voluntarios mv JOIN ministerios_comunidade m ON m.id=mv.ministerio_id AND m.comunidade_id=mv.comunidade_id WHERE mv.usuario_id=u.id AND mv.comunidade_id=uc.comunidade_id AND mv.ativo=1 AND m.status='ATIVO'))
           AND (? <> 'com-escala' OR EXISTS (SELECT 1 FROM escala_designacoes d JOIN escalas_ministerio s ON s.id=d.escala_id AND s.comunidade_id=d.comunidade_id WHERE d.usuario_id=u.id AND d.comunidade_id=uc.comunidade_id AND d.ativo=1 AND d.status IN ('CONFIRMADA','PENDENTE') AND s.status IN ('PUBLICADA','AGUARDANDO_CHECKLIST') AND datetime(s.termina_em)>=datetime('now')))
           AND (? <> 'sem-titulo' OR (oc.id IS NOT NULL AND COALESCE(oc.titulo,'')=''))
           AND (? = -1 OR (CASE WHEN oc.id IS NULL THEN 0 ELSE 1 END) = ?)
           AND (
             ? = ''
             OR u.nome LIKE ?
             OR u.email LIKE ?
             OR COALESCE(u.telefone, '') LIKE ?
           )
           AND (
             ? = 0
             OR u.nome > ?
             OR (u.nome = ? AND uc.id > ?)
           )
         ORDER BY u.nome ASC, uc.id ASC
         LIMIT ?
        )
        SELECT uc.id AS membership_id, u.id AS usuario_id, u.nome, u.email,
          u.criado_em AS owner_criado_em,
          (SELECT proprietario_usuario_id FROM comunidades WHERE id = uc.comunidade_id) AS community_owner_id,
          u.telefone, u.foto_perfil, uc.papel,
          COALESCE((SELECT group_concat(m.nome, ', ')
            FROM ministerio_voluntarios mv JOIN ministerios_comunidade m
              ON m.id = mv.ministerio_id AND m.comunidade_id = mv.comunidade_id
            WHERE mv.usuario_id = u.id AND mv.comunidade_id = uc.comunidade_id AND mv.ativo = 1
              AND m.status = 'ATIVO'), '') AS ministerios,
          (SELECT COUNT(DISTINCT d.escala_id) FROM escala_designacoes d
            JOIN escalas_ministerio s ON s.id = d.escala_id AND s.comunidade_id = d.comunidade_id
            WHERE d.usuario_id = u.id AND d.comunidade_id = uc.comunidade_id AND d.ativo = 1
              AND d.status IN ('CONFIRMADA', 'PENDENTE') AND s.status IN ('PUBLICADA', 'AGUARDANDO_CHECKLIST')
              AND datetime(s.termina_em) >= datetime('now')) AS proximas_escalas,
          CASE WHEN oc.id IS NULL THEN 0 ELSE 1 END AS oficial,
          COALESCE(oc.titulo, '') AS titulo_oficial,
          COALESCE(oc.permissoes, '') AS permissoes,
          uc.status, uc.criado_em,
          COALESCE(oc.atualizado_em, uc.criado_em) AS atualizado_em

         FROM page
         JOIN usuario_comunidades uc ON uc.id = page.id
         JOIN usuarios u ON u.id = uc.usuario_id
         LEFT JOIN oficiais_comunidade oc
           ON oc.usuario_comunidade_id = uc.id
         ORDER BY u.nome ASC, uc.id ASC`,
      )
      .bind(
        access.context.comunidadeId,
        participation, participation, participation,
        officialsOnly,
        officialsOnly,
        search,
        searchTerm,
        searchTerm,
        searchTerm,
        cursor ? 1 : 0,
        cursor?.nome ?? "",
        cursor?.nome ?? "",
        cursor?.id ?? 0,
        pageSize + 1,
      )
      .all<Record<string, unknown>>(),
    // Os cartões do topo mostram o total da comunidade, não o do lote
    // carregado, então a contagem é feita no banco e não sobre as linhas
    // devolvidas.
    db
      .prepare(
        `SELECT
          SUM(CASE WHEN oc.id IS NULL THEN 1 ELSE 0 END) AS membros,
          SUM(CASE WHEN oc.id IS NULL THEN 0 ELSE 1 END) AS oficiais,
          SUM(CASE WHEN oc.id IS NOT NULL AND COALESCE(oc.titulo, '') = ''
                THEN 1 ELSE 0 END) AS oficiais_sem_titulo
         FROM usuario_comunidades uc
         JOIN usuarios u ON u.id = uc.usuario_id
         LEFT JOIN oficiais_comunidade oc
           ON oc.usuario_comunidade_id = uc.id
         WHERE uc.comunidade_id = ? AND u.ativo = 1 AND uc.status = 'ATIVO'`,
      )
      .bind(access.context.comunidadeId)
      .first<{ membros: number; oficiais: number; oficiais_sem_titulo: number }>(),
  ]);

  const hasMore = rows.results.length > pageSize;
  const people = hasMore ? rows.results.slice(0, pageSize) : rows.results;
  const last = people[people.length - 1];
  const nextCursor =
    hasMore && last
      ? encodePeopleCursor({
          nome: String(last.nome ?? ""),
          id: Number(last.membership_id),
        })
      : null;

  return Response.json(
    {
      me: verifiedMe,
      people: people.map((person) => ({
        ...withOwnerVerification(person),
        canEditHierarchy: access.context.permissions.includes("officials.manage") && canManagePerson(access.context, person),
        canRemove: canRemoveCommunity && Number(person.usuario_id) !== access.user.id && canManagePerson(access.context, person),
      })),
      nextCursor,
      counts: {
        membros: Number(totals?.membros || 0),
        oficiais: Number(totals?.oficiais || 0),
        oficiaisSemTitulo: Number(totals?.oficiais_sem_titulo || 0),
      },
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
  const { owner_criado_em, community_owner_id, ...safeRow } = row;
  void community_owner_id;
  return {
    ...safeRow,
    owner_verified: isSystemOwnerAccount({
      email: String(row.email || ""),
      criado_em: String(owner_criado_em || ""),
    }),
  };
}

// Verifica também o alvo: poder conceder um cargo menor não permite
// rebaixar superiores, pares ou os proprietários cadastrados.
function canManagePerson(context: TenantContext, target: Record<string, unknown>) {
  if (context.isOwner) return true;
  if (Number(target.usuario_id) === context.userId ||
      Number(target.community_owner_id) === Number(target.usuario_id) ||
      isSystemOwnerAccount({email: String(target.email || ""), criado_em: String(target.owner_criado_em || "")})) return false;
  const rank: Record<string, number> = {MEMBRO: 0, LIDER: 1, PASTOR: 2, ADMIN_COMUNIDADE: 3, SUPERADMIN: 3, PROPRIETARIO_VISUALIZADOR: 3};
  const actorRank = rank[context.papel] ?? -1;
  const targetRank = rank[String(target.papel)] ?? Number.POSITIVE_INFINITY;
  return actorRank > targetRank;
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
  const payload = (((await request.json().catch(() => null)) ?? {})) as Record<string, unknown>;
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
      `SELECT uc.id, uc.usuario_id, uc.papel, u.nome, u.email,
         u.criado_em AS owner_criado_em,
         (SELECT proprietario_usuario_id FROM comunidades WHERE id = uc.comunidade_id) AS community_owner_id
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
      papel: string;
      owner_criado_em: string;
      community_owner_id: number | null;
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

  if (!canManagePerson(access.context, target)) {
    return Response.json({error: "Seu perfil não pode remover esta pessoa da comunidade."}, {status: 403});
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

  return deleteUserAccount(db, access.user.id, target.usuario_id);
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("officials.manage");
  if ("error" in access) return access.error;
  const parsed = parseOfficialUpdate(((await request.json().catch(() => null)) ?? {}));
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
      `SELECT uc.id, uc.usuario_id, uc.papel, u.email, u.criado_em AS owner_criado_em,
        (SELECT proprietario_usuario_id FROM comunidades WHERE id = uc.comunidade_id) AS community_owner_id,
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
      email: string;
      owner_criado_em: string;
      community_owner_id: number | null;
    }>();
  if (!target) {
    return Response.json(
      { error: "Pessoa não encontrada nesta comunidade." },
      { status: 404 },
    );
  }

  if (!canManagePerson(access.context, target)) {
    return Response.json({error: "Seu perfil não pode alterar a hierarquia desta pessoa."}, {status: 403});
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
  await recordPromotionNotice(db, {
    comunidadeId: access.context.comunidadeId,
    usuarioId: Number(target.usuario_id),
    escopo: "COMUNIDADE",
    contexto: access.context.comunidadeNome,
    papelAnterior: String(target.papel || ""),
    papelNovo: parsed.data.papel,
    promovidoPor: access.user.id,
  });
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
