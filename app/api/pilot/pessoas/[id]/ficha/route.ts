import { getD1 } from "../../../../../../db";
import { requireTenantPermission } from "../../../../../lib/tenant";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const permissions = access.context.permissions;
  if (!permissions.includes("people.view") && !access.user.system_owner) {
    return Response.json({ error: "Seu perfil não permite consultar fichas de pessoas." }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Pessoa inválida." }, { status: 400 });
  const db = getD1();
  const communityId = access.context.comunidadeId;
  const person = await db.prepare(`SELECT uc.id AS membership_id, u.id AS usuario_id,
    u.nome, u.email, u.telefone, u.foto_perfil, u.data_nascimento, u.endereco,
    uc.papel, uc.status, uc.criado_em AS vinculado_em,
    COALESCE(oc.titulo, '') AS titulo_oficial, COALESCE(oc.permissoes, '') AS permissoes,
    CASE WHEN oc.id IS NULL THEN 0 ELSE 1 END AS oficial
    FROM usuario_comunidades uc JOIN usuarios u ON u.id = uc.usuario_id
    LEFT JOIN oficiais_comunidade oc ON oc.usuario_comunidade_id = uc.id
    WHERE uc.id = ? AND uc.comunidade_id = ? AND u.ativo = 1 LIMIT 1`)
    .bind(id, communityId).first<{ usuario_id: number } & Record<string, unknown>>();
  if (!person) return Response.json({ error: "Pessoa não encontrada nesta comunidade." }, { status: 404 });
  const userId = person.usuario_id;
  const canViewSchedules = permissions.includes("schedules.view");
  const canViewAvailability = permissions.includes("schedules.manage") || userId === access.user.id;
  const canViewMinistries = permissions.includes("ministries.view");
  const canViewCells = permissions.includes("cells.view");
  const canViewChecklist = canViewSchedules && (permissions.includes("schedules.manage") || permissions.includes("diaconia.view"));
  try {
    const [ministries, cells, schedules, participation, unavailable, checklist] = await Promise.all([
      canViewMinistries ? db.prepare(`SELECT mv.id, m.id AS ministerio_id, m.nome, mv.funcao, mv.papel,
        mv.dias_disponiveis, mv.periodo_preferido, mv.limite_escalas,
        (SELECT group_concat(e.nome, ', ') FROM ministerio_equipe_membros em
          JOIN ministerio_equipes e ON e.id = em.equipe_id AND e.comunidade_id = em.comunidade_id
          WHERE em.voluntario_id = mv.id AND em.comunidade_id = mv.comunidade_id AND e.ativa = 1) AS equipes
        FROM ministerio_voluntarios mv JOIN ministerios_comunidade m
          ON m.id = mv.ministerio_id AND m.comunidade_id = mv.comunidade_id
        WHERE mv.usuario_id = ? AND mv.comunidade_id = ? AND mv.ativo = 1 AND m.status = 'ATIVO'
        ORDER BY m.nome LIMIT 100`).bind(userId, communityId).all() : null,
      canViewCells ? db.prepare(`SELECT DISTINCT c.id, c.nome FROM celulas c, json_each(c.membros) membro
        WHERE c.comunidade_id = ? AND c.ativo = 1 AND c.escopo_confirmado = 1
        AND json_extract(membro.value, '$.kind') = 'COMMUNITY'
        AND CAST(json_extract(membro.value, '$.userId') AS INTEGER) = ?
        ORDER BY c.nome LIMIT 100`).bind(communityId, userId).all() : null,
      canViewSchedules ? db.prepare(`SELECT d.id, s.id AS escala_id, s.ministerio_id, s.titulo, s.inicia_em, s.termina_em,
        s.local, s.status AS escala_status, d.status, d.funcao, m.nome AS ministerio,
        CASE WHEN datetime(s.termina_em) >= datetime('now') THEN 1 ELSE 0 END AS futura
        FROM escala_designacoes d JOIN escalas_ministerio s
          ON s.id = d.escala_id AND s.comunidade_id = d.comunidade_id
        JOIN ministerios_comunidade m ON m.id = s.ministerio_id AND m.comunidade_id = s.comunidade_id
        WHERE d.usuario_id = ? AND d.comunidade_id = ? AND d.ativo = 1 AND s.status <> 'CANCELADA'
        ORDER BY futura DESC, CASE WHEN datetime(s.termina_em) >= datetime('now') THEN s.inicia_em END ASC,
          s.inicia_em DESC LIMIT 50`).bind(userId, communityId).all() : null,
      canViewSchedules ? db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN d.status = 'CONFIRMADA' THEN 1 ELSE 0 END) AS confirmadas,
        SUM(CASE WHEN d.status = 'PENDENTE' THEN 1 ELSE 0 END) AS pendentes,
        SUM(CASE WHEN d.status = 'INDISPONIVEL' THEN 1 ELSE 0 END) AS indisponiveis,
        SUM(CASE WHEN d.status = 'AUSENTE' THEN 1 ELSE 0 END) AS ausencias,
        SUM(CASE WHEN datetime(s.termina_em) < datetime('now') AND d.status = 'CONFIRMADA' THEN 1 ELSE 0 END) AS passadas_confirmadas,
        COUNT(DISTINCT CASE WHEN datetime(s.termina_em) >= datetime('now') AND d.status IN ('CONFIRMADA','PENDENTE')
          AND s.status IN ('PUBLICADA','AGUARDANDO_CHECKLIST') THEN s.id END) AS proximas
        FROM escala_designacoes d JOIN escalas_ministerio s
          ON s.id = d.escala_id AND s.comunidade_id = d.comunidade_id
        WHERE d.usuario_id = ? AND d.comunidade_id = ? AND d.ativo = 1
          AND s.status IN ('PUBLICADA','AGUARDANDO_CHECKLIST','ENCERRADA')`)
        .bind(userId, communityId).first() : null,
      canViewAvailability ? db.prepare(`SELECT id, data_inicio, data_fim, todo_dia, hora_inicio, hora_fim
        FROM indisponibilidades WHERE usuario_id = ? AND comunidade_id = ? AND bloqueio_escalas = 1
          AND date(data_fim) >= date('now') ORDER BY data_inicio LIMIT 100`).bind(userId, communityId).all() : null,
      canViewChecklist ? db.prepare(`SELECT * FROM (
        SELECT 'MINISTERIO' AS origem, ci.id, ci.tarefa, ci.status, ci.atualizado_em, s.id AS escala_id, s.titulo AS escala
        FROM ministerio_checklist_itens ci JOIN escalas_ministerio s
          ON s.id = ci.escala_id AND s.comunidade_id = ci.comunidade_id
        JOIN escala_designacoes d ON d.id = ci.designacao_id AND d.comunidade_id = ci.comunidade_id
        WHERE ci.comunidade_id = ? AND (d.usuario_id = ? OR ci.substituto_usuario_id = ?) AND d.ativo = 1
        UNION ALL
        SELECT 'DIACONIA' AS origem, ci.id, ci.tarefa, ci.status, ci.atualizado_em, s.id AS escala_id, s.titulo AS escala
        FROM diaconia_checklist_itens ci JOIN escalas_ministerio s
          ON s.id = ci.escala_id AND s.comunidade_id = ci.comunidade_id
        JOIN escala_designacoes d ON d.id = ci.designacao_id AND d.comunidade_id = ci.comunidade_id
        WHERE ci.comunidade_id = ? AND (d.usuario_id = ? OR ci.substituto_usuario_id = ?) AND d.ativo = 1
        ) ORDER BY atualizado_em DESC LIMIT 50`).bind(communityId, userId, userId, communityId, userId, userId).all() : null,
    ]);
    return Response.json({ person, ministries: ministries?.results || [], cells: cells?.results || [],
      schedules: schedules?.results || [], participation, unavailable: unavailable?.results || [],
      checklist: checklist?.results || [], canViewSchedules, canViewAvailability, canViewChecklist,
      canViewMinistries, canViewCells }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao carregar ficha da comunidade", error);
    return Response.json({ error: "Não foi possível carregar a ficha. Tente novamente." }, { status: 503 });
  }
}
