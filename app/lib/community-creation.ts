export type CommunityCreationFieldType =
  | "text"
  | "tel"
  | "email"
  | "number"
  | "date"
  | "textarea";

export type CommunityCreationField = {
  id: string;
  label: string;
  type: CommunityCreationFieldType;
  placeholder: string;
  required: boolean;
  enabled: boolean;
};

export const DEFAULT_COMMUNITY_CREATION_FIELDS: CommunityCreationField[] = [
  {
    id: "denominacao",
    label: "Denominação ou vínculo",
    type: "text",
    placeholder: "Informe a denominação, rede ou igreja independente",
    required: true,
    enabled: true,
  },
  {
    id: "telefone_institucional",
    label: "Telefone institucional",
    type: "tel",
    placeholder: "(00) 00000-0000",
    required: true,
    enabled: true,
  },
  {
    id: "cep",
    label: "CEP",
    type: "text",
    placeholder: "00000-000",
    required: true,
    enabled: true,
  },
  {
    id: "endereco",
    label: "Endereço da sede",
    type: "text",
    placeholder: "Rua, número e bairro",
    required: true,
    enabled: true,
  },
  {
    id: "data_fundacao",
    label: "Data de fundação",
    type: "date",
    placeholder: "",
    required: false,
    enabled: true,
  },
  {
    id: "membros_estimados",
    label: "Quantidade estimada de membros",
    type: "number",
    placeholder: "0",
    required: false,
    enabled: true,
  },
];

const FIELD_TYPES = new Set<CommunityCreationFieldType>([
  "text",
  "tel",
  "email",
  "number",
  "date",
  "textarea",
]);

export function parseCommunityCreationFields(value: unknown) {
  const source = Array.isArray(value) ? value : DEFAULT_COMMUNITY_CREATION_FIELDS;
  const used = new Set<string>();
  return source.slice(0, 16).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const id = String(item.id || `campo_${index + 1}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .slice(0, 48);
    const label = String(item.label || "").trim().slice(0, 70);
    const type = String(item.type || "text") as CommunityCreationFieldType;
    if (!id || !label || used.has(id) || !FIELD_TYPES.has(type)) return [];
    used.add(id);
    return [{
      id,
      label,
      type,
      placeholder: String(item.placeholder || "").trim().slice(0, 100),
      required: item.required === true,
      enabled: item.enabled !== false,
    }];
  });
}

export function parseCommunityCreationAnswers(
  value: unknown,
  fields: CommunityCreationField[],
) {
  const source = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const result: Record<string, { label: string; value: string }> = {};
  for (const field of fields.filter((item) => item.enabled)) {
    const answer = String(source[field.id] || "").trim().slice(0, 500);
    if (field.required && !answer) {
      return { error: `Preencha o campo obrigatório: ${field.label}.` };
    }
    if (answer) result[field.id] = { label: field.label, value: answer };
  }
  return { data: result };
}
