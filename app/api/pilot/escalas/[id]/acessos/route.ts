import { getD1 } from "../../../../../../db";
import { canManageSchedule } from "../../../../../lib/ministry-access";
import { requireTenantPermission } from "../../../../../lib/tenant";
import {
  createOpaqueTemporaryToken,
  getTemporaryAccessById,
  hashTemporaryToken,
  isTemporaryAccessResource,
  recordTemporaryAccessAudit,
  temporaryResourceLabel,
} from "../../../../../lib/temporary-access";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const access = await requireTenantPermission("schedules.view");
  if ("error" in access) return access.error;
  const scheduleId = Number((await context.params).id);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return Response.json({ error: "Escala inválida." }, { status: 400 });
  }
  const db = getD1();
  if (
    !(await canManageSchedule(
      db,
      access.context,
      access.user.id,
      scheduleId,
    ))
  ) {
    return Response.json(
      { error: "Você não administra esta escala." },
      { status: 403 },
    );
  }
  const rows = await db
    .prepare(
      `SELECT id FROM acessos_temporarios
       WHERE comunidade_id = ? AND escala_id = ?
       ORDER BY id DESC LIMIT 100`,
    )
    .bind(access.context.comunidadeId, scheduleId)
    .all<{ id: number }>();
  const grants = (
    await Promise.all(
      rows.results.map((row) => getTemporaryAccessById(db, Number(row.id))),
    )
  ).filter(Boolean);
  return Response.json(
    {
      acessos: grants.map((grant) => ({
        id: grant!.id,
        designacaoId: grant!.designacao_id,
        beneficiarioUsuarioId: grant!.beneficiario_usuario_id,
        beneficiarioNome: grant!.beneficiario_nome,
        beneficiarioFoto: grant!.beneficiario_foto,
        funcao: grant!.funcao,
        recurso: grant!.recurso,
        recursoLabel: temporaryResourceLabel(grant!.recurso),
        iniciaEm: grant!.inicia_em,
        terminaEm: grant!.termina_em,
        status: grant!.status,
        ativadoEm: grant!.ativado_em,
        canceladoEm: grant!.cancelado_em,
        expiradoEm: grant!.expirado_em,
        criadoEm: grant!.criado_em,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, context: Context) {
  const access = await requireTenantPermission("schedules.view");
  if ("error" in access) return access.error;
  const scheduleId = Number((await context.params).id);
  const body = await safeJson(request);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0 || !body) {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const rawDesignationIds = Array.isArray(body.designacaoIds)
    ? body.designacaoIds
    : [body.designacaoId];
  const designationIds = [...new Set(rawDesignationIds.map(Number))];
  const resource = String(body.recurso || "").toUpperCase();
  const startsAt = Date.parse(String(body.iniciaEm || ""));
  const endsAt = Date.parse(String(body.terminaEm || ""));
  const invalidFields = [
    ...(designationIds.length < 1 ||
    designationIds.length > 30 ||
    designationIds.some((id) => !Number.isInteger(id) || id <= 0)
      ? ["designacaoIds"]
      : []),
    ...(!isTemporaryAccessResource(resource) ? ["recurso"] : []),
    ...(!Number.isFinite(startsAt) ? ["iniciaEm"] : []),
    ...(!Number.isFinite(endsAt) ? ["terminaEm"] : []),
    ...(Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    endsAt <= startsAt
      ? ["periodo"]
      : []),
  ];
  if (invalidFields.length) {
    return Response.json(
      {
        error: "Selecione uma ou mais pessoas, o recurso e um período válidos.",
        camposInvalidos: invalidFields,
      },
      { status: 400 },
    );
  }
  const db = getD1();
  if (
    !(await canManageSchedule(
      db,
      access.context,
      access.user.id,
      scheduleId,
    ))
  ) {
    return Response.json(
      { error: "Você não administra esta escala." },
      { status: 403 },
    );
  }
  const schedule = await db
    .prepare(
      `SELECT s.id, s.status, s.inicia_em, s.termina_em,
        m.categoria AS ministerio_categoria, m.nome AS ministerio_nome
       FROM escalas_ministerio s
       JOIN ministerios_comunidade m
         ON m.id = s.ministerio_id AND m.comunidade_id = s.comunidade_id
       WHERE s.id = ? AND s.comunidade_id = ? LIMIT 1`,
    )
    .bind(scheduleId, access.context.comunidadeId)
    .first<{
      id: number;
      status: string;
      inicia_em: string;
      termina_em: string;
      ministerio_categoria: string;
      ministerio_nome: string;
    }>();
  if (!schedule) {
    return Response.json({ error: "Escala não encontrada." }, { status: 404 });
  }
  if (schedule.status !== "PUBLICADA") {
    return Response.json(
      { error: "Publique a escala antes de autorizar acesso." },
      { status: 409 },
    );
  }
  if (endsAt <= Date.now() || endsAt - startsAt > 31 * 24 * 60 * 60 * 1000) {
    return Response.json(
      {
        error: endsAt <= Date.now()
          ? "O término da liberação precisa estar no futuro."
          : "A liberação pode durar no máximo 31 dias.",
      },
      { status: 400 },
    );
  }
  const parkingMinistry =
    schedule.ministerio_categoria === "ESTACIONAMENTO" ||
    schedule.ministerio_nome.toLocaleLowerCase("pt-BR").includes("estacionamento");
  if (resource === "ESTACIONAMENTO" && !parkingMinistry) {
    return Response.json(
      {
        error:
          "A aba Estacionamento só pode ser liberada por uma escala desse ministério.",
      },
      { status: 400 },
    );
  }
  if (resource === "ESTACIONAMENTO") {
    const parkingConfig = await db
      .prepare(
        `SELECT ativo FROM estacionamento_configuracoes
         WHERE comunidade_id = ? LIMIT 1`,
      )
      .bind(access.context.comunidadeId)
      .first<{ ativo: number }>();
    if (!Number(parkingConfig?.ativo)) {
      return Response.json(
        { error: "O módulo Estacionamento está desativado nesta comunidade." },
        { status: 409 },
      );
    }
  }
  const placeholders = designationIds.map(() => "?").join(",");
  const designationRows = await db
    .prepare(
      `SELECT d.id, d.usuario_id, d.funcao, u.nome
       FROM escala_designacoes d
       JOIN usuarios u ON u.id = d.usuario_id AND u.ativo = 1
       JOIN usuario_comunidades uc
         ON uc.usuario_id = d.usuario_id
        AND uc.comunidade_id = d.comunidade_id
        AND uc.status = 'ATIVO'
       WHERE d.id IN (${placeholders}) AND d.escala_id = ? AND d.comunidade_id = ?
         AND d.ativo = 1
         AND d.status NOT IN ('INDISPONIVEL','SUBSTITUICAO_SOLICITADA','AUSENTE')
       ORDER BY d.id`,
    )
    .bind(...designationIds, scheduleId, access.context.comunidadeId)
    .all<{ id: number; usuario_id: number; funcao: string; nome: string }>();
  if (designationRows.results.length !== designationIds.length) {
    return Response.json(
      {
        error:
          "Todas as pessoas precisam estar ativas, escaladas e vinculadas a esta comunidade.",
      },
      { status: 404 },
    );
  }
  const designationById = new Map(
    designationRows.results.map((designation) => [Number(designation.id), designation]),
  );
  const designations = designationIds.map((id) => designationById.get(id)!);

  const previous = await db
    .prepare(
      `SELECT id FROM acessos_temporarios
       WHERE comunidade_id = ? AND escala_id = ? AND recurso = ?
         AND designacao_id IN (${placeholders})
         AND status IN ('PENDENTE','AGUARDANDO_HORARIO','ATIVO')`,
    )
    .bind(
      access.context.comunidadeId,
      scheduleId,
      resource,
      ...designationIds,
    )
    .all<{ id: number }>();
  const oldGrants = (
    await Promise.all(
      previous.results.map((old) =>
        getTemporaryAccessById(db, Number(old.id), { sync: false }),
      ),
    )
  ).filter(Boolean);
  const tokenEntries = await Promise.all(
    designations.map(async (designation) => {
      const token = createOpaqueTemporaryToken();
      return { designation, token, tokenHash: await hashTemporaryToken(token) };
    }),
  );
  const status = startsAt > Date.now() ? "AGUARDANDO_HORARIO" : "ATIVO";
  const batchResults = await db.batch([
    ...oldGrants.map((oldGrant) =>
      db.prepare(
        `UPDATE acessos_temporarios
         SET status = 'CANCELADO', cancelado_por = ?,
           cancelado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ?
           AND status IN ('PENDENTE','AGUARDANDO_HORARIO','ATIVO')`,
      )
        .bind(access.user.id, oldGrant!.id, access.context.comunidadeId),
    ),
    ...tokenEntries.map(({ designation, token, tokenHash }) =>
      db.prepare(
        `INSERT INTO acessos_temporarios
         (comunidade_id, escala_id, designacao_id, beneficiario_usuario_id,
          recurso, token_hash, token_hint, inicia_em, termina_em, status,
          autorizado_por, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        access.context.comunidadeId,
        scheduleId,
        designation.id,
        designation.usuario_id,
        resource,
        tokenHash,
        token.slice(-8),
        new Date(startsAt).toISOString(),
        new Date(endsAt).toISOString(),
        status,
        access.user.id,
        access.user.id,
      ),
    ),
  ]);
  for (const oldGrant of oldGrants) {
    await recordTemporaryAccessAudit(
      db,
      oldGrant!,
      "ACESSO_TEMPORARIO_CANCELADO",
      "SUCESSO",
      access.user.id,
      { motivo: "NOVO_LINK_GERADO" },
    );
  }
  const insertResults = batchResults.slice(oldGrants.length);
  const grants = await Promise.all(
    insertResults.map((result) =>
      getTemporaryAccessById(db, Number(result.meta.last_row_id), { sync: false }),
    ),
  );
  if (grants.some((grant) => !grant)) {
    return Response.json(
      { error: "As autorizações foram criadas, mas não puderam ser consultadas." },
      { status: 500 },
    );
  }
  for (const grant of grants) {
    for (const event of [
      "ACESSO_TEMPORARIO_CRIADO",
      "ACESSO_TEMPORARIO_AUTORIZADO",
      "ACESSO_TEMPORARIO_LINK_GERADO",
    ]) {
      await recordTemporaryAccessAudit(
        db,
        grant!,
        event,
        "SUCESSO",
        access.user.id,
        { statusInicial: status, lote: grants.length > 1 },
      );
    }
  }
  const created = grants.map((grant, index) => ({
    id: grant!.id,
    token: tokenEntries[index].token,
    status,
    recurso: grant!.recurso,
    recursoLabel: temporaryResourceLabel(grant!.recurso),
    beneficiarioNome: tokenEntries[index].designation.nome,
    iniciaEm: grant!.inicia_em,
    terminaEm: grant!.termina_em,
  }));
  const first = created[0];
  return Response.json(
    {
      ...first,
      acessos: created,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

async function safeJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
