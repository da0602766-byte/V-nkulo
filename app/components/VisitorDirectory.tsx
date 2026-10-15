"use client";

import { useEffect, useState } from "react";
import "./visitor-directory.css";
import { visitorCsv } from "../lib/visitor-csv";

export type DirectoryView = "pendencias" | "acompanhamentos" | "categorias" | "ministerios";
type Person = { id: number; nome_completo: string; telefone: string | null; categoria_nome: string | null; ministerio_nome: string; responsavel_nome: string; status: string; ultimo_contato: string | null; proxima_data: string | null; proxima_acao: string | null; data_proxima_acao: string | null; proximo_contato: string | null };
type Group = { categoria_id: number | null; categoria_nome: string | null; ministerio_nome: string; total: number };
type Result = { visitantes: Person[]; total: number; pagina: number; paginas: number; limite: number; hoje: string; indicadores: { total: number; semana: number; acompanhamento: number; retornos: number }; ministerios: string[]; responsaveis: string[]; grupos: Group[] };
const statuses: Record<string, string> = { NOVO: "Novo", EM_CONTATO: "Em contato", EM_ACOMPANHAMENTO: "Em acompanhamento", INTEGRADO: "Integrado" };
const date = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const contactDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : value.replace(" ", "T") + "Z")) : "—";

