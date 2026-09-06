export type LaboratoryNode = {
  id: string;
  type: string;
  name: string;
  props: Record<string, string | number | boolean>;
  children?: LaboratoryNode[];
  hidden?: boolean;
  locked?: boolean;
};

export type LaboratoryDocument = {
  schema: 1;
  nodes: LaboratoryNode[];
  css: string;
  profile: "PROPRIETARIO" | "DONO_COMUNIDADE" | "ADMINISTRADOR" | "LIDER" | "MEMBRO" | "VISITANTE";
  state: "NORMAL" | "LOADING" | "EMPTY" | "ERROR" | "OFFLINE" | "DENIED" | "BLOCKED" | "SUCCESS" | "WARNING" | "PARTIAL";
};

const NODE_TYPES = new Set(["title", "subtitle", "paragraph", "button", "link", "badge", "status", "card", "container", "row", "column", "grid", "list", "table", "form", "input", "textarea", "select", "checkbox", "switch", "calendar", "tabs", "menu", "alert", "notification", "indicator", "divider", "spacer", "header", "footer", "html"]);
const SAFE_ID = /^[a-z][a-z0-9_-]{0,63}$/i;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]+\))$/i;

export const EMPTY_LAB_DOCUMENT: LaboratoryDocument = { schema: 1, nodes: [], css: "", profile: "PROPRIETARIO", state: "NORMAL" };

export const LAB_TEMPLATES = [
  ["Dashboard", "Indicadores, atalhos e atividade recente."],
  ["Página administrativa", "Cabeçalho, filtros, lista e ações."],
  ["Lista", "Busca, filtros e resultados operacionais."],
  ["Tabela", "Dados estruturados para desktop e mobile."],
  ["Página de membro", "Experiência simples, acolhedora e responsiva."],
  ["Formulário", "Coleta de dados com validação visual."],
  ["Relatório", "Indicadores e observações em uma visualização."],
  ["Página de configurações", "Preferências organizadas por seção."],
  ["Painel operacional", "Fila de atendimento e próximos passos."],
] as const;

function text(value: unknown, maximum = 1000) { return String(value ?? "").trim().slice(0, maximum); }
function number(value: unknown, min: number, max: number, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }

export function parseLaboratoryDocument(value: unknown): LaboratoryDocument {
  const source = value && typeof value === "object" ? value as Partial<LaboratoryDocument> : {};
  return {
    schema: 1,
    nodes: parseNodes(source.nodes, 0),
    css: sanitizeLaboratoryCss(source.css),
    profile: ["PROPRIETARIO", "DONO_COMUNIDADE", "ADMINISTRADOR", "LIDER", "MEMBRO", "VISITANTE"].includes(String(source.profile)) ? source.profile as LaboratoryDocument["profile"] : "PROPRIETARIO",
    state: ["NORMAL", "LOADING", "EMPTY", "ERROR", "OFFLINE", "DENIED", "BLOCKED", "SUCCESS", "WARNING", "PARTIAL"].includes(String(source.state)) ? source.state as LaboratoryDocument["state"] : "NORMAL",
  };
}

function parseNodes(value: unknown, depth: number): LaboratoryNode[] {
  if (!Array.isArray(value) || depth > 6) return [];
  return value.slice(0, 120).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<LaboratoryNode>;
    if (!NODE_TYPES.has(String(item.type))) return [];
    const id = SAFE_ID.test(String(item.id)) ? String(item.id) : `node-${depth}-${index}`;
    const props: LaboratoryNode["props"] = {};
    if (item.props && typeof item.props === "object") for (const [key, rawValue] of Object.entries(item.props).slice(0, 30)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/.test(key)) continue;
      if (typeof rawValue === "string") {
        const value = text(rawValue, 500);
        props[key] = String(item.type) === "html" && key === "text"
          ? value.replace(/<script[\s\S]*?<\/script>|\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
          : value;
      }
      if (typeof rawValue === "boolean") props[key] = rawValue;
      if (typeof rawValue === "number") props[key] = number(rawValue, -10000, 10000, 0);
    }
    for (const key of ["color", "background"] as const) if (typeof props[key] === "string" && !SAFE_COLOR.test(props[key] as string)) delete props[key];
    return [{ id, type: String(item.type), name: text(item.name || item.type, 80), props, children: parseNodes(item.children, depth + 1), hidden: Boolean(item.hidden), locked: Boolean(item.locked) }];
  });
}

// CSS limitado ao preview. Bloqueia imports, URLs e escapes do contêiner experimental.
export function sanitizeLaboratoryCss(value: unknown) {
  const css = text(value, 12000);
  if (!css || /[{}<>]|@import|@namespace|expression\s*\(|url\s*\(|javascript:|behavior\s*:/i.test(css)) return "";
  const allowed = new Set(["color", "background", "background-color", "font-size", "font-weight", "line-height", "padding", "margin", "gap", "border", "border-radius", "opacity", "display", "grid-template-columns", "justify-content", "align-items", "text-align", "max-width", "min-height"]);
  return css.split(";").slice(0, 40).flatMap((declaration) => {
    const [property, ...value] = declaration.split(":");
    const normalized = property?.trim().toLowerCase();
    const result = value.join(":").trim();
    return normalized && allowed.has(normalized) && result.length <= 180 ? [`${normalized}: ${result}`] : [];
  }).join("; ");
}

export function laboratoryTemplate(name: string): LaboratoryDocument {
  const title = text(name, 100) || "Novo experimento";
  return parseLaboratoryDocument({ schema: 1, nodes: [
    { id: "header", type: "header", name: "Cabeçalho", props: {} },
    { id: "title", type: "title", name: "Título", props: { text: title, fontSize: 28 } },
    { id: "description", type: "paragraph", name: "Descrição", props: { text: "Descreva a experiência que deseja validar.", color: "var(--muted)" } },
    { id: "action", type: "button", name: "Ação", props: { text: "Ação principal" } },
  ], css: "", profile: "PROPRIETARIO", state: "NORMAL" });
}
