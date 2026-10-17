import { getD1 } from "../../../../../db";
import { requireTenantPermission } from "../../../../lib/tenant";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { visitorCustomFields } from "../../../../lib/visitor-custom-fields";
import { CUSTOM_FIELD_TYPES, MAX_CUSTOM_FIELDS, customFieldNameIssue, normalizeColumn } from "../../../../lib/visitor-spreadsheet";

export async function GET() {
  const access = await requireTenantPermission("visitors.view");
  if ("error" in access) return access.error;
  return Response.json({ campos:await visitorCustomFields(getD1(), access.context.comunidadeId), canManage:access.context.isOwner || access.context.permissions.includes("visitor.categories.manage") }, { headers:{ "Cache-Control":"no-store" } });
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("visitors.create");
  if ("error" in access) return access.error;
  if (!access.context.isOwner && !access.context.permissions.includes("visitor.categories.manage")) return Response.json({ error:"Criar campos do cadastro exige permissão de gestão de Visitantes." }, { status:403 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error:"Solicitação inválida." }, { status:400 }); }
  if (!Array.isArray(body?.campos) || !body.campos.length || body.campos.length > MAX_CUSTOM_FIELDS) return Response.json({ error:`Envie de 1 a ${MAX_CUSTOM_FIELDS} campos.` }, { status:400 });
  const fields = body.campos.map((item: { nome?: unknown; tipo?: unknown } | null) => ({ nome:typeof item?.nome === "string" ? item.nome.trim() : "", tipo:typeof item?.tipo === "string" ? item.tipo : "" }));
  const db = getD1(), communityId = access.context.comunidadeId;
  const existing = await visitorCustomFields(db, communityId);
  const keys = new Set<string>();
  for (const field of fields) {
    const issue = customFieldNameIssue(field.nome);
    if (issue || !Object.hasOwn(CUSTOM_FIELD_TYPES, field.tipo)) return Response.json({ error:issue || "Tipo de campo inválido." }, { status:400 });
    const key = normalizeColumn(field.nome);
    if (keys.has(key)) return Response.json({ error:`“${field.nome}” está repetido. Revise os destinos.` }, { status:400 });
    keys.add(key);
    const match = existing.find(item => item.chave === key);
    if (match && match.tipo !== field.tipo) return Response.json({ error:`“${field.nome}” já existe com outro tipo. Selecione o campo existente ou use outro nome.` }, { status:409 });
  }
  const missing = fields.filter((field: { nome: string }) => !existing.some(item => item.chave === normalizeColumn(field.nome)));
  if (existing.length + missing.length > MAX_CUSTOM_FIELDS) return Response.json({ error:`A comunidade pode ter até ${MAX_CUSTOM_FIELDS} campos adicionais.` }, { status:400 });
  // Unique key reuses an existing field on retry. The count guard also bounds concurrent creates.
  if (missing.length) await db.batch(missing.map((field: { nome: string; tipo: string }) => db.prepare(`INSERT INTO visitante_campos (comunidade_id, nome, chave, tipo, criado_por)
    SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM visitante_campos WHERE comunidade_id = ?) < ?
    ON CONFLICT(comunidade_id, chave) DO NOTHING`).bind(communityId, field.nome, normalizeColumn(field.nome), field.tipo, access.user.id, communityId, MAX_CUSTOM_FIELDS)));
  const saved = await visitorCustomFields(db, communityId);
  if (fields.some((field: { nome: string; tipo: string }) => !saved.some(item => item.chave === normalizeColumn(field.nome) && item.tipo === field.tipo))) return Response.json({ error:"Os campos mudaram durante a revisão. Reabra a importação para conferir os destinos." }, { status:409 });
  await recordTenantAudit(db, access.context, access.user.id, "VISITANTES_CAMPOS_DEFINIDOS", "SUCESSO", { campos: saved.filter(item => keys.has(item.chave)).map(item => item.id) });
  return Response.json({ campos:saved }, { status:201, headers:{ "Cache-Control":"no-store" } });
}
