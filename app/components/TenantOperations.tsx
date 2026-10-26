"use client";
import {createPortal} from 'react-dom';
import SafeImage from './SafeImage';
import TransientFeedback from './TransientFeedback';
import {type FormEvent,useCallback,useEffect,useState} from 'react';
type Cell = {
  id: number;
  nome: string;
  responsavel: string;
  observacoes: string | null;
  visitantes_ativos: number;
  dias_reuniao: string[];
  endereco_publico: string;
  descricao_publica: string;
  lider_usuario_id: number | null;
  lider_nome: string | null;
  vice_lider_usuario_id: number | null;
  vice_lider_nome: string | null;
  ultimo_relatorio_em: string | null;
  arquivada_em: string | null;
  ativo: number;
  can_operate: boolean;
  membros_total: number;
  membros: Array<{
    id: string;
    kind: "COMMUNITY" | "EXTERNAL";
    userId?: number;
    name: string;
    note?: string;
    role?: "LEADER" | "VICE_LEADER" | "MEMBER";
    email?: string;
    telefone?: string | null;
    fotoPerfil?: string | null;
    papelComunidade?: string;
  }>;
  agenda: Array<{ id: number; titulo: string; inicia_em: string; termina_em: string; lembrete: string; visibilidade: "PUBLICO" | "PRIVADO" }>;
  relatorios: Array<{ id: number; data_reuniao: string; aconteceu: number; presentes: number; visitantes: number; observacoes: string; enviado_por_nome: string | null }>;
  solicitacoes: Array<{ id: number; nome: string; contato: string; mensagem: string; criado_em: string }>;
};

type CellHealth = {
  id: "AGUARDANDO" | "SEM_RELATORIO" | "ATENCAO" | "MULTIPLICAR" | "SAUDAVEL";
  label: string;
  weeks: number[];
  semanasEmDia: number;
  mediaPresentes: number;
};

const CELL_HEALTH_WEEKS = 8;
const CELL_REPORT_GRACE_DAYS = 21;

function cellHealth(cell: Cell, agora: number): CellHealth {
  // Antes do relógio acertar no cliente não dá para julgar atraso sem chutar
  // uma data, e chutar aqui pintaria célula saudável de vermelho.
  if (!agora) {
    return {
      id: "AGUARDANDO",
      label: "Calculando",
      weeks: [],
      semanasEmDia: 0,
      mediaPresentes: 0,
    };
  }
  // Os relatórios chegam da rota em ordem decrescente de data.
  const recentes = cell.relatorios.slice(0, CELL_HEALTH_WEEKS);
  const weeks = [...recentes]
    .reverse()
    .map((item) => (item.aconteceu ? Number(item.presentes) || 0 : 0));
  const semanasEmDia = recentes.filter((item) => item.aconteceu).length;
  const comPresenca = weeks.filter((valor) => valor > 0);
  const mediaPresentes = comPresenca.length
    ? Math.round(comPresenca.reduce((soma, valor) => soma + valor, 0) / comPresenca.length)
    : 0;

  const ultimo = cell.ultimo_relatorio_em
    ? Date.parse(cell.ultimo_relatorio_em)
    : Number.NaN;
  const diasSemReportar = Number.isNaN(ultimo)
    ? Number.POSITIVE_INFINITY
    : Math.floor((agora - ultimo) / 86400000);

  if (diasSemReportar > CELL_REPORT_GRACE_DAYS) {
    const semanas = Number.isFinite(diasSemReportar)
      ? Math.floor(diasSemReportar / 7)
      : 0;
    return {
      id: "SEM_RELATORIO",
      label: semanas
        ? `Sem relatório há ${semanas} ${semanas === 1 ? "semana" : "semanas"}`
        : "Sem relatório",
      weeks,
      semanasEmDia,
      mediaPresentes,
    };
  }

  // Encolhendo: a média das duas últimas semanas caiu abaixo de 70% da média
  // das quatro anteriores. Uma semana ruim sozinha não acusa nada.
  const ultimas = weeks.slice(-2).filter((valor) => valor > 0);
  const anteriores = weeks.slice(-6, -2).filter((valor) => valor > 0);
  const mediaUltimas = ultimas.length
    ? ultimas.reduce((soma, valor) => soma + valor, 0) / ultimas.length
    : 0;
  const mediaAnteriores = anteriores.length
    ? anteriores.reduce((soma, valor) => soma + valor, 0) / anteriores.length
    : 0;
  const encolhendo = mediaAnteriores > 0 && mediaUltimas < mediaAnteriores * 0.7;

  if (encolhendo) {
    return { id: "ATENCAO", label: "Atenção", weeks, semanasEmDia, mediaPresentes };
  }
  if (mediaPresentes >= 15 && semanasEmDia >= 6) {
    return {
      id: "MULTIPLICAR",
      label: "Pronta p/ multiplicar",
      weeks,
      semanasEmDia,
      mediaPresentes,
    };
  }
  return { id: "SAUDAVEL", label: "Saudável", weeks, semanasEmDia, mediaPresentes };
}

