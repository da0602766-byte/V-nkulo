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
  const scene = await db.prepare('SELECT revisao FROM estacionamento_cenas WHERE comunidade_id=?').bind(access.context.comunidadeId).first<{revisao:number}>();
  if (scene?.revisao) return Response.json({error:'Use o editor de cenário e publique as alterações para atualizar este mapa.'},{status:409});

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
  const scene = await db.prepare('SELECT revisao FROM estacionamento_cenas WHERE comunidade_id=?').bind(access.context.comunidadeId).first<{revisao:number}>();
  if (scene?.revisao) return Response.json({error:'Use o editor de cenário e publique as alterações para atualizar este mapa.'},{status:409});
  if (action === "ATUALIZAR_POSICOES" || action === "ATUALIZAR_POSICAO") {
    const source = action === "ATUALIZAR_POSICAO" ? [payload] : Array.isArray(payload.positions) ? payload.positions : [];
    const positions = source.map(item => {
      const row = item as Record<string,unknown>;
      return { id:Number(row.vagaId), x:Number(row.posicaoX), y:Number(row.posicaoY), px:Number(row.previousX), py:Number(row.previousY) };
    });
    if (!positions.length || positions.length>500 || new Set(positions.map(p=>p.id)).size!==positions.length || positions.some(p=>!Number.isInteger(p.id)||p.id<=0||[p.x,p.y,p.px,p.py].some(n=>!Number.isInteger(n)||n<0||n>10000))) {
      return Response.json({error:"Posições inválidas. Atualize o mapa antes de salvar."},{status:400});
    }
    const updated = await db.prepare(`WITH input AS MATERIALIZED (
      SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.x') AS x,json_extract(value,'$.y') AS y,json_extract(value,'$.px') AS px,json_extract(value,'$.py') AS py FROM json_each(?)
    ), guard AS MATERIALIZED (
      SELECT (SELECT COUNT(*) FROM estacionamento_vagas v JOIN input i ON i.id=v.id WHERE v.comunidade_id=? AND v.ativo=1 AND v.posicao_x=i.px AND v.posicao_y=i.py)=(SELECT COUNT(*) FROM input)
      AND NOT EXISTS(SELECT 1 FROM input i JOIN estacionamento_vagas v ON v.id=i.id
        JOIN estacionamento_vagas other ON other.comunidade_id=v.comunidade_id AND other.setor_id=v.setor_id AND other.id<>v.id AND other.ativo=1
        LEFT JOIN input j ON j.id=other.id WHERE v.comunidade_id=? AND abs(i.x-COALESCE(j.x,other.posicao_x))<64 AND abs(i.y-COALESCE(j.y,other.posicao_y))<56) AS ok
    ) UPDATE estacionamento_vagas SET posicao_x=(SELECT x FROM input WHERE input.id=estacionamento_vagas.id),posicao_y=(SELECT y FROM input WHERE input.id=estacionamento_vagas.id),atualizado_em=CURRENT_TIMESTAMP
      WHERE comunidade_id=? AND id IN (SELECT id FROM input) AND (SELECT ok FROM guard) RETURNING id`)
      .bind(JSON.stringify(positions),access.context.comunidadeId,access.context.comunidadeId,access.context.comunidadeId).all<{id:number}>();
    if (updated.results.length!==positions.length) return Response.json({error:"O mapa foi alterado por outro gestor, a vaga não está disponível para edição ou há sobreposição. Atualize e confira as posições."},{status:409});
    await recordTenantAudit(db,access.context,access.user.id,"ESTACIONAMENTO_LAYOUT_REORGANIZADO","SUCESSO",{quantidade:positions.length});
    return Response.json({ok:true,quantidade:positions.length});
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
  if (typeof payload.previousNome !== "string" || typeof payload.previousCor !== "string" || !Number.isInteger(Number(payload.previousOrdem))) return Response.json({error:"Atualize o setor antes de editar."},{status:400});
  try {
    const updated = await db
      .prepare(
        `UPDATE estacionamento_setores
         SET nome = ?, cor = ?, ordem = ?
         WHERE id = ? AND comunidade_id = ? AND ativo = 1 AND nome=? AND cor=? AND ordem=?`,
      )
      .bind(
        parsed.nome,
        parsed.cor,
        parsed.ordem,
        setorId,
        access.context.comunidadeId,
        payload.previousNome, payload.previousCor, Number(payload.previousOrdem),
      )
      .run();
    if (!updated.meta.changes) return Response.json({error:"O setor foi alterado por outro gestor. Atualize antes de salvar."},{status:409});
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
