import { getD1 } from "../../../../../db";
import {
  parseParkingSector,
  parseParkingSpaces,
} from "../../../../lib/parking-validation";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

export async function POST(request: Request) {
  const access = await requireTenantPermission("parking.configure");
  if ("error" in access) return access.error;
  const payload = (await request.json()) as Record<string, unknown>;
  const action = String(payload.action || "").toUpperCase();
  const db = getD1();

  if (action === "CRIAR_SETOR") {
    const parsed = parseParkingSector(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    try {
      const result = await db
        .prepare(
          `INSERT INTO estacionamento_setores
           (comunidade_id, nome, cor, ordem)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(
          access.context.comunidadeId,
          parsed.nome,
          parsed.cor,
          parsed.ordem,
        )
        .run();
      const setorId = Number(result.meta.last_row_id);
      await recordTenantAudit(
        db,
        access.context,
        access.user.id,
        "ESTACIONAMENTO_SETOR_CRIADO",
        "SUCESSO",
        { setorId, nome: parsed.nome, ordem: parsed.ordem },
      );
      return Response.json({ id: setorId }, { status: 201 });
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        return Response.json(
          { error: "Já existe um setor com esse nome nesta comunidade." },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  if (action === "CRIAR_VAGAS") {
    const parsed = parseParkingSpaces(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const sector = await db
      .prepare(
        `SELECT id FROM estacionamento_setores
         WHERE id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(parsed.setorId, access.context.comunidadeId)
      .first<{ id: number }>();
    if (!sector) {
      return Response.json({ error: "Setor não encontrado." }, { status: 404 });
    }
    const statements = Array.from({ length: parsed.quantidade }, (_, index) =>
      db
        .prepare(
          `INSERT INTO estacionamento_vagas
           (comunidade_id, setor_id, codigo, tipo)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(
          access.context.comunidadeId,
          parsed.setorId,
          `${parsed.prefixo}${String(index + 1).padStart(2, "0")}`,
          parsed.tipo,
        ),
    );
    try {
      await db.batch(statements);
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        return Response.json(
          { error: "Uma ou mais vagas com esse prefixo já existem." },
          { status: 409 },
        );
      }
      throw error;
    }
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "ESTACIONAMENTO_VAGAS_CRIADAS",
      "SUCESSO",
      {
        setorId: parsed.setorId,
        prefixo: parsed.prefixo,
        quantidade: parsed.quantidade,
        tipo: parsed.tipo,
      },
    );
    return Response.json({ quantidade: parsed.quantidade }, { status: 201 });
  }

  return Response.json({ error: "Ação inválida." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("parking.configure");
  if ("error" in access) return access.error;
  const payload = (await request.json()) as Record<string, unknown>;
  const action = String(payload.action || "").toUpperCase();
  const db = getD1();
  if (action === "ATUALIZAR_POSICOES") {
    const source = Array.isArray(payload.positions) ? payload.positions : [];
    const positions = source.slice(0, 500).map((item) => {
      const row = item as Record<string, unknown>;
      return {
        vagaId: Number(row.vagaId),
        x: Math.max(0, Math.round(Number(row.posicaoX) || 0)),
        y: Math.max(0, Math.round(Number(row.posicaoY) || 0)),
      };
    }).filter((item) => Number.isInteger(item.vagaId) && item.vagaId > 0);
    if (!positions.length) return Response.json({ error: "Nenhuma posição válida foi enviada." }, { status: 400 });
    await db.batch(positions.map((item) => db.prepare(`UPDATE estacionamento_vagas SET posicao_x=?,posicao_y=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=? AND comunidade_id=? AND ativo=1`).bind(item.x,item.y,item.vagaId,access.context.comunidadeId)));
    await recordTenantAudit(db,access.context,access.user.id,"ESTACIONAMENTO_LAYOUT_REORGANIZADO","SUCESSO",{quantidade:positions.length});
    return Response.json({ ok: true, quantidade: positions.length });
  }
  if (action === "ATUALIZAR_POSICAO") {
    const vagaId = Number(payload.vagaId);
    const x = Math.max(0, Math.round(Number(payload.posicaoX) || 0));
    const y = Math.max(0, Math.round(Number(payload.posicaoY) || 0));
    const result = await db.prepare(`UPDATE estacionamento_vagas SET posicao_x=?,posicao_y=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=? AND comunidade_id=? AND ativo=1`).bind(x,y,vagaId,access.context.comunidadeId).run();
    if (!result.meta.changes) return Response.json({ error: "Vaga não encontrada." }, { status: 404 });
    await recordTenantAudit(db,access.context,access.user.id,"ESTACIONAMENTO_VAGA_REPOSICIONADA","SUCESSO",{vagaId,posicaoX:x,posicaoY:y});
    return Response.json({ ok: true });
  }
  if (action !== "ATUALIZAR_SETOR") {
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  }
  const setorId = Number(payload.setorId);
  const parsed = parseParkingSector(payload);
  if (!Number.isInteger(setorId) || setorId <= 0 || "error" in parsed) {
    return Response.json(
      { error: "error" in parsed ? parsed.error : "Setor inválido." },
      { status: 400 },
    );
  }
  const sector = await db
    .prepare(
      `SELECT id FROM estacionamento_setores
       WHERE id = ? AND comunidade_id = ? AND ativo = 1`,
    )
    .bind(setorId, access.context.comunidadeId)
    .first<{ id: number }>();
  if (!sector) {
    return Response.json({ error: "Setor não encontrado." }, { status: 404 });
  }
  try {
    await db
      .prepare(
        `UPDATE estacionamento_setores
         SET nome = ?, cor = ?, ordem = ?
         WHERE id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(
        parsed.nome,
        parsed.cor,
        parsed.ordem,
        setorId,
        access.context.comunidadeId,
      )
      .run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      return Response.json(
        { error: "Já existe um setor com esse nome nesta comunidade." },
        { status: 409 },
      );
    }
    throw error;
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "ESTACIONAMENTO_SETOR_ATUALIZADO",
    "SUCESSO",
    { setorId, nome: parsed.nome, ordem: parsed.ordem },
  );
  return Response.json({ ok: true });
}