export function CellsWorkspace({
  permissions,
  communityName,
}: {
  permissions: string[];
  communityName: string;
}) {
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: number; nome: string; papel: string }>>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<"visao" | "integrantes" | "agenda" | "relatorio" | "solicitacoes" | "entrar">("visao");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<Cell["membros"][number] | null>(null);
  const [cellSearch, setCellSearch] = useState("");
  const [cellStatus, setCellStatus] = useState<"all" | "active" | "archived">("all");
  const [cellHealthFilter, setCellHealthFilter] = useState<"all" | CellHealth["id"]>("all");
  // O relógio vem de estado: lê-lo durante a renderização daria valores
  // diferentes no servidor e no cliente e quebraria a hidratação.
  const [agora, setAgora] = useState(0);
  const canManage = permissions.includes("cells.manage");

  const loadCells = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await apiJson<{ celulas: Cell[]; availableUsers?: Array<{ id: number; nome: string; papel: string }> }>("/api/pilot/celulas");
      setCells(result.celulas);
      setAvailableUsers(result.availableUsers || []);
      setSelectedId((current) => current && result.celulas.some((cell) => cell.id === current) ? current : null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCells();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCells]);

  useEffect(() => {
    const acertar = () => setAgora(Date.now());
    const primeiro = window.setTimeout(acertar, 0);
    const relogio = window.setInterval(acertar, 3600000);
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(relogio);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedId]);

  async function createCell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = { ...Object.fromEntries(data.entries()), diasReuniao: data.getAll("diasReuniao") };
    try {
      await apiJson("/api/pilot/celulas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      form.reset();
      setCreateOpen(false);
      setMessage("Célula criada com os dias e a liderança definidos.");
      await loadCells(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateCell(cell: Cell) {
    if (
      saving ||
      !window.confirm(
        `Arquivar ${cell.nome}? A gestão pastoral poderá reativá-la depois.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiJson(`/api/pilot/celulas/${cell.id}`, { method: "DELETE" });
      setMessage("Célula arquivada.");
      await loadCells(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function updateCellMember(
    cell: Cell,
    action: "MEMBRO_ADICIONAR_INTERNO" | "MEMBRO_ADICIONAR_EXTERNO" | "MEMBRO_REMOVER",
    body: Record<string, unknown>,
    form?: HTMLFormElement,
  ) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiJson(`/api/pilot/celulas/${cell.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: action, ...body }),
      });
      form?.reset();
      setMessage("Integrantes da célula atualizados sem recarregar a página.");
      await loadCells(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function cellAction(cell: Cell, body: Record<string, unknown>, form?: HTMLFormElement) {
    if (saving) return;
    setSaving(true); setMessage(""); setError("");
    try {
      await apiJson(`/api/pilot/celulas/${cell.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      form?.reset();
      setMessage(body.acao === "RELATORIO_CRIAR" ? "Relatório enviado ao acompanhamento pastoral." : "Alteração salva.");
      await loadCells(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally { setSaving(false); }
  }

  async function requestCellEntry(cell: Cell, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setMessage(""); setError("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await apiJson(`/api/public/celulas/${cell.id}/solicitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      form.reset();
      setMessage(`Solicitação enviada à liderança da célula ${cell.nome}.`);
      setTab("visao");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const selected = cells.find((cell) => cell.id === selectedId) || null;
  const dayLabels: Record<string, string> = { DOM: "Dom", SEG: "Seg", TER: "Ter", QUA: "Qua", QUI: "Qui", SEX: "Sex", SAB: "Sáb" };
  const activeCells = cells.filter((cell) => cell.ativo);
  const membersTotal = activeCells.reduce((total, cell) => total + cell.membros_total, 0);
  const meetingsTotal = activeCells.reduce((total, cell) => total + cell.agenda.length, 0);
  const normalizedCellSearch = cellSearch.trim().toLocaleLowerCase("pt-BR");
  const healthById = new Map(cells.map((cell) => [cell.id, cellHealth(cell, agora)]));
  const healthCounts = cells.reduce<Record<string, number>>((acc, cell) => {
    if (!cell.ativo) return acc;
    const id = healthById.get(cell.id)!.id;
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});
  const visibleCells = cells.filter((cell) => {
    if (cellStatus === "active" && !cell.ativo) return false;
    if (cellStatus === "archived" && cell.ativo) return false;
    if (cellHealthFilter !== "all" && healthById.get(cell.id)!.id !== cellHealthFilter) return false;
    if (!normalizedCellSearch) return true;
    return [cell.nome, cell.descricao_publica, cell.endereco_publico, cell.lider_nome, cell.responsavel]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalizedCellSearch));
  });

  return (
    <section className="cells-workspace-v2" aria-busy={loading}>
      <header className="cells-hero-v2 cells-hero-v4">
        <div><p className="pilot-kicker">CÉLULAS · {communityName}</p><h1>Grupos que aproximam pessoas</h1><p>Acompanhe líderes, encontros e relatórios sem perder a visão de cada célula.</p></div>
        {canManage && <button className="cell-create-trigger-v4" type="button" onClick={() => setCreateOpen(true)}><span aria-hidden="true">＋</span> Criar célula</button>}
      </header>
      <OperationFeedback message={message} error={error} />
      <section className="cells-summary-v4" aria-label="Resumo das células">
        <article><small>Ativas</small><strong>{activeCells.length}</strong></article>
        <article><small>Pessoas</small><strong>{membersTotal}</strong></article>
        <article><small>Próximos encontros</small><strong>{meetingsTotal}</strong></article>
        <article><small>Relatórios em dia</small><strong>{activeCells.filter((cell) => cell.ultimo_relatorio_em).length}<span> de {activeCells.length}</span></strong></article>
        <article data-alerta={(healthCounts.SEM_RELATORIO || 0) > 0 ? "1" : undefined}><small>Sem relatório</small><strong>{healthCounts.SEM_RELATORIO || 0}<span> há mais de 3 semanas</span></strong></article>
      </section>
      <div className="cell-shell-v2 cell-shell-v4">
        <aside className="cell-index-v2" aria-label="Células da comunidade">
          <header><div><p className="pilot-kicker">DIRETÓRIO</p><h2>Células da comunidade</h2><small>Abra uma célula para consultar ou administrar suas informações.</small></div><span>{activeCells.length} ativas · {cells.filter((cell) => !cell.ativo).length} arquivadas</span></header>
          <div className="cell-directory-toolbar-v4">
            <label className="cell-directory-search-v4"><span aria-hidden="true">⌕</span><input value={cellSearch} onChange={(event) => setCellSearch(event.target.value)} placeholder="Buscar célula, líder ou bairro" aria-label="Buscar célula, líder ou bairro" /></label>
            <div className="cell-directory-status-v4" role="group" aria-label="Filtrar células por situação">
              {([['all','Todas'],['active','Ativas'],['archived','Arquivadas']] as const).map(([value, label]) => <button key={value} type="button" className={cellStatus === value ? "active" : ""} aria-pressed={cellStatus === value} onClick={() => setCellStatus(value)}>{label}</button>)}
            </div>
            <div className="cell-health-filter-v5" role="group" aria-label="Filtrar células por saúde">
              {([
                ['all', 'Saúde: todas', 0],
                ['SEM_RELATORIO', 'Sem relatório', healthCounts.SEM_RELATORIO || 0],
                ['ATENCAO', 'Atenção', healthCounts.ATENCAO || 0],
                ['MULTIPLICAR', 'Prontas p/ multiplicar', healthCounts.MULTIPLICAR || 0],
                ['SAUDAVEL', 'Saudáveis', healthCounts.SAUDAVEL || 0],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  data-saude={value}
                  className={cellHealthFilter === value ? "active" : ""}
                  aria-pressed={cellHealthFilter === value}
                  onClick={() => setCellHealthFilter(value as "all" | CellHealth["id"])}
                >
                  {label}{value !== 'all' && <span>{count}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="cell-directory-v4">
            {visibleCells.map((cell) => <button type="button" key={cell.id} className={`${selectedId === cell.id ? "active" : ""}${!cell.ativo ? " archived" : ""}`} onClick={() => { setSelectedId(cell.id); setTab("visao"); }}><span className="cell-row-avatar-v4" aria-hidden="true">{cell.nome.slice(0, 1)}</span><span className="cell-row-copy-v4"><span><i>{cell.ativo ? "Ativa" : "Arquivada"}</i><strong>{cell.nome}</strong></span><small>{cell.descricao_publica || "Descrição pública ainda não informada."}</small><span className="cell-row-health-v5">{(() => { const saude = healthById.get(cell.id)!; const teto = Math.max(1, ...saude.weeks); return (<><i className="cell-health-pill-v5" data-saude={saude.id}>{saude.label}</i><span className="cell-health-weeks-v5" aria-hidden="true">{saude.weeks.map((valor, indice) => <i key={indice} data-vazio={valor === 0 ? "1" : undefined} style={{ height: `${Math.max(12, Math.round((valor / teto) * 100))}%` }} />)}</span><small>{saude.semanasEmDia}/8 relatórios</small></>); })()}</span></span><span className="cell-row-fact-v4"><small>Encontros</small><strong>{cell.dias_reuniao.map((day) => dayLabels[day] || day).join(", ") || "A definir"}</strong></span><span className="cell-row-fact-v4"><small>Pessoas</small><strong>{cell.membros_total + cell.visitantes_ativos}</strong></span><span className="cell-row-fact-v4"><small>Liderança</small><strong>{cell.lider_nome || cell.responsavel || "A definir"}</strong></span><span className="cell-row-arrow-v4" aria-hidden="true">›</span></button>)}
            {!loading && !visibleCells.length && <p className="cell-directory-empty-v4">Nenhuma célula encontrada com esses filtros.</p>}
          </div>
        </aside>
        {selected && <div className="cell-detail-overlay-v2" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
        <main className="cell-detail-v2 cell-detail-v4" role="dialog" aria-modal="true" aria-label={`Detalhes da célula ${selected.nome}`}>
          <button className="cell-detail-close-v2" type="button" aria-label="Fechar detalhes" onClick={() => setSelectedId(null)}>×</button>
          <>
            <header className="cell-detail-head-v2"><div><small>DETALHES DA CÉLULA</small><div className="cell-detail-title-v4"><h2>{selected.nome}</h2><span>{selected.ativo ? "Ativa" : "Arquivada"}</span></div><p>{selected.descricao_publica || "Descrição pública ainda não informada."}</p><div className="cell-day-pills"><small>Encontros</small>{selected.dias_reuniao.map((day) => <span key={day}>{dayLabels[day] || day}</span>)}</div></div></header>
            <dl className="cell-metrics-v2"><div><dt>Membros</dt><dd>{selected.membros_total}</dd></div><div><dt>Visitantes</dt><dd>{selected.visitantes_ativos + selected.membros.filter((member) => member.kind === "EXTERNAL").length}</dd></div><div><dt>Liderança</dt><dd>{selected.vice_lider_nome ? "2" : "1"}</dd></div><div><dt>Próximos encontros</dt><dd>{selected.agenda.length}</dd></div></dl>
            <div className="cell-detail-body-v4">
            <nav className="cell-tabs-v2" aria-label="Seções da célula">{(selected.can_operate ? [["visao","Visão geral"],["integrantes","Integrantes"],["agenda","Agenda"],["relatorio","Relatório semanal"],["solicitacoes",`Solicitações ${selected.solicitacoes.length || ""}`]] : [["visao","Informações"],["agenda","Próximos encontros"],["entrar","Solicitar entrada"]]).map(([id,label], index) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id as typeof tab)}><span>{String(index + 1).padStart(2,"0")}</span>{label}</button>)}</nav>
            <div className="cell-detail-content-v4">
            {tab === "visao" && <section className="cell-overview-v2"><article><span aria-hidden="true">♙</span><div><small>LIDERANÇA</small><strong>{selected.lider_nome || selected.responsavel}</strong><p>{selected.vice_lider_nome ? `Vice-líder: ${selected.vice_lider_nome}` : "Vice-líder ainda não definido"}</p></div></article><article><span aria-hidden="true">⌖</span><div><small>LOCAL PÚBLICO</small><strong>{selected.endereco_publico || "A definir"}</strong><p>Visível para quem procura uma célula.</p></div></article><article><span aria-hidden="true">✓</span><div><small>ÚLTIMO RELATÓRIO</small><strong>{selected.ultimo_relatorio_em ? new Date(selected.ultimo_relatorio_em).toLocaleDateString("pt-BR") : "Pendente"}</strong><p>Após 60 dias sem relatório, a célula é arquivada.</p></div></article>{canManage && <article className="cell-danger-v2"><span aria-hidden="true">⚙</span><div><small>GESTÃO PASTORAL</small><strong>{selected.ativo ? "Célula em atividade" : "Célula arquivada"}</strong>{selected.ativo ? <button type="button" onClick={() => void deactivateCell(selected)}>Arquivar célula</button> : <button type="button" onClick={() => void cellAction(selected, { acao: "REATIVAR" })}>Reativar célula</button>}</div></article>}</section>}
            {tab === "integrantes" && <section className="cell-members-v2">
              <div className="cell-member-list">{selected.membros.map((member) => <article key={member.id}>
                <span aria-hidden="true">{member.name.slice(0,1)}</span>
                <div><strong>{member.name}</strong><small>{member.role === "LEADER" ? "Líder" : member.role === "VICE_LEADER" ? "Vice-líder" : member.kind === "EXTERNAL" ? `Visitante${member.note ? ` · ${member.note}` : ""}` : "Membro"}</small>{member.kind === "COMMUNITY" && <button type="button" className="cell-member-profile-open" onClick={() => setSelectedMemberProfile(member)}>Ver perfil</button>}</div>
                {selected.can_operate && member.role !== "LEADER" && <div className="cell-member-actions">{member.kind === "COMMUNITY" && member.role !== "VICE_LEADER" && <button type="button" onClick={() => void cellAction(selected, { acao: "MEMBRO_PROMOVER_VICE", membroId: member.id })}>Promover</button>}<button type="button" className="danger-link" onClick={() => void updateCellMember(selected, "MEMBRO_REMOVER", { membroId: member.id })}>Remover</button></div>}
              </article>)}</div>
              {selected.can_operate && <div className="cell-add-members-v2"><form onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); void updateCellMember(selected,"MEMBRO_ADICIONAR_INTERNO",{usuarioId:Number(data.get("usuarioId"))},form); }}><label>Membro da comunidade<select name="usuarioId" required defaultValue=""><option value="" disabled>Selecione</option>{availableUsers.map((user)=><option value={user.id} key={user.id}>{user.nome} · {user.papel}</option>)}</select></label><button disabled={saving}>Adicionar</button></form><form onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); void updateCellMember(selected,"MEMBRO_ADICIONAR_EXTERNO",{nomeExterno:data.get("nomeExterno"),descricaoExterna:data.get("descricaoExterna")},form); }}><label>Visitante de fora<input name="nomeExterno" required placeholder="Nome completo" /></label><label>Observação<input name="descricaoExterna" placeholder="Contato ou contexto" /></label><button disabled={saving}>Registrar</button></form></div>}
            </section>}
            {tab === "agenda" && <section className="cell-agenda-v2"><div className="cell-agenda-list-v2">{selected.agenda.map((item) => <article key={item.id}><time>{new Date(item.inicia_em).toLocaleDateString("pt-BR", { day:"2-digit", month:"short" })}</time><div><strong>{item.titulo}</strong><small>{new Date(item.inicia_em).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}–{new Date(item.termina_em).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })} · {item.visibilidade === "PUBLICO" ? "Público" : "Só liderança"}</small><p>{item.lembrete}</p></div></article>)}{!selected.agenda.length && <p>Nenhum encontro programado.</p>}</div>{selected.can_operate && <form className="pilot-form cell-agenda-form-v2" onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=Object.fromEntries(new FormData(form)); void cellAction(selected,{acao:"AGENDA_CRIAR",...data},form); }}><h3>Programar sem publicar no feed</h3><label>Título<input name="titulo" required /></label><label>Início<input name="iniciaEm" type="datetime-local" required /></label><label>Término<input name="terminaEm" type="datetime-local" required /></label><label>Visibilidade<select name="visibilidade"><option value="PUBLICO">Público para a célula</option><option value="PRIVADO">Privado para liderança</option></select></label><label className="cell-wide-field">Lembrete<textarea name="lembrete" rows={2} /></label><button disabled={saving}>Verificar horários e salvar</button></form>}</section>}
            {tab === "relatorio" && <section className="cell-reports-v2">{selected.can_operate && <form className="pilot-form cell-report-form-v2" onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=Object.fromEntries(new FormData(form)); void cellAction(selected,{acao:"RELATORIO_CRIAR",...data,aconteceu:data.aconteceu === "true"},form); }}><h3>Formulário do encontro</h3><label>Data<input name="dataReuniao" type="date" required /></label><label>Aconteceu?<select name="aconteceu"><option value="true">Sim</option><option value="false">Não</option></select></label><label>Presentes<input name="presentes" type="number" min="0" defaultValue="0" /></label><label>Visitantes<input name="visitantes" type="number" min="0" defaultValue="0" /></label><label className="cell-wide-field">Observações<textarea name="observacoes" rows={2} /></label><button disabled={saving}>Enviar ao pastor</button></form>}<div className="cell-report-history-v2">{selected.relatorios.map((report) => <article key={report.id}><time>{new Date(`${report.data_reuniao}T12:00:00`).toLocaleDateString("pt-BR")}</time><strong>{report.aconteceu ? `${report.presentes} pessoas · ${report.visitantes} visitantes` : "Encontro não realizado"}</strong><small>{report.enviado_por_nome ? `Enviado por ${report.enviado_por_nome}` : "Relatório registrado"}</small></article>)}</div></section>}
            {tab === "solicitacoes" && <section className="cell-requests-v2">{!selected.can_operate && <p>As solicitações ficam disponíveis somente para a liderança.</p>}{selected.solicitacoes.map((request) => <article key={request.id}><div><strong>{request.nome}</strong><small>{request.contato || "Sem contato"}</small><p>{request.mensagem}</p></div><div><button type="button" onClick={() => void cellAction(selected,{acao:"SOLICITACAO_DECIDIR",solicitacaoId:request.id,status:"APROVADA"})}>Aprovar</button><button type="button" className="danger-link" onClick={() => void cellAction(selected,{acao:"SOLICITACAO_DECIDIR",solicitacaoId:request.id,status:"RECUSADA"})}>Recusar</button></div></article>)}</section>}
            {tab === "entrar" && !selected.can_operate && <section className="cell-entry-request-v2"><header><small>ENTRAR NESTA CÉLULA</small><h3>Envie seus dados à liderança</h3><p>As informações serão usadas somente para analisar seu pedido e entrar em contato.</p></header><form className="pilot-form" onSubmit={(event) => void requestCellEntry(selected, event)}><label>Nome completo<input name="nome" required minLength={5} maxLength={120} autoComplete="name" /></label><label>WhatsApp ou e-mail<input name="contato" required maxLength={160} autoComplete="email" /></label><label className="cell-wide-field">Mensagem para a liderança<textarea name="mensagem" rows={3} maxLength={500} placeholder="Conte um pouco sobre você e o melhor horário para contato." /></label><label className="cell-request-consent"><input type="checkbox" required />Autorizo o envio destes dados à liderança desta célula.</label><button disabled={saving}>{saving ? "Enviando…" : "Solicitar entrada"}</button></form></section>}
            </div>
            </div>
          </>
        </main>
        </div>}
      </div>
      {selectedMemberProfile && typeof document !== "undefined" && createPortal(
        <div className="cell-member-profile-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMemberProfile(null); }}>
          <section className="cell-member-profile-dialog" role="dialog" aria-modal="true" aria-label={`Perfil de ${selectedMemberProfile.name}`}>
            <header><span>{selectedMemberProfile.fotoPerfil ? <SafeImage loading="lazy" fallbackName={selectedMemberProfile.name} fallbackKind="avatar" src={selectedMemberProfile.fotoPerfil} alt="" /> : selectedMemberProfile.name.slice(0,1)}</span><div><small>PERFIL DO MEMBRO</small><h2>{selectedMemberProfile.name}</h2><p>{selectedMemberProfile.papelComunidade || "Membro da comunidade"}</p></div><button type="button" onClick={() => setSelectedMemberProfile(null)} aria-label="Fechar perfil">×</button></header>
            <dl><div><dt>Função na célula</dt><dd>{selectedMemberProfile.role === "LEADER" ? "Líder" : selectedMemberProfile.role === "VICE_LEADER" ? "Vice-líder" : "Membro"}</dd></div><div><dt>E-mail</dt><dd>{selectedMemberProfile.email || "Não informado"}</dd></div><div><dt>WhatsApp</dt><dd>{selectedMemberProfile.telefone || "Não informado"}</dd></div></dl>
            {selectedMemberProfile.telefone && whatsappHref(selectedMemberProfile.telefone) && <a href={whatsappHref(selectedMemberProfile.telefone) || undefined} target="_blank" rel="noreferrer">Conversar pelo WhatsApp</a>}
          </section>
        </div>, document.body,
      )}
      {createOpen && createPortal(<div className="cell-create-overlay-v2" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreateOpen(false); }}><form className="pilot-form cell-create-dialog-v2" role="dialog" aria-modal="true" aria-label="Criar célula" onSubmit={createCell}><header><div><small>NOVA CÉLULA</small><h2>Informações essenciais</h2></div><button type="button" aria-label="Fechar" onClick={() => setCreateOpen(false)}>×</button></header><label>Nome da célula<input name="nome" required maxLength={100} /></label><label>Líder<select name="liderUsuarioId" required defaultValue=""><option value="" disabled>Selecione</option>{availableUsers.map((user)=><option value={user.id} key={user.id}>{user.nome} · {user.papel}</option>)}</select></label><fieldset className="cell-days-field-v2"><legend>Dias de encontro (obrigatório)</legend>{Object.entries(dayLabels).map(([value,label]) => <label key={value}><input type="checkbox" name="diasReuniao" value={value} />{label}</label>)}</fieldset><label className="cell-wide-field">Observações internas <small>só a liderança vê</small><textarea name="observacoes" rows={2} maxLength={1000} /></label><fieldset className="form-public-block-v5"><legend>Página pública</legend><p className="form-public-warning-v5"><span aria-hidden="true">◉</span>O que for preenchido aqui aparece na internet, no perfil público da comunidade. Deixe em branco para manter a célula fora do diretório.</p><label>Endereço público<input name="enderecoPublico" maxLength={240} placeholder="Rua e bairro do encontro" /><small>Não use o endereço da casa de alguém sem permissão.</small></label><label className="cell-wide-field">Descrição pública<textarea name="descricaoPublica" rows={2} maxLength={700} placeholder="Uma frase para quem procura uma célula perto de casa" /></label></fieldset><footer><p className="form-consequence-v5"><span aria-hidden="true">◉</span>Cria a célula, dá acesso de líder a quem você escolheu e abre o primeiro ciclo de relatórios semanais.</p><button type="button" onClick={() => setCreateOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Criando…" : "Criar célula"}</button></footer></form></div>, document.body)}
    </section>
  );
}

function OperationFeedback({
  message,
  error,
}: {
  message: string;
  error: string;
}) {
  if (!message && !error) return null;
  return (
    <TransientFeedback
      className={`operations-feedback ${error ? "error" : ""}`}
      role="status"
    >
      {error || message}
    </TransientFeedback>
  );
}

async function apiJson<T = { ok: boolean }>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || "Não foi possível concluir a operação.");
  }
  return result;
}





function whatsappHref(phone: string | null) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") || /^([0-9])\1+$/.test(digits)) return null;
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.startsWith("55") && !/^55[1-9][0-9][2-9]/.test(digits)) return null;
  return digits.length >= 10 && digits.length <= 15
    ? `https://wa.me/${digits}`
    : null;
}
