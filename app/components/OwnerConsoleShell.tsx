"use client";
import SafeImage from "./SafeImage";


import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "./StableLink";
import ThemeControl from "./ThemeControl";
import PilotNotificationCenter from "./PilotNotificationCenter";
import VerifiedOwnerName from "./VerifiedOwnerName";
import { OwnerTabIcon, OWNER_NAV_SECTIONS, TABS, type OwnerData, type OwnerTab } from "../lib/owner-console";

export function ConsoleIcon({ name }: { name: "menu" | "search" | "bell" | "close" | "collapse" }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === "menu" ? <path d="M4 6h16M4 12h16M4 18h16" /> : name === "search" ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></> : name === "bell" ? <><path d="M18 8a6 6 0 0 0-12 0c0 6-3 6-3 9h18c0-3-3-3-3-9M10 21h4" /></> : name === "close" ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="m14 6-6 6 6 6" />}</svg>;
}

export type OwnerDecision = { key: string; title: string; detail: string; date: string; tab: OwnerTab; kind: "Solicitação" | "Feedback" | "Denúncia"; status: string };
export function ownerDecisions(data: OwnerData): OwnerDecision[] {
  return [
    ...data.requests.filter(row => ["PENDENTE", "EM_ANALISE"].includes(String(row.status))).map(row => ({ key: `request-${row.id}`, title: String(row.nome), detail: String(row.solicitante_nome || "Solicitante não informado"), date: String(row.criado_em || ""), tab: "requests" as OwnerTab, kind: "Solicitação" as const, status: String(row.status) })),
    ...data.feedback.filter(row => ["PENDENTE", "EM_ANALISE"].includes(String(row.status))).map(row => ({ key: `feedback-${row.id}`, title: String(row.mensagem || "Mensagem sem conteúdo").slice(0, 140), detail: String(row.comunidade_nome || row.usuario_nome || "Plataforma"), date: String(row.criado_em || ""), tab: "feedback" as OwnerTab, kind: String(row.tipo).includes("DENUNCIA") ? "Denúncia" as const : "Feedback" as const, status: String(row.status) })),
  ].sort((a, b) => (Date.parse(a.date) || Infinity) - (Date.parse(b.date) || Infinity));
}

export function OwnerDecisionQueue({ data, onSelect, compact = false }: { data: OwnerData; onSelect: (tab: OwnerTab) => void; compact?: boolean }) {
  const [filter, setFilter] = useState("Todos");
  const items = ownerDecisions(data).filter(item => filter === "Todos" || item.kind === filter);
  return <section className="oc-panel oc-decisions" aria-label="Fila de decisões">
    <header className="oc-panel-head"><div><h2>Fila de decisões</h2><p>Solicitações e mensagens abertas · mais antigas primeiro</p></div><button type="button" className="oc-text-button" onClick={() => onSelect(compact ? "decisions" : "requests")}>{compact ? "Ver todas" : "Solicitações"} →</button></header>
    {!compact && <div className="oc-filter-row" role="group" aria-label="Tipo de pendência">{["Todos", "Solicitação", "Feedback", "Denúncia"].map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}<button type="button" onClick={() => onSelect("feedback")}>Histórico de mensagens →</button></div>}
    {items.slice(0, compact ? 4 : items.length).map(item => <article className="oc-decision" key={item.key}><span className="oc-decision-marker" /><div><span className="oc-tag">{item.kind} · {item.status === "EM_ANALISE" ? "Em análise" : "Pendente"}</span><h3>{item.title}</h3><p>{item.detail} · <time dateTime={item.date}>{formatConsoleDate(item.date)}</time></p></div><button type="button" className="oc-button" onClick={() => onSelect(item.tab)}>Revisar</button></article>)}
    {!items.length && <div className="oc-empty"><OwnerTabIcon tab="decisions" /><h3>Nenhuma pendência nesta fila</h3><p>Não há solicitações ou mensagens abertas nos registros carregados.</p></div>}
    <footer className="oc-panel-foot">{items.length} itens nesta consulta. Eventos de auditoria ficam em Saúde & incidentes; não indicam, por si só, incidentes abertos.</footer>
  </section>;
}

