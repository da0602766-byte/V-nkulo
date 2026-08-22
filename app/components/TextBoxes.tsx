"use client";

import { FormEvent, useState } from "react";

const AREAS = [
  ["avisos", "Menu Principal"],
  ["inicio", "Visão geral"],
  ["visitantes", "Visitantes"],
  ["acompanhamentos", "Acompanhamentos"],
  ["celulas", "Células"],
  ["louvor", "Louvor"],
  ["diaconia", "Diaconia"],
  ["cultos", "Rotinas dos Cultos"],
  ["teens", "Teens"],
  ["relatorios", "Relatórios"],
  ["modulos", "Outras áreas"],
  ["usuarios", "Usuários"],
  ["personalizar", "Personalização"],
] as const;

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Não foi possível salvar a caixa de texto.");
  return body;
}

export default function TextBoxes({
  area,
  position,
  boxes,
  canManage,
  showAdd = false,
  onChanged,
  notify,
}: {
  area: string;
  position: "TOPO" | "RODAPE";
  boxes: Record<string, unknown>[];
  canManage: boolean;
  showAdd?: boolean;
  onChanged: (boxes: Record<string, unknown>[]) => void;
  notify: (text: string) => void;
}) {
  const [selected, setSelected] = useState<Record<string, unknown> | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const visible = boxes.filter(
    (item) => String(item.area) === area && String(item.posicao) === position,
  );

  async function refresh() {
    const result = await api("/api/blocos-texto");
    onChanged(result.blocos);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(
        selected ? `/api/blocos-texto/${selected.id}` : "/api/blocos-texto",
        {
          method: selected ? "PATCH" : "POST",
          body: JSON.stringify(Object.fromEntries(form.entries())),
        },
      );
      await refresh();
      setOpen(false);
      setSelected(null);
      notify("Caixa de texto salva.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function remove(item: Record<string, unknown>) {
    if (!window.confirm("Excluir esta caixa de texto?")) return;
    try {
      await api(`/api/blocos-texto/${item.id}`, { method: "DELETE" });
      await refresh();
      notify("Caixa de texto excluída.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  if (!visible.length && !(canManage && showAdd)) return null;
  return (
    <section className={`text-box-zone text-box-${position.toLowerCase()}`}>
      {canManage && showAdd && (
        <button
          className="add-text-box"
          onClick={() => {
            setSelected(null);
            setOpen(true);
          }}
        >
          ＋ Adicionar caixa de texto nesta área
        </button>
      )}
      <div className="text-box-grid">
        {visible.map((item) => (
          <article
            className="custom-text-box"
            style={
              {
                "--box-color": String(item.cor || "#eef7f6"),
              } as React.CSSProperties
            }
            key={String(item.id)}
          >
            {Boolean(item.titulo) && <h3>{String(item.titulo)}</h3>}
            <p>{String(item.conteudo)}</p>
            {canManage && (
              <div>
                <button
                  onClick={() => {
                    setSelected(item);
                    setOpen(true);
                  }}
                >
                  Editar
                </button>
                <button onClick={() => remove(item)}>Excluir</button>
              </div>
            )}
          </article>
        ))}
      </div>
      {open && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setOpen(false)
          }
        >
          <section className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <p className="eyebrow">CONTEÚDO LIVRE</p>
                <h2>
                  {selected ? "Editar caixa de texto" : "Nova caixa de texto"}
                </h2>
              </div>
              <button onClick={() => setOpen(false)}>×</button>
            </div>
            <form className="form-grid" onSubmit={save}>
              <label>
                Área
                <select
                  name="area"
                  defaultValue={String(selected?.area || area)}
                >
                  {AREAS.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Posição
                <select
                  name="posicao"
                  defaultValue={String(selected?.posicao || position)}
                >
                  <option value="TOPO">No começo da área</option>
                  <option value="RODAPE">No final da área</option>
                </select>
              </label>
              <label className="span-2">
                Título
                <input
                  name="titulo"
                  defaultValue={String(selected?.titulo || "")}
                />
              </label>
              <label className="span-2">
                Texto*
                <textarea
                  name="conteudo"
                  rows={6}
                  required
                  defaultValue={String(selected?.conteudo || "")}
                />
              </label>
              <label className="color-picker-card">
                Cor da caixa
                <input
                  type="color"
                  name="cor"
                  defaultValue={String(selected?.cor || "#eef7f6")}
                />
              </label>
              <label>
                Ordem
                <input
                  type="number"
                  name="ordem"
                  min="0"
                  defaultValue={Number(selected?.ordem || 0)}
                />
              </label>
              <div className="form-actions span-2">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </button>
                <button className="primary-button">Salvar caixa</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