export default function VisitorDirectory({ view, categories, canCreate, onCreate, onOpen, selectedId, revision }: {
  view: DirectoryView; categories: {id: number; nome: string}[]; canCreate: boolean; onCreate: () => void; onOpen: (id: number) => void; selectedId: number | null; revision: string;
}) {
  const [filters, setFilters] = useState({ busca: "", status: "", categoria: "", ministerio: "", responsavel: "", periodo: "", ordem: "prioridade" });
  const [pagination, setPagination] = useState({ view, page: 1 });
  const page = pagination.view === view ? pagination.page : 1;
  const setPage = (nextPage: number) => setPagination({ view, page: nextPage });
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selection, setSelection] = useState<{ key: string; ids: number[] }>({ key: "", ids: [] });
  const [selecting, setSelecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const selectionKey = JSON.stringify([filters, view, revision]);
  const selected = selection.key === selectionKey ? selection.ids : [];
  function toggle(id: number) {
    if (!selected.includes(id) && selected.length >= 50) { setExportNotice("Selecione até 50 fichas, ou exporte todos os resultados dos filtros."); return; }
    setSelection({ key: selectionKey, ids: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] });
  }
  async function exportCsv(onlySelected: boolean) {
    if (exporting) return;
    setExporting(true); setExportNotice("");
    try {
      const params = new URLSearchParams(query);
      if (onlySelected) params.set("selecionados", selected.join(","));
      const response = await fetch(`/api/pilot/visitantes/exportar?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível exportar.");
      if (!data.rows.length) { setExportNotice("Nenhuma ficha disponível para exportar."); return; }
      const url = URL.createObjectURL(new Blob([visitorCsv(data.rows)], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `visitantes-${onlySelected ? "selecionados" : "filtrados"}.csv`;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportNotice(`${data.rows.length} ficha(s) exportada(s).`);
    } catch (caught) { setExportNotice((caught as Error).message); }
    finally { setExporting(false); }
  }
  const query = new URLSearchParams({ ...filters, diretorio: "1", contexto: view === "acompanhamentos" ? view : "todos", pagina: String(page) }).toString();
  const requestKey = `${query}|${revision}|${retry}`;
  const loading = loadedQuery !== requestKey;
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/pilot/visitantes?${query}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar os visitantes.");
        if (!controller.signal.aborted) { setResult(data); setError(""); setLoadedQuery(requestKey); }
      } catch (caught) {
        if (!controller.signal.aborted) { setError((caught as Error).message); setLoadedQuery(requestKey); }
      }
    }, filters.busca ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, requestKey, filters.busca]);
  function update(key: keyof typeof filters, value: string) { setFilters(current => ({ ...current, [key]: value })); setPage(1); }
  function clear() { setFilters({ busca: "", status: "", categoria: "", ministerio: "", responsavel: "", periodo: "", ordem: "prioridade" }); setPage(1); }
  const active = Object.entries(filters).filter(([key, value]) => key !== "ordem" && value).length;
  const rows = !loading && !error ? result?.visitantes || [] : [];
  const groups = new Map<string, {name: string; total: number}>();
  if (!loading && !error) for (const group of result?.grupos || []) {
    const key = view === "categorias" ? String(group.categoria_id || "sem-categoria") : group.ministerio_nome || "__none";
    const name = view === "categorias" ? group.categoria_nome || "Sem categoria" : group.ministerio_nome || "Não vinculado";
    groups.set(key, { name, total: (groups.get(key)?.total || 0) + group.total });
  }
  return <div className="vd-directory">
    <div className="vd-metrics" aria-label="Indicadores da comunidade">
      {([["total", "Visitantes no total", "♧"], ["semana", "Novos nos últimos 7 dias", "+"], ["acompanhamento", "Em acompanhamento", "◎"], ["retornos", "Retornos até hoje", "◷"]] as const).map(([key, label, icon]) => <div key={key}><span className={`vd-metric-icon vd-${key}`} aria-hidden="true">{icon}</span><span><b>{result && !error ? result.indicadores[key] || 0 : "—"}</b><small>{label}</small></span></div>)}
    </div>
    <div className="vd-searchbar"><label><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar visitante" placeholder="Buscar visitante…" value={filters.busca} onChange={e => update("busca", e.target.value)} /></label>{canCreate && <button className="vd-primary" onClick={onCreate}>＋ Novo visitante</button>}</div>
    <div className="vd-toolbar"><button className="vd-filter-toggle" aria-expanded={expanded} aria-controls="vd-filters" onClick={() => setExpanded(!expanded)}>☷ Filtros{active ? ` (${active})` : ""}</button><span>{view === "acompanhamentos" ? "Pessoas com status Em acompanhamento." : view === "categorias" ? "Encontre pessoas por categoria." : view === "ministerios" ? "Encontre pessoas por vínculo de ministério." : "Pendências e próximas ações aparecem primeiro."}</span><button className="vd-clear" onClick={clear}>Limpar filtros</button></div>
    <div id="vd-filters" className={`vd-filters ${expanded ? "is-expanded" : ""}`}>
      <label>Status<select value={filters.status} onChange={e => update("status", e.target.value)}><option value="">Todos</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Categoria<select value={filters.categoria} onChange={e => update("categoria", e.target.value)}><option value="">Todas</option><option value="sem-categoria">Sem categoria</option>{categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label>Ministério<select value={filters.ministerio} onChange={e => update("ministerio", e.target.value)}><option value="">Todos</option><option value="__none">Não vinculado</option>{result?.ministerios.map(m => <option key={m}>{m}</option>)}</select></label>
      <label>Responsável<select value={filters.responsavel} onChange={e => update("responsavel", e.target.value)}><option value="">Todos</option><option value="__none">Não definido</option>{result?.responsaveis.map(r => <option key={r}>{r}</option>)}</select></label>
      <label>Último contato<select value={filters.periodo} onChange={e => update("periodo", e.target.value)}><option value="">Qualquer período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="nunca">Nunca contatado</option></select></label>
      <label>Ordenar por<select value={filters.ordem} onChange={e => update("ordem", e.target.value)}><option value="prioridade">Prioridade</option><option value="nome">Nome A–Z</option><option value="nome_desc">Nome Z–A</option><option value="contato">Contato recente</option><option value="acao">Próxima ação</option></select></label>
    </div>
    {active > 0 && <p className="vd-filter-state">{active} filtro(s) aplicado(s){filters.busca && ` · “${filters.busca}”`}</p>}
    {(view === "categorias" || view === "ministerios") && groups.size > 0 && <div className="vd-groups" aria-label={`Agrupar por ${view}`}>{[...groups].map(([key, group]) => <button key={key} aria-pressed={(view === "categorias" ? filters.categoria : filters.ministerio) === key} onClick={() => update(view === "categorias" ? "categoria" : "ministerio", key)}>{group.name}<b>{group.total}</b></button>)}</div>}
    <div className="vd-export-tools">
      <button disabled={loading || Boolean(error) || exporting || !result?.total} onClick={() => void exportCsv(false)}>{exporting ? "Exportando…" : "Exportar filtrados (CSV)"}</button>
      <button aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelection({ key: selectionKey, ids: [] }); }}>{selecting ? "Cancelar seleção" : "Selecionar para exportar"}</button>
      {selecting && <button disabled={!selected.length || loading || exporting} onClick={() => void exportCsv(true)}>Exportar selecionados ({selected.length})</button>}
      {exportNotice && <span role="status">{exportNotice}</span>}
    </div>
    <div className="vd-list" aria-busy={loading}>
      {loading ? <div className="vd-loading" role="status"><p>Carregando visitantes…</p>{[1, 2, 3, 4, 5].map(i => <div key={i} />)}</div> : error ? <div className="vd-empty" role="alert"><strong>Não foi possível carregar a lista</strong><p>{error}</p><button onClick={() => setRetry(r => r + 1)}>Tentar novamente</button></div> : rows.length === 0 ? <div className="vd-empty"><strong>{active ? "Nenhum visitante encontrado para estes filtros" : "Nenhum visitante nesta visão"}</strong><p>{active ? "Tente outro nome ou amplie os filtros." : "Os cadastros autorizados aparecerão aqui."}</p>{active ? <button onClick={clear}>Limpar filtros</button> : canCreate && <button onClick={onCreate}>Cadastrar visitante</button>}</div> : <>
        <div className="vd-table-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Categoria</th><th>Ministério</th><th>Último contato</th><th>Responsável</th><th>Status</th><th>Próximos prazos</th><th><span className="vd-sr-only">Abrir ficha</span></th></tr></thead><tbody>{rows.map(p => <tr key={p.id} data-selected={selectedId === p.id}><th scope="row">{selecting && <input className="vd-selection" type="checkbox" aria-label={`Selecionar ${p.nome_completo}`} checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />}<button className="vd-name" onClick={() => onOpen(p.id)}>{p.nome_completo}</button></th><td>{p.telefone || "—"}</td><td>{p.categoria_nome || "Sem categoria"}</td><td>{p.ministerio_nome || "Não vinculado"}</td><td>{contactDate(p.ultimo_contato)}</td><td>{p.responsavel_nome || "Não definido"}</td><td><span className="vd-status" data-status={p.status}>{statuses[p.status] || p.status}</span></td><td className={p.proxima_data && p.proxima_data < (result?.hoje || "") ? "vd-overdue" : ""} title={p.proxima_acao || undefined}>{p.data_proxima_acao && <span className="vd-deadline">Ação: {date(p.data_proxima_acao)}</span>}{p.proximo_contato && <span className="vd-deadline">Contato: {date(p.proximo_contato)}</span>}{!p.data_proxima_acao && !p.proximo_contato && "—"}</td><td><button className="vd-open" aria-label={`Abrir ficha de ${p.nome_completo}`} onClick={() => onOpen(p.id)}>›</button></td></tr>)}</tbody></table></div>
        <div className="vd-mobile-list">{rows.map(p => <button className="vd-mobile-row" key={p.id} data-selected={selecting ? selected.includes(p.id) : selectedId === p.id} aria-pressed={selecting ? selected.includes(p.id) : undefined} aria-label={selecting ? `Selecionar ${p.nome_completo}` : undefined} onClick={() => selecting ? toggle(p.id) : onOpen(p.id)}><span className="vd-mobile-title"><strong>{p.nome_completo}</strong><span className="vd-status" data-status={p.status}>{statuses[p.status] || p.status}</span></span></button>)}</div>
      </>}
    </div>
    {!loading && !error && result && <footer className="vd-pagination"><span>{result.total ? `Mostrando ${(result.pagina - 1) * result.limite + 1}–${Math.min(result.pagina * result.limite, result.total)} de ${result.total} visitantes` : "0 visitantes"}</span><div><button aria-label="Página anterior" disabled={result.pagina <= 1} onClick={() => setPage(result.pagina - 1)}>‹</button><span aria-live="polite">{result.pagina} / {result.paginas}</span><button aria-label="Próxima página" disabled={result.pagina >= result.paginas} onClick={() => setPage(result.pagina + 1)}>›</button></div></footer>}
  </div>;
}
