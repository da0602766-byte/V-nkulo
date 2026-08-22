import { getD1 } from "../../../../../db";
import { parseParkingConfig } from "../../../../lib/parking-validation";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

export async function GET() {
  const access = await requireTenantPermission("parking.configure");
  if ("error" in access) return access.error;
  const config = await getD1()
    .prepare(
      `SELECT ativo, nome_modulo, cor_destaque, regras
       FROM estacionamento_configuracoes
       WHERE comunidade_id = ?`,
    )
    .bind(access.context.comunidadeId)
    .first<Record<string, unknown>>();
  return Response.json(
    {
      ativo: Boolean(config?.ativo),
      nomeModulo: config?.nome_modulo || "Estacionamento",
      corDestaque: config?.cor_destaque || "#d99a32",
      ...readRules(config?.regras),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("parking.configure");
  if ("error" in access) return access.error;
  const parsed = parseParkingConfig(
    (await request.json()) as Record<string, unknown>,
  );
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const db = getD1();
  await db
    .prepare(
      `INSERT INTO estacionamento_configuracoes
       (comunidade_id, ativo, nome_modulo, cor_destaque, regras, atualizado_por)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(comunidade_id) DO UPDATE SET
         ativo = excluded.ativo,
         nome_modulo = excluded.nome_modulo,
         cor_destaque = excluded.cor_destaque,
         regras = excluded.regras,
         atualizado_por = excluded.atualizado_por,
         atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(
      access.context.comunidadeId,
      parsed.ativo ? 1 : 0,
      parsed.nomeModulo,
      parsed.corDestaque,
      JSON.stringify({
        responsavelUsuarioId: parsed.responsavelUsuarioId,
        instrucoes: parsed.instrucoes,
      }),
      access.user.id,
    )
    .run();
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    parsed.ativo
      ? "ESTACIONAMENTO_MODULO_ATIVADO"
      : "ESTACIONAMENTO_MODULO_DESATIVADO",
    "SUCESSO",
    {
      nomeModulo: parsed.nomeModulo,
      responsavelUsuarioId: parsed.responsavelUsuarioId,
    },
  );
  return Response.json(parsed);
}

function readRules(value: unknown) {
  try {
    const rules = JSON.parse(String(value || "{}"));
    return {
      responsavelUsuarioId: Number(rules.responsavelUsuarioId || 0) || null,
      instrucoes: String(rules.instrucoes || ""),
    };
  } catch {
    return { responsavelUsuarioId: null, instrucoes: "" };
  }
}
