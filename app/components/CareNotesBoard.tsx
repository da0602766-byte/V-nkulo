"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "./StableLink";

type ChecklistItem = { id: string; texto: string; concluido: boolean };
type CareNote = {
  id: string;
  titulo: string;
  texto: string;
  cor: "amarelo" | "rosa" | "azul" | "verde";
  visitanteId: number | null;
  visitanteNome: string;
  eventoId: number | null;
  eventoTitulo: string;
  checklist: ChecklistItem[];
  criadoEm: string;
  atualizadoEm: string;
};
type Option = { id: number; nome?: string; nome_completo?: string; titulo?: string; inicia_em?: string };

export default function CareNotesBoard({ compact = false }: { compact?: boolean }) {
  const [notes, setNotes] = useState<CareNote[]>([]);
  const [events, setEvents] = useState<Option[]>([]);
  const [visitors, setVisitors] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/pilot/anotacoes", { cache: "no-store" });
      const payload = await response.json() as { anotacoes?: CareNote[]; eventos?: Option[]; visitantes?: Option[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar as anotações.");
      setNotes(payload.anotacoes || []);
      setEvents(payload.eventos || []);
      setVisitors(payload.visitantes || []);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleNotes = useMemo(() => compact ? notes.slice(0, 3) : notes, [compact, notes]);

  async function createNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setFeedback("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const visitorId = Number(data.get("visitanteId")) || null;
    const eventId = Number(data.get("eventoId")) || null;
    const visitor = visitors.find((item) => item.id === visitorId);
    const linkedEvent = events.find((item) => item.id === eventId);
    const checklist = String(data.get("checklist") || "").split(/\r?\n/).map((texto) => texto.trim()).filter(Boolean).slice(0, 16).map((texto, index) => ({ id: `item-${Date.now()}-${index}`, texto, concluido: false }));
    try {
      const response = await fetch("/api/pilot/anotacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: data.get("titulo"), texto: data.get("texto"), cor: data.get("cor"),
          visitanteId: visitorId, visitanteNome: visitor?.nome_completo || "",
          eventoId: eventId, eventoTitulo: linkedEvent?.titulo || "", checklist,
        }),
      });
      const payload = await response.json() as { anotacao?: CareNote; error?: string };
      if (!response.ok || !payload.anotacao) throw new Error(payload.error || "Não foi possível salvar a anotação.");
      setNotes((current) => [payload.anotacao!, ...current]);
      form.reset(); setComposerOpen(false); setFeedback("Post-it salvo. Ele também aparece no Fio do dia.");
    } catch (caught) { setError((caught as Error).message); }
    finally { setSaving(false); }
  }

  async function updateNote(note: CareNote) {
    setNotes((current) => current.map((item) => item.id === note.id ? note : item));
    try {
      const response = await fetch("/api/pilot/anotacoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(note) });
      const payload = await response.json() as { anotacao?: CareNote; error?: string };
      if (!response.ok || !payload.anotacao) throw new Error(payload.error || "Não foi possível atualizar o checklist.");
      setNotes((current) => current.map((item) => item.id === note.id ? payload.anotacao! : item));
    } catch (caught) { setError((caught as Error).message); void load(); }
  }

  async function removeNote(note: CareNote) {
    if (!window.confirm(`Excluir o post-it “${note.titulo}”?`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/pilot/anotacoes?id=${encodeURIComponent(note.id)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir a anotação.");
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setFeedback("Post-it removido.");
    } catch (caught) { setError((caught as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <section className={`care-notes-board ${compact ? "is-compact" : ""}`} aria-labelledby={compact ? "care-notes-title-compact" : "care-notes-title"}>
      <header>
        <div><span aria-hidden="true">▰</span><div><p className="pilot-kicker">POST-ITS</p><h2 id={compact ? "care-notes-title-compact" : "care-notes-title"}>Minhas anotações de cuidado</h2><small>Privadas para você · vínculos opcionais</small></div></div>
        <button type="button" onClick={() => setComposerOpen((open) => !open)} aria-expanded={composerOpen}>{composerOpen ? "Fechar" : "＋ Novo post-it"}</button>
      </header>
      {composerOpen && <form className="care-note-composer" onSubmit={createNote}>
        <label>Título<input name="titulo" maxLength={100} required placeholder="Ex.: Ligar para a família Oliveira" /></label>
        <label>Cor<select name="cor" defaultValue="amarelo"><option value="amarelo">Amarelo</option><option value="rosa">Rosa</option><option value="azul">Azul</option><option value="verde">Verde</option></select></label>
        <label className="wide">Anotação<textarea name="texto" rows={3} maxLength={1200} placeholder="Contexto que você quer lembrar…" /></label>
        <label>Vincular visitante <small>opcional</small><select name="visitanteId" defaultValue=""><option value="">Sem vínculo</option>{visitors.map((item) => <option value={item.id} key={item.id}>{item.nome_completo}</option>)}</select></label>
        <label>Vincular evento <small>opcional</small><select name="eventoId" defaultValue=""><option value="">Sem vínculo</option>{events.map((item) => <option value={item.id} key={item.id}>{item.titulo}</option>)}</select></label>
        <label className="wide">Checklist <small>uma tarefa por linha</small><textarea name="checklist" rows={3} maxLength={1800} placeholder={"Enviar mensagem\nConfirmar presença\nRegistrar retorno"} /></label>
        <footer><span>O post-it ficará disponível em Visitantes e no Fio do dia.</span><button disabled={saving}>{saving ? "Salvando…" : "Criar post-it"}</button></footer>
      </form>}
      {(feedback || error) && <p className={`care-note-feedback ${error ? "is-error" : ""}`} role="status">{error || feedback}</p>}
      <div className="care-notes-grid" aria-busy={loading}>
        {visibleNotes.map((note) => {
          const completed = note.checklist.filter((item) => item.concluido).length;
          return <article className="care-note" data-color={note.cor} key={note.id}>
            <header><span aria-hidden="true">●</span><small>{completed}/{note.checklist.length || 0} concluídos</small><button type="button" disabled={saving} onClick={() => void removeNote(note)} aria-label={`Excluir ${note.titulo}`}>×</button></header>
            <h3>{note.titulo}</h3>{note.texto && <p>{note.texto}</p>}
            {(note.visitanteNome || note.eventoTitulo) && <nav aria-label="Vínculos do post-it">{note.visitanteNome && <Link href={`/painel?view=visitantes&visitante=${note.visitanteId}`}>Pessoa · {note.visitanteNome}</Link>}{note.eventoTitulo && <Link href={`/painel?view=eventos&evento=${note.eventoId}`}>Evento · {note.eventoTitulo}</Link>}</nav>}
            {note.checklist.length > 0 && <div className="care-note-checklist">{note.checklist.map((item) => <label className={item.concluido ? "done" : ""} key={item.id}><input type="checkbox" checked={item.concluido} onChange={() => void updateNote({ ...note, checklist: note.checklist.map((entry) => entry.id === item.id ? { ...entry, concluido: !entry.concluido } : entry) })} /><span>{item.texto}</span></label>)}</div>}
          </article>;
        })}
        {!loading && !notes.length && <div className="care-notes-empty"><span aria-hidden="true">▱</span><strong>Nenhum post-it ainda</strong><p>Crie uma lembrança livre ou, se desejar, relacione uma pessoa ou evento.</p></div>}
        {loading && <div className="care-notes-empty"><strong>Organizando suas anotações…</strong></div>}
      </div>
      {compact && notes.length > visibleNotes.length && <Link className="care-notes-more" href="/painel?view=visitantes">Ver todos os {notes.length} post-its em Visitantes →</Link>}
    </section>
  );
}