export function formatConsoleDate(value: string) {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function OwnerConsoleShell({ tab, onSelect, onSearchDirectory, data, ownerName, ownerPhoto, brandName, brandLogo, children }: { tab: OwnerTab; onSelect: (tab: OwnerTab) => void; onSearchDirectory: (tab: "communities" | "users", query: string) => void; data: OwnerData | null; ownerName: string; ownerPhoto: string; brandName: string; brandLogo: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [modal, setModal] = useState<"search" | "alerts" | "menu" | null>(null);
  const [query, setQuery] = useState("");
  const [directoryResults, setDirectoryResults] = useState<{ tab: "communities" | "users"; id: number; title: string; detail: string }[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const sidebar = useRef<HTMLElement>(null);
  const pending = data ? ownerDecisions(data) : [];
  const activeNav = ["requests", "feedback"].includes(tab) ? "decisions" : ["passwords", "deleted"].includes(tab) ? "audit" : tab === "incidents" ? "performance" : tab;
  const select = (value: OwnerTab) => { setModal(null); setQuery(""); onSelect(value); };
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setModal(current => current === "search" ? null : "search"); }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  useEffect(() => {
    if (modal !== "search" || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      try {
        const sections = ["communities", "users"] as const;
        const results = await Promise.all(sections.map(async section => {
          const response = await fetch(`/api/proprietario?section=${section}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("Busca indisponível");
          const result = await response.json() as OwnerData;
          return result[section].filter(row => [row.nome, row.email, row.cidade_publica, row.comunidades_nomes].join(" ").toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))).slice(0, 5).map(row => ({ tab: section, id: Number(row.id), title: String(row.nome), detail: String(row.cidade_publica || row.comunidades_nomes || (section === "users" ? "Pessoa cadastrada" : "Comunidade")) }));
        }));
        if (!controller.signal.aborted) { setDirectoryResults(results.flat()); setSearchState("ready"); }
      } catch {
        if (!controller.signal.aborted) { setDirectoryResults([]); setSearchState("error"); }
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [modal, query]);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (modal) {
      previousFocus.current = document.activeElement as HTMLElement;
      node.showModal();
      if (modal === "search") node.querySelector<HTMLInputElement>("input[type=search]")?.focus();
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = originalOverflow; node.close(); previousFocus.current?.focus(); };
    }
  }, [modal]);
  useEffect(() => { sidebar.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" }); }, [tab]);

  const navigation = (mobile = false) => <nav className="oc-nav" aria-label={mobile ? "Menu móvel do proprietário" : "Navegação do proprietário"}>{OWNER_NAV_SECTIONS.map(group => <section key={group.id}><h2>{group.label}</h2>{group.items.map(id => <button type="button" key={id} title={TABS.find(item => item.id === id)?.label} aria-current={activeNav === id ? "page" : undefined} onClick={() => select(id)}><OwnerTabIcon tab={id} /><span>{TABS.find(item => item.id === id)?.label}</span>{id === "decisions" && pending.length > 0 && <b>{pending.length}</b>}</button>)}</section>)}</nav>;
  const term = query.trim().toLocaleLowerCase("pt-BR");
  const commands = TABS.filter(item => !term || item.label.toLocaleLowerCase("pt-BR").includes(term));
  function handleCommandKeys(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (modal !== "search") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(".oc-command-list button"));
    if (!buttons.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = index < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[nextIndex].focus();
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault(); buttons[0].click();
    }
  }
  const brand = <Link href="/" className="oc-brand">{brandLogo ? <SafeImage src={brandLogo} alt="" /> : <span className="oc-brand-mark">{brandName.slice(0, 1)}</span>}<span><strong>{brandName}</strong><small>Console do proprietário</small></span></Link>;
  return <div className={`oc-shell${collapsed ? " is-collapsed" : ""}`}>
    <a href="#owner-console-content" className="oc-skip">Ir para o conteúdo</a>
    <aside className="oc-sidebar" ref={sidebar}>
      <div className="oc-brand-row">{brand}<button type="button" className="oc-collapse" aria-label={collapsed ? "Expandir menu" : "Recolher menu"} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><ConsoleIcon name="collapse" /></button></div>
      <div className="oc-scope"><i /><div><strong>Escopo global</strong><small>Administração da plataforma</small></div></div>
      {navigation()}
      <footer className="oc-sidebar-footer"><Link href="/painel?view=conta" className="oc-user">{ownerPhoto ? <SafeImage src={ownerPhoto} alt="" /> : <span>{ownerName.split(" ").map(n => n[0]).slice(0, 2).join("")}</span>}<div><strong><VerifiedOwnerName name={ownerName} verified /></strong><small>Proprietário global</small></div></Link><Link href="/painel" className="oc-community-link">↗ <span>Abrir painel da comunidade</span></Link></footer>
    </aside>
    <header className="oc-topbar"><button type="button" className="oc-icon-button oc-menu-button" aria-label="Abrir menu" onClick={() => setModal("menu")}><ConsoleIcon name="menu" /></button><button type="button" className="oc-search-trigger" onClick={() => setModal("search")}><ConsoleIcon name="search" /><span>Buscar área ou ação…</span><kbd>Ctrl K</kbd></button><div className="oc-top-spacer" /><span className="oc-env">Acesso do proprietário</span><ThemeControl compact cycle /><button type="button" className="oc-icon-button" aria-label={`Central de alertas administrativos${data ? `, ${pending.length} pendências` : ""}`} onClick={() => setModal("alerts")}><OwnerTabIcon tab="decisions" />{pending.length > 0 && <i className="oc-notification-dot" />}</button><PilotNotificationCenter /><span id="global-editor-toolbar-slot" className="global-editor-toolbar-slot" aria-label="Editor de aparência" /></header>
    <div className="oc-main"><section id="owner-console-content" className="owner-workspace oc-content" tabIndex={-1}>{children}</section></div>
    <nav className="oc-mobile-tabs" aria-label="Navegação rápida">{(["overview", "decisions", "communities", "performance"] as OwnerTab[]).map((id, i) => <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => select(id)}><OwnerTabIcon tab={id} /><span>{["Início", "Pendências", "Comunidades", "Saúde"][i]}</span></button>)}<button type="button" onClick={() => setModal("menu")}><ConsoleIcon name="menu" /><span>Mais</span></button></nav>
    <dialog ref={dialog} onKeyDown={handleCommandKeys} className={`oc-dialog oc-dialog-${modal || "closed"}`} aria-label={modal === "search" ? "Busca e comandos" : modal === "menu" ? "Menu do proprietário" : "Central de alertas"} onCancel={() => setModal(null)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setModal(null); } }}>
      <header><h2>{modal === "search" ? "Busca e comandos" : modal === "menu" ? "Menu do proprietário" : "Central de alertas"}</h2><button type="button" className="oc-icon-button" aria-label="Fechar" onClick={() => setModal(null)}><ConsoleIcon name="close" /></button></header>
      {modal === "search" && <><label className="oc-command-input"><ConsoleIcon name="search" /><input autoFocus type="search" value={query} onChange={event => { setQuery(event.target.value); setDirectoryResults([]); setSearchState(event.target.value.trim().length >= 2 ? "loading" : "idle"); }} placeholder="Digite uma área, pessoa ou comunidade…" aria-label="Pesquisar áreas, pessoas e comunidades" /><kbd>Esc</kbd></label><div className="oc-command-list">{commands.map(item => <button type="button" key={item.id} onClick={() => select(item.id)}><OwnerTabIcon tab={item.id} /><span>{item.label}<small>Abrir área administrativa</small></span><span>↗</span></button>)}{term.length >= 2 && <div className="oc-command-directories"><p>Comunidades e pessoas · consulta limitada a 300 registros por diretório</p>{searchState === "loading" && <p role="status">Buscando nos cadastros…</p>}{searchState === "error" && <p role="alert">Não foi possível consultar os diretórios. As áreas continuam disponíveis acima.</p>}{searchState === "ready" && directoryResults.map(item => <button type="button" key={`${item.tab}-${item.id}`} onClick={() => { setModal(null); onSearchDirectory(item.tab, item.title); setQuery(""); }}><OwnerTabIcon tab={item.tab} /><span>{item.title}<small>{item.detail}</small></span><span>↗</span></button>)}{searchState === "ready" && !directoryResults.length && <p>Nenhum cadastro encontrado nesta consulta.</p>}</div>}{!commands.length && term.length < 2 && <p className="oc-empty">Digite pelo menos dois caracteres para pesquisar cadastros.</p>}</div></>}
      {modal === "menu" && navigation(true)}
      {modal === "alerts" && <div className="oc-drawer-content">{!data ? <p>Os alertas estarão disponíveis após carregar os dados.</p> : <><p>Solicitações e mensagens abertas na última consulta. Não representa monitoramento em tempo real.</p>{pending.slice(0, 12).map(item => <button className="oc-notice" type="button" key={item.key} onClick={() => select(item.tab)}><small>{item.kind}</small><strong>{item.title}</strong><span>{item.detail}</span><time dateTime={item.date}>{formatConsoleDate(item.date)}</time></button>)}{!pending.length && <div className="oc-empty"><h3>Nenhum alerta pendente</h3><p>A consulta atual não retornou solicitações ou mensagens abertas.</p></div>}<button type="button" className="oc-button" onClick={() => select("decisions")}>Abrir fila completa</button></>}</div>}
    </dialog>
  </div>;
}
