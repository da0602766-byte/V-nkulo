import { getD1 } from "../../../../../db";
import {
  canManageMinistry,
  canManageSchedule,
  hasGlobalMinistryManagement,
} from "../../../../lib/ministry-access";
import {
  cleanAction,
  parseCustomFunctionPayload,
  parseMinistryChecklistUpdate,
  parseScheduleTemplatePayload,
  parseSecretaryLinks,
} from "../../../../lib/ministry-validation";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

type Row = Record<string, unknown>;

export async function GET() {
  const access = await requireTenantPermission("ministries.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const globalManager = hasGlobalMinistryManagement(access.context);
  const [functions, templates, checklist, reusableLinks, libraryItems] = await Promise.all([
    db
      .prepare(
        `SELECT f.id, f.ministerio_id, f.nome, f.descricao
         FROM ministerio_funcoes f
         JOIN ministerios_comunidade m
           ON m.id = f.ministerio_id
          AND m.comunidade_id = f.comunidade_id
         WHERE f.comunidade_id = ? AND f.ativa = 1
           AND (
             ? = 1
             OR m.responsavel_usuario_id = ?
             OR EXISTS (
               SELECT 1 FROM ministerio_voluntarios own_leadership
               WHERE own_leadership.ministerio_id = f.ministerio_id
                 AND own_leadership.comunidade_id = f.comunidade_id
                 AND own_leadership.usuario_id = ?
                 AND own_leadership.papel = 'LIDER'
                 AND own_leadership.ativo = 1
             )
           )
         ORDER BY f.nome ASC`,
      )
      .bind(
        access.context.comunidadeId,
        globalManager ? 1 : 0,
        access.user.id,
        access.user.id,
      )
      .all<Row>(),
    db
      .prepare(
        `SELECT t.id, t.ministerio_id, t.nome, t.titulo, t.duracao_minutos,
          t.local, t.observacoes, t.checklist_modelo,
          t.campos_personalizados, t.versao
         FROM ministerio_modelos_escala t
         JOIN ministerios_comunidade m
           ON m.id = t.ministerio_id
          AND m.comunidade_id = t.comunidade_id
         WHERE t.comunidade_id = ? AND t.ativo = 1
           AND (
             ? = 1
             OR m.responsavel_usuario_id = ?
             OR EXISTS (
               SELECT 1 FROM ministerio_voluntarios own_leadership
               WHERE own_leadership.ministerio_id = t.ministerio_id
                 AND own_leadership.comunidade_id = t.comunidade_id
                 AND own_leadership.usuario_id = ?
                 AND own_leadership.papel = 'LIDER'
                 AND own_leadership.ativo = 1
             )
           )
         ORDER BY t.nome ASC`,
      )
      .bind(
        access.context.comunidadeId,
        globalManager ? 1 : 0,
        access.user.id,
        access.user.id,
      )
      .all<Row>(),
    db
      .prepare(
        `SELECT ci.id, ci.escala_id, ci.designacao_id, ci.tarefa,
          ci.status, ci.observacao, d.usuario_id,
          CASE WHEN d.usuario_id = ? THEN 1 ELSE 0 END AS is_mine
         FROM ministerio_checklist_itens ci
         JOIN escalas_ministerio s
           ON s.id = ci.escala_id
          AND s.comunidade_id = ci.comunidade_id
         JOIN ministerios_comunidade m
           ON m.id = s.ministerio_id
          AND m.comunidade_id = s.comunidade_id
         LEFT JOIN escala_designacoes d
           ON d.id = ci.designacao_id
          AND d.comunidade_id = ci.comunidade_id
         WHERE ci.comunidade_id = ?
           AND s.status != 'CANCELADA'
           AND (
             ? = 1
             OR m.responsavel_usuario_id = ?
             OR EXISTS (
               SELECT 1 FROM ministerio_voluntarios lead
               WHERE lead.ministerio_id = s.ministerio_id
                 AND lead.comunidade_id = s.comunidade_id
                 AND lead.usuario_id = ?
                 AND lead.papel = 'LIDER' AND lead.ativo = 1
             )
             OR d.usuario_id = ?
           )
         ORDER BY ci.escala_id DESC, ci.id ASC`,
      )
      .bind(
        access.user.id,
        access.context.comunidadeId,
        globalManager ? 1 : 0,
        access.user.id,
        access.user.id,
        access.user.id,
      )
      .all<Row>(),
    db
      .prepare(
        `SELECT l.id, l.ministerio_id, l.item_id, l.tipo, l.titulo, l.url
         FROM ministerio_links_reutilizaveis l
         JOIN ministerios_comunidade m
           ON m.id = l.ministerio_id
          AND m.comunidade_id = l.comunidade_id
         WHERE l.comunidade_id = ? AND l.ativo = 1
           AND (
             ? = 1
             OR m.responsavel_usuario_id = ?
             OR EXISTS (
               SELECT 1 FROM ministerio_voluntarios lead
               WHERE lead.ministerio_id = l.ministerio_id
                 AND lead.comunidade_id = l.comunidade_id
                 AND lead.usuario_id = ?
                 AND lead.papel = 'LIDER' AND lead.ativo = 1
             )
           )
         ORDER BY l.atualizado_em DESC, l.id DESC`,
      )
      .bind(
        access.context.comunidadeId,
        globalManager ? 1 : 0,
        access.user.id,
        access.user.id,
      )
      .all<Row>(),
    db
      .prepare(
        `SELECT b.id, b.ministerio_id, b.titulo, b.atualizado_em
         FROM ministerio_biblioteca_itens b
         JOIN ministerios_comunidade m
           ON m.id = b.ministerio_id
          AND m.comunidade_id = b.comunidade_id
         WHERE b.comunidade_id = ? AND b.ativo = 1
           AND (
             ? = 1
             OR m.responsavel_usuario_id = ?
             OR EXISTS (
               SELECT 1 FROM ministerio_voluntarios lead
               WHERE lead.ministerio_id = b.ministerio_id
                 AND lead.comunidade_id = b.comunidade_id
                 AND lead.usuario_id = ?
                 AND lead.papel = 'LIDER' AND lead.ativo = 1
             )
           )
         ORDER BY b.titulo COLLATE NOCASE ASC`,
      )
      .bind(
        access.context.comunidadeId,
        globalManager ? 1 : 0,
        access.user.id,
        access.user.id,
      )
      .all<Row>(),
  ]);
  // Cada item da biblioteca reúne os links da mesma música ou material, para
  // que a lista mostre apenas o nome e os ícones das plataformas.
  const linksByItem = new Map<number, Row[]>();
  for (const link of reusableLinks.results) {
    const itemId = Number(link.item_id);
    if (!Number.isInteger(itemId) || itemId <= 0) continue;
    const bucket = linksByItem.get(itemId);
    if (bucket) bucket.push(link);
    else linksByItem.set(itemId, [link]);
  }
  return Response.json(
    {
      funcoes: functions.results,
      modelos: templates.results.map((template) => ({
        ...template,
        checklist_modelo: parseList(template.checklist_modelo),
        campos_personalizados: parseList(template.campos_personalizados),
      })),
      checklist: checklist.results,
      linksReutilizaveis: reusableLinks.results,
      bibliotecaItens: libraryItems.results.map((item) => ({
        ...item,
        links: linksByItem.get(Number(item.id)) || [],
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("ministries.view");
  if ("error" in access) return access.error;
  const payload = (((await request.json().catch(() => null)) ?? {})) as Record<string, unknown>;
  const action = cleanAction(payload.acao);
  const db = getD1();

  if (action === "SALVAR_LINKS_REUTILIZAVEIS") {
    const ministryId = positiveInteger(payload.ministerioId);
    const parsed = parseSecretaryLinks(payload.links);
    if (!ministryId || "error" in parsed || (!parsed.value.length && !cleanLibraryTitle(payload.item))) {
      return Response.json(
        {
          error: !ministryId
            ? "Ministério obrigatório."
            : "error" in parsed
              ? parsed.error
              : "Inclua ao menos um link completo para salvar.",
        },
        { status: 400 },
      );
    }
    if (
      !(await canManageMinistry(
        db,
        access.context,
        access.user.id,
        ministryId,
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    // O item é o agrupador da biblioteca (ex.: a música). Sem um nome
    // explícito, usamos o título do primeiro link para manter compatibilidade
    // com as bibliotecas salvas antes do agrupamento.
    const itemTitle =
      cleanLibraryTitle(payload.item) || parsed.value[0]?.titulo || "";
    if (!itemTitle) {
      return Response.json(
        { error: "Informe o nome do item da biblioteca." },
        { status: 400 },
      );
    }
    const itemId = await ensureLibraryItem(
      db,
      access.context.comunidadeId,
      ministryId,
      itemTitle,
      access.user.id,
    );
    for (const link of parsed.value) {
      await db
        .prepare(
          `INSERT INTO ministerio_links_reutilizaveis
           (comunidade_id, ministerio_id, item_id, tipo, titulo, url, ativo,
            criado_por)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(ministerio_id, url) DO UPDATE SET
             item_id = excluded.item_id,
             tipo = excluded.tipo,
             titulo = excluded.titulo,
             ativo = 1,
             atualizado_em = CURRENT_TIMESTAMP`,
        )
        .bind(
          access.context.comunidadeId,
          ministryId,
          itemId,
          link.tipo,
          link.titulo,
          link.url,
          access.user.id,
        )
        .run();
    }
    await audit("MINISTERIO_LINKS_REUTILIZAVEIS_SALVOS", {
      ministerioId: ministryId,
      itemId,
      quantidade: parsed.value.length,
    });
    return Response.json({ ok: true, itemId, quantidade: parsed.value.length });
  }

  if (action === "RENOMEAR_ITEM_BIBLIOTECA") {
    const id = positiveInteger(payload.id);
    const titulo = cleanLibraryTitle(payload.titulo);
    if (!id || !titulo) {
      return Response.json(
        { error: "Informe o item e o novo nome." },
        { status: 400 },
      );
    }
    const row = await db
      .prepare(
        `SELECT ministerio_id FROM ministerio_biblioteca_itens
         WHERE id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(id, access.context.comunidadeId)
      .first<{ ministerio_id: number }>();
    if (
      !row ||
      !(await canManageMinistry(
        db,
        access.context,
        access.user.id,
        Number(row.ministerio_id),
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    await db
      .prepare(
        `UPDATE ministerio_biblioteca_itens
         SET titulo = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(titulo, id, access.context.comunidadeId)
      .run();
    await audit("MINISTERIO_BIBLIOTECA_ITEM_RENOMEADO", {
      ministerioId: Number(row.ministerio_id),
      itemId: id,
    });
    return Response.json({ ok: true });
  }

  if (action === "EXCLUIR_ITEM_BIBLIOTECA") {
    const id = positiveInteger(payload.id);
    if (!id) {
      return Response.json({ error: "Item inválido." }, { status: 400 });
    }
    const row = await db
      .prepare(
        `SELECT ministerio_id FROM ministerio_biblioteca_itens
         WHERE id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(id, access.context.comunidadeId)
      .first<{ ministerio_id: number }>();
    if (
      !row ||
      !(await canManageMinistry(
        db,
        access.context,
        access.user.id,
        Number(row.ministerio_id),
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    await db.batch([
      db
        .prepare(
          `UPDATE ministerio_links_reutilizaveis
           SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
           WHERE item_id = ? AND comunidade_id = ?`,
        )
        .bind(id, access.context.comunidadeId),
      db
        .prepare(
          `UPDATE ministerio_biblioteca_itens
           SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(id, access.context.comunidadeId),
    ]);
    await audit("MINISTERIO_BIBLIOTECA_ITEM_EXCLUIDO", {
      ministerioId: Number(row.ministerio_id),
      itemId: id,
    });
    return Response.json({ ok: true });
  }

  if (action === "EXCLUIR_LINK_REUTILIZAVEL") {
    const id = positiveInteger(payload.id);
    if (!id) {
      return Response.json({ error: "Link inválido." }, { status: 400 });
    }
    const row = await db
      .prepare(
        `SELECT ministerio_id FROM ministerio_links_reutilizaveis
         WHERE id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(id, access.context.comunidadeId)
      .first<{ ministerio_id: number }>();
    if (
      !row ||
      !(await canManageMinistry(
        db,
        access.context,
        access.user.id,
        Number(row.ministerio_id),
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    await db
      .prepare(
        `UPDATE ministerio_links_reutilizaveis
         SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(id, access.context.comunidadeId)
      .run();
    await audit("MINISTERIO_LINK_REUTILIZAVEL_EXCLUIDO", {
      ministerioId: Number(row.ministerio_id),
      linkId: id,
    });
    return Response.json({ ok: true });
  }

  if (action === "CRIAR_FUNCAO") {
    const ministryId = positiveInteger(payload.ministerioId);
    const parsed = parseCustomFunctionPayload(payload);
    if (!ministryId) {
      return Response.json(
        { error: "Ministério obrigatório." },
        { status: 400 },
      );
    }
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    if (
      !(await canManageMinistry(
        db,
        access.context,
        access.user.id,
        ministryId,
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    try {
      const result = await db
        .prepare(
          `INSERT INTO ministerio_funcoes
           (comunidade_id, ministerio_id, nome, descricao, criado_por)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          access.context.comunidadeId,
          ministryId,
          parsed.nome,
          parsed.descricao,
          access.user.id,
        )
        .run();
      await audit("MINISTERIO_V46_FUNCAO_CRIADA", {
        ministerioId: ministryId,
        funcaoId: Number(result.meta.last_row_id),
      });
      return Response.json({ id: Number(result.meta.last_row_id) }, { status: 201 });
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        return Response.json(
          { error: "Essa função já existe neste ministério." },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  if (action === "CRIAR_MODELO") {
    const parsed = parseScheduleTemplatePayload(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    if (
      !(await canManageMinistry(
        db,
        access.context,
        access.user.id,
        parsed.ministerioId,
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    try {
      const result = await db
        .prepare(
          `INSERT INTO ministerio_modelos_escala
           (comunidade_id, ministerio_id, nome, titulo, duracao_minutos,
            local, observacoes, checklist_modelo, campos_personalizados,
            criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          access.context.comunidadeId,
          parsed.ministerioId,
          parsed.nome,
          parsed.titulo,
          parsed.duracaoMinutos,
          parsed.local,
          parsed.observacoes,
          JSON.stringify(parsed.checklist),
          JSON.stringify(parsed.camposPersonalizados),
          access.user.id,
        )
        .run();
      await audit("MINISTERIO_V46_MODELO_CRIADO", {
        ministerioId: parsed.ministerioId,
        modeloId: Number(result.meta.last_row_id),
      });
      return Response.json({ id: Number(result.meta.last_row_id) }, { status: 201 });
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        return Response.json(
          { error: "Já existe um modelo com esse nome neste ministério." },
          { status: 409 },
        );
      }
      throw error;
    }
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
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("schedules.view");
  if ("error" in access) return access.error;
  const payload = (((await request.json().catch(() => null)) ?? {})) as Record<string, unknown>;
  const action = cleanAction(payload.acao);
  const db = getD1();

  if (action === "ATUALIZAR_CHECKLIST") {
    const parsed = parseMinistryChecklistUpdate(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const item = await db
      .prepare(
        `SELECT ci.id, ci.escala_id, d.usuario_id
         FROM ministerio_checklist_itens ci
         LEFT JOIN escala_designacoes d
           ON d.id = ci.designacao_id
          AND d.comunidade_id = ci.comunidade_id
         WHERE ci.id = ? AND ci.comunidade_id = ?`,
      )
      .bind(parsed.itemId, access.context.comunidadeId)
      .first<{ id: number; escala_id: number; usuario_id: number | null }>();
    if (!item) {
      return Response.json({ error: "Item não encontrado." }, { status: 404 });
    }
    const canManage = await canManageSchedule(
      db,
      access.context,
      access.user.id,
      Number(item.escala_id),
    );
    if (!canManage && Number(item.usuario_id) !== Number(access.user.id)) {
      return Response.json(
        { error: "Você só pode concluir itens atribuídos a você." },
        { status: 403 },
      );
    }
    await db
      .prepare(
        `UPDATE ministerio_checklist_itens
         SET status = ?, observacao = ?, atualizado_por = ?,
           atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(
        parsed.status,
        parsed.observacao,
        access.user.id,
        parsed.itemId,
        access.context.comunidadeId,
      )
      .run();
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "MINISTERIO_V46_CHECKLIST_ATUALIZADO",
      "SUCESSO",
      {
        itemId: parsed.itemId,
        escalaId: Number(item.escala_id),
        status: parsed.status,
      },
    );
    return Response.json({ ok: true });
  }

  if (action === "ATUALIZAR_FUNCAO") {
    const id = positiveInteger(payload.id);
    const parsed = parseCustomFunctionPayload(payload);
    if (!id) {
      return Response.json(
        { error: "Função inválida." },
        { status: 400 },
      );
    }
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const row = await db
      .prepare(
        `SELECT ministerio_id FROM ministerio_funcoes
         WHERE id = ? AND comunidade_id = ? AND ativa = 1`,
      )
      .bind(id, access.context.comunidadeId)
      .first<{ ministerio_id: number }>();
    if (
      !row ||
      !(await canManageMinistry(
        db,
        access.context,
        access.user.id,
        Number(row.ministerio_id),
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    try {
      await db
        .prepare(
          `UPDATE ministerio_funcoes
           SET nome = ?, descricao = ?, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(
          parsed.nome,
          parsed.descricao,
          id,
          access.context.comunidadeId,
        )
        .run();
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        return Response.json(
          { error: "Essa função já existe neste ministério." },
          { status: 409 },
        );
      }
      throw error;
    }
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "MINISTERIO_V46_FUNCAO_ATUALIZADA",
      "SUCESSO",
      { id, ministerioId: Number(row.ministerio_id) },
    );
    return Response.json({ ok: true });
  }

  if (action === "ATUALIZAR_MODELO") {
    const id = positiveInteger(payload.id);
    const parsed = parseScheduleTemplatePayload(payload);
    if (!id) {
      return Response.json(
        { error: "Modelo inválido." },
        { status: 400 },
      );
    }
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const row = await db
      .prepare(
        `SELECT ministerio_id, versao FROM ministerio_modelos_escala
         WHERE id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(id, access.context.comunidadeId)
      .first<{ ministerio_id: number; versao: number }>();
    if (
      !row ||
      Number(row.ministerio_id) !== parsed.ministerioId ||
      !(await canManageMinistry(
        db,
        access.context,
        access.user.id,
        parsed.ministerioId,
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    try {
      await db
        .prepare(
          `UPDATE ministerio_modelos_escala
           SET nome = ?, titulo = ?, duracao_minutos = ?, local = ?,
             observacoes = ?, checklist_modelo = ?,
             campos_personalizados = ?, versao = versao + 1,
             atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(
          parsed.nome,
          parsed.titulo,
          parsed.duracaoMinutos,
          parsed.local,
          parsed.observacoes,
          JSON.stringify(parsed.checklist),
          JSON.stringify(parsed.camposPersonalizados),
          id,
          access.context.comunidadeId,
        )
        .run();
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        return Response.json(
          { error: "Já existe um modelo com esse nome neste ministério." },
          { status: 409 },
        );
      }
      throw error;
    }
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "MINISTERIO_V46_MODELO_ATUALIZADO",
      "SUCESSO",
      {
        id,
        ministerioId: parsed.ministerioId,
        versaoAnterior: Number(row.versao),
        versaoNova: Number(row.versao) + 1,
      },
    );
    return Response.json({ ok: true, versao: Number(row.versao) + 1 });
  }

  if (
    action === "DESATIVAR_FUNCAO" ||
    action === "DESATIVAR_MODELO" ||
    action === "EXCLUIR_FUNCAO" ||
    action === "EXCLUIR_MODELO"
  ) {
    const id = positiveInteger(payload.id);
    if (!id) {
      return Response.json({ error: "Registro inválido." }, { status: 400 });
    }
    const table = action.endsWith("FUNCAO")
      ? "ministerio_funcoes"
      : "ministerio_modelos_escala";
    const row = await db
      .prepare(
        `SELECT ministerio_id FROM ${table}
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(id, access.context.comunidadeId)
      .first<{ ministerio_id: number }>();
    if (
      !row ||
      !(await canManageMinistry(
        db,
        access.context,
        access.user.id,
        Number(row.ministerio_id),
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    const deleting = action.startsWith("EXCLUIR_");
    if (deleting) {
      await db
        .prepare(`DELETE FROM ${table} WHERE id = ? AND comunidade_id = ?`)
        .bind(id, access.context.comunidadeId)
        .run();
    } else {
      const activeField = action === "DESATIVAR_FUNCAO" ? "ativa" : "ativo";
      await db
        .prepare(
          `UPDATE ${table}
           SET ${activeField} = 0, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(id, access.context.comunidadeId)
        .run();
    }
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      deleting
        ? action.endsWith("FUNCAO")
          ? "MINISTERIO_V472_FUNCAO_EXCLUIDA"
          : "MINISTERIO_V472_MODELO_EXCLUIDO"
        : action === "DESATIVAR_FUNCAO"
          ? "MINISTERIO_V46_FUNCAO_DESATIVADA"
          : "MINISTERIO_V46_MODELO_DESATIVADO",
      "SUCESSO",
      { id, ministerioId: Number(row.ministerio_id) },
    );
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Ação inválida." }, { status: 400 });
}

function parseList(value: unknown) {
  try {
    const list = JSON.parse(String(value || "[]"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function cleanLibraryTitle(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function ensureLibraryItem(
  db: ReturnType<typeof getD1>,
  comunidadeId: number,
  ministerioId: number,
  titulo: string,
  usuarioId: number,
) {
  const existing = await db
    .prepare(
      `SELECT id FROM ministerio_biblioteca_itens
       WHERE comunidade_id = ? AND ministerio_id = ? AND ativo = 1
         AND titulo = ? COLLATE NOCASE
       LIMIT 1`,
    )
    .bind(comunidadeId, ministerioId, titulo)
    .first<{ id: number }>();
  if (existing) return Number(existing.id);
  const created = await db
    .prepare(
      `INSERT INTO ministerio_biblioteca_itens
       (comunidade_id, ministerio_id, titulo, ativo, criado_por)
       VALUES (?, ?, ?, 1, ?)`,
    )
    .bind(comunidadeId, ministerioId, titulo, usuarioId)
    .run();
  return Number(created.meta.last_row_id);
}
