import { getD1 } from "../../../../db";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

const TYPES = new Set(["WHATSAPP", "TELEFONE", "PRESENCIAL", "EMAIL", "OUTRO"]);

export async function GET(request: Request) {
  const access = await requireTenantPermission("followups.view");
  if ("error" in access) return access.error;
  const visitorId = Number(
    new URL(request.url).searchParams.get("visitanteId") || 0,
  );
  if (!Number.isInteger(visitorId) || visitorId <= 0) {
    return Response.json({ error: "Visitante inválido." }, { status: 400 });
  }
  const result = await getD1()
    .prepare(
      `SELECT a.id, a.visitante_id, a.tipo, a.resultado, a.descricao,
        a.proximo_contato, a.criado_em, v.nome_completo AS visitante_nome
      FROM acompanhamentos a
      JOIN visitantes v
        ON v.id = a.visitante_id
       AND v.comunidade_id = a.comunidade_id
       AND v.ativo = 1
       AND v.escopo_confirmado = 1
      WHERE a.visitante_id = ?
        AND a.comunidade_id = ?
        AND a.escopo_confirmado = 1
      ORDER BY a.id DESC
      LIMIT 50`,
    )
    .bind(visitorId, access.context.comunidadeId)
    .all();
  return Response.json(
    { acompanhamentos: result.results },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("followups.manage");
  if ("error" in access) return access.error;
  const payload = (await request.json()) as Record<string, string | number | null>;
  const visitorId = Number(payload.visitanteId || 0);
  const tipo = String(payload.tipo || "WHATSAPP").trim().toUpperCase();
  const resultado = String(payload.resultado || "").trim().slice(0, 160);
  const descricao = String(payload.descricao || "").trim().slice(0, 1500);
  const proximoContato = String(payload.proximoContato || "").trim().slice(0, 10);
  if (
    !Number.isInteger(visitorId) ||
    visitorId <= 0 ||
    !TYPES.has(tipo) ||
    !resultado ||
    (proximoContato && !/^\d{4}-\d{2}-\d{2}$/.test(proximoContato))
  ) {
    return Response.json({ error: "Dados do acompanhamento inválidos." }, { status: 400 });
  }
  const db = getD1();
  const visitor = await db
    .prepare(
      `SELECT id FROM visitantes
      WHERE id = ? AND comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1`,
    )
    .bind(visitorId, access.context.comunidadeId)
    .first<{ id: number }>();
  if (!visitor) {
    return Response.json({ error: "Visitante não encontrado." }, { status: 404 });
  }
  const result = await db
    .prepare(
      `INSERT INTO acompanhamentos
      (comunidade_id, visitante_id, responsavel_email, tipo, resultado,
       descricao, proximo_contato, escopo_confirmado)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      access.context.comunidadeId,
      visitorId,
      access.user.email,
      tipo,
      resultado,
      descricao || null,
      proximoContato || null,
    )
    .run();
  await db
    .prepare(
      `UPDATE visitantes SET status = 'EM_ACOMPANHAMENTO',
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1`,
    )
    .bind(visitorId, access.context.comunidadeId)
    .run();
  const followupId = Number(result.meta.last_row_id);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "ACOMPANHAMENTO_V45_CRIADO",
    "SUCESSO",
    { acompanhamentoId: followupId, visitanteId: visitorId, tipo },
  );
  return Response.json({ id: followupId }, { status: 201 });
}
