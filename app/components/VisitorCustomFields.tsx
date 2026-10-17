"use client";

import { displayCustomValue, readCustomValues, type VisitorCustomField } from "../lib/visitor-spreadsheet";
import "./visitor-spreadsheet.css";

export function customValuesFromForm(data: FormData) {
  return JSON.stringify(Object.fromEntries([...data.entries()].filter(([key]) => key.startsWith("visitorCustom:")).map(([key, value]) => [key.slice(14), String(value)])));
}

export function VisitorCustomFields({ fields, values, readOnly = false }: { fields: VisitorCustomField[]; values?: string | null; readOnly?: boolean }) {
  if (!fields.length) return null;
  const saved = readCustomValues(values);
  if (readOnly && !fields.some(field => saved[field.id] !== undefined && saved[field.id] !== "")) return null;
  return <section className="visitor-custom-fields visitor-wide-field" aria-label="Campos adicionais do cadastro">
    <h3>Campos adicionais</h3>
    <div className="visitor-custom-fields-grid">{fields.filter(field => !readOnly || (saved[field.id] !== undefined && saved[field.id] !== "")).map(field => readOnly ? <div key={field.id}><small>{field.nome}</small><p>{displayCustomValue(saved[field.id], field.tipo)}</p></div> : <label key={field.id}>{field.nome}<small>Opcional</small>{field.tipo === "SIM_NAO" ? <select name={`visitorCustom:${field.id}`} defaultValue={saved[field.id] ?? ""}><option value="">Não informado</option><option value="SIM">Sim</option><option value="NAO">Não</option></select> : field.tipo === "TEXTO" ? <textarea name={`visitorCustom:${field.id}`} rows={2} maxLength={2000} defaultValue={saved[field.id] ?? ""} /> : <input name={`visitorCustom:${field.id}`} type={field.tipo === "DATA" ? "date" : field.tipo === "DATA_HORA" ? "datetime-local" : "number"} step={field.tipo === "DATA_HORA" ? "0.001" : field.tipo === "NUMERO" ? "any" : undefined} defaultValue={saved[field.id] ?? ""} />}</label>)}</div>
  </section>;
}
