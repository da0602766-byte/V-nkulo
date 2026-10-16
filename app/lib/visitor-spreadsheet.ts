import type { WorkBook, WorkSheet } from "xlsx";

export const IMPORT_FIELDS = [
  ["nomeCompleto", "Nome completo", "nome", "nome completo"],
  ["telefone", "Telefone", "telefone", "telefone whatsapp", "whatsapp", "numero", "celular"],
  ["email", "E-mail", "email", "e mail"],
  ["categoriaNome", "Categoria", "categoria", "categoria de acompanhamento", "tipo"],
  ["dataEntrada", "Data de chegada", "data de entrada", "entrada", "data", "data da visita", "data de chegada"],
  ["dataNascimento", "Data de nascimento", "data de nascimento", "nascimento"],
  ["parente", "Parente ou responsável", "parente", "parente ou responsavel", "responsavel", "responsavel kids", "responsavel teen"],
  ["ministerio", "Ministério", "ministerio"], ["status", "Status do acompanhamento", "status"],
  ["batizado", "Batismo", "batizado", "batismo"],
  ["certificadoBatismo", "Certificado de batismo", "certificado de batismo"],
  ["tipoPessoa", "Vínculo com a igreja", "vinculo", "tipo de pessoa"],
  ["encontroComDeus", "Encontro com Deus", "encontro com deus"],
  ["cursoMembros", "Curso de membros", "curso de membros"],
  ["discipulado", "Discipulado", "discipulado"], ["discipulador", "Discipulador", "discipulador"],
  ["doaADoa", "Doa a Doa", "doa a doa"], ["doaReceber", "Deve receber apoio", "deve receber apoio"],
  ["doacoesRealizadas", "Doações realizadas", "doacoes realizadas"],
  ["oficial", "Oficial", "oficial"], ["funcaoOficial", "Função do oficial", "funcao do oficial"],
  ["responsavelAcompanhamento", "Responsável pelo acompanhamento", "responsavel pelo acompanhamento"],
  ["proximaAcao", "Próxima ação", "proxima acao"], ["dataProximaAcao", "Prazo da ação", "prazo da acao"],
  ["endereco", "Endereço", "endereco"], ["acompanhante", "Quem recebeu", "quem recebeu"],
  ["celulaId", "Célula existente", "celula"], ["observacoes", "Observações", "observacoes"],
] as const;
export type ImportField = typeof IMPORT_FIELDS[number][0] | "extra" | "ignore";
export type SheetTable = { name: string; sheet: string; headerRow: number; headers: string[]; rows: { line: number; values: unknown[] }[]; mapping: ImportField[] };
export type ImportPerson = Record<string, string | boolean> & { nomeCompleto: string; categoriaNome: string; categoriaId: string; dataEntrada: string };
export const normalizeColumn = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/^0(?=responsavel)/, "").trim().replace(/\s+/g, " ");

export function suggestField(header: string): ImportField {
  return IMPORT_FIELDS.find(field => (field.slice(2) as readonly string[]).includes(normalizeColumn(header)))?.[0] || "extra";
}

export function readVisitorWorkbook(XLSX: typeof import("xlsx"), bytes: ArrayBuffer, csv = false) {
  if (csv) {
    let text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(bytes);
    // CSV has no cell types: keep dates and phone identifiers as literal text.
    return XLSX.read(text, { type:"string", raw:true, cellNF:true });
  }
  return XLSX.read(bytes, { type:"array", cellDates:false, cellNF:true });
}

function columnIndex(letters: string) { return [...letters].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1; }
function excelDay(value: number, date1904 = false) {
  if (!Number.isFinite(value) || value < 0 || (!date1904 && Math.floor(value) === 60)) return "";
  const day = Math.floor(value);
  const date = new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 31) + (day - (!date1904 && day > 60 ? 1 : 0)) * 86400000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}
