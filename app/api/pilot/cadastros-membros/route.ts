import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { getActiveTenantContext } from "../../../lib/tenant";
import { recordTenantAudit } from "../../../lib/tenant-audit";

type Row = Record<string, unknown>;

export async function GET() {
  const access = await requireCommunityOwner();
  if ("error" in access) return access.error;
  const db = getD1();
  await purgeInactiveLinks(db, access.user.id);
  const links = await db
    .prepare(
      `SELECT l.id, l.token, l.titulo, l.abre_em, l.fecha_em, l.status, l.criado_em, l.auto_excluir,
        origem.nome AS comunidade_origem_nome,
        CASE
          WHEN l.status != 'ATIVO' THEN 'CANCELADO'
          WHEN datetime('now') < datetime(l.abre_em) THEN 'AGUARDANDO'
          WHEN datetime('now') >= datetime(l.fecha_em) THEN 'ENCERRADO'
          ELSE 'ABERTO'
        END AS estado,
        COUNT(cadastro.id) AS total_cadastros
       FROM links_cadastro_membros l
       JOIN comunidades origem
         ON origem.id = l.comunidade_origem_id
        AND origem.proprietario_usuario_id = l.criado_por
       LEFT JOIN cadastros_membros_temporarios cadastro
         ON cadastro.link_id = l.id
       WHERE l.criado_por = ?
       GROUP BY l.id
       ORDER BY l.criado_em DESC, l.id DESC
       LIMIT 100`,
    )
    .bind(access.user.id)
    .all<Row>();
  const submissions = await db
    .prepare(
      `SELECT cadastro.id, cadastro.link_id, cadastro.nome_completo,
        cadastro.email, cadastro.cpf, cadastro.cep, cadastro.data_nascimento,
        cadastro.uncao, cadastro.foto_url, cadastro.ministerio_dados,
        cadastro.status, cadastro.enviado_em,
        comunidade.nome AS comunidade_nome,
        ministerio.nome AS ministerio_nome
       FROM cadastros_membros_temporarios cadastro
       JOIN links_cadastro_membros link
         ON link.id = cadastro.link_id
        AND link.criado_por = ?
       JOIN comunidades comunidade
         ON comunidade.id = cadastro.comunidade_id
        AND comunidade.proprietario_usuario_id = link.criado_por
       JOIN ministerios_comunidade ministerio
         ON ministerio.id = cadastro.ministerio_id
        AND ministerio.comunidade_id = cadastro.comunidade_id
       ORDER BY cadastro.enviado_em DESC, cadastro.id DESC
       LIMIT 250`,
    )
    .bind(access.user.id)
    .all<Row>();
  return Response.json(
    {
      links: links.results.map((row) => ({
        id: Number(row.id),
        path: `/cadastro-membro/${String(row.token || "")}`,
        title: String(row.titulo || "Cadastro de membros"),
        opensAt: String(row.abre_em),
        closesAt: String(row.fecha_em),
        status: String(row.status),
        state: String(row.estado),
        originCommunityName: String(row.comunidade_origem_nome || ""),
        totalSubmissions: Number(row.total_cadastros || 0),
        autoDelete: Number(row.auto_excluir ?? 0) === 1,
      })),
      submissions: submissions.results.map((row) => ({
        id: Number(row.id),
        linkId: Number(row.link_id),
        fullName: String(row.nome_completo || ""),
        email: String(row.email || ""),
        cpf: String(row.cpf || ""),
        cep: String(row.cep || ""),
        birthDate: String(row.data_nascimento || ""),
        anointing: String(row.uncao || ""),
        photoUrl: String(row.foto_url || ""),
        ministryData: parseObject(row.ministerio_dados),
        status: String(row.status || "PENDENTE"),
        submittedAt: String(row.enviado_em || ""),
        communityName: String(row.comunidade_nome || ""),
        ministryName: String(row.ministerio_nome || ""),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireCommunityOwner();
  if ("error" in access) return access.error;
  const body = await safeJson(request);
  const title = String(body.title || "Cadastro de membros").trim().slice(0, 100);
  const opensAt = parseDate(body.opensAt);
  const closesAt = parseDate(body.closesAt);
  const autoDelete = body.autoDelete === true;
  if (title.length < 3 || !opensAt || !closesAt || closesAt <= opensAt) {
    return Response.json(
      { error: "Informe título, abertura e fechamento válidos." },
      { status: 400 },
    );
  }
  if (closesAt.getTime() - opensAt.getTime() < 5 * 60_000) {
    return Response.json(
      { error: "O formulário precisa permanecer aberto por pelo menos 5 minutos." },
      { status: 400 },
    );
  }
  const db = getD1();
  const token = crypto.randomUUID();
  const result = await db
    .prepare(
      `INSERT INTO links_cadastro_membros
       (comunidade_origem_id, criado_por, token, titulo, abre_em, fecha_em, status, auto_excluir)
       SELECT c.id, ?, ?, ?, ?, ?, 'ATIVO', ?
       FROM comunidades c
       WHERE c.id = ? AND c.proprietario_usuario_id = ? AND c.status = 'ATIVA'`,
    )
    .bind(
      access.user.id,
      token,
      title,
      opensAt.toISOString(),
      closesAt.toISOString(),
      autoDelete ? 1 : 0,
      access.context.comunidadeId,
      access.user.id,
    )
    .run();
  if (!Number(result.meta.changes)) {
    return Response.json(
      { error: "Somente o proprietário real pode criar este link." },
      { status: 403 },
    );
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "LINK_CADASTRO_MEMBROS_CRIADO",
    "SUCESSO",
    { linkId: Number(result.meta.last_row_id), opensAt, closesAt },
  );
  return Response.json({
    id: Number(result.meta.last_row_id),
    token,
    path: `/cadastro-membro/${token}`,
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await requireCommunityOwner();
  if ("error" in access) return access.error;
  const body = await safeJson(request);
  const id = Number(body.id || 0);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Link inválido." }, { status: 400 });
  }
  const action = String(body.action || "UPDATE").toUpperCase();
  const db = getD1();
  if (action === "CANCEL") {
    const result = await db
      .prepare(
        `UPDATE links_cadastro_membros
         SET status = CASE WHEN auto_excluir = 1 THEN 'EXCLUIR' ELSE 'CANCELADO' END,
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND criado_por = ?
           AND EXISTS (
             SELECT 1 FROM comunidades c
             WHERE c.id = links_cadastro_membros.comunidade_origem_id
               AND c.proprietario_usuario_id = links_cadastro_membros.criado_por
           )`,
      )
      .bind(id, access.user.id)
      .run();
    if (!Number(result.meta.changes)) {
      return Response.json({ error: "Link não encontrado." }, { status: 404 });
    }
    await db.prepare("DELETE FROM links_cadastro_membros WHERE id = ? AND criado_por = ? AND status = 'EXCLUIR'").bind(id, access.user.id).run();
    await recordTenantAudit(db, access.context, access.user.id, "LINK_CADASTRO_MEMBROS_CANCELADO", "SUCESSO", { linkId: id });
    return Response.json({ cancelled: true });
  }
  const title = String(body.title || "").trim().slice(0, 100);
  const opensAt = parseDate(body.opensAt);
  const closesAt = parseDate(body.closesAt);
  const autoDelete = body.autoDelete === true;
  if (title.length < 3 || !opensAt || !closesAt || closesAt <= opensAt) {
    return Response.json(
      { error: "Informe título, abertura e fechamento válidos." },
      { status: 400 },
    );
  }
  const result = await db
    .prepare(
      `UPDATE links_cadastro_membros
       SET titulo = ?, abre_em = ?, fecha_em = ?, auto_excluir = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND criado_por = ? AND status = 'ATIVO'
         AND EXISTS (
           SELECT 1 FROM comunidades c
           WHERE c.id = links_cadastro_membros.comunidade_origem_id
             AND c.proprietario_usuario_id = links_cadastro_membros.criado_por
         )`,
    )
    .bind(title, opensAt.toISOString(), closesAt.toISOString(), autoDelete ? 1 : 0, id, access.user.id)
    .run();
  if (!Number((result.meta as { changes?: number }).changes || 0)) {
    return Response.json({ error: "Link ativo não encontrado." }, { status: 404 });
  }
  await recordTenantAudit(db, access.context, access.user.id, "LINK_CADASTRO_MEMBROS_ATUALIZADO", "SUCESSO", { linkId: id, opensAt, closesAt });
  return Response.json({ updated: true });
}

export async function DELETE(request: Request) {
  const access = await requireCommunityOwner();
  if ("error" in access) return access.error;
  const body = await safeJson(request);
  const id = Number(body.id || 0);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Link inválido." }, { status: 400 });
  }

  const db = getD1();
  const link = await db
    .prepare(
      `SELECT l.id, l.titulo, l.status, l.fecha_em,
        CASE
          WHEN l.status = 'CANCELADO' OR datetime(l.fecha_em) <= datetime('now') THEN 1
          ELSE 0
        END AS pode_excluir,
        COUNT(cadastro.id) AS total_cadastros
       FROM links_cadastro_membros l
       LEFT JOIN cadastros_membros_temporarios cadastro
         ON cadastro.link_id = l.id
       WHERE l.id = ? AND l.criado_por = ?
         AND EXISTS (
           SELECT 1 FROM comunidades c
           WHERE c.id = l.comunidade_origem_id
             AND c.proprietario_usuario_id = l.criado_por
         )
       GROUP BY l.id
       LIMIT 1`,
    )
    .bind(id, access.user.id)
    .first<Row>();
  if (!link) {
    return Response.json({ error: "Link não encontrado." }, { status: 404 });
  }
  if (Number(link.pode_excluir || 0) !== 1) {
    return Response.json(
      { error: "Somente links encerrados ou cancelados podem ser excluídos." },
      { status: 409 },
    );
  }

  const result = await db
    .prepare(
      `DELETE FROM links_cadastro_membros
       WHERE id = ? AND criado_por = ?
         AND (status = 'CANCELADO' OR datetime(fecha_em) <= datetime('now'))`,
    )
    .bind(id, access.user.id)
    .run();
  if (!Number((result.meta as { changes?: number }).changes || 0)) {
    return Response.json(
      { error: "O link mudou de estado. Atualize a página e tente novamente." },
      { status: 409 },
    );
  }

  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "LINK_CADASTRO_MEMBROS_EXCLUIDO",
    "SUCESSO",
    {
      linkId: id,
      title: String(link.titulo || ""),
      previousStatus: String(link.status || ""),
      closesAt: String(link.fecha_em || ""),
      totalSubmissions: Number(link.total_cadastros || 0),
    },
  );
  return Response.json({ deleted: true });
}

async function requireCommunityOwner() {
  const user = await getSessionUser();
  if (!user) {
    return { error: Response.json({ error: "Faça login para continuar." }, { status: 401 }) } as const;
  }
  const tenant = await getActiveTenantContext(user);
  if (!tenant.context) {
    return { error: Response.json({ error: "Selecione uma comunidade." }, { status: 409 }) } as const;
  }
  if (!tenant.context.isCommunityOwner) {
    return { error: Response.json({ error: "Somente o proprietário da comunidade pode administrar links de cadastro." }, { status: 403 }) } as const;
  }
  return { user, context: tenant.context } as const;
}

async function purgeInactiveLinks(db: ReturnType<typeof getD1>, ownerId: number) {
  await db
    .prepare(
      `DELETE FROM links_cadastro_membros
       WHERE criado_por = ?
         AND (
           (status = 'CANCELADO' OR datetime(fecha_em) <= datetime('now'))
           AND auto_excluir = 1
         )`,
    )
    .bind(ownerId)
    .run();
}

function parseDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

async function safeJson(request: Request) {
  try {
    return (await request.json()) as Row;
  } catch {
    return {} as Row;
  }
}

function parseObject(value: unknown) {
  try {
    const result = JSON.parse(String(value || "{}"));
    return result && typeof result === "object" && !Array.isArray(result) ? result : {};
  } catch {
    return {};
  }
}
