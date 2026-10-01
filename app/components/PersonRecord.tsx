"use client";

import { useEffect, useRef, useState } from "react";
import SafeImage from "./SafeImage";

type Ministry = { id: number; ministerio_id: number; nome: string; funcao: string; papel: string; dias_disponiveis: string; periodo_preferido: string; limite_escalas: number; equipes: string | null };
type Schedule = { id: number; escala_id: number; ministerio_id: number; titulo: string; inicia_em: string; termina_em: string; local: string; escala_status: string; status: string; funcao: string; ministerio: string; futura: number };
type RecordData = {
  person: { nome: string; email: string; telefone: string | null; foto_perfil: string | null; data_nascimento: string | null; endereco: string | null; papel: string; status: string; vinculado_em: string; titulo_oficial: string; permissoes: string };
  ministries: Ministry[]; cells: { id: number; nome: string }[]; schedules: Schedule[];
  participation: { total: number; confirmadas: number; pendentes: number; indisponiveis: number; ausencias: number; passadas_confirmadas: number; proximas: number } | null;
  unavailable: { id: number; data_inicio: string; data_fim: string; todo_dia: number; hora_inicio: string | null; hora_fim: string | null }[];
  checklist: { id: number; origem: string; tarefa: string; status: string; escala: string; escala_id: number }[];
  canViewSchedules: boolean; canViewAvailability: boolean; canViewChecklist: boolean; canViewMinistries: boolean; canViewCells: boolean;
  error?: string;
};
const DAYS: Record<string, string> = { DOM: "Domingo", SEG: "Segunda", TER: "Terça", QUA: "Quarta", QUI: "Quinta", SEX: "Sexta", SAB: "Sábado" };
const LABELS: Record<string, string> = { PENDENTE: "Pendente", CONFIRMADA: "Confirmada", INDISPONIVEL: "Indisponível", AUSENTE: "Ausência registrada", FEITO: "Concluído", NAO_FEITO: "Não concluído", ATIVO: "Ativo", MEMBRO: "Membro", LIDER: "Líder", PASTOR: "Pastor", ADMIN_COMUNIDADE: "Administrador", SUPERADMIN: "Proprietário", RASCUNHO: "Rascunho", AGENDADA: "Agendada", PUBLICADA: "Publicada", AGUARDANDO_CHECKLIST: "Aguardando checklist", ENCERRADA: "Encerrada", MANHA: "Manhã", TARDE: "Tarde", NOITE: "Noite", FLEXIVEL: "Flexível" };
function date(value: string | null | undefined, withTime = false) {
  if (!value) return "Não informado";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", ...(withTime ? { timeStyle: "short" as const } : {}) }).format(parsed);
}
function days(value: string) {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) && parsed.length ? parsed.map((item) => DAYS[String(item)] || String(item)).join(", ") : "Dias não informados"; }
  catch { return "Dias não informados"; }
}