export function importDate(value: unknown): string {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : "";
  if (typeof value === "number") return excelDay(value);
  const text = String(value ?? "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  const br = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:$|\s)/);
  const result = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : br ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : "";
  return result && Number.isFinite(Date.parse(result)) && new Date(result + "T12:00:00Z").toISOString().slice(0, 10) === result ? result : "";
}
export function cellText(value: unknown): string {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().replace("T", " ").replace(/(?:\.000)?Z$/, "") : "";
  return typeof value === "number" ? String(value) : String(value ?? "").trim();
}

// Read only populated cells: old workbooks often have tens of thousands of styled empty rows.
export function visitorWorkbookTables(workbook: WorkBook): SheetTable[] {
  const tables: SheetTable[] = [];
  for (const name of workbook.SheetNames) {
    const sheet: WorkSheet = workbook.Sheets[name];
    const matrix = new Map<number, Map<number, unknown>>();
    for (const [address, cell] of Object.entries(sheet)) {
      const match = address.match(/^([A-Z]+)(\d+)$/);
      if (!match || !cell || cell.v === undefined || cell.v === "" || cell.t === "e") continue;
      const r = Number(match[2]), c = columnIndex(match[1]);
      if (c > 255) throw new Error("A planilha excede o limite de 256 colunas. Separe a lista que deseja importar.");
      if (!matrix.has(r)) matrix.set(r, new Map());
      const dateCell = cell.t === "d" || (typeof cell.v === "number" && /[dy]/i.test(String(cell.z || "").replace(/"[^"]*"/g, "")));
      let value: unknown = cell.v;
      if (dateCell && typeof value === "number") {
        const day = excelDay(value, Boolean(workbook.Workbook?.WBProps?.date1904));
        value = day ? new Date(Date.parse(day + "T00:00:00Z") + Math.round((value - Math.floor(value)) * 86400000)) : "Data inválida";
      }
      matrix.get(r)!.set(c, value);
    }
    const entries = [...matrix.entries()].sort((a, b) => a[0] - b[0]);
    const header = entries.find(([, row]) => [...row.values()].some(v => suggestField(cellText(v)) === "nomeCompleto"));
    if (!header) continue;
    const [headerRow, cells] = header;
    const columns = [...cells.keys()].sort((a,b) => a-b);
    const nameColumns = columns.filter(c => suggestField(cellText(cells.get(c))) === "nomeCompleto");
    nameColumns.forEach((start, block) => {
      const end = nameColumns[block + 1] ?? Infinity;
      const selected = columns.filter(c => c >= (block ? start : 0) && c < end);
      const headers = selected.map(c => cellText(cells.get(c)));
      const mapping = headers.map(suggestField);
      const rows = entries.filter(([r]) => r > headerRow).map(([line, row]) => ({ line, values: selected.map(c => row.get(c) ?? "") }))
        .filter(row => cellText(row.values[mapping.indexOf("nomeCompleto")]) && !["nome", "nome completo"].includes(normalizeColumn(cellText(row.values[mapping.indexOf("nomeCompleto")]))));
      if (rows.length > 10000) throw new Error("Importe até 10.000 pessoas por vez.");
      if (rows.length) tables.push({ name: nameColumns.length > 1 ? `${name} · lista ${block + 1}` : name, sheet: name, headerRow, headers, rows, mapping });
    });
  }
  return tables;
}

const answer = (value: string) => ["sim", "true", "1", "participou", "ja participou", "foi"].includes(normalizeColumn(value)) ? "SIM" : ["nao", "false", "0", "nao participou", "nao foi"].includes(normalizeColumn(value)) ? "NAO" : "NAO_INFORMADO";
export function prepareImportRows(table: SheetTable, mapping: ImportField[], categories: { id: number; nome: string }[], cells: { id: number; nome: string }[], categoryChoices: Record<string, string>, fallbackDate: string, today: string) {
  return table.rows.map(source => {
    const payload: ImportPerson = { nomeCompleto: "", categoriaNome: "", categoriaId: "", dataEntrada: "", status: "NOVO" };
    const issues: string[] = [], notes: string[] = [];
    const extras: string[] = [];
    const values = new Map<string, string[]>();
    const addNote = (i: number) => { const value = cellText(source.values[i]); if (value) extras.push(`${table.headers[i]}: ${value}`); };
    mapping.forEach((field, index) => {
      const raw = source.values[index], text = cellText(raw);
      if (!text || field === "ignore") return;
      if (field === "extra") { addNote(index); return; }
      if (field === "observacoes") { notes.push(text); return; }
      let value = text;
      if (["dataEntrada", "dataNascimento", "dataProximaAcao"].includes(field)) {
        value = importDate(raw);
        if (!value) issues.push(`${table.headers[index]}: data inválida (${text})`);
        else if (field !== "dataProximaAcao" && value > today) issues.push(`${table.headers[index]}: data no futuro`);
      }
      const previous = values.get(field) || [];
      if (previous.length && !previous.includes(value) && field !== "parente") issues.push(`Mais de uma coluna preenche ${IMPORT_FIELDS.find(f => f[0] === field)?.[1]}. Escolha apenas uma.`);
      values.set(field, [...previous, value]);
    });
    values.forEach((items, field) => { payload[field] = [...new Set(items)].join(field === "parente" ? " / " : ""); });
    if (!payload.nomeCompleto) issues.push("Escolha a coluna de nome completo.");
    if (!payload.dataEntrada) payload.dataEntrada = fallbackDate;
    if (!importDate(payload.dataEntrada)) issues.push("Informe a data de chegada para as linhas sem data.");
    else if (payload.dataEntrada > today) issues.push("A data de chegada não pode estar no futuro.");
    const originalCategory = String(payload.categoriaNome || "");
    const choice = categoryChoices[originalCategory];
    const matched = categories.find(c => choice && choice !== "same" && choice !== "none" ? String(c.id) === choice : normalizeColumn(c.nome) === normalizeColumn(originalCategory));
    if (choice === "none") { payload.categoriaNome = ""; payload.categoriaId = ""; if (originalCategory) extras.push(`Categoria original: ${originalCategory}`); }
    else { payload.categoriaNome = matched?.nome || originalCategory; payload.categoriaId = matched ? String(matched.id) : ""; }
    if (/^(sem categoria|[-—])$/i.test(payload.categoriaNome)) payload.categoriaNome = "";
    const cellName = String(payload.celulaId || "");
    payload.celulaId = String(cells.find(c => normalizeColumn(c.nome) === normalizeColumn(cellName))?.id || "");
    if (cellName && !payload.celulaId) extras.push(`Célula: ${cellName}`);
    const status = normalizeColumn(String(payload.status)).replaceAll(" ", "_").toUpperCase();
    payload.status = ["NOVO", "EM_CONTATO", "EM_ACOMPANHAMENTO", "INTEGRADO"].includes(status) ? status : "NOVO";
    if (status !== payload.status) extras.push(`Status original: ${values.get("status")?.[0] || status}`);
    const personType = normalizeColumn(String(payload.tipoPessoa || ""));
    payload.tipoPessoa = personType === "membro" || (!personType && normalizeColumn(originalCategory) === "membro") ? "MEMBRO" : "VISITANTE";
    if (personType && !["membro", "visitante"].includes(personType)) extras.push(`Vínculo original: ${values.get("tipoPessoa")?.[0]}`);
    for (const field of ["batizado", "certificadoBatismo", "discipulado", "doaADoa", "doaReceber", "oficial", "encontroComDeus", "cursoMembros"]) {
      const raw = String(payload[field] || "");
      const normalized = answer(raw);
      if (raw && normalized === "NAO_INFORMADO" && !["nao informado", "nao registrado"].includes(normalizeColumn(raw))) extras.push(`${IMPORT_FIELDS.find(f => f[0] === field)?.[1]}: ${raw}`);
      payload[field] = ["encontroComDeus", "cursoMembros"].includes(field) ? normalized === "SIM" : normalized;
    }
    if (payload.discipulado === "SIM" && !payload.discipulador) issues.push("Informe o discipulador na planilha.");
    if (payload.oficial === "SIM" && !payload.funcaoOficial) issues.push("Informe a função do oficial na planilha.");
    if (payload.dataProximaAcao && !payload.proximaAcao) issues.push("Informe a descrição da próxima ação.");
    if (payload.certificadoBatismo === "SIM" && payload.batizado !== "SIM") issues.push("Confirme o batismo antes do certificado.");
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email))) issues.push("E-mail inválido.");
    if (extras.length) notes.push("Dados da planilha:\n" + extras.join("\n"));
    payload.observacoes = notes.join("\n\n");
    const limits: Record<string, number> = { nomeCompleto:120, telefone:30, email:180, categoriaNome:80, parente:120, ministerio:120, endereco:250, acompanhante:120, observacoes:1000, discipulador:120, funcaoOficial:120, responsavelAcompanhamento:120, proximaAcao:300, doacoesRealizadas:1500 };
    for (const [field, limit] of Object.entries(limits)) if (String(payload[field] || "").length > limit) issues.push(`${IMPORT_FIELDS.find(f => f[0] === field)?.[1]} excede ${limit} caracteres; revise a planilha ou o destino das colunas.`);
    return { line: source.line, payload, issues };
  });
}

export function formatImportDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value; }

// Excel exports use numeric date cells; text/phone identifiers remain literal strings.
export function visitorExportWorksheet(XLSX: typeof import("xlsx"), rows: Record<string, string | number>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0] || {});
  const dateHeaders = new Set(["Data de nascimento", "Data de entrada", "Prazo da ação"]);
  headers.forEach((header, col) => {
    if (!dateHeaders.has(header)) return;
    rows.forEach((row, i) => {
      const iso = importDate(row[header]);
      if (!iso) return;
      const serial = (Date.parse(iso + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86400000 - (iso < "1900-03-01" ? 1 : 0);
      sheet[XLSX.utils.encode_cell({ r:i+1, c:col })] = { t:"n", v:serial, z:"dd/mm/yyyy" };
    });
  });
  sheet["!cols"] = headers.map(header => ({ wch: header === "Observações" ? 64 : header === "Nome" ? 36 : /Data|Prazo|contato/.test(header) ? 20 : Math.min(34, Math.max(18, header.length + 2)) }));
  if (sheet["!ref"]) sheet["!autofilter"] = { ref:sheet["!ref"] };
  return sheet;
}
