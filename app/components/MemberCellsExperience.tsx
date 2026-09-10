"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

type MemberCell = {
  id: number;
  nome: string;
  responsavel: string;
  dias_reuniao: string[];
  endereco_publico: string;
  descricao_publica: string;
  lider_nome: string | null;
  membros_total: number;
  ativo: number;
  agenda: Array<{
    id: number;
    titulo: string;
    inicia_em: string;
    termina_em: string;
    lembrete: string;
    visibilidade: "PUBLICO" | "PRIVADO";
  }>;
  membro_atual?: boolean;
  solicitacao_id?: number | null;
  solicitacao_status?: string | null;
  solicitacao_criada_em?: string | null;
};

type MemberRequest = {
  id: number;
  celula_id: number;
  status: string;
  criado_em: string;
  atualizado_em: string;
};

const dayLabels: Record<string, string> = {
  DOM: "Domingo",
  SEG: "Segunda-feira",
  TER: "Terça-feira",
  QUA: "Quarta-feira",
  QUI: "Quinta-feira",
  SEX: "Sexta-feira",
  SAB: "Sábado",
};

const shortDayLabels: Record<string, string> = {
  DOM: "Dom",
  SEG: "Seg",
  TER: "Ter",
  QUA: "Qua",
  QUI: "Qui",
  SEX: "Sex",
  SAB: "Sáb",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function statusText(cell: MemberCell) {
  if (cell.membro_atual) return "Já participo";
  if (cell.solicitacao_status === "PENDENTE") return "Solicitação pendente";
  if (cell.solicitacao_status === "APROVADA") return "Aprovada";
  if (cell.solicitacao_status === "RECUSADA") return "Recusada";
  if (cell.solicitacao_status === "CANCELADA") return "Aberta";
  return "Aberta";
}

function statusTone(cell: MemberCell) {
  if (cell.membro_atual) return "member";
  if (cell.solicitacao_status === "PENDENTE") return "pending";
  if (cell.solicitacao_status === "RECUSADA") return "muted";
  return "open";
}

async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result;
}

