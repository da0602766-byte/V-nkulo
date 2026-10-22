"use client";
import {useMemo,useState,useEffect,useRef,type ReactNode} from 'react';
import {type Pessoa,type Categoria,type PerfilConfig,type Status,today,age,whatsapp} from './data';
import {Dialog} from './Dialog';
import {useVisitorPreference,useColumnWidths,ColumnHandle} from './WorkspaceControls';
import {visitorBirthdayInYear} from '../../lib/visitor-birthday';
/* ---------- helpers & styles ---------- */
const STATUS: Status[] = ['Novo', 'Em contato', 'Em acompanhamento', 'Integrado']
const statusStyle: Record<Status, string> = {
  Novo: 'bg-sky-50 text-sky-800 ring-sky-200',
  'Em contato': 'bg-amber-50 text-amber-700 ring-amber-200',
  'Em acompanhamento': 'bg-violet-50 text-violet-700 ring-violet-200',
  Integrado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

export const fmt = (d?: string) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '')
const dias = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a.slice(0, 10)).getTime()) / 864e5)
const idade = age
const ultimo = (p: Pessoa) => p.ultimo
const proximoContato = (p: Pessoa) => p.retorno
const respEfetivo = (p: Pessoa, cats: Categoria[]) => p.responsavel ?? cats.find((c) => c.nome === p.categoria)?.responsavel
const pendente = (p: Pessoa) => {
  const d = [p.prazo, proximoContato(p)].filter(Boolean) as string[]
  return d.some((x) => x <= today())
}
const semContato15 = (p: Pessoa) => dias(ultimo(p) || p.entrada, today()) >= 15

export function Icon({ d, className = 'size-4' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  )
}

export const I = {
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  cake: 'M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s1.5-1 4-1 4 2 6 2 4-1 4-1M2 21h20M12 4v4',
  tag: 'M12 2H2v10l9.3 9.3a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4ZM7 7h.01',
  note: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4',
  sheet: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2',
  msg: 'M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.7A8.4 8.4 0 1 1 21 11.5',
  check: 'M20 6 9 17l-5-5',
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  menu: 'M3 12h18M3 6h18M3 18h18',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM16 2v4M8 2v4M3 10h18',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  checkCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  info: 'M12 16v-4M12 8h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0Z',
}

export const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 h-10 text-[13px] font-medium transition-all active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer'
export const btnPri = `${btn} bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-md shadow-brand-600/30 hover:brightness-110`
export const btnSec = `${btn} bg-white ring-1 ring-stone-200 text-stone-700 hover:ring-stone-300 hover:bg-stone-50`
const btnGhost = `${btn} text-stone-600 hover:bg-stone-100`
export const input = 'h-10 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-stone-200 outline-none transition focus:ring-2 focus:ring-brand-600 placeholder:text-stone-400'

