"use client";

import { FormEvent, useState } from "react";

type Teen = Record<string, unknown>;
type Followup = Record<string, unknown>;

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options, headers: { "Content-Type": "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Não foi possível concluir.");
  return body;
}

export default function TeensModule({ initialTeens, initialFollowups, canManage, notify, onChanged }: {
  initialTeens: Teen[];
  initialFollowups: Followup[];
  canManage: boolean;
  notify: (text: string) => void;
  onChanged: (teens: Teen[], followups: Followup[]) => void;
}) {
  const [teens, setTeens] = useState(initialTeens);
  const [followups, setFollowups] = useState(initialFollowups);
  const [selectedTeen, setSelectedTeen] = useState<Teen | null>(null);
  const [selectedFollowup, setSelectedFollowup] = useState<Followup | null>(null);

  async function refresh() {
    const result = await api("/api/teens");
    setTeens(result.teens); setFollowups(result.acompanhamentos); onChanged(result.teens, result.acompanhamentos);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTeen) return;
    const form = new FormData(event.currentTarget);
    const payload = { ...Object.fromEntries(form.entries()), usuarioId: selectedTeen.id };
    try {
      await api(selectedFollowup ? `/api/teens/acompanhamentos/${selectedFollowup.id}` : "/api/teens/acompanhamentos", { method: selectedFollowup ? "PATCH" : "POST", body: JSON.stringify(payload) });
      await refresh(); setSelectedTeen(null); setSelectedFollowup(null); notify("Acompanhamento do Teens salvo.");
    } catch (error) { notify((error as Error).message); }
  }

  async function remove(item: Followup) {
    if (!window.confirm("Excluir este acompanhamento?")) return;
    try { await api(`/api/teens/acompanhamentos/${item.id}`, { method: "DELETE" }); await refresh(); notify("Acompanhamento excluído."); }
    catch (error) { notify((error as Error).message); }
  }

  return <>
    <header className="topbar page-header"><div><p className="eyebrow">CUIDADO E ACOMPANHAMENTO</p><h1>Teens</h1><p>Usuários cadastrados com menos de 17 anos entram aqui automaticamente.</p></div></header>
    <div className="teens-grid">{teens.map((teen) => <article className="teen-card" key={String(teen.id)}><span className="teen-age">{String(teen.idade)}<small>anos</small></span><div><h2>{String(teen.nome)}</h2><p><strong>Pais ou responsáveis:</strong> {String(teen.nome_pais || "Não informado")}</p>{Boolean(teen.diaconia_equipe_nome) && <p><strong>Diaconia:</strong> {String(teen.diaconia_equipe_nome)}</p>}</div>{canManage && <button className="secondary-button" onClick={() => { setSelectedTeen(teen); setSelectedFollowup(null); }}>＋ Acompanhar</button>}</article>)}{!teens.length && <div className="panel empty-state"><span>◇</span><p>Nenhum usuário menor de 17 anos com data de nascimento cadastrada.</p></div>}</div>
    <section className="section-block"><div className="section-title"><div><p className="eyebrow">HISTÓRICO</p><h2>Acompanhamentos</h2></div></div><div className="cards-list">{followups.map((item) => <article className="followup-card" key={String(item.id)}><span className="visitor-avatar">T</span><div><strong>{String(item.usuario_nome)}</strong><small>{new Date(String(item.criado_em)).toLocaleDateString("pt-BR")}{Boolean(item.proximo_contato) ? ` · Próximo: ${new Date(`${String(item.proximo_contato)}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</small><p>{String(item.resultado)}{Boolean(item.descricao) ? ` — ${String(item.descricao)}` : ""}</p></div>{canManage && <div className="row-actions"><button className="table-action" onClick={() => { setSelectedTeen(teens.find((teen) => Number(teen.id) === Number(item.usuario_id)) || null); setSelectedFollowup(item); }}>Editar</button><button className="danger-button" onClick={() => remove(item)}>Excluir</button></div>}</article>)}</div></section>
    {selectedTeen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTeen(null)}><section className="modal"><div className="modal-header"><div><p className="eyebrow">TEENS</p><h2>{selectedFollowup ? "Editar acompanhamento" : "Novo acompanhamento"} — {String(selectedTeen.nome)}</h2></div><button onClick={() => setSelectedTeen(null)}>×</button></div><form className="form-grid" onSubmit={save}><label className="span-2">Resultado*<input name="resultado" required defaultValue={String(selectedFollowup?.resultado || "")} placeholder="Como foi o contato ou acompanhamento" /></label><label className="span-2">Descrição<textarea name="descricao" rows={4} defaultValue={String(selectedFollowup?.descricao || "")} /></label><label>Próximo contato<input type="date" name="proximoContato" defaultValue={String(selectedFollowup?.proximo_contato || "")} /></label><div className="form-actions span-2"><button type="button" className="secondary-button" onClick={() => setSelectedTeen(null)}>Cancelar</button><button className="primary-button">Salvar acompanhamento</button></div></form></section></div>}
  </>;
}