function downloadCalendarEvent(cell: MemberCell, meeting: MemberCell["agenda"][number]) {
  const start = new Date(meeting.inicia_em);
  const end = new Date(meeting.termina_em);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  const stamp = (date: Date) => date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
  const escape = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vinkulo//Celulas//PT-BR",
    "BEGIN:VEVENT",
    `UID:vinkulo-celula-${cell.id}-${meeting.id}@vinkulo`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(meeting.titulo || `Encontro da célula ${cell.nome}`)}`,
    `LOCATION:${escape(cell.endereco_publico || "Local informado pela liderança")}`,
    `DESCRIPTION:${escape(meeting.lembrete || `Encontro da célula ${cell.nome}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `celula-${cell.nome.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/gi, "-")}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function MemberCellsExperience({ communityName, canOpenManagement, onOpenManagement }: { communityName: string; canOpenManagement?: boolean; onOpenManagement?: () => void }) {
  const [cells, setCells] = useState<MemberCell[]>([]);
  const [requests, setRequests] = useState<MemberRequest[]>([]);
  const [search, setSearch] = useState("");
  const [day, setDay] = useState("TODOS");
  const [weekOnly, setWeekOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiJson<{ celulas: MemberCell[]; minhasSolicitacoes: MemberRequest[] }>("/api/pilot/celulas");
      setCells(result.celulas || []);
      setRequests(result.minhasSolicitacoes || []);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNow(Date.now());
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = cells.find((cell) => cell.id === selectedId) || null;
  const activeCells = cells.filter((cell) => Boolean(cell.ativo));
  const myCell = activeCells.find((cell) => cell.membro_atual) || null;
  const pendingRequests = requests.filter((request) => request.status === "PENDENTE");
  const nextWeek = now + 7 * 24 * 60 * 60 * 1000;
  const upcoming = activeCells.flatMap((cell) => cell.agenda.filter((meeting) => {
    const time = Date.parse(meeting.inicia_em);
    return Number.isFinite(time) && time >= now && time <= nextWeek && meeting.visibilidade === "PUBLICO";
  }).map((meeting) => ({ cell, meeting }))).sort((a, b) => Date.parse(a.meeting.inicia_em) - Date.parse(b.meeting.inicia_em));

  const visibleCells = activeCells.filter((cell) => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    if (day !== "TODOS" && !cell.dias_reuniao.includes(day)) return false;
    if (weekOnly && !cell.agenda.some((meeting) => {
      const time = Date.parse(meeting.inicia_em);
      return Number.isFinite(time) && time >= now && time <= nextWeek && meeting.visibilidade === "PUBLICO";
    })) return false;
    if (!normalized) return true;
    return [cell.nome, cell.endereco_publico, cell.descricao_publica, cell.lider_nome, cell.responsavel]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalized));
  });

  useEffect(() => {
    if (!selectedId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelectedId(null); setRequestOpen(false); } };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", close); };
  }, [selectedId]);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true); setError(""); setMessage("");
    try {
      await apiJson(`/api/pilot/celulas/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "SOLICITACAO_CRIAR",
          contato: data.get("contato"),
          mensagem: data.get("mensagem"),
          autorizacaoContato: data.get("autorizacaoContato") === "on",
        }),
      });
      setRequestOpen(false);
      setMessage(`Solicitação enviada para ${selected.nome}.`);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function cancelRequest(cell: MemberCell) {
    if (!cell.solicitacao_id || saving || !window.confirm("Cancelar esta solicitação?")) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await apiJson(`/api/pilot/celulas/${cell.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "SOLICITACAO_CANCELAR", solicitacaoId: cell.solicitacao_id }),
      });
      setMessage("Solicitação cancelada.");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="member-cells-workspace" aria-busy={loading}>
      <header className="member-cells-heading">
        <div><p className="pilot-kicker">CÉLULAS · {communityName}</p><h1>Caminhe com pessoas</h1><p>Encontre uma célula, conheça a proposta e solicite sua entrada.</p></div>
        <div className="member-cells-heading-actions">
          {canOpenManagement && onOpenManagement && <button type="button" className="member-cells-management-toggle" onClick={onOpenManagement}>Visão de gestão</button>}
          <span className="member-cells-heading-mark" aria-hidden="true">⌂</span>
        </div>
      </header>

      {message && <p className="member-cells-feedback success" role="status">{message}</p>}
      {error && <p className="member-cells-feedback error" role="alert">{error} <button type="button" onClick={() => void load()}>Tentar novamente</button></p>}

      <section className="member-cells-summary" aria-label="Resumo da sua participação">
        <article className={myCell ? "is-highlight" : ""}><small>Minha célula</small><strong>{myCell ? myCell.nome : "Ainda não"}</strong><span>{myCell ? `${myCell.membros_total} membros` : "Encontre um grupo para caminhar"}</span></article>
        <article><small>Solicitações abertas</small><strong>{pendingRequests.length}</strong><span>{pendingRequests.length ? "Acompanhe o retorno" : "Nenhuma pendente"}</span></article>
        <article><small>Próximos 7 dias</small><strong>{upcoming.length}</strong><span>{upcoming.length ? "Encontros disponíveis" : "Nenhum encontro marcado"}</span></article>
        <article><small>Células abertas</small><strong>{activeCells.length}</strong><span>Na comunidade atual</span></article>
      </section>

      <div className="member-cells-layout">
        <main className="member-cells-directory">
          <div className="member-cells-toolbar">
            <label className="member-cells-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, bairro ou líder..." aria-label="Buscar por nome, bairro ou líder" /></label>
            <div className="member-cells-filters" role="group" aria-label="Filtros de células">
              <label><span>Dia</span><select value={day} onChange={(event) => setDay(event.target.value)}><option value="TODOS">Todos os dias</option>{Object.entries(dayLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <button type="button" className={weekOnly ? "active" : ""} aria-pressed={weekOnly} onClick={() => setWeekOnly((value) => !value)}>Com encontro esta semana</button>
              {(search || day !== "TODOS" || weekOnly) && <button type="button" className="clear" onClick={() => { setSearch(""); setDay("TODOS"); setWeekOnly(false); }}>Limpar filtros</button>}
            </div>
          </div>

          <header className="member-cells-list-heading"><div><p className="pilot-kicker">ENCONTRE SUA CÉLULA</p><h2>Células disponíveis</h2></div><span>{visibleCells.length} encontrada{visibleCells.length === 1 ? "" : "s"}</span></header>
          <div className="member-cells-list">
            {loading && <p className="member-cells-empty">Carregando células…</p>}
            {!loading && !visibleCells.length && <div className="member-cells-empty"><strong>Nenhuma célula encontrada</strong><span>Tente outro nome, bairro ou dia da semana.</span>{(search || day !== "TODOS" || weekOnly) && <button type="button" onClick={() => { setSearch(""); setDay("TODOS"); setWeekOnly(false); }}>Limpar filtros</button>}</div>}
            {visibleCells.map((cell) => <button type="button" className={`member-cell-row ${myCell?.id === cell.id ? "is-mine" : ""}`} key={cell.id} onClick={() => setSelectedId(cell.id)}>
              <span className="member-cell-avatar" aria-hidden="true">{cell.nome.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
              <span className="member-cell-row-copy"><strong>{cell.nome}</strong><small>{cell.endereco_publico || "Local informado após o contato"}</small><span>{cell.dias_reuniao.map((item) => shortDayLabels[item] || item).join(" · ") || "Dia a definir"}{cell.lider_nome ? ` · ${cell.lider_nome}` : ""}</span></span>
              <span className={`member-cell-status ${statusTone(cell)}`}>{statusText(cell)}</span><span className="member-cell-arrow" aria-hidden="true">›</span>
            </button>)}
          </div>
        </main>

        <aside className="member-cells-side" aria-label="Acompanhe sua participação">
          <section><header><div><p className="pilot-kicker">MINHAS SOLICITAÇÕES</p><h2>Acompanhe seu pedido</h2></div><span>{requests.length}</span></header>{!requests.length && <p className="member-cells-side-empty">Quando você solicitar entrada, o andamento aparecerá aqui.</p>}{requests.slice(0, 5).map((request) => { const cell = cells.find((item) => item.id === request.celula_id); return <article key={request.id}><div><strong>{cell?.nome || "Célula"}</strong><small>{formatDate(request.criado_em)}</small></div><span className={`member-request-status ${request.status.toLowerCase()}`}>{request.status === "PENDENTE" ? "Aguardando aprovação" : request.status === "APROVADA" ? "Aprovada" : request.status === "RECUSADA" ? "Recusada" : "Cancelada"}</span></article>; })}</section>
          <section><header><div><p className="pilot-kicker">PRÓXIMOS ENCONTROS</p><h2>O que vem por aí</h2></div><span>{upcoming.length}</span></header>{!upcoming.length && <p className="member-cells-side-empty">As próximas reuniões da sua célula aparecerão aqui.</p>}{upcoming.slice(0, 4).map(({ cell, meeting }) => <article key={`${cell.id}-${meeting.id}`}><time>{formatDateTime(meeting.inicia_em)}</time><strong>{cell.nome}</strong><small>{meeting.titulo}{cell.endereco_publico ? ` · ${cell.endereco_publico}` : ""}</small></article>)}</section>
          <section className="member-cells-how"><p className="pilot-kicker">COMO FUNCIONA</p><h2>Um passo de cada vez</h2><ol><li><b>1</b><span>Encontre uma célula que combine com você.</span></li><li><b>2</b><span>Conheça o horário, local e proposta.</span></li><li><b>3</b><span>Envie sua solicitação e aguarde a liderança.</span></li></ol></section>
        </aside>
      </div>

      {selected && <div className="member-cell-detail-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedId(null); setRequestOpen(false); } }}>
        <section className="member-cell-detail" role="dialog" aria-modal="true" aria-labelledby="member-cell-detail-title">
          <button type="button" className="member-cell-detail-close" aria-label="Fechar perfil da célula" onClick={() => { setSelectedId(null); setRequestOpen(false); }}>×</button>
          <header><span className="member-cell-detail-mark" aria-hidden="true">{selected.nome.slice(0, 1).toLocaleUpperCase("pt-BR")}</span><div><p className="pilot-kicker">PERFIL DA CÉLULA</p><h2 id="member-cell-detail-title">{selected.nome}</h2><span className={`member-cell-status ${statusTone(selected)}`}>{statusText(selected)}</span></div></header>
          <p className="member-cell-detail-description">{selected.descricao_publica || "Um espaço para criar vínculos, crescer na fé e caminhar em comunidade."}</p>
          <dl className="member-cell-facts"><div><dt>Quando</dt><dd>{selected.dias_reuniao.map((item) => dayLabels[item] || item).join(", ") || "A definir"}</dd></div><div><dt>Liderança</dt><dd>{selected.lider_nome || selected.responsavel || "Informações após o contato"}</dd></div><div><dt>Participantes</dt><dd>{selected.membros_total} membros</dd></div><div><dt>Onde</dt><dd>{selected.endereco_publico || "Local informado pela liderança"}</dd></div></dl>
          {selected.agenda.length > 0 && <section className="member-cell-meetings"><h3>Próximas reuniões</h3>{selected.agenda.filter((meeting) => Date.parse(meeting.inicia_em) >= now && meeting.visibilidade === "PUBLICO").slice(0, 4).map((meeting) => <article key={meeting.id}><div><time>{formatDateTime(meeting.inicia_em)}</time><strong>{meeting.titulo}</strong><small>{meeting.lembrete || selected.endereco_publico || "Detalhes com a liderança"}</small></div><button type="button" onClick={() => { if (window.confirm("Adicionar esta reunião ao calendário do seu dispositivo?")) downloadCalendarEvent(selected, meeting); }}>Adicionar ao calendário</button></article>)}</section>}
          <footer className="member-cell-detail-actions">
            {selected.solicitacao_status === "PENDENTE" ? <><span className="member-cell-pending-copy">Sua solicitação está aguardando a aprovação da liderança.</span><button type="button" className="secondary" disabled={saving} onClick={() => void cancelRequest(selected)}>Cancelar solicitação</button></> : selected.membro_atual ? <span className="member-cell-pending-copy">Esta é a célula da qual você participa.</span> : <button type="button" onClick={() => setRequestOpen(true)} disabled={saving}>Solicitar entrada</button>}
          </footer>
          {requestOpen && <form className="member-cell-request-form" onSubmit={submitRequest}><h3>Solicitar entrada</h3><p>Envie uma forma de contato para a liderança retornar para você.</p><label>Telefone, WhatsApp ou e-mail<input name="contato" required maxLength={160} autoComplete="email" /></label><label>Mensagem <span>opcional</span><textarea name="mensagem" rows={3} maxLength={500} placeholder="Conte um pouco sobre você ou o melhor horário para contato." /></label><label className="member-cell-consent"><input name="autorizacaoContato" type="checkbox" required />Autorizo o envio destes dados à liderança desta célula.</label><div><button type="button" className="secondary" onClick={() => setRequestOpen(false)}>Voltar</button><button disabled={saving}>{saving ? "Enviando…" : "Enviar solicitação"}</button></div></form>}
        </section>
      </div>}
    </section>
  );
}
