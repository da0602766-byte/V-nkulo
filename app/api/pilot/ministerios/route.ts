import { getD1 } from "../../../../db";
import { hasGlobalMinistryManagement } from "../../../lib/ministry-access";
import { parseMinistryPayload } from "../../../lib/ministry-validation";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

type MinistryRow = Record<string, unknown> & { id: number };
type VolunteerRow = Record<string, unknown> & { ministerio_id: number };
type VisitorCategoryRow = Record<string, unknown> & { ministerio_id: number };

export async function GET() {
  const access = await requireTenantPermission("ministries.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const systemOwner = access.user.system_owner === true;
  const globalManager =
    systemOwner || hasGlobalMinistryManagement(access.context);
  const ministriesResult = await db
    .prepare(
      `SELECT m.id, m.nome, m.descricao, m.categoria, m.status,
        m.youtube_url, m.spotify_url, m.banner_url,
        m.responsavel_usuario_id, responsavel.nome AS responsavel_nome,
        m.criado_em, m.atualizado_em,
        CASE WHEN m.status = 'ATIVO' AND (
          ? = 1
          OR m.responsavel_usuario_id = ?
          OR EXISTS (
          SELECT 1 FROM ministerio_voluntarios own_leadership
          WHERE own_leadership.ministerio_id = m.id
            AND own_leadership.comunidade_id = m.comunidade_id
            AND own_leadership.usuario_id = ?
            AND own_leadership.papel = 'LIDER'
            AND own_leadership.ativo = 1
          )
        ) THEN 1 ELSE 0 END AS can_manage,
        CASE WHEN m.categoria = 'DIACONIA' AND (
          ? = 1 OR ? = 1
        ) THEN 1 ELSE 0 END AS can_archive,
        CASE WHEN ? = 1 OR (
          m.status = 'ATIVO' AND (
            ? = 1
            OR m.responsavel_usuario_id = ?
            OR EXISTS (
              SELECT 1 FROM ministerio_voluntarios delete_leadership
              WHERE delete_leadership.ministerio_id = m.id
                AND delete_leadership.comunidade_id = m.comunidade_id
                AND delete_leadership.usuario_id = ?
                AND delete_leadership.papel = 'LIDER'
                AND delete_leadership.ativo = 1
            )
          )
        ) THEN 1 ELSE 0 END AS can_delete
      FROM ministerios_comunidade m
      LEFT JOIN usuarios responsavel ON responsavel.id = m.responsavel_usuario_id
      WHERE m.comunidade_id = ?
        AND m.status != 'ARQUIVADO'
        AND (m.status = 'ATIVO' OR ? = 1)
        AND (
          ? = 1
          OR m.responsavel_usuario_id = ?
          OR EXISTS (
            SELECT 1 FROM ministerio_voluntarios own_membership
            WHERE own_membership.ministerio_id = m.id
              AND own_membership.comunidade_id = m.comunidade_id
              AND own_membership.usuario_id = ?
              AND own_membership.ativo = 1
          )
          OR EXISTS (
            SELECT 1
            FROM escala_designacoes own_assignment
            JOIN escalas_ministerio own_schedule
              ON own_schedule.id = own_assignment.escala_id
             AND own_schedule.comunidade_id = own_assignment.comunidade_id
            WHERE own_schedule.ministerio_id = m.id
              AND own_assignment.comunidade_id = m.comunidade_id
              AND own_assignment.usuario_id = ?
              AND own_assignment.ativo = 1
              AND own_schedule.status = 'PUBLICADA'
          )
        )
      ORDER BY m.status ASC, m.nome ASC
      LIMIT 100`,
    )
    .bind(
      globalManager ? 1 : 0,
      access.user.id,
      access.user.id,
      globalManager ? 1 : 0,
      access.user.system_owner ? 1 : 0,
      systemOwner ? 1 : 0,
      globalManager ? 1 : 0,
      access.user.id,
      access.user.id,
      access.context.comunidadeId,
      globalManager ? 1 : 0,
      globalManager ? 1 : 0,
      access.user.id,
      access.user.id,
      access.user.id,
    )
    .all<MinistryRow>();
  const volunteersResult = await db
    .prepare(
      `SELECT mv.id, mv.ministerio_id, mv.usuario_id, u.nome,
        mv.funcao, mv.papel, mv.dias_disponiveis,
        mv.periodo_preferido, mv.limite_escalas, mv.ativo,
        (
          SELECT COUNT(*)
          FROM escala_designacoes capacity_assignment
          JOIN escalas_ministerio capacity_schedule
            ON capacity_schedule.id = capacity_assignment.escala_id
           AND capacity_schedule.comunidade_id = capacity_assignment.comunidade_id
          WHERE capacity_assignment.voluntario_id = mv.id
            AND capacity_assignment.comunidade_id = mv.comunidade_id
            AND capacity_assignment.ativo = 1
            AND capacity_schedule.status IN ('PUBLICADA', 'AGUARDANDO_CHECKLIST')
            AND datetime(capacity_schedule.termina_em) >= datetime('now')
        ) AS escalas_ativas,
        CASE WHEN mv.usuario_id = ? THEN 1 ELSE 0 END AS is_mine
      FROM ministerio_voluntarios mv
      JOIN usuarios u ON u.id = mv.usuario_id
      JOIN usuario_comunidades uc
        ON uc.usuario_id = mv.usuario_id
       AND uc.comunidade_id = mv.comunidade_id
       AND uc.status = 'ATIVO'
      JOIN ministerios_comunidade m
        ON m.id = mv.ministerio_id
       AND m.comunidade_id = mv.comunidade_id
      WHERE mv.comunidade_id = ? AND mv.ativo = 1
        AND (
          ? = 1
          OR m.responsavel_usuario_id = ?
          OR EXISTS (
            SELECT 1 FROM ministerio_voluntarios own_leadership
            WHERE own_leadership.ministerio_id = mv.ministerio_id
              AND own_leadership.comunidade_id = mv.comunidade_id
              AND own_leadership.usuario_id = ?
              AND own_leadership.papel = 'LIDER'
              AND own_leadership.ativo = 1
          )
        )
      ORDER BY mv.papel DESC, u.nome ASC`,
    )
    .bind(
      access.user.id,
      access.context.comunidadeId,
      globalManager ? 1 : 0,
      access.user.id,
      access.user.id,
    )
    .all<VolunteerRow>();
  const visitorCategoriesResult = await db
    .prepare(
      `SELECT vc.id, vc.ministerio_id, vc.nome, vc.icone, vc.cor,
        COUNT(v.id) AS total_visitantes
       FROM visitante_categorias vc
       LEFT JOIN visitantes v
         ON v.categoria_id = vc.id
        AND v.comunidade_id = vc.comunidade_id
        AND v.ativo = 1 AND v.escopo_confirmado = 1
       WHERE vc.comunidade_id = ? AND vc.ativa = 1
         AND vc.ministerio_id IS NOT NULL
       GROUP BY vc.id
       ORDER BY vc.ordem ASC, vc.nome ASC`,
    )
    .bind(access.context.comunidadeId)
    .all<VisitorCategoryRow>();
  const volunteersByMinistry = new Map<number, VolunteerRow[]>();
  for (const volunteer of volunteersResult.results) {
    const ministryId = Number(volunteer.ministerio_id);
    const items = volunteersByMinistry.get(ministryId) || [];
    items.push({
      ...volunteer,
      dias_disponiveis: parseDays(volunteer.dias_disponiveis),
    });
    volunteersByMinistry.set(ministryId, items);
  }
  const visitorCategoriesByMinistry = new Map<number, VisitorCategoryRow[]>();
  for (const category of visitorCategoriesResult.results) {
    const ministryId = Number(category.ministerio_id);
    const items = visitorCategoriesByMinistry.get(ministryId) || [];
    items.push(category);
    visitorCategoriesByMinistry.set(ministryId, items);
  }
  const canManageAny = ministriesResult.results.some(
    (ministry) => Boolean(ministry.can_manage),
  );
  let availableUsers: Record<string, unknown>[] = [];
  if (globalManager || canManageAny) {
    const availableResult = await db
      .prepare(
        `SELECT u.id, u.nome, uc.papel
        FROM usuario_comunidades uc
        JOIN usuarios u ON u.id = uc.usuario_id
        WHERE uc.comunidade_id = ?
          AND uc.status = 'ATIVO'
          AND u.ativo = 1
        ORDER BY u.nome ASC
        LIMIT 250`,
      )
      .bind(access.context.comunidadeId)
      .all<Record<string, unknown>>();
    availableUsers = availableResult.results;
  }
  return Response.json(
    {
      ministerios: ministriesResult.results.map((ministry) => ({
        ...ministry,
        voluntarios: volunteersByMinistry.get(Number(ministry.id)) || [],
        categorias_visitantes:
          visitorCategoriesByMinistry.get(Number(ministry.id)) || [],
      })),
      availableUsers,
      canCreate: globalManager,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("ministries.view");
  if ("error" in access) return access.error;
  if (!hasGlobalMinistryManagement(access.context)) {
    return Response.json(
      { error: "Somente a gestão pastoral ou administrativa pode criar ministérios." },
      { status: 403 },
    );
  }
  const parsed = parseMinistryPayload(await request.json());
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  if (!parsed.responsavelUsuarioId) {
    return Response.json(
      { error: "Defina o líder responsável ao criar o ministério." },
      { status: 400 },
    );
  }
  const db = getD1();
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
    const result = await db
      .prepare(
        `INSERT INTO ministerios_comunidade
        (comunidade_id, nome, descricao, categoria, status,
         youtube_url, spotify_url, banner_url, responsavel_usuario_id,
         criado_por, atualizado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        access.context.comunidadeId,
        parsed.nome,
        parsed.descricao,
        parsed.categoria,
        parsed.status,
        parsed.youtubeUrl,
        parsed.spotifyUrl,
        parsed.bannerUrl,
        parsed.responsavelUsuarioId,
        access.user.id,
        access.user.id,
      )
      .run();
    const ministryId = Number(result.meta.last_row_id);
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
        ministryId,
        parsed.responsavelUsuarioId,
      )
      .run();
    if (parsed.categoria === "ESTACIONAMENTO") {
      const rules = JSON.stringify({ responsavelUsuarioId: parsed.responsavelUsuarioId, instrucoes: "Operação vinculada ao ministério de Estacionamento." });
      await db.prepare(`INSERT INTO estacionamento_configuracoes
        (comunidade_id,ativo,nome_modulo,cor_destaque,regras,atualizado_por,atualizado_em)
        VALUES (?,1,'Estacionamento','#d99a32',?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(comunidade_id) DO UPDATE SET ativo=1,regras=excluded.regras,atualizado_por=excluded.atualizado_por,atualizado_em=CURRENT_TIMESTAMP`)
        .bind(access.context.comunidadeId,rules,access.user.id).run();
    }
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "MINISTERIO_V45_CRIADO",
      "SUCESSO",
      { ministerioId: ministryId, categoria: parsed.categoria },
    );
    return Response.json({ id: ministryId }, { status: 201 });
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      return Response.json(
        { error: "Já existe um ministério com esse nome nesta comunidade." },
        { status: 409 },
      );
    }
    throw error;
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
