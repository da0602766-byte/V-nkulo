import { getD1 } from "../../../../../db";
import { requireTenantPermission } from "../../../../lib/tenant";
import { readParkingContext } from "../../../../lib/parking-context";

export async function GET(request: Request) {
  const access = await requireTenantPermission("parking.reserve");
  if ("error" in access) return access.error;
  const db = getD1();
  const config = await db.prepare(`SELECT ativo,nome_modulo,cor_destaque,atualizado_em FROM estacionamento_configuracoes WHERE comunidade_id=?`)
    .bind(access.context.comunidadeId).first<Record<string, unknown>>();
  if (!config?.ativo) return Response.json({ error: "O módulo de estacionamento está desativado nesta comunidade." }, { status: 423 });
  const context = await readParkingContext(db, access.context.comunidadeId, access.user.id, new URL(request.url));
  if ("error" in context) return Response.json({ error: context.error }, { status: context.status });
  return Response.json({
    ...context,
    config: { ...config, responsavel: null, responsavelUsuarioId: null, instrucoes: "", atualizado_por_nome: null },
    movimentacoes: [], ocorrencias: [], availableUsers: [], ministryMembers: [],
    operator: { id: access.user.id, nome: access.user.nome, email: access.user.email, papel: access.context.papel, origemAcesso: "MEMBRO", escala: null },
    permissions: access.context.permissions.filter(item => item.startsWith("parking.")),
  }, { headers: { "Cache-Control": "no-store" } });
}
