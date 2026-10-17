"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./visitor-spreadsheet.css";
import { CUSTOM_FIELD_TYPES, MAX_CUSTOM_FIELDS, customFieldNameIssue, inferCustomFieldType, displayCustomValue, IMPORT_FIELDS, cellText, formatImportDate, normalizeColumn, prepareImportRows, readVisitorWorkbook, visitorWorkbookTables, type CustomFieldDraft, type VisitorCustomField, type ImportField, type SheetTable } from "../lib/visitor-spreadsheet";

type NamedItem = { id: number; nome: string };
export default function VisitorSpreadsheetImport({ categories, cells, canManageCategories, onImported }: {
  categories: NamedItem[]; cells: NamedItem[]; canManageCategories: boolean; onImported: (message: string) => void | Promise<void>;
}) {
  const [tables, setTables] = useState<SheetTable[]>([]);
  const [selected, setSelected] = useState(0);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [fields, setFields] = useState<VisitorCustomField[]>([]);
  const [canManageFields, setCanManageFields] = useState(false);
  const [drafts, setDrafts] = useState<CustomFieldDraft[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [filename, setFilename] = useState("");
  const [fallback, setFallback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<"mapped" | "original">("mapped");
  const [serverErrors, setServerErrors] = useState<Record<number, string>>({});
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const table = tables[selected];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo" }).format(new Date());
  const custom = useMemo(() => drafts.map((draft, i) => fields.find(field => mapping[i] === `custom:${field.id}`) || draft), [drafts, fields, mapping]);
  const rows = useMemo(() => table ? prepareImportRows(table, mapping, categories, cells, choices, fallback, today, custom) : [], [table, mapping, categories, cells, choices, fallback, today, custom]);
  const customColumns = mapping.flatMap((value, i) => value === "extra" || value.startsWith("custom:") ? [i] : []);
  const newFields = customColumns.filter(i => mapping[i] === "extra").map(i => drafts[i]);
  const fieldIssues: string[] = [];
  const assigned = new Set<string>();
  for (const i of customColumns) {
    const field = custom[i], key = normalizeColumn(field.nome);
    if (mapping[i] === "extra") {
      const issue = customFieldNameIssue(field.nome);
      if (issue) fieldIssues.push(issue);
      const existing = fields.find(item => item.chave === key);
      if (existing) fieldIssues.push(`“${field.nome}” já existe. Escolha esse campo no destino.`);
    }
    if (assigned.has(key)) fieldIssues.push(`“${field.nome}” recebe mais de uma coluna. Escolha destinos diferentes.`);
    assigned.add(key);
  }
  if (fields.length + newFields.length > MAX_CUSTOM_FIELDS) fieldIssues.push(`A comunidade pode ter até ${MAX_CUSTOM_FIELDS} campos adicionais.`);
  const categoryNames = useMemo(() => table ? [...new Set(table.rows.flatMap(row => mapping.flatMap((field, i) => field === "categoriaNome" && cellText(row.values[i]) ? [cellText(row.values[i])] : [])))] : [], [table, mapping]);
  const invalid = rows.filter(row => row.issues.length).length;
  const newCategories = [...new Set(rows.filter(row => row.payload.categoriaNome && !row.payload.categoriaId).map(row => row.payload.categoriaNome))];
  const open = Boolean(table);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { document.body.style.overflow = previous; trigger.current?.focus(); };
  }, [open]);
  function close() { if (!busy) { setTables([]); setError(""); setProgress(""); } }
  function configureTable(item: SheetTable, available: VisitorCustomField[]) {
    setMapping(item.mapping.map((value, i): ImportField => { const match = available.find(field => field.chave === normalizeColumn(item.headers[i])); return value === "extra" && match ? `custom:${match.id}` : value; }));
    setDrafts(item.headers.map((nome, i) => ({ nome, tipo:inferCustomFieldType(item.rows.map(row => row.values[i])) })));
  }
  function selectTable(index: number) { setSelected(index); configureTable(tables[index], fields); setChoices({}); setFallback(""); setPage(0); setError(""); setServerErrors({}); }
  async function readFile(file: File) {
    setBusy(true); setError(""); setProgress("");
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error("Use um arquivo de até 15 MB.");
      const XLSX = await import("xlsx");
      const workbook = readVisitorWorkbook(XLSX, await file.arrayBuffer(), /\.csv$/i.test(file.name));
      const found = visitorWorkbookTables(workbook);
      if (!found.length) throw new Error("Nenhuma lista com a coluna Nome ou Nome completo foi encontrada.");
      const response = await fetch("/api/pilot/visitantes/campos", { cache:"no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível conferir os campos do cadastro. Tente novamente.");
      setFields(result.campos); setCanManageFields(Boolean(result.canManage)); configureTable(found[0], result.campos);
      setTables(found); setSelected(0); setChoices({}); setFallback(""); setPage(0); setPreview("mapped"); setFilename(file.name); setServerErrors({});
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function confirm() {
    if (!rows.length || invalid || fieldIssues.length || busy || (!canManageCategories && newCategories.length) || (!canManageFields && newFields.length)) return;
    setBusy(true); setError(""); setServerErrors({});
    const failures: Record<number, string> = {}, successful = new Set<number>();
    try {
      let available = fields;
      if (newFields.length) {
        setProgress("Criando os campos revisados…");
        const response = await fetch("/api/pilot/visitantes/campos", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ campos:newFields }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Não foi possível criar os campos. Nenhuma pessoa foi importada.");
        available = result.campos;
        setFields(available);
        setMapping(current => current.map((field, i): ImportField => field === "extra" ? `custom:${available.find(item => item.chave === normalizeColumn(drafts[i].nome))!.id}` : field));
      }
      for (const [index, row] of rows.entries()) {
        setProgress(`Importando ${index + 1} de ${rows.length}…`);
        try {
          const values = Object.fromEntries(customColumns.map(i => {
            const field = available.find(item => mapping[i] === `custom:${item.id}` || (mapping[i] === "extra" && item.chave === normalizeColumn(drafts[i].nome)));
            if (!field) throw new Error("Campo não encontrado. Reabra a revisão.");
            return [String(field.id), row.customValues[i] ?? ""];
          }));
          const response = await fetch("/api/pilot/visitantes", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ ...row.payload, camposPersonalizados:values }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Não foi possível salvar esta linha.");
          successful.add(row.line);
        } catch (caught) { failures[row.line] = (caught as Error).message; }
      }
      setTables(current => current.map((item, index) => index === selected ? { ...item, rows:item.rows.filter(row => !successful.has(row.line)) } : item));
      setServerErrors(failures); setPage(0);
      setProgress(`${successful.size} cadastro(s) importado(s).${Object.keys(failures).length ? ` ${Object.keys(failures).length} linha(s) continuam para revisão.` : ""}`);
      // Remove saved rows before refreshing; retries can only contain failed rows.
      if (successful.size || newFields.length) await onImported(`${successful.size} cadastro(s) importado(s), com os campos, categorias e datas revisados.`);
    } catch (caught) { setError((caught as Error).message); setProgress(""); }
    finally { setBusy(false); }
  }
  const pageRows = rows.slice(page * 20, (page + 1) * 20);
  const fieldLabel = (field: ImportField) => field === "extra" ? "Novo campo do cadastro" : field === "ignore" ? "Não importar" : field.startsWith("custom:") ? fields.find(item => field === `custom:${item.id}`)?.nome : IMPORT_FIELDS.find(item => item[0] === field)?.[1];
  return <>
    <input ref={input} className="visitor-import-input-v2" type="file" accept=".xlsx,.xls,.csv" aria-label="Arquivo Excel para importar pessoas" onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
    <button ref={trigger} type="button" disabled={busy} onClick={() => input.current?.click()}>{busy && !open ? "Lendo planilha…" : "⇧ Importar Excel"}</button>
    {error && !open && <p role="alert">{error}</p>}
    {open && createPortal(<dialog ref={dialog} className="visitor-import-dialog-v2 visitor-import-mapping" aria-labelledby="visitor-import-title" onCancel={event => { event.preventDefault(); close(); }}>
      <header><div><h2 id="visitor-import-title">Revisar importação</h2><p>{filename}</p></div><button type="button" aria-label="Fechar importação" disabled={busy} onClick={close}>×</button></header>
      <div className="visitor-import-content">
        <div className="visitor-import-summary"><label>Lista da planilha<select value={selected} disabled={busy} onChange={event => selectTable(Number(event.target.value))}>{tables.map((item, index) => <option key={item.name} value={index}>{item.name} · {item.rows.length} pessoas</option>)}</select></label><p><strong>{rows.length} pessoas · {table.headers.length} colunas</strong><span>Importe uma lista por vez. Abas de resumo podem repetir pessoas.</span></p></div>
        <details className="visitor-import-columns" open data-keep-open-on-outside>
          <summary>Destino das colunas <span>{newFields.length} novo(s) campo(s) sugerido(s)</span></summary>
          <p>Revise nome e tipo dos novos campos. Eles ficarão na ficha da pessoa e em colunas próprias na exportação. Nada é criado até confirmar a importação.</p>
          <div className="visitor-import-map-list">{table.headers.map((header, index) => <div className="visitor-import-map-item" key={index}><label><span>{header}<small>{cellText(table.rows.find(row => cellText(row.values[index]))?.values[index]).slice(0, 80) || "Sem valores"}</small></span><select aria-label={`Destino de ${header}`} value={mapping[index]} disabled={busy} onChange={event => { setMapping(current => current.map((value, i) => i === index ? event.target.value as ImportField : value)); setPage(0); setChoices({}); }}><option value="extra">Criar novo campo</option><optgroup label="Campos do cadastro">{IMPORT_FIELDS.map(field => <option key={field[0]} value={field[0]}>{field[1]}</option>)}</optgroup>{fields.length > 0 && <optgroup label="Campos adicionais existentes">{fields.map(field => <option key={field.id} value={`custom:${field.id}`}>{field.nome} · {CUSTOM_FIELD_TYPES[field.tipo]}</option>)}</optgroup>}<option value="ignore">Não importar esta coluna</option></select></label>{mapping[index] === "extra" && <div className="visitor-import-new-field"><label>Nome do novo campo<input maxLength={80} aria-label={`Nome do campo para ${header}`} value={drafts[index].nome} disabled={busy} onChange={event => setDrafts(current => current.map((draft, i) => i === index ? { ...draft, nome:event.target.value } : draft))} /></label><label>Tipo<select aria-label={`Tipo do campo para ${header}`} value={drafts[index].tipo} disabled={busy} onChange={event => setDrafts(current => current.map((draft, i) => i === index ? { ...draft, tipo:event.target.value as CustomFieldDraft["tipo"] } : draft))}>{Object.entries(CUSTOM_FIELD_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>}</div>)}</div>
        </details>
        {!canManageFields && newFields.length > 0 && <p role="alert">Criar campos exige permissão de gestão de Visitantes. Selecione campos existentes ou não importe essas colunas.</p>}
        {fieldIssues.length > 0 && <p className="visitor-import-issue" role="alert">{[...new Set(fieldIssues)].join(" ")}</p>}
        {categoryNames.length > 0 && <details className="visitor-import-categories" open data-keep-open-on-outside><summary>Categorias encontradas <span>{categoryNames.length}</span></summary><div className="visitor-import-category-list">{categoryNames.map(name => { const existing = categories.find(category => normalizeColumn(category.nome) === normalizeColumn(name)); return <label key={name}><span>{name}<small>{existing ? "Categoria já cadastrada" : "Sugestão: criar com este nome"}</small></span><select aria-label={`Categoria para ${name}`} disabled={busy} value={choices[name] || "same"} onChange={event => setChoices(current => ({ ...current, [name]:event.target.value }))}><option value="same">{existing ? `Usar ${existing.nome}` : `Criar ${name}`}</option>{categories.filter(category => category.id !== existing?.id).map(category => <option key={category.id} value={category.id}>Usar {category.nome}</option>)}<option value="none">Deixar classificação automática</option></select></label>; })}</div></details>}
        {rows.some(row => !row.payload.dataEntrada) && <label className="visitor-import-fallback">Data de chegada para linhas sem data<input type="date" max={today} value={fallback} disabled={busy} onChange={event => setFallback(event.target.value)} /><small>As datas já preenchidas na planilha serão mantidas.</small></label>}
        {fallback && <label className="visitor-import-fallback">Data para linhas sem chegada<input type="date" max={today} value={fallback} disabled={busy} onChange={event => setFallback(event.target.value)} /></label>}
        {!canManageCategories && newCategories.length > 0 && <p role="alert">Você pode importar pessoas, mas criar categorias exige permissão de gestão. Escolha categorias existentes acima.</p>}
        <div className="visitor-import-preview-tabs" role="group" aria-label="Visualização da revisão"><button type="button" aria-pressed={preview === "mapped"} onClick={() => setPreview("mapped")}>Como será cadastrado</button><button type="button" aria-pressed={preview === "original"} onClick={() => setPreview("original")}>Todas as colunas do arquivo</button></div>
        <div className="visitor-import-table-v2" tabIndex={0} role="region" aria-label="Prévia dos cadastros">
          <table><thead><tr><th>Linha</th>{preview === "original" ? table.headers.map((header, i) => <th key={i}>{header}<small>{fieldLabel(mapping[i])}</small></th>) : <><th>Nome / contato</th><th>Categoria</th><th>Chegada</th><th>Nascimento</th>{customColumns.map(i => <th key={i}>{custom[i].nome}<small>{CUSTOM_FIELD_TYPES[custom[i].tipo]} · {mapping[i] === "extra" ? "Novo campo" : "Campo existente"}</small></th>)}<th>Revisão</th></>}</tr></thead><tbody>{pageRows.map(row => <tr key={row.line}><td>{row.line}</td>{preview === "original" ? table.rows.find(item => item.line === row.line)?.values.map((value, i) => <td key={i}>{cellText(value) || "—"}</td>) : <><th scope="row">{row.payload.nomeCompleto}<small>{row.payload.telefone || row.payload.email || "Sem contato"}</small></th><td>{row.payload.categoriaNome || "Automática, se houver regra"}</td><td>{formatImportDate(row.payload.dataEntrada) || "Não informada"}</td><td>{formatImportDate(String(row.payload.dataNascimento || "")) || "Não informado"}</td>{customColumns.map(i => <td key={i}>{displayCustomValue(row.customValues[i], custom[i].tipo) || "—"}</td>)}<td>{row.issues.length || serverErrors[row.line] ? <span className="visitor-import-issue">{[...row.issues, serverErrors[row.line]].filter(Boolean).join(" · ")}</span> : "Pronto"}{row.payload.observacoes && <details data-keep-open-on-outside><summary>Observações</summary><p className="visitor-import-notes">{row.payload.observacoes}</p></details>}</td></>}</tr>)}</tbody></table>
        </div>
        {rows.length > 20 && <nav className="visitor-import-pagination" aria-label="Páginas da prévia"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span>{page * 20 + 1}–{Math.min((page + 1) * 20, rows.length)} de {rows.length}</span><button type="button" disabled={(page + 1) * 20 >= rows.length} onClick={() => setPage(page + 1)}>Próxima</button></nav>}
        {invalid > 0 && <p className="visitor-import-issue" role="alert">Revise {invalid} linha(s) antes de importar. Datas inválidas não serão substituídas por hoje.</p>}
        {error && <p role="alert">{error}</p>}<p role="status" aria-live="polite">{progress}</p>
      </div>
      <footer><span>{[newFields.length > 0 ? `${newFields.length} novo(s) campo(s)` : "", newCategories.length > 0 ? `${newCategories.length} categoria(s)` : ""].filter(Boolean).join(" e ") || "Nenhuma estrutura nova"} · criação somente ao confirmar.</span><button type="button" onClick={close} disabled={busy}>{rows.length ? "Cancelar" : "Concluir"}</button>{rows.length > 0 && <button type="button" onClick={() => void confirm()} disabled={busy || invalid > 0 || fieldIssues.length > 0 || (!canManageCategories && newCategories.length > 0) || (!canManageFields && newFields.length > 0)}>{busy ? "Importando…" : `Importar ${rows.length} pessoas`}</button>}</footer>
    </dialog>, document.body)}
  </>;
}
