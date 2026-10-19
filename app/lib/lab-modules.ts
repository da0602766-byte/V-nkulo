export const FIELD_TYPES = ["text", "textarea", "number", "date", "email", "select", "checkbox"] as const;
export const MODULE_ROLES = ["SUPERADMIN", "ADMIN", "PASTOR", "LIDER", "MEMBRO"] as const;
export type ModuleField = { id: string; label: string; type: typeof FIELD_TYPES[number]; required: boolean; options: string[] };
export type ModuleDefinition = { name: string; description: string; fields: ModuleField[]; communities: number[]; readers: string[]; writers: string[]; allowCreate: boolean; allowEdit: boolean; allowArchive: boolean };
export type ModuleRelease = { version: number; at: string; note: string; definition: ModuleDefinition };
export type LabModule = { id: string; revision: number; draft: ModuleDefinition; published: ModuleRelease | null; releases: ModuleRelease[]; updatedAt: string; archived: boolean };
export type ModuleRecord = { id: string; revision: number; values: Record<string,string | boolean>; archived: boolean; createdAt: string; updatedAt: string };
export const MODULE_PREFIX = "lab.module.";
export const validModuleId = (id: string) => /^[a-f0-9-]{36}$/.test(id);
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0,max);

export function parseModule(value: unknown): ModuleDefinition {
  const s = (value && typeof value === "object" ? value : {}) as Partial<ModuleDefinition>;
  const fields = (Array.isArray(s.fields) ? s.fields : []).slice(0,24).map(f => ({
    id: clean(f?.id,64), label: clean(f?.label,80), type: FIELD_TYPES.includes(f?.type) ? f.type : "text" as const,
    required: f?.required === true, options: [...new Set((Array.isArray(f?.options) ? f.options : []).map(o=>clean(o,100)).filter(Boolean))].slice(0,40),
  }));
  if (fields.some(f=>!/^f_[a-z0-9_-]+$/.test(f.id)) || new Set(fields.map(f=>f.id)).size!==fields.length) throw new Error("Os campos precisam de identificadores únicos e válidos.");
  const roles = (v: unknown) => (Array.isArray(v) ? v : []).filter(r => MODULE_ROLES.includes(r));
  return { name:clean(s.name,80), description:clean(s.description,600), fields,
    communities:[...new Set((Array.isArray(s.communities)?s.communities:[]).map(Number).filter(n=>Number.isInteger(n)&&n>0))].slice(0,200),
    readers:roles(s.readers), writers:roles(s.writers), allowCreate:s.allowCreate!==false, allowEdit:s.allowEdit!==false, allowArchive:s.allowArchive!==false };
}
export function moduleIssues(d: ModuleDefinition): string[] {
  return [...(d.name.length<2?["Informe o nome da aba."]:[]), ...(d.fields.length===0?["Adicione pelo menos um campo."]:[]),
    ...(d.fields.some(f=>!f.label || (f.type==="select"&&!f.options.length))?["Preencha o nome dos campos e as opções das seleções."]:[]),
    ...(!d.communities.length?["Selecione as comunidades de destino."]:[]), ...(!d.readers.length?["Escolha quem pode consultar a aba."]:[]),
    ...(d.writers.some(r=>!d.readers.includes(r))?["Quem edita também precisa poder consultar."]:[])];
}
export function canUseModule(d: ModuleDefinition, context: { comunidadeId:number; papel:string; isOwner:boolean; communityAccess:string; temporaryAccess?: unknown }, write=false) {
  return d.communities.includes(context.comunidadeId) && !context.temporaryAccess && context.communityAccess!=="FEED_ONLY" && (context.isOwner || (write?d.writers:d.readers).includes(context.papel));
}
export function validateModuleValues(d:ModuleDefinition, raw:unknown) {
  const input = (raw && typeof raw==="object" ? raw : {}) as Record<string,unknown>;
  const values:Record<string,string|boolean>={};
  for(const f of d.fields) {
    const v=f.type==="checkbox"?input[f.id]===true:clean(input[f.id],f.type==="textarea"?4000:500);
    if(f.required && (v==="" || v===false)) throw new Error(`Preencha ${f.label}.`);
    if(typeof v==="string" && v) {
      if(f.type==="number" && !Number.isFinite(Number(v))) throw new Error(`${f.label}: informe um número válido.`);
      if(f.type==="email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error(`${f.label}: informe um e-mail válido.`);
      if(f.type==="date" && (!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)) throw new Error(`${f.label}: data inválida.`);
      if(f.type==="select" && !f.options.includes(v)) throw new Error(`${f.label}: escolha uma opção válida.`);
    }
    values[f.id]=v;
  }
  return values;
}
export function newModuleDefinition(name="Nova aba"):ModuleDefinition {
  return {name,description:"",fields:[{id:"f_nome",label:"Nome",type:"text",required:true,options:[]}],communities:[],readers:["SUPERADMIN","ADMIN","PASTOR"],writers:["SUPERADMIN","ADMIN","PASTOR"],allowCreate:true,allowEdit:true,allowArchive:true};
}