export default function PersonRecord({ membershipId, name, onClose, permissionLabels }: { membershipId: number; name: string; onClose: () => void; permissionLabels: Record<string, string> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<RecordData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<"perfil" | "disponibilidade" | "escalas" | "checklist">("perfil");
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    void fetch(`/api/pilot/pessoas/${membershipId}/ficha`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const result = await response.json() as RecordData; if (!response.ok) throw new Error(result.error || "Não foi possível carregar a ficha."); return result; })
      .then(setData).catch((issue: Error) => { if (issue.name !== "AbortError") setError(issue.message); });
    return () => controller.abort();
  }, [membershipId, revision]);
  const person = data?.person;
  const stats = data?.participation;
  const rate = stats?.total ? Math.round(Number(stats.confirmadas) / Number(stats.total) * 100) : null;
  const upcoming = data?.schedules.filter(item => item.futura && ["PENDENTE", "CONFIRMADA"].includes(item.status) && ["PUBLICADA", "AGUARDANDO_CHECKLIST"].includes(item.escala_status)) || [];
  return <dialog ref={dialog} className="person-record" aria-labelledby="person-record-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header className="person-record-header">
      <span className="person-record-avatar">{person?.foto_perfil ? <SafeImage src={person.foto_perfil} alt="" fallbackName={name} fallbackKind="avatar" /> : name.split(/\s+/).slice(0,2).map(part => part[0]).join("")}</span>
      <div><small>FICHA DA PESSOA</small><h2 id="person-record-title">{name}</h2><p>{person ? `${person.titulo_oficial || LABELS[person.papel] || person.papel} · ${LABELS[person.status] || person.status}` : "Informações da comunidade"}</p></div>
      <button type="button" className="record-close" aria-label="Fechar ficha" onClick={onClose}>×</button>
    </header>
    <nav className="person-record-tabs" aria-label="Seções da ficha">{([['perfil','Perfil e vínculos'],['disponibilidade','Disponibilidade'],['escalas','Participação'],['checklist','Checklist']] as const).map(([key,label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    <div className="person-record-content" aria-busy={!data && !error}>
      {error ? <div className="record-empty" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></div> : !data || !person ? <p role="status">Carregando ficha…</p> : <>
        {tab === "perfil" && <>
          <section className="record-section"><h3>Informações pessoais</h3><dl className="record-fields"><div><dt>E-mail</dt><dd>{person.email}</dd></div><div><dt>Telefone</dt><dd>{person.telefone || "Não informado"}</dd></div><div><dt>Data de nascimento</dt><dd>{date(person.data_nascimento)}</dd></div><div><dt>Vínculo com a comunidade</dt><dd>{date(person.vinculado_em)}</dd></div><div className="record-field-wide"><dt>Endereço</dt><dd>{person.endereco || "Não informado"}</dd></div><div><dt>Função</dt><dd>{LABELS[person.papel] || person.papel}</dd></div><div><dt>Título oficial</dt><dd>{person.titulo_oficial || "Não possui"}</dd></div></dl></section>
          <section className="record-section"><h3>Ministérios e equipes <span>{data.ministries.length}</span></h3>{!data.canViewMinistries ? <p>Seu perfil não permite consultar ministérios.</p> : !data.ministries.length ? <p>Nenhum vínculo ativo com ministérios.</p> : data.ministries.map(item => <article className="record-ministry" key={item.id}><div><strong>{item.nome}</strong><span>{item.funcao} · {LABELS[item.papel] || item.papel}</span><small>Equipe: {item.equipes || "Não vinculada"}</small></div><a href={`/painel?view=ministerios&ministry=${item.ministerio_id}`}>Ver ministério</a></article>)}</section>
          <section className="record-section"><h3>Células</h3><p>{data.canViewCells ? data.cells.map(item => item.nome).join(" · ") || "Nenhuma célula vinculada nesta comunidade." : "Seu perfil não permite consultar células."}</p></section>
          <section className="record-section"><h3>Permissões adicionais</h3><div className="record-tags">{person.permissoes.split(",").filter(Boolean).map(item => <span key={item}>{permissionLabels[item] || item}</span>)}</div>{!person.permissoes && <p>Sem permissões adicionais. O acesso segue a função na comunidade.</p>}</section>
        </>}
        {tab === "disponibilidade" && <>
          <section className="record-section"><h3>Dias e períodos para servir</h3>{!data.canViewMinistries ? <p>Seu perfil não permite consultar ministérios.</p> : !data.ministries.length ? <p>A disponibilidade ainda não foi informada em um ministério.</p> : data.ministries.map(item => <article className="record-availability" key={item.id}><strong>{item.nome}</strong><dl className="record-fields"><div><dt>Dias disponíveis</dt><dd>{days(item.dias_disponiveis)}</dd></div><div><dt>Período preferido</dt><dd>{LABELS[item.periodo_preferido] || item.periodo_preferido}</dd></div><div><dt>Limite mensal de escalas</dt><dd>{item.limite_escalas}</dd></div></dl></article>)}</section>
          <section className="record-section"><h3>Bloqueios de dias e horários</h3>{!data.canViewAvailability ? <p>Os bloqueios são visíveis para a própria pessoa e gestores de escalas.</p> : !data.unavailable.length ? <p>Nenhum bloqueio futuro registrado.</p> : data.unavailable.map(item => <article className="record-busy" key={item.id}><strong>{date(item.data_inicio)} — {date(item.data_fim)}</strong><span>{item.todo_dia ? "Dia inteiro" : `${item.hora_inicio || "—"} às ${item.hora_fim || "—"}`}</span></article>)}</section>
          <section className="record-section"><h3>Horários ocupados por escalas</h3>{!data.canViewSchedules ? <p>Seu perfil não permite consultar escalas.</p> : upcoming.length ? upcoming.map(item => <article className="record-busy" key={item.id}><div><strong>{item.titulo}</strong><span>{date(item.inicia_em, true)} — {date(item.termina_em, true)}</span><small>{item.ministerio} · {item.status === "PENDENTE" ? "Aguardando resposta" : "Confirmada"}</small></div></article>) : <p>Nenhuma escala futura reservada.</p>}</section>
        </>}
        {tab === "escalas" && <>
          {!data.canViewSchedules ? <p>Seu perfil não permite consultar escalas.</p> : <>
            <div className="record-stats"><article><small>Próximas escalas</small><strong>{stats?.proximas || 0}</strong></article><article><small>Confirmações</small><strong>{stats?.confirmadas || 0}</strong></article><article><small>Pendentes</small><strong>{stats?.pendentes || 0}</strong></article><article><small>Taxa de confirmação</small><strong>{rate === null ? "—" : `${rate}%`}</strong></article></div>
            <section className="record-section"><h3>Participação nas escalas</h3><p>{stats?.total ? `${stats.total} designações · ${stats.indisponiveis || 0} indisponibilidades · ${stats.ausencias || 0} ausências registradas` : "Sem histórico de participação."}</p><p className="record-note">A taxa considera as respostas às designações publicadas. Uma confirmação não comprova presença.</p>{rate !== null && <progress value={rate} max={100} aria-label="Taxa de confirmação" />}</section>
            <section className="record-section"><h3>Agenda e histórico <span>Até 50 designações</span></h3>{data.schedules.map(item => <article className="record-schedule" key={item.id}><div><strong>{item.titulo}</strong><span>{item.ministerio} · {item.funcao}</span><small>{date(item.inicia_em, true)} · {item.local || "Local não informado"}</small></div><div><span className={`record-status is-${item.status.toLowerCase()}`}>{LABELS[item.status] || item.status}</span><small>{LABELS[item.escala_status] || item.escala_status}</small><a href={`/painel?view=ministerios&ministry=${item.ministerio_id}&schedule=${item.escala_id}`}>Ver escala</a></div></article>)}{!data.schedules.length && <p>Nenhuma designação cadastrada.</p>}</section>
          </>}
        </>}
        {tab === "checklist" && <section className="record-section"><h3>Responsabilidades individuais</h3>{!data.canViewChecklist ? <p>Seu perfil não permite consultar os checklists desta pessoa.</p> : <><p>{data.checklist.filter(item => item.status === "FEITO").length} concluídas de {data.checklist.length} tarefas exibidas.</p><p className="record-note">Últimas 50 tarefas vinculadas à pessoa ou às suas substituições.</p>{data.checklist.map(item => <article className="record-checklist" key={`${item.origem}-${item.id}`}><span aria-hidden="true">{item.status === "FEITO" ? "✓" : "○"}</span><div><strong>{item.tarefa}</strong><small>{item.escala} · {item.origem === "DIACONIA" ? "Diaconia" : "Ministério"}</small></div><span className={`record-status is-${item.status.toLowerCase()}`}>{LABELS[item.status] || item.status}</span></article>)}{!data.checklist.length && <p>Nenhuma responsabilidade individual cadastrada.</p>}<a href="/painel?view=ministerios&tab=escalas">Abrir escalas e checklists</a></>}</section>}
      </>}
    </div>
  </dialog>;
}