export const Badge = ({ s }: { s: Status }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusStyle[s]}`}>{s}</span>
)
const Missing = ({ children }: { children: ReactNode }) => <span className="text-stone-400 italic">{children}</span>

/* ---------- app types ---------- */
type View = 'pessoas' | 'pendencias' | 'aniversarios' | 'categorias' | 'anotacoes' | 'planilha'
type Recorte = 'ativos' | Status | 'pendencias' | 'sem15' | 'arquivados' | 'semCelula' | 'discipulado' | 'semMinisterio' | 'certificado' | 'apoio'

const recortes: { id: Recorte; label: string; group: 'Etapa' | 'Atenção' | 'Integração' }[] = [
  { id: 'ativos', label: 'Todos os ativos', group: 'Etapa' },
  ...STATUS.map((s) => ({ id: s as Recorte, label: s === 'Novo' ? 'Novos' : s === 'Integrado' ? 'Integrados' : s, group: 'Etapa' as const })),
  { id: 'pendencias', label: 'Pendências de retorno', group: 'Atenção' },
  { id: 'sem15', label: 'Sem contato há +15 dias', group: 'Atenção' },
  { id: 'arquivados', label: 'Arquivados', group: 'Atenção' },
  { id: 'semCelula', label: 'Sem célula', group: 'Integração' },
  { id: 'discipulado', label: 'Discipulado a confirmar', group: 'Integração' },
  { id: 'semMinisterio', label: 'Sem ministério', group: 'Integração' },
  { id: 'certificado', label: 'Certificado de batismo', group: 'Integração' },
  { id: 'apoio', label: 'Apoio social', group: 'Integração' },
]

const matchRecorte = (p: Pessoa, r: Recorte) => {
  if (r === 'arquivados') return !!p.arquivado
  if (p.arquivado) return false
  switch (r) {
    case 'ativos': return true
    case 'pendencias': return pendente(p)
    case 'sem15': return semContato15(p)
    case 'semCelula': return !p.celula
    case 'discipulado': return p.discipulado !== 'Sim'
    case 'semMinisterio': return !p.ministerio
    case 'certificado': return p.batizado === 'Sim' && p.certificado !== 'Sim'
    case 'apoio': return p.apoio === 'Sim'
    default: return p.status === r
  }
}

export interface FiltrosAvancados {
  status: string
  tipo: string
  celula: string
  responsavel: string
  ministerio: string
  apoio: string
  discipulado: string
  contatoRecente: string
  entradaPeriodo: string
}

const filtrosIniciais: FiltrosAvancados = {
  status: '',
  tipo: '',
  celula: '',
  responsavel: '',
  ministerio: '',
  apoio: '',
  discipulado: '',
  contatoRecente: '',
  entradaPeriodo: '',
}

export function Header({
  title,
  sub,
  children,
}: {
  title: string
  sub?: string
  children?: ReactNode
}) {
  return (
    <header className="px-4 sm:px-8 py-4 sm:py-5 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border-b border-stone-100">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-[28px] leading-tight font-extrabold tracking-tight text-brand-900">
          {title}
        </h1>
        {sub && <div className="text-stone-500 text-[12px] sm:text-[13px] mt-0.5">{sub}</div>}
      </div>
      <div className="flex items-center flex-wrap gap-2">{children}</div>
    </header>
  )
}

export function Pessoas({
  pessoas,
  categorias,
  perfil,
  onOpen,
  onNew,
  onBulk,
  celulas,
  notify,
  categoryFilter,
  onCategoryChange,
}: {
  pessoas: Pessoa[]
  categorias: Categoria[]
  perfil: PerfilConfig
  onOpen: (id: string) => void
  onNew: () => void
  onBulk: (ids:string[], action:"arquivar"|"excluir") => Promise<boolean>
  celulas:string[]
  notify: (m: string, tipo?: 'info' | 'error' | 'success') => void
  categoryFilter: string
  onCategoryChange: (value:string) => void
}) {
  const [stagesCollapsed,setStagesCollapsed]=useVisitorPreference('stages');
  const columns=useColumnWidths();
  const [q, setQ] = useState('')
  const filtersRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const filters=filtersRef.current;
    if(!filters)return;
    const update=()=>filters.parentElement?.style.setProperty('--vp-filter-height',filters.offsetHeight+'px');
    update();
    const observer=new ResizeObserver(update);
    observer.observe(filters);
    return()=>observer.disconnect();
  },[]);
  const cat = categoryFilter
  const setCat = onCategoryChange
  const [statusPicker, setStatusPicker] = useState(false)
  const [filterPicker, setFilterPicker] = useState<'categoria' | 'ordem' | null>(null)
  const orderOptions = [{value:'az',label:'Nome (A–Z)'},{value:'za',label:'Nome (Z–A)'},{value:'recente',label:'Contato recente'},{value:'acao',label:'Próxima ação'}]
  const categoryOptions = [{value:'',label:'Todas categorias'},...categorias.map(c=>({value:c.nome,label:c.nome})),{value:'__sem',label:'Sem categoria'}]
  const [rec, setRec] = useState<Recorte>('ativos')
  const [ordem, setOrdem] = useState<'az' | 'za' | 'recente' | 'acao'>('az')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<'arquivar' | 'excluir' | null>(null)
  const [limite, setLimite] = useState(10)
  const [showFiltrosAvancados, setShowFiltrosAvancados] = useState(false)
  const [filtros, setFiltros] = useState<FiltrosAvancados>(filtrosIniciais)

  const categoryPeople = pessoas.filter(p=>!cat || (cat==='__sem' ? !p.categoria : p.categoria===cat))

  // Advanced operational filters count
  const countFiltrosAvancados = Object.values(filtros).filter(Boolean).length

  // Filtered people
  const lista = useMemo(() => {
    const t = q.toLowerCase().trim()
    return pessoas
      .filter((p) => {
        // Recorte
        if (!matchRecorte(p, rec)) return false

        // Quick Category
        if (cat) {
          if (cat === '__sem' && p.categoria) return false
          if (cat !== '__sem' && p.categoria !== cat) return false
        }

        // Search text
        if (t) {
          const match = [p.nome, p.telefone, p.email, p.responsavel, p.recebeu].some((v) =>
            v?.toLowerCase().includes(t)
          )
          if (!match) return false
        }

        // Advanced operational filters
        if (filtros.status && p.status !== filtros.status) return false
        if (filtros.tipo && p.tipo !== filtros.tipo) return false
        if (filtros.celula) {
          if (filtros.celula === '__sem' && p.celula) return false
          if (filtros.celula !== '__sem' && p.celula !== filtros.celula) return false
        }
        if (filtros.responsavel) {
          const r = respEfetivo(p, categorias)
          if (filtros.responsavel === '__sem' && r) return false
          if (filtros.responsavel !== '__sem' && r !== filtros.responsavel) return false
        }
        if (filtros.ministerio) {
          if (filtros.ministerio === '__sem' && p.ministerio) return false
          if (filtros.ministerio !== '__sem' && p.ministerio !== filtros.ministerio) return false
        }
        if (filtros.apoio && p.apoio !== filtros.apoio) return false
        if (filtros.discipulado && p.discipulado !== filtros.discipulado) return false

        if (filtros.contatoRecente) {
          const u = ultimo(p)
          if (filtros.contatoRecente === 'nunca' && u) return false
          if (filtros.contatoRecente === '7d' && (!u || dias(u, today()) > 7)) return false
          if (filtros.contatoRecente === '15d' && (!u || dias(u, today()) <= 15)) return false
        }

        if (filtros.entradaPeriodo) {
          const d = dias(p.entrada, today())
          if (filtros.entradaPeriodo === '7d' && d > 7) return false
          if (filtros.entradaPeriodo === '30d' && d > 30) return false
          if (filtros.entradaPeriodo === '90d' && d > 90) return false
        }

        return true
      })
      .sort((a, b) => {
        if (ordem === 'az') return a.nome.localeCompare(b.nome)
        if (ordem === 'za') return b.nome.localeCompare(a.nome)
        if (ordem === 'recente') return (ultimo(b) ?? '').localeCompare(ultimo(a) ?? '')
        return (a.prazo ?? '9').localeCompare(b.prazo ?? '9')
      })
  }, [pessoas, q, cat, rec, ordem, filtros, categorias])

  useEffect(()=>{setSel(new Set());setLimite(10);},[q,cat,rec,filtros]);
  const visiveis = lista.slice(0, limite)
  const filtrosAtivosTotal = (q ? 1 : 0) + (cat ? 1 : 0) + (rec !== 'ativos' ? 1 : 0) + countFiltrosAvancados
  const count = (r: Recorte) => pessoas.filter((p) => matchRecorte(p, r) && (!cat || (cat === '__sem' ? !p.categoria : p.categoria === cat))).length
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const resetAllFilters = () => {
    setQ('')
    setCat('')
    setRec('ativos')
    setFiltros(filtrosIniciais)
  }

  // List of responsibles for filter dropdown
  const todosResponsaveis = Array.from(
    new Set(
      pessoas
        .map((p) => respEfetivo(p, categorias))
        .filter(Boolean) as string[]
    )
  ).sort()

  const handleArchiveSelected = () => {
    if (!perfil.podeArquivar) {
      notify(`Ação não permitida para o perfil ${perfil.papel}.`, 'error')
      return
    }
    setConfirm('arquivar')
  }

  const handleDeleteSelected = () => {
    if (!perfil.podeExcluir) {
      notify('Apenas gestores com perfil pleno podem excluir fichas.', 'error')
      return
    }
    setConfirm('excluir')
  }

  return (
    <div className="vp-people-page">
      <Header
        title={cat ? (cat === '__sem' ? 'Sem categoria' : cat) : 'Pessoas'}
        sub={`${pessoas.filter((p) => !p.arquivado && (!cat || (cat === '__sem' ? !p.categoria : p.categoria === cat))).length} visitantes e membros${cat ? ' nesta categoria' : ' cadastrados'}`}
      >
        {perfil.podeCriarPessoa && (
          <button className={btnPri} onClick={onNew}>
            <Icon d={I.plus} />
            <span>Novo cadastro</span>
          </button>
        )}
      </Header>

      {/* Metric Cards: 2 cols on mobile, 4 on desktop */}
      <div className="vp-people-metrics px-4 sm:px-8 py-3 sm:pb-6 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 bg-white shrink-0">
        {[
          [
            'Visitantes ativos',
            categoryPeople.filter((p) => !p.arquivado).length,
            'na comunidade',
            'from-brand-600 to-brand-700 text-white shadow-md shadow-brand-600/30',
            'text-white/80',
          ],
          [
            'Novos esta semana',
            categoryPeople.filter((p) => !p.arquivado && p.status === 'Novo' && dias(p.entrada, today()) >= 0 && dias(p.entrada, today()) <= 7).length,
            'aguardando acolhida',
            'from-sky-50 to-sky-100 text-sky-900 ring-1 ring-sky-200/60',
            'text-sky-800/70',
          ],
          [
            'Retornos pendentes',
            categoryPeople.filter((p) => !p.arquivado && pendente(p)).length,
            'vencidos ou hoje',
            'from-gold-100 to-orange-100 text-gold-500 ring-1 ring-gold-200/60',
            'text-gold-500/80',
          ],
          [
            'Integrados',
            categoryPeople.filter((p) => !p.arquivado && p.status === 'Integrado').length,
            'servindo ativamente',
            'from-emerald-50 to-emerald-100 text-emerald-900 ring-1 ring-emerald-200/60',
            'text-emerald-800/70',
          ],
        ].map(([k, v, h, c, m]) => (
          <div
            key={k as string}
            className={`rounded-2xl sm:rounded-3xl bg-gradient-to-br ${c} p-3.5 sm:px-6 sm:py-5 flex items-end justify-between`}
          >
            <div>
              <div className={`text-[11px] sm:text-[12px] font-medium ${m}`}>{k}</div>
              <div className={`text-[10px] sm:text-[11px] ${m} opacity-80`}>{h}</div>
            </div>
            <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tabular-nums leading-none tracking-tight">
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* Tablet shortcuts; phones use the complete grouped selector below. */}
      <div className="vp-status-shortcuts xl:hidden border-y border-stone-200 bg-stone-50/80 px-3 py-2 overflow-x-auto flex gap-1.5 scrollbar-none shrink-0">
        {recortes.map((r) => {
          const isAtivo = rec === r.id
          return (
            <button
              key={r.id}
              onClick={() => {
                setRec(r.id)
                setSel(new Set())
              }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium flex items-center gap-1.5 transition-all ${
                isAtivo
                  ? 'bg-brand-600 text-white shadow-xs font-semibold'
                  : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100'
              }`}
            >
              <span>{r.label}</span>
              <span
                className={`text-[10px] tabular-nums rounded-full px-1.5 py-0.2 ${
                  isAtivo ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-500'
                }`}
              >
                {count(r.id)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="vp-people-body flex-1 min-h-0 flex border-t border-stone-100">
        {/* Desktop Sidebar Recortes */}
        <div id="vp-stage-panel" data-collapsed={stagesCollapsed} className="vp-people-stages hidden xl:block w-60 shrink-0 border-r border-stone-200 overflow-y-auto py-5 px-3">
          {(['Etapa', 'Atenção', 'Integração'] as const).map((g) => (
            <div key={g} className="mb-4">
              <div className="px-2 mb-1.5 text-[11px] uppercase tracking-[.14em] text-stone-400 font-semibold">
                {g}
              </div>
              {recortes
                .filter((r) => r.group === g)
                .map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRec(r.id)
                      setSel(new Set())
                    }}
                    className={`w-full flex items-center rounded-xl px-2.5 h-8 text-[13px] transition-colors cursor-pointer ${
                      rec === r.id
                        ? 'bg-brand-50 text-brand-700 font-semibold'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex-1 text-left truncate">{r.label}</span>
                    <span
                      className={`text-[11px] tabular-nums ${
                        rec === r.id ? 'text-brand-700 font-bold' : 'text-stone-400'
                      }`}
                    >
                      {count(r.id)}
                    </span>
                  </button>
                ))}
            </div>
          ))}
        </div>

        {/* Content Area */}
        <section className="flex-1 min-w-0 flex flex-col bg-white">
          {/* Filter Bar */}
          <div ref={filtersRef} className="vp-people-filters p-3 sm:px-6 sm:py-3.5 border-b border-stone-100 space-y-2 shrink-0">
            <button type="button" className="vp-status-trigger" aria-label={`Filtrar status e acompanhamento: ${recortes.find(r=>r.id===rec)?.label}`} aria-haspopup="dialog" aria-expanded={statusPicker} onClick={()=>setStatusPicker(true)}>
              <Icon d={I.filter}/><span>{recortes.find(r=>r.id===rec)?.label}</span><strong>{count(rec)}</strong><Icon d={I.chevronDown}/>
            </button>
            <div className="vp-workspace-controls"><button className="vp-stage-toggle" aria-controls="vp-stage-panel" aria-expanded={!stagesCollapsed} onClick={()=>setStagesCollapsed(!stagesCollapsed)}><Icon d={I.filter}/>{stagesCollapsed?'Mostrar etapas':'Recolher etapas'}</button><button className="vp-width-reset" onClick={columns.reset} title="Restaurar as larguras originais das colunas">Restaurar colunas</button></div>
            <div className="vp-filterbar">
              <div className="relative flex-1">
                <Icon d={I.search} className="size-4 absolute left-3 top-3 text-stone-400" />
                <input
                  className={`${input} pl-9`}
                  aria-label="Buscar pessoas" placeholder="Buscar por nome, telefone ou e-mail..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q && (
                  <button onClick={() => setQ('')} className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600">
                    <Icon d={I.x} className="size-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button type="button" className="vp-choice-trigger" aria-label={`Filtrar categoria: ${categoryOptions.find(o=>o.value===cat)?.label || cat}`} aria-haspopup="dialog" aria-expanded={filterPicker==='categoria'} onClick={()=>setFilterPicker('categoria')}><span>{categoryOptions.find(o=>o.value===cat)?.label || cat}</span><Icon d={I.chevronDown}/></button>
                <select
                  className={`vp-choice-native ${input} w-36 sm:w-44 text-[13px]`}
                  aria-label="Filtrar categoria" value={cat}
                  onChange={(e) => setCat(e.target.value)}
                >
                  <option value="">Todas categorias</option>
                  {categorias.map((c) => (
                    <option key={c.nome} value={c.nome}>
                      {c.nome}
                    </option>
                  ))}
                  <option value="__sem">Sem categoria</option>
                </select>

                <button type="button" className="vp-choice-trigger" aria-label={`Ordenar pessoas: ${orderOptions.find(o=>o.value===ordem)?.label}`} aria-haspopup="dialog" aria-expanded={filterPicker==='ordem'} onClick={()=>setFilterPicker('ordem')}><span>{orderOptions.find(o=>o.value===ordem)?.label}</span><Icon d={I.chevronDown}/></button>
                <select
                  className={`vp-choice-native ${input} w-36 sm:w-40 text-[13px]`}
                  aria-label="Ordenar pessoas" value={ordem}
                  onChange={(e) => setOrdem(e.target.value as typeof ordem)}
                >
                  <option value="az">Nome (A–Z)</option>
                  <option value="za">Nome (Z–A)</option>
                  <option value="recente">Contato recente</option>
                  <option value="acao">Próxima ação</option>
                </select>

                <button
                  onClick={() => setShowFiltrosAvancados(!showFiltrosAvancados)}
                  className={`${btnSec} shrink-0 px-3 ${
                    countFiltrosAvancados > 0 || showFiltrosAvancados
                      ? 'bg-brand-50 border-brand-300 text-brand-700 font-semibold'
                      : ''
                  }`}
                  title="Filtros operacionais avançados"
                >
                  <Icon d={I.filter} className="size-4" />
                  <span className="hidden sm:inline">Filtros</span>
                  {countFiltrosAvancados > 0 && (
                    <span className="size-5 rounded-full bg-brand-600 text-white text-[10px] grid place-items-center">
                      {countFiltrosAvancados}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Expandable Advanced Operational Filters */}
            {showFiltrosAvancados && (
              <div className="vp-advanced-filters p-4 rounded-2xl bg-stone-50 ring-1 ring-stone-200 mt-2 space-y-3 [animation:rise_.2s_ease]">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] uppercase font-bold tracking-wider text-stone-500 flex items-center gap-1.5">
                    <Icon d={I.sliders} className="size-3.5" />
                    Filtros Operacionais Avançados
                  </span>
                  <button
                    onClick={() => setFiltros(filtrosIniciais)}
                    className="text-[11px] text-brand-600 hover:underline font-medium"
                  >
                    Resetar filtros avançados
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="text-stone-500 font-medium block mb-1">Status</label>
                    <select
                      className={input}
                      value={filtros.status}
                      onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
                    >
                      <option value="">Todos</option>
                      {STATUS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-stone-500 font-medium block mb-1">Tipo de vínculo</label>
                    <select
                      className={input}
                      value={filtros.tipo}
                      onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
                    >
                      <option value="">Todos</option>
                      <option value="Visitante">Visitante</option>
                      <option value="Membro">Membro</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-stone-500 font-medium block mb-1">Célula</label>
                    <select
                      className={input}
                      value={filtros.celula}
                      onChange={(e) => setFiltros({ ...filtros, celula: e.target.value })}
                    >
                      <option value="">Todas</option>
                      {celulas.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__sem">Sem célula</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-stone-500 font-medium block mb-1">Responsável</label>
                    <select
                      className={input}
                      value={filtros.responsavel}
                      onChange={(e) => setFiltros({ ...filtros, responsavel: e.target.value })}
                    >
                      <option value="">Todos</option>
                      {todosResponsaveis.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                      <option value="__sem">Não definido</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-stone-500 font-medium block mb-1">Apoio Social (Doa a Doa)</label>
                    <select
                      className={input}
                      value={filtros.apoio}
                      onChange={(e) => setFiltros({ ...filtros, apoio: e.target.value })}
                    >
                      <option value="">Todos</option>
                      <option value="Sim">Sim (recebe apoio)</option>
                      <option value="Não">Não</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-stone-500 font-medium block mb-1">Discipulado</label>
                    <select
                      className={input}
                      value={filtros.discipulado}
                      onChange={(e) => setFiltros({ ...filtros, discipulado: e.target.value })}
                    >
                      <option value="">Todos</option>
                      <option value="Sim">Sim (participa)</option>
                      <option value="Não">Não</option>
                      <option value="Não informado">Não informado</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-stone-500 font-medium block mb-1">Último contato</label>
                    <select
                      className={input}
                      value={filtros.contatoRecente}
                      onChange={(e) => setFiltros({ ...filtros, contatoRecente: e.target.value })}
                    >
                      <option value="">Todos</option>
                      <option value="7d">Últimos 7 dias</option>
                      <option value="15d">Sem contato há +15 dias</option>
                      <option value="nunca">Nunca contatado</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-stone-500 font-medium block mb-1">Data de chegada</label>
                    <select
                      className={input}
                      value={filtros.entradaPeriodo}
                      onChange={(e) => setFiltros({ ...filtros, entradaPeriodo: e.target.value })}
                    >
                      <option value="">Qualquer data</option>
                      <option value="7d">Últimos 7 dias</option>
                      <option value="30d">Últimos 30 dias</option>
                      <option value="90d">Últimos 90 dias</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Active Filters Chips */}
            {filtrosAtivosTotal > 0 && (
              <div className="flex items-center flex-wrap gap-1.5 pt-1 text-xs">
                <span className="text-stone-400 font-medium text-[11px]">Filtros ativos:</span>
                {q && (
                  <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full">
                    Busca: "{q}"
                    <button onClick={() => setQ('')}><Icon d={I.x} className="size-3" /></button>
                  </span>
                )}
                {cat && (
                  <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                    Cat: {cat === '__sem' ? 'Sem categoria' : cat}
                    <button onClick={() => setCat('')}><Icon d={I.x} className="size-3" /></button>
                  </span>
                )}
                {rec !== 'ativos' && (
                  <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                    Recorte: {recortes.find((r) => r.id === rec)?.label}
                    <button onClick={() => setRec('ativos')}><Icon d={I.x} className="size-3" /></button>
                  </span>
                )}
                {filtros.status && (
                  <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full">
                    Status: {filtros.status}
                    <button onClick={() => setFiltros({ ...filtros, status: '' })}><Icon d={I.x} className="size-3" /></button>
                  </span>
                )}
                {filtros.celula && (
                  <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full">
                    Célula: {filtros.celula === '__sem' ? 'Sem célula' : filtros.celula}
                    <button onClick={() => setFiltros({ ...filtros, celula: '' })}><Icon d={I.x} className="size-3" /></button>
                  </span>
                )}
                {filtros.responsavel && (
                  <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full">
                    Resp: {filtros.responsavel === '__sem' ? 'Não definido' : filtros.responsavel}
                    <button onClick={() => setFiltros({ ...filtros, responsavel: '' })}><Icon d={I.x} className="size-3" /></button>
                  </span>
                )}
                <button
                  onClick={resetAllFilters}
                  className="text-[11px] text-red-600 hover:underline font-medium ml-1"
                >
                  Limpar todos ({filtrosAtivosTotal})
                </button>
                <span className="ml-auto text-stone-400 text-[11px] tabular-nums">
                  {lista.length} encontrada(s)
                </span>
              </div>
            )}
          </div>

          {/* Bulk Selection Bar */}
          {sel.size > 0 && (
            <div className="px-4 sm:px-6 h-12 flex items-center gap-2 sm:gap-3 bg-brand-900 text-white text-[13px] shrink-0">
              <span className="font-semibold text-xs sm:text-sm">{sel.size} selecionada(s)</span>
              <button
                className="rounded-lg px-2.5 h-7 hover:bg-white/10 flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                onClick={handleArchiveSelected}
                disabled={!perfil.podeArquivar}
              >
                <Icon d={I.archive} />
                <span>Arquivar</span>
              </button>
              {perfil.podeExcluir && (
                <button
                  className="rounded-lg px-2.5 h-7 hover:bg-white/10 flex items-center gap-1.5 text-red-300 text-xs font-medium cursor-pointer"
                  onClick={handleDeleteSelected}
                >
                  <Icon d={I.trash} />
                  <span>Excluir</span>
                </button>
              )}
              <button
                className="ml-auto rounded-lg px-2.5 h-7 hover:bg-white/10 text-xs text-stone-300 cursor-pointer"
                onClick={() => setSel(new Set())}
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Records Display Area: Table for Desktop, Cards for Mobile */}
          <div className="vp-people-list flex-1 overflow-y-auto">
            {lista.length === 0 ? (
              <div className="h-full min-h-[300px] grid place-items-center p-6 text-center">
                <div className="max-w-md">
                  <div className="size-14 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-3">
                    <Icon d={I.search} className="size-7" />
                  </div>
                  <div className="font-bold text-stone-800 text-base">Nenhuma pessoa encontrada nesta consulta</div>
                  <p className="text-stone-500 text-[13px] mt-1.5 leading-relaxed">
                    A comunidade possui {pessoas.length} cadastros no total. Tente ajustar a busca ou limpar os filtros operacionais.
                  </p>
                  <button className={`${btnSec} mt-4`} onClick={resetAllFilters}>
                    Limpar todos os filtros
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="vp-people-table hidden xl:block">
                  <table ref={columns.tableRef} style={columns.widths?{width:columns.widths.reduce((a,b)=>a+b,0),minWidth:0}:undefined} className="w-full text-[13px]">
                    <colgroup>{(columns.widths||[6,28,15,15,10,13,13]).map((w,i)=><col key={i} style={{width:columns.widths?w:`${w}%`}}/>)}</colgroup>
                    <thead className="sticky top-0 z-10 bg-stone-50 text-left text-[11px] uppercase tracking-[.12em] text-stone-500 border-b border-stone-200">
                      <tr>
                        <th className="pl-6 w-8 py-3">
                          <input
                            type="checkbox"
                            aria-label="Selecionar pessoas visíveis" checked={visiveis.length > 0 && visiveis.every((p) => sel.has(p.id))}
                            onChange={(e) =>
                              setSel(e.target.checked ? new Set(visiveis.map((p) => p.id)) : new Set())
                            }
                          />
                        </th>
                        <th className="px-3 font-semibold">Pessoa<ColumnHandle index={1} label="Pessoa" columns={columns}/></th>
                        <th className="px-3 font-semibold">Categoria / Ministério<ColumnHandle index={2} label="Categoria / Ministério" columns={columns}/></th>
                        <th className="px-3 font-semibold">Responsável<ColumnHandle index={3} label="Responsável" columns={columns}/></th>
                        <th className="px-3 font-semibold">Status<ColumnHandle index={4} label="Status" columns={columns}/></th>
                        <th className="px-3 font-semibold">Último contato<ColumnHandle index={5} label="Último contato" columns={columns}/></th>
                        <th className="px-3 pr-6 font-semibold">Próxima ação<ColumnHandle index={6} label="Próxima ação" columns={columns}/></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map((p) => {
                        const r = respEfetivo(p, categorias)
                        const u = ultimo(p)
                        return (
                          <tr
                            key={p.id}
                            onClick={() => onOpen(p.id)}
                            className={`border-b border-stone-100 bg-white hover:bg-brand-50/60 transition-colors cursor-pointer ${
                              p.arquivado ? 'opacity-60 bg-stone-50/50' : ''
                            }`}
                          >
                            <td className="pl-6 py-3.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`Selecionar ${p.nome}`} checked={sel.has(p.id)}
                                onChange={() => toggle(p.id)}
                              />
                            </td>
                            <td className="vp-directory-person px-3">
                              <div className="vp-directory-identity flex items-center gap-3">
                                <div
                                  className={`size-9 shrink-0 rounded-2xl grid place-items-center text-[12px] font-bold ${
                                    p.tipo === 'Membro'
                                      ? 'bg-gold-100 text-gold-500'
                                      : 'bg-brand-100 text-brand-700'
                                  }`}
                                >
                                  {p.nome
                                    .split(' ')
                                    .map((n) => n[0])
                                    .slice(0, 2)
                                    .join('')}
                                </div>
                                <div>
                                  <div className="vp-directory-name font-semibold text-[14px] text-stone-900 flex items-center gap-1.5">
                                    <button className="text-left hover:underline" onClick={e=>{e.stopPropagation();onOpen(p.id)}} aria-label={`Abrir ficha de ${p.nome}`}>{p.nome}</button>
                                    {p.tipo === 'Membro' && (
                                      <span className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold bg-stone-100 px-1.5 py-0.2 rounded">
                                        Membro
                                      </span>
                                    )}
                                    {p.arquivado && (
                                      <span className="text-[10px] uppercase text-stone-500 bg-stone-100 rounded px-1.5 py-0.2 font-medium">
                                        Arquivado
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-stone-500 text-[12px]">
                                    {p.telefone ?? <Missing>Contato não informado</Missing>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3">
                              <div className="font-medium text-stone-800">
                                {p.categoria ?? <Missing>Sem categoria</Missing>}
                              </div>
                              <div className="text-stone-400 text-[12px]">
                                {p.ministerio ?? <Missing>Ministério não vinculado</Missing>}
                              </div>
                            </td>
                            <td className="px-3 text-stone-700">
                              {r ? (
                                <>
                                  <div className="font-medium">{r}</div>
                                  {!p.responsavel && (
                                    <div className="text-[11px] text-stone-400">pela categoria</div>
                                  )}
                                </>
                              ) : (
                                <Missing>Não definido</Missing>
                              )}
                            </td>
                            <td className="px-3">
                              <Badge s={p.status} />
                            </td>
                            <td className="px-3 tabular-nums text-stone-600">
                              {u ? (
                                <>
                                  <div className="font-medium">{fmt(u)}</div>
                                  <div className="text-[11px] text-stone-400">há {dias(u, today())} dias</div>
                                </>
                              ) : (
                                <Missing>Nunca contatado</Missing>
                              )}
                            </td>
                            <td className="px-3 pr-6 max-w-64">
                              <Acao p={p} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View: Touch Optimized */}
                <div className="xl:hidden divide-y divide-stone-100">
                  {visiveis.map((p) => {
                    const r = respEfetivo(p, categorias)
                    const u = ultimo(p)
                    const telRaw = p.telefone?.replace(/\D/g, '')

                    return (
                      <div
                        key={p.id}
                        onClick={() => onOpen(p.id)}
                        className={`vp-person-card ${!telRaw && !p.proximaAcao && !proximoContato(p) ? 'vp-person-card--simple' : ''} p-4 bg-white active:bg-brand-50/50 transition-colors flex flex-col gap-2.5 ${
                          p.arquivado ? 'opacity-60 bg-stone-50/70' : ''
                        }`}
                      >
                        <div className="vp-person-card-header flex items-start gap-3">
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="pt-1"
                          >
                            <input
                              type="checkbox"
                              aria-label={`Selecionar ${p.nome}`} checked={sel.has(p.id)}
                              onChange={() => toggle(p.id)}
                            />
                          </div>

                          <div
                            className={`vp-person-card-avatar size-10 shrink-0 rounded-2xl grid place-items-center text-xs font-bold ${
                              p.tipo === 'Membro'
                                ? 'bg-gold-100 text-gold-500'
                                : 'bg-brand-100 text-brand-700'
                            }`}
                          >
                            {p.nome
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="vp-person-card-title flex items-center justify-between gap-1">
                              <h3 className="font-bold text-stone-900 text-sm truncate">{p.nome}</h3>
                              <Badge s={p.status} />
                            </div>
                            <div className="text-stone-500 text-xs mt-0.5 truncate">
                              {p.telefone ?? <Missing>Sem telefone</Missing>}
                            </div>
                          </div>
                        </div>

                        {/* Details pills */}
                        <div className="vp-person-card-meta flex flex-wrap items-center gap-1.5 text-[11px] text-stone-600 pl-8">
                          <span className="bg-stone-100 px-2 py-0.5 rounded-md font-medium">
                            {p.categoria ?? 'Sem cat.'}
                          </span>
                          {r && (
                            <span className="bg-stone-100 px-2 py-0.5 rounded-md">
                              Resp: {r}
                            </span>
                          )}
                          <span className="text-stone-400">
                            {u ? `Último contato há ${dias(u, today())}d` : 'Nunca contatado'}
                          </span>
                        </div>

                        {/* Next action preview */}
                        {(p.proximaAcao || proximoContato(p)) && (
                          <div className="vp-person-card-next pl-8 text-xs bg-stone-50 rounded-xl p-2 text-stone-700">
                            <Acao p={p} />
                          </div>
                        )}

                        {/* Quick Touch Actions */}
                        <div
                          className="vp-person-card-actions flex items-center gap-2 pt-1 pl-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {telRaw ? (
                            <a
                              href={`https://wa.me/${whatsapp(telRaw)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-semibold text-xs px-3 py-1.5 rounded-xl border border-emerald-200 active:scale-95"
                            >
                              <Icon d={I.msg} className="size-3.5" />
                              WhatsApp
                            </a>
                          ) : null}

                          {telRaw ? (
                            <a
                              href={`tel:${telRaw}`}
                              className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 font-semibold text-xs px-3 py-1.5 rounded-xl border border-stone-200 active:scale-95"
                            >
                              <Icon d={I.phone} className="size-3.5" />
                              Ligar
                            </a>
                          ) : null}

                          <button
                            onClick={() => onOpen(p.id)}
                            className="ml-auto text-xs text-brand-600 font-semibold hover:underline"
                          >
                            Ver ficha →
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {lista.length > limite && (
              <div className="p-4 text-center">
                <button
                  className={`${btnSec} w-full sm:w-auto`}
                  onClick={() => setLimite((l) => l + 10)}
                >
                  Carregar mais pessoas ({lista.length - limite} restantes)
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {statusPicker && <Dialog title="Status e acompanhamento" onClose={()=>setStatusPicker(false)}>
        <div className="vp-status-options">
          {(['Etapa','Atenção','Integração'] as const).map(group=><section key={group} aria-label={group}><h3>{group}</h3><div className="vp-choice-options">
            {recortes.filter(r=>r.group===group).map(option=><button type="button" key={option.id} aria-pressed={rec===option.id} onClick={()=>{setRec(option.id);setSel(new Set());setStatusPicker(false)}}><span>{option.label}</span><span className="vp-status-option-count">{count(option.id)}{rec===option.id&&<Icon d={I.check}/>}</span></button>)}
          </div></section>)}
        </div>
      </Dialog>}
      {filterPicker && <Dialog title={filterPicker==='categoria'?'Filtrar categoria':'Ordenar pessoas'} onClose={()=>setFilterPicker(null)}>
        <div className="vp-choice-options">
          {(filterPicker==='categoria'?categoryOptions:orderOptions).map(option=><button type="button" key={option.value} aria-pressed={(filterPicker==='categoria'?cat:ordem)===option.value} onClick={()=>{if(filterPicker==='categoria')setCat(option.value);else setOrdem(option.value as typeof ordem);setFilterPicker(null)}}><span>{option.label}</span>{(filterPicker==='categoria'?cat:ordem)===option.value&&<Icon d={I.check}/>}</button>)}
        </div>
      </Dialog>}
      {confirm && (
        <Confirm
          danger={confirm === 'excluir'}
          title={
            confirm === 'excluir'
              ? `Excluir ${sel.size} ficha(s) definitivamente?`
              : `Arquivar ${sel.size} ficha(s)?`
          }
          body={
            confirm === 'excluir'
              ? 'As fichas e todo o histórico de contatos serão removidos de forma permanente. Esta ação não pode ser desfeita.'
              : 'As fichas selecionadas sairão da relação de ativos. Os dados e históricos ficam salvos e podem ser reativados a qualquer momento.'
          }
          action={confirm === 'excluir' ? 'Excluir definitivamente' : 'Arquivar'}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            if(await onBulk([...sel], confirm)) {setSel(new Set());setConfirm(null)}
          }}
        />
      )}
    </div>
  )
}

