import type { getD1 } from "../../db";
import { customFieldValue, readCustomValues, type VisitorCustomField } from "./visitor-spreadsheet";

export async function visitorCustomFields(db: ReturnType<typeof getD1>, communityId: number) {
  const result = await db.prepare("SELECT id, nome, chave, tipo FROM visitante_campos WHERE comunidade_id = ? ORDER BY id").bind(communityId).all<VisitorCustomField>();
  return result.results;
}

// A partial edit preserves fields omitted by the caller. Empty values explicitly clear a field.
export async function validateVisitorCustomValues(db: ReturnType<typeof getD1>, communityId: number, submitted: unknown, previous: unknown = "{}") {
  const values = readCustomValues(previous);
  if (submitted === undefined) return { json:JSON.stringify(values) };
  let input: unknown = submitted;
  if (typeof input === "string") {
    if (input.length > 120000) return { error:"Os campos adicionais excedem o limite de tamanho." };
    try { input = JSON.parse(input); } catch { return { error:"Campos adicionais inválidos." }; }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error:"Campos adicionais inválidos." };
  const fields = await visitorCustomFields(db, communityId);
  for (const [key, raw] of Object.entries(input)) {
    const field = fields.find(item => String(item.id) === key);
    if (!field) return { error:"Um campo adicional não pertence à comunidade ativa. Atualize a página." };
    const parsed = customFieldValue(raw, field.tipo);
    if (parsed.error) return { error:`${field.nome}: ${parsed.error}.` };
    if (parsed.value === "") delete values[key]; else values[key] = parsed.value;
  }
  const json = JSON.stringify(values);
  return json.length > 120000 ? { error:"Os campos adicionais excedem o limite de tamanho." } : { json };
}
