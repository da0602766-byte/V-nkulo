"use client";

import { useEffect, useState } from "react";
import type {
  CommunityCreationField,
  CommunityCreationFieldType,
} from "../lib/community-creation";

const TYPE_LABELS: Record<CommunityCreationFieldType, string> = {
  text: "Texto",
  tel: "Telefone",
  email: "E-mail",
  number: "Número",
  date: "Data",
  textarea: "Texto longo",
};

export default function CommunityCreationConfigWorkspace() {
  const [fields, setFields] = useState<CommunityCreationField[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/pilot/community-creation-config", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Falha ao carregar a ficha.");
        setFields(result.fields || []);
      })
      .catch((error) => setMessage((error as Error).message));
  }, []);

  function addField() {
    if (fields.length >= 16) {
      setMessage("O limite seguro é de 16 campos adicionais.");
      return;
    }
    setFields((current) => [
      ...current,
      {
        id: `campo_${Date.now().toString(36)}`,
        label: "Nova informação",
        type: "text",
        placeholder: "",
        required: false,
        enabled: true,
      },
    ]);
  }

  function updateField(index: number, patch: Partial<CommunityCreationField>) {
    setFields((current) => current.map((field, itemIndex) =>
      itemIndex === index ? { ...field, ...patch } : field,
    ));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/pilot/community-creation-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");
      setFields(result.fields || fields);
      setMessage("Ficha de criação de comunidade atualizada.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`community-creation-config ${open ? "open" : ""}`}>
      <button type="button" className="community-creation-config-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>＋</span>
        <div>
          <strong>Ficha rígida para novas comunidades</strong>
          <small>{fields.length} campos configuráveis · aprovação exclusiva do proprietário</small>
        </div>
        <em>{open ? "Recolher" : "Configurar"}</em>
      </button>
      {open && (
        <div className="community-creation-config-body">
          <header>
            <div>
              <p className="pilot-kicker">CRIAÇÃO DE COMUNIDADE</p>
              <h3>Informações adicionais</h3>
              <p>Nome, cidade, descrição e e-mail institucional continuam obrigatórios. A ficha registra uma solicitação; somente o proprietário cria e ativa a comunidade.</p>
            </div>
            <button type="button" onClick={addField}>+ Adicionar informação</button>
          </header>
          <div className="community-creation-field-list">
            {fields.map((field, index) => (
              <article key={field.id}>
                <span>{index + 1}</span>
                <label>Nome<input value={field.label} maxLength={70} onChange={(event) => updateField(index, { label: event.target.value })} /></label>
                <label>Tipo<select value={field.type} onChange={(event) => updateField(index, { type: event.target.value as CommunityCreationFieldType })}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="wide">Exemplo<input value={field.placeholder} maxLength={100} onChange={(event) => updateField(index, { placeholder: event.target.value })} /></label>
                <label className="toggle"><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} /> Obrigatório</label>
                <label className="toggle"><input type="checkbox" checked={field.enabled} onChange={(event) => updateField(index, { enabled: event.target.checked })} /> Ativo</label>
                <button type="button" className="danger" onClick={() => setFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Excluir</button>
              </article>
            ))}
          </div>
          <div className="community-creation-config-save">
            <p>Alterações valem para computador e celular na próxima abertura da ficha.</p>
            <button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar ficha de comunidade"}</button>
          </div>
          {message && <p className="operations-feedback" role="status">{message}</p>}
        </div>
      )}
    </section>
  );
}