function Acao({ p }: { p: Pessoa }) {
  const prox = proximoContato(p)
  if (!p.proximaAcao && !prox) return <Missing>Sem ação prevista</Missing>
  const tag = (d?: string) =>
    !d ? (
      <span className="text-stone-400">sem prazo</span>
    ) : d < today() ? (
      <span className="text-red-600 font-bold">vencido {fmt(d)}</span>
    ) : d === today() ? (
      <span className="text-amber-600 font-bold">hoje</span>
    ) : (
      <span className="text-stone-600">{fmt(d)}</span>
    )

  return (
    <div className="leading-tight">
      {p.proximaAcao && (
        <div className="truncate">
          <span className="font-medium">{p.proximaAcao}</span> · {tag(p.prazo)}
        </div>
      )}
      {prox && (
        <div className="text-[11px] text-stone-500 mt-0.5">
          Retorno programado: {tag(prox)}
        </div>
      )}
    </div>
  )
}

export function Confirm({
  title,
  body,
  action,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  action: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="space-y-3">
        <div className="font-bold text-stone-900 text-base sm:text-lg">{title}</div>
        <p className="text-stone-600 text-[13px] leading-relaxed">{body}</p>
        <div className="pt-3 flex justify-end gap-2">
          <button className={btnSec} onClick={onCancel}>
            Cancelar
          </button>
          <button
            className={
              danger
                ? `${btn} bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-600/30`
                : btnPri
            }
            onClick={onConfirm}
          >
            {action}
          </button>
        </div>
      </div>
    </Dialog>
  )
}


export function Relacionamento({
  pessoas,
  categorias,
  onOpen,
  notify,
  onExport,
}: {
  pessoas: Pessoa[]
  categorias: Categoria[]
  onExport: (ids:string[]) => void
  onOpen: (id: string) => void
  notify: (m: string, tipo?: 'info' | 'error' | 'success') => void
}) {
  const motivo = (p: Pessoa) =>
    [
      p.prazo && p.prazo < today() && 'Ação vencida',
      (p.prazo === today() || proximoContato(p) === today()) && 'Retorno hoje',
      proximoContato(p) && proximoContato(p)! < today() && 'Retorno atrasado',
      !ultimo(p) && 'Aguardando 1º contato',
      ultimo(p) && semContato15(p) && 'Sem contato há +15 dias',
    ].filter(Boolean) as string[]

  const fila = pessoas
    .map((p) => ({ p, m: motivo(p) }))
    .filter((x) => x.m.length > 0)
    .sort((a, b) => b.m.length - a.m.length)

  const ind = [
    ['Ativos', pessoas.length],
    ['Novos (7 dias)', pessoas.filter((p) => dias(p.entrada, today()) <= 7).length],
    ['Aguardando 1º contato', pessoas.filter((p) => !ultimo(p)).length],
    ['Em acompanhamento', pessoas.filter((p) => p.status === 'Em acompanhamento').length],
    ['Retornos até hoje', pessoas.filter(pendente).length],
    ['Sem contato +15d', pessoas.filter(semContato15).length],
  ] as const

  const porResp = Object.entries(
    pessoas.reduce<Record<string, number>>((a, p) => {
      const r = respEfetivo(p, categorias) ?? 'Não definido'
      a[r] = (a[r] ?? 0) + 1
      return a
    }, {})
  ).sort((a, b) => b[1] - a[1])

  const handleExportCSV = () => onExport(fila.map(x=>x.p.id))

  return (
    <>
      <Header
        title="Central de Relacionamento"
        sub="Pessoas que precisam de retorno e atenção imediata"
      >
        <button className={btnSec} onClick={handleExportCSV}>
          <Icon d={I.download} />
          <span>Exportar pendências</span>
        </button>
      </Header>

      {/* Metrics Strip */}
      <div className="flex border-b border-stone-200 bg-white overflow-x-auto divide-x divide-stone-100 shrink-0">
        {ind.map(([k, v]) => (
          <div key={k} className="px-5 py-3 shrink-0 min-w-[130px]">
            <div className="text-[11px] font-medium text-stone-500">{k}</div>
            <div className="text-xl sm:text-2xl font-bold tabular-nums text-stone-900 mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
        {/* Priority Queue */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-bold bg-stone-50 border-b border-stone-200 flex items-center justify-between sticky top-0 z-10">
            <span>Fila de prioridade · {fila.length} casos</span>
            <span className="text-stone-400 font-normal">Ordenado por criticidade</span>
          </div>

          {fila.length === 0 ? (
            <div className="p-12 text-center text-stone-500 space-y-3">
              <div className="size-14 rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center mx-auto">
                <Icon d={I.checkCircle} className="size-7" />
              </div>
              <div className="font-bold text-stone-800 text-base">Nenhuma pendência crítica no momento!</div>
              <p className="text-xs text-stone-400 max-w-sm mx-auto leading-relaxed">
                Todos os contatos de retorno e ações programadas estão em dia.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {fila.map(({ p, m }) => {
                const telRaw = p.telefone?.replace(/\D/g, '')
                return (
                  <div
                    key={p.id}
                    onClick={() => onOpen(p.id)}
                    className="p-4 sm:px-6 sm:py-3.5 bg-white hover:bg-stone-50 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                  >
                    <div className="w-full sm:w-60 min-w-0">
                      <div className="font-bold text-stone-900 text-sm truncate">{p.nome}</div>
                      <div className="text-xs text-stone-500 truncate mt-0.5">
                        Resp: {respEfetivo(p, categorias) ?? 'Não definido'}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-wrap gap-1.5">
                      {m.map((x) => (
                        <span
                          key={x}
                          className={`text-[11px] font-semibold rounded-md px-2 py-0.5 ${
                            x.includes('vencida') || x.includes('atrasado')
                              ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                              : x.includes('hoje')
                              ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {x}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                      <Badge s={p.status} />
                      {telRaw && (
                        <a
                          href={`https://wa.me/${whatsapp(telRaw)}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="size-8 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center hover:bg-emerald-100 transition-colors"
                          title="Enviar mensagem no WhatsApp"
                        >
                          <Icon d={I.msg} className="size-4" />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Distribution and Quality Sidebar */}
        <aside className="w-full xl:w-80 border-t xl:border-t-0 xl:border-l border-stone-200 bg-white p-5 overflow-y-auto shrink-0 space-y-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-stone-400 font-bold mb-2">
              Distribuição do cuidado pastoral
            </div>
            <div className="space-y-1.5">
              {porResp.map(([r, n]) => (
                <div
                  key={r}
                  className="flex items-center justify-between py-1.5 text-xs border-b border-stone-100"
                >
                  <span className={`truncate ${r === 'Não definido' ? 'text-amber-700 italic' : 'text-stone-800'}`}>
                    {r}
                  </span>
                  <span className="font-bold tabular-nums text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                    {n}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-stone-400 font-bold mb-2">
              Qualidade cadastral
            </div>
            <div className="space-y-1.5">
              {[
                ['Sem telefone / WhatsApp', pessoas.filter((p) => !p.telefone).length],
                ['Sem data de nascimento', pessoas.filter((p) => !p.nascimento).length],
                ['Sem categoria atribuída', pessoas.filter((p) => !p.categoria).length],
                ['Sem célula associada', pessoas.filter((p) => !p.celula).length],
              ].map(([k, n]) => (
                <div
                  key={k as string}
                  className="flex items-center justify-between py-1.5 text-xs border-b border-stone-100"
                >
                  <span className="text-stone-700">{k}</span>
                  <span className="font-bold tabular-nums text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    {n}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

/* ---------- Componente Aniversários ---------- */
const modelosParabens = [
  'Graça e paz, {nome}! Que alegria celebrar mais um ano da sua vida. Oramos para que o Senhor derrame ricas bênçãos e renove suas forças neste novo ciclo! Parabéns!',
  'Parabéns pelo seu aniversário, {nome}! Nossa comunidade louva a Deus pela sua vida e deseja um ano repleto de paz, saúde e realizações. Conte sempre conosco!',
  'Querido(a) {nome}, hoje celebramos com você! Que o novo ano seja cheio do favor e da presença do Senhor em tudo o que fizer. Feliz aniversário!',
]

export function Aniversarios({
  pessoas,
  onOpen,
  notify,
}: {
  pessoas: Pessoa[]
  onOpen: (id: string) => void
  notify: (m: string, tipo?: 'info' | 'error' | 'success') => void
}) {
  const currentDay = today()
  const [mes, setMes] = useState(Number(currentDay.slice(5,7)))
  const [sel, setSel] = useState<Pessoa | null>(null)
  const [texto, setTexto] = useState(modelosParabens[0])

  const lista = pessoas
    .filter((p) => p.nascimento && +p.nascimento.slice(5, 7) === mes)
    .sort((a, b) => a.nascimento!.slice(8).localeCompare(b.nascimento!.slice(8)))

  const primeiroNome = sel ? sel.nome.split(' ')[0] : ''
  const msgPronta = sel ? texto.split('{nome}').join(primeiroNome) : ''
  const telRaw = sel?.telefone?.replace(/\D/g, '')

  return (
    <>
      <Header
        title="Aniversários"
        sub={`Aniversários de ${currentDay.slice(0,4)} · Felicitações e acompanhamento`}
      >
        <select
          className={`${input} w-44 font-semibold text-stone-800`}
          aria-label="Mês dos aniversários"
          value={mes}
          onChange={(e) => {
            setMes(+e.target.value)
            setSel(null)
          }}
        >
          {[
            'Janeiro',
            'Fevereiro',
            'Março',
            'Abril',
            'Maio',
            'Junho',
            'Julho',
            'Agosto',
            'Setembro',
            'Outubro',
            'Novembro',
            'Dezembro',
          ].map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </Header>

      <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
        {/* Birthday People List */}
        <div className="flex-1 overflow-y-auto">
          {lista.length === 0 ? (
            <div className="p-12 text-center text-stone-500 space-y-2">
              <div className="size-12 rounded-2xl bg-stone-100 text-stone-400 grid place-items-center mx-auto">
                <Icon d={I.cake} className="size-6" />
              </div>
              <div className="font-semibold text-stone-800">
                Nenhum aniversariante cadastrado neste mês.
              </div>
              <p className="text-xs text-stone-400">
                Cadastre a data de nascimento nas fichas para que os aniversários apareçam automaticamente.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {lista.map((p) => {
                const birthday = visitorBirthdayInYear(p.nascimento!,currentDay)
                const dia = p.nascimento!.slice(8)
                const isSelected = sel?.id === p.id
                const pTel = p.telefone?.replace(/\D/g, '')

                return (
                  <div
                    key={p.id}
                    onClick={() => setSel(p)}
                    className={`vp-birthday-row p-4 sm:px-6 sm:py-3.5 flex items-center gap-3 sm:gap-4 transition-colors cursor-pointer ${
                      isSelected ? 'bg-brand-50/80 border-l-4 border-brand-600' : 'bg-white hover:bg-stone-50'
                    }`}
                  >
                    <div className="size-11 rounded-2xl bg-gold-100 text-gold-500 grid place-items-center font-extrabold text-base shrink-0">
                      {dia}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="vp-birthday-name font-bold text-stone-900 text-sm">{p.nome}</div>
                      <div className="vp-birthday-meta">
                        <span className="vp-birthday-category">{p.categoria || 'Sem categoria'}</span>
                        {birthday&&<span className="vp-birthday-countdown" data-state={birthday.days<0?'past':birthday.days===0?'today':'upcoming'}>{birthday.label}</span>}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        {birthday ? <>{birthday.days<0?'Fez':'Faz'} {birthday.age} {birthday.age===1?'ano':'anos'} · </> : null}
                        {p.telefone ?? 'Sem telefone'}
                      </div>
                      {birthday?.adjusted&&<small className="vp-muted">29/02: contagem em 28/02 neste ano.</small>}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {pTel && (
                        <a
                          href={`https://wa.me/55${pTel}?text=${encodeURIComponent(
                            modelosParabens[0].split('{nome}').join(p.nome.split(' ')[0])
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-semibold text-xs px-2.5 py-1.5 rounded-xl border border-emerald-200 hover:bg-emerald-100"
                        >
                          <Icon d={I.msg} className="size-3.5" />
                          <span className="hidden sm:inline">Parabéns</span>
                        </a>
                      )}

                      <button
                        className="text-xs text-brand-600 font-semibold hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpen(p.id)
                        }}
                      >
                        Ver ficha
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Message Customization Sidebar */}
        <aside className="w-full xl:w-96 border-t xl:border-t-0 xl:border-l border-stone-200 bg-white p-5 overflow-y-auto shrink-0">
          {!sel ? (
            <div className="text-stone-400 text-center py-12 space-y-2">
              <Icon d={I.cake} className="size-8 mx-auto text-stone-300" />
              <div className="font-medium text-sm text-stone-600">
                Selecione uma pessoa aniversariante
              </div>
              <p className="text-xs">
                Clique na lista para redigir ou enviar uma mensagem personalizada pelo WhatsApp.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="font-bold text-stone-900 text-base">
                  Felicitações para {primeiroNome}
                </div>
                <div className="text-xs text-stone-500">
                  Dia {sel.nascimento!.slice(8)} · {sel.categoria || 'Sem categoria'} · {visitorBirthdayInYear(sel.nascimento!,currentDay)?.label} · {sel.telefone ?? 'Sem contato'}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1.5">
                  Modelos de mensagem bíblica e fraterna
                </label>
                <div className="space-y-1.5">
                  {modelosParabens.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => setTexto(m)}
                      className={`w-full text-left text-xs rounded-xl p-2.5 ring-1 transition-all ${
                        texto === m
                          ? 'ring-brand-600 bg-brand-50/50 font-medium text-brand-900'
                          : 'ring-stone-200 hover:bg-stone-50 text-stone-600'
                      }`}
                    >
                      {m.slice(0, 90)}...
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Personalizar texto" hint="A tag {nome} será trocada pelo primeiro nome">
                <textarea
                  className={`${input} h-24 py-2 resize-none`}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </Field>

              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-950 leading-relaxed space-y-1">
                <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <Icon d={I.msg} className="size-3.5" />
                  Pré-visualização do envio:
                </div>
                <div>{msgPronta}</div>
              </div>

              {telRaw ? (
                <a
                  className={`${btnPri} w-full justify-center`}
                  target="_blank"
                  rel="noreferrer"
                  href={`https://wa.me/${whatsapp(telRaw)}?text=${encodeURIComponent(msgPronta)}`}
                >
                  <Icon d={I.msg} />
                  <span>Enviar pelo WhatsApp</span>
                </a>
              ) : (
                <div className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  Esta pessoa não possui telefone válido para WhatsApp cadastrado.
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  )
}


/* ---------- Componente Categorias (CRUD Completo) ---------- */

function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){return <label className="vp-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
