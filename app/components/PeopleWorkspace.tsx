"use client";

import TransientFeedback from "./TransientFeedback";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import VerifiedOwnerName from "./VerifiedOwnerName";
import PersonRecord from "./PersonRecord";
import SafeImage from "./SafeImage";
import "./people-directory-ux.css";
import "./leadership-member-ux.css";
import "./people-role-editor.css";

type Person = {
  canEditHierarchy?: boolean;
  canRemove?: boolean;
  membership_id: number;
  usuario_id: number;
  nome: string;
  email: string;
  telefone?: string | null;
  foto_perfil?: string | null;
  papel: string;
  oficial: number;
  titulo_oficial: string;
  permissoes: string;
  status: string;
  owner_verified?: number;
  ministerios?: string;
  proximas_escalas?: number;
};

type Me = {
  id: number;
  nome: string;
  email: string;
  telefone?: string | null;
  data_nascimento?: string | null;
  endereco?: string | null;
  celula_vinculada?: string | null;
  ministerio?: string | null;
  papel: string;
  oficial: number;
  titulo_oficial: string;
  owner_verified?: number;
};

type PeopleCounts = {
  membros: number;
  oficiais: number;
  oficiaisSemTitulo: number;
};

type PeopleResponse = {
  me: Me | null;
  people: Person[];
  // Posição do último item do lote. Nulo quando não há mais ninguém depois.
  nextCursor?: string | null;
  // Totais da comunidade inteira, não do lote carregado.
  counts?: PeopleCounts;
  canViewPeople: boolean;
  canManage: boolean;
  canDeleteGlobal?: boolean;
  canRemoveCommunity?: boolean;
  canEditSelfHierarchy?: boolean;
  permissionCatalog?: string[];
  error?: string;
};

type RemovalBlocker = {
  label: string;
  detail: string;
  href: string;
};

const PERMISSION_LABELS: Record<string, string> = {
  "visitors.view": "Abrir Visitantes (lista pessoal)",
  "visitors.create": "Cadastrar visitantes",
  "visitors.edit": "Editar visitantes",
  "followups.view": "Consultar acompanhamentos",
  "followups.manage": "Gerenciar acompanhamentos",
  "cells.view": "Consultar células",
  "events.view": "Consultar eventos",
  "events.manage": "Gerenciar eventos",
  "ministries.view": "Consultar ministérios",
  "schedules.view": "Consultar escalas",
  "schedules.manage": "Gerenciar escalas",
  "parking.view": "Consultar estacionamento",
  "parking.reserve": "Reservar estacionamento",
  "parking.report": "Registrar ocorrências",
  "visitor.categories.manage": "Organizar categorias de visitantes",
  "diaconia.view": "Consultar diaconia",
  "diaconia.checklist.update": "Atualizar checklist da diaconia",
  "diaconia.manage": "Gerenciar diaconia",
  "diaconia.report": "Registrar relatório da diaconia",
  "feed.publish": "Publicar no feed",
  "requests.manage": "Atender pedidos da comunidade",
};



const TITLE_CATEGORIES = [
  { label: "Formação", titles: ["ASPIRANTE"] },
  { label: "Liderança de células", titles: ["LÍDER", "SUPERVISOR DE CÉLULAS", "SUPERVISORA DE CÉLULAS"] },
  { label: "Cuidado e diaconia", titles: ["GESTOR DE CUIDADO", "GESTORA DE CUIDADO", "DIÁCONO", "DIACONISA"] },
  { label: "Ministérios", titles: ["COORDENADOR DE MINISTÉRIO", "COORDENADORA DE MINISTÉRIO", "EVANGELISTA", "MISSIONÁRIO", "MISSIONÁRIA"] },
  { label: "Pastoral", titles: ["PRESBÍTERO", "PRESBÍTERA", "PASTOR", "PASTORA"] },
  { label: "Administração", titles: ["SECRETÁRIO", "SECRETÁRIA"] },
] as const;

const HIERARCHY_PERMISSION_PRESETS: Record<string, string[]> = {
  "ASPIRANTE": [],
  "LÍDER": ["visitors.view", "visitors.create", "visitors.edit", "followups.view", "followups.manage", "cells.view", "events.view", "ministries.view", "schedules.view", "feed.publish"],
  "DIÁCONO": ["visitors.view", "followups.view", "events.view", "ministries.view", "schedules.view", "parking.view", "parking.report"],
  "DIACONISA": ["visitors.view", "followups.view", "events.view", "ministries.view", "schedules.view", "parking.view", "parking.report"],
  "PRESBÍTERO": ["visitors.view", "visitors.create", "visitors.edit", "followups.view", "followups.manage", "cells.view", "events.view", "events.manage", "ministries.view", "schedules.view", "schedules.manage", "feed.publish", "requests.manage"],
  "PRESBÍTERA": ["visitors.view", "visitors.create", "visitors.edit", "followups.view", "followups.manage", "cells.view", "events.view", "events.manage", "ministries.view", "schedules.view", "schedules.manage", "feed.publish", "requests.manage"],
  "PASTOR": ["visitors.view", "visitors.create", "visitors.edit", "followups.view", "followups.manage", "cells.view", "events.view", "events.manage", "ministries.view", "schedules.view", "schedules.manage", "parking.view", "feed.publish", "requests.manage"],
  "PASTORA": ["visitors.view", "visitors.create", "visitors.edit", "followups.view", "followups.manage", "cells.view", "events.view", "events.manage", "ministries.view", "schedules.view", "schedules.manage", "parking.view", "feed.publish", "requests.manage"],
  "COORDENADOR DE MINISTÉRIO": ["visitors.view", "followups.view", "cells.view", "events.view", "ministries.view", "schedules.view", "schedules.manage", "feed.publish"],
  "COORDENADORA DE MINISTÉRIO": ["visitors.view", "followups.view", "cells.view", "events.view", "ministries.view", "schedules.view", "schedules.manage", "feed.publish"],
  "SUPERVISOR DE CÉLULAS": ["visitors.view", "visitors.create", "visitors.edit", "followups.view", "followups.manage", "cells.view", "events.view", "ministries.view", "schedules.view"],
  "SUPERVISORA DE CÉLULAS": ["visitors.view", "visitors.create", "visitors.edit", "followups.view", "followups.manage", "cells.view", "events.view", "ministries.view", "schedules.view"],
  "GESTOR DE CUIDADO": ["visitors.view", "visitors.create", "visitors.edit", "followups.view", "followups.manage", "requests.manage"],
  "GESTORA DE CUIDADO": ["visitors.view", "visitors.create", "visitors.edit", "followups.view", "followups.manage", "requests.manage"],
};

const HIERARCHY_MODEL_COPY: Record<string, string> = {
  "LÍDER": "Acompanha pessoas, células, agenda e publicações locais.",
  "DIÁCONO": "Serve nas rotinas de apoio, agenda e estacionamento.",
  "DIACONISA": "Serve nas rotinas de apoio, agenda e estacionamento.",
  "PRESBÍTERO": "Coordena cuidado, agenda, escalas e atendimento de pedidos.",
  "PRESBÍTERA": "Coordena cuidado, agenda, escalas e atendimento de pedidos.",
  "PASTOR": "Tem uma base ampla para cuidado pastoral e operação da comunidade.",
  "PASTORA": "Tem uma base ampla para cuidado pastoral e operação da comunidade.",
  "COORDENADOR DE MINISTÉRIO": "Organiza ministérios, escalas, eventos e comunicação da equipe.",
  "COORDENADORA DE MINISTÉRIO": "Organiza ministérios, escalas, eventos e comunicação da equipe.",
  "SUPERVISOR DE CÉLULAS": "Acompanha líderes, pessoas e o ritmo de cuidado das células.",
  "SUPERVISORA DE CÉLULAS": "Acompanha líderes, pessoas e o ritmo de cuidado das células.",
  "GESTOR DE CUIDADO": "Centraliza visitantes, acompanhamentos e pedidos de cuidado.",
  "GESTORA DE CUIDADO": "Centraliza visitantes, acompanhamentos e pedidos de cuidado.",
};

const ACTIVITY_MODELS = [
  { title: "LÍDER", label: "Liderança local" },
  { title: "SUPERVISOR DE CÉLULAS", label: "Supervisão de células" },
  { title: "GESTOR DE CUIDADO", label: "Cuidado de pessoas" },
  { title: "DIÁCONO", label: "Diaconia e apoio" },
  { title: "COORDENADOR DE MINISTÉRIO", label: "Coordenação de ministério" },
  { title: "PRESBÍTERO", label: "Presbitério" },
  { title: "PASTOR", label: "Cuidado pastoral" },
  { title: "SECRETÁRIO", label: "Apoio administrativo" },
];

const PERMISSION_GROUPS = [
  { title: "Pessoas e cuidado", detail: "A página Visitantes libera a lista pessoal do oficial. O acesso à sua lista exige “Compartilhar lista”.", permissions: ["visitors.view", "visitors.create", "visitors.edit", "visitor.categories.manage", "followups.view", "followups.manage", "cells.view", "requests.manage"] },
  { title: "Agenda e equipes", detail: "Eventos, ministérios e escalas.", permissions: ["events.view", "events.manage", "ministries.view", "schedules.view", "schedules.manage"] },
  { title: "Diaconia e apoio", detail: "Rotinas de serviço e relatórios.", permissions: ["diaconia.view", "diaconia.checklist.update", "diaconia.manage", "diaconia.report", "parking.view", "parking.reserve", "parking.report"] },
  { title: "Comunicação", detail: "Publicações no mural da comunidade.", permissions: ["feed.publish"] },
];

export default function PeopleWorkspace({
  communityName,
  mode = "manage",
  selfLinks = [],
}: {
  communityName: string;
  mode?: "self" | "manage";
  selfLinks?: Array<{ label: string; href: string }>;
}) {
  const [data, setData] = useState<PeopleResponse>({
    me: null,
    people: [],
    canViewPeople: false,
    canManage: false,
  });
  const [pending, setPending] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadFailure, setLoadFailure] = useState<{key: string; cursor: string | null; message: string} | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const loadedQueryRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const profileSavingRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"todos" | "membros" | "oficiais">("todos");
  const [record, setRecord] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const [participation, setParticipation] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<string[]>([]);
  const [presetTitle, setPresetTitle] = useState("LÍDER");
  const [modelApplied, setModelApplied] = useState(false);
  const [officialTitle, setOfficialTitle] = useState("LÍDER");
  const [isOfficial, setIsOfficial] = useState(false);
  const [removing, setRemoving] = useState<Person | null>(null);
  const [removeConfirmation, setRemoveConfirmation] = useState("");
  const [removalIssue, setRemovalIssue] = useState<{ message: string; blockers: RemovalBlocker[] } | null>(null);
  const queryKey = JSON.stringify([tab, search.trim(), participation]);
  const currentFailure = loadFailure?.key === queryKey ? loadFailure : null;
  const loading = pending || (loadedKey !== queryKey && !currentFailure);
  const listError = currentFailure && !currentFailure.cursor ? currentFailure.message : "";

  useEffect(() => {
    if (!editing) return;
    const dialog = document.querySelector<HTMLElement>('[data-role-editor="true"]');
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Fechar"]')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setEditing(null); }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button, input, select, summary, [tabindex="0"]')]
        .filter(element => !element.hasAttribute("disabled") && element.getClientRects().length > 0);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; dialog.removeEventListener("keydown", handleKey); previousFocus?.focus(); };
  }, [editing]);

  // `cursor` vazio recomeça a lista (troca de aba, nova busca, recarga depois de
  // uma alteração); com cursor, o lote novo é anexado ao que já está na tela.
  const load = useCallback(
    async (options: { quiet?: boolean; cursor?: string | null } = {}) => {
      const { quiet = false, cursor = null } = options;
      if (cursor && (requestRef.current || loadedQueryRef.current !== queryKey)) return;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      if (cursor) setLoadingMore(true);
      else if (!quiet) setPending(true);
      setLoadFailure(null);
      try {
        const address = new URL("/api/pilot/pessoas", window.location.origin);
        address.searchParams.set("aba", tab);
        if (participation) address.searchParams.set("vinculo", participation);
        const term = search.trim();
        if (term) address.searchParams.set("busca", term);
        if (cursor) address.searchParams.set("cursor", cursor);
        const response = await fetch(address, { cache: "no-store", signal: controller.signal });
        const result = (await response.json()) as PeopleResponse;
        if (!response.ok) {
          throw new Error(result.error || "Não foi possível carregar as pessoas.");
        }
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.people)) throw new Error("Não foi possível ler a lista de pessoas.");
        setData((current) =>
          cursor
            ? { ...result, people: [...new Map([...current.people, ...result.people].map(person => [person.membership_id, person])).values()] }
            : result,
        );
        setLoadedKey(queryKey);
        loadedQueryRef.current = queryKey;
      } catch (loadError) {
        if (!controller.signal.aborted) setLoadFailure({key: queryKey, cursor, message: (loadError as Error).message});
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setLoadingMore(false);
          setPending(false);
        }
      }
    },
    [search, tab, participation, queryKey],
  );

  // A busca agora roda no banco, então cada tecla viraria uma consulta; o
  // intervalo abaixo espera a digitação parar antes de recomeçar a lista.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 300 : 0);
    return () => { window.clearTimeout(timer); requestRef.current?.abort(); requestRef.current = null; };
  }, [load, search]);

  // A aba e a busca são resolvidas no servidor, então o que chega já é o
  // resultado filtrado: filtrar de novo aqui esconderia gente do lote seguinte.
  const filtered = loadedKey === queryKey && !listError ? data.people : [];
  const pagedPeople = filtered;

  function applyHierarchyModel(title: string) {
    setPresetTitle(title);
    setModelApplied(true);
    setPermissionDraft((HIERARCHY_PERMISSION_PRESETS[title] || ["events.view", "ministries.view", "schedules.view"])
      .filter((permission) => (data.permissionCatalog || []).includes(permission)));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileSavingRef.current) return;
    profileSavingRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/pilot/pessoas/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível atualizar o perfil.");
      }
      setMessage("Seu perfil foi atualizado.");
      await load({ quiet: true });
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      profileSavingRef.current = false;
      setSaving(false);
    }
  }

  async function saveOfficial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/pilot/pessoas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: editing.membership_id,
          oficial: isOfficial,
          papel: form.get("papel"),
          titulo: form.get("titulo"),
          permissions: form.getAll("permissions"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível salvar a função.");
      }
      setEditing(null);
      setMessage("Função e permissões atualizadas com auditoria.");
      await load({ quiet: true });
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!removing) return;
    setSaving(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/pilot/pessoas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: removing.membership_id,
          action: form.get("action"),
        }),
      });
      const result = (await response.json()) as { error?: string; message?: string; blockers?: RemovalBlocker[] };
      if (!response.ok) {
        if (result.blockers?.length) {
          setRemovalIssue({ message: result.error || "A ação precisa de atenção.", blockers: result.blockers });
          return;
        }
        throw new Error(result.error || "Não foi possível concluir.");
      }
      const removedMembershipId = removing.membership_id;
      setRemoving(null);
      setRemoveConfirmation("");
      setData((current) => ({
        ...current,
        people: current.people.filter((person) => person.membership_id !== removedMembershipId),
      }));
      setRemovalIssue(null);
      setMessage(result.message || "A ação foi concluída e registrada na auditoria.");
    } catch (removeError) {
      setError((removeError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading && mode === "self" && !data.me) {
    return (
      <section className="people-workspace">
        <div className="people-loading" role="status">
          Carregando seu perfil…
        </div>
      </section>
    );
  }

  if (mode === "self") {
    if (listError && !data.me) return <section className="directory-load-error"><p role="alert">{listError}</p><button type="button" onClick={() => void load()}>Tentar novamente</button></section>;
    return (
      <SelfProfile
        me={data.me}
        saving={saving}
        error={error}
        message={message}
        onSubmit={saveProfile}
        refreshError={listError}
        onRetry={() => void load({ quiet: true })}
        refreshing={pending}
        links={selfLinks}
      />
    );
  }

  // Os cartões do topo mostram a comunidade inteira. Contar sobre `data.people`
  // passou a estar errado quando a lista virou paginada: ali só existe o lote
  // já carregado da aba aberta.
  const totals = data.counts || { membros: 0, oficiais: 0, oficiaisSemTitulo: 0 };
  const members = totals.membros;
  return (
    <section className="people-workspace people-directory">
      <header className="workspace-heading people-heading">
        <div>
          <p className="pilot-kicker">COMUNIDADE · {communityName}</p>
          <h1>Encontre e acompanhe pessoas</h1>
          <p>
            Busque uma pessoa, consulte sua participação e abra a ficha para acompanhar os detalhes.
          </p>
        </div>
        <a className="people-report-link" href="/painel?view=relatorios">Consultar relatórios →</a>
      </header>

      {data.canEditSelfHierarchy && (
        <div className="owner-access-banner">
          <span aria-hidden="true">✦</span>
          <div>
            <strong>Você é o proprietário desta comunidade</strong>
            <p>
              Todas as funções estão disponíveis neste escopo, inclusive a
              edição da sua própria função. A propriedade permanece separada
              da função escolhida.
            </p>
          </div>
        </div>
      )}

      {data.counts && <div className="people-metrics">
        <article>
          <span>◎</span>
          <div><small>Pessoas vinculadas</small><strong>{members + totals.oficiais}</strong></div>
        </article>
        <article>
          <span>○</span>
          <div><small>Membros</small><strong>{members}</strong></div>
        </article>
        <article>
          <span>✦</span>
          <div><small>Oficiais</small><strong>{totals.oficiais}</strong></div>
        </article>
        <article>
          <span>◇</span>
          <div>
            <small>Oficiais sem título</small>
            <strong>{totals.oficiaisSemTitulo}</strong>
          </div>
        </article>
      </div>}

      {(message || error) && (
        <TransientFeedback className={`operations-feedback ${error ? "error" : ""}`} role="status">
          {error || message}
        </TransientFeedback>
      )}

      <div className="people-toolbar">
        <div className="people-tabs" aria-label="Tipo de pessoa">
          <button type="button" className={tab === "todos" ? "active" : ""} aria-pressed={tab === "todos"} onClick={() => setTab("todos")}>Todas {data.counts && <span>{members + totals.oficiais}</span>}</button>
          <button
            type="button"
            className={tab === "membros" ? "active" : ""}
            aria-pressed={tab === "membros"}
            onClick={() => setTab("membros")}
          >
            Membros {data.counts && <span>{members}</span>}
          </button>
          <button
            type="button"
            className={tab === "oficiais" ? "active" : ""}
            aria-pressed={tab === "oficiais"}
            onClick={() => setTab("oficiais")}
          >
            Oficiais {data.counts && <span>{totals.oficiais}</span>}
          </button>
        </div>
        <label>
          <span>Buscar pessoa</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone"
          />
        </label>
        <label><span>Acompanhamento</span><select value={participation} onChange={event => setParticipation(event.target.value)}><option value="">Todos os vínculos</option><option value="sem-ministerio">Sem ministério ativo</option><option value="com-escala">Com próximas escalas</option><option value="sem-titulo">Oficiais sem título</option></select></label>
        {(search || participation || tab !== "todos") && <button type="button" className="people-clear-filters" onClick={() => { setSearch(""); setTab("todos"); setParticipation(""); }}>Limpar filtros</button>}
      </div>

      {loading && <p className="people-loading" role="status">Buscando pessoas…</p>}
      {listError && <div className="directory-load-error"><p role="alert">{listError}</p><button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
      {!loading && !listError && <div className="people-list people-directory-list">
        <div className="people-directory-columns" aria-hidden="true"><span>Pessoa / função</span><span>Ministérios</span><span>Contato</span><span>Próximas escalas</span><span>Ficha</span></div>
        {pagedPeople.map((person) => (
          <article key={person.membership_id} className="people-card people-directory-row">
            <div className="people-card-main">
              <button type="button" className="people-person-button" onClick={() => setRecord(person)} aria-label={`Abrir ficha de ${person.nome}`}>
                <span className="people-avatar">{person.foto_perfil ? <SafeImage src={person.foto_perfil} alt="" fallbackName={person.nome} fallbackKind="avatar" /> : getInitials(person.nome)}</span>
                <span><VerifiedOwnerName name={person.nome} verified={Boolean(person.owner_verified)} official={Boolean(person.oficial)} officialTitle={person.oficial?person.titulo_oficial:null} /><small>Unção: {person.oficial ? person.titulo_oficial || "Não informada" : "Não informada"} · Função: {roleLabel(person.papel)}</small></span>
              </button>
            </div>
            <div className="people-directory-ministry"><small className="people-mobile-label">Ministérios</small><span>{person.ministerios || "Sem vínculo ativo"}</span></div>
            <div className="people-card-contact">
              <small>{person.email}</small>
              <span>{person.telefone || "Não informado"}</span>
            </div>
            <div className="people-directory-schedules"><small className="people-mobile-label">Próximas escalas</small><span>{person.proximas_escalas || 0}</span></div>
            <div className="people-card-actions">
              <button type="button" className="people-open-record" onClick={() => setRecord(person)} aria-label={`Ver ficha de ${person.nome}`}>Ver ficha</button>
              {(person.canEditHierarchy || person.canRemove) && <details className="people-row-menu"><summary aria-label={`Mais ações para ${person.nome}`}>⋯</summary><div>
              {person.canEditHierarchy && (
                <button type="button" onClick={() => { const title = person.titulo_oficial || "LÍDER"; setEditing(person); setModelApplied(false); setPermissionDraft(person.permissoes.split(",").filter(Boolean)); setPresetTitle(title); setOfficialTitle(title); setIsOfficial(Boolean(person.oficial)); }}>
                  Editar função
                </button>
              )}
              {person.canRemove && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => { setRemoveConfirmation(""); setRemovalIssue(null); setRemoving(person); }}
                >
                  Remover pessoa
                </button>
              )}
              </div></details>}
            </div>
          </article>
        ))}
        {!filtered.length && (
          <div className="pilot-empty-state">
            <strong>Nenhuma pessoa encontrada</strong>
            <p>{search || participation || tab !== "todos" ? "Ajuste a busca ou limpe os filtros para ampliar os resultados." : "Os vínculos desta comunidade aparecerão aqui."}</p>
          </div>
        )}
      </div>}

      {!loading && !listError && (data.nextCursor || filtered.length > 0) && (
        <nav className="people-pagination" aria-label="Paginação de pessoas">
          <span>
            {filtered.length} {filtered.length === 1 ? "pessoa carregada" : "pessoas carregadas"}
            {" · "}
            {participation ? "no filtro de acompanhamento" : search.trim() ? `na busca por “${search.trim()}”` : `${tab === "todos" ? members + totals.oficiais : tab === "oficiais" ? totals.oficiais : totals.membros} nesta aba`}
          </span>
          {currentFailure?.cursor && <p className="people-more-error" role="alert">{currentFailure.message} As pessoas já carregadas continuam disponíveis.</p>}
          {data.nextCursor && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void load({ cursor: data.nextCursor, quiet: true })}
            >
              {loadingMore ? "Carregando…" : currentFailure?.cursor ? "Tentar carregar mais" : "Carregar mais"}
            </button>
          )}
        </nav>
      )}

      {record && <PersonRecord membershipId={record.membership_id} name={record.nome} permissionLabels={PERMISSION_LABELS} onClose={() => setRecord(null)} />}
      {editing && (
        <div className="people-modal-backdrop" onMouseDown={() => setEditing(null)}>
          <section
            className="people-modal people-role-editor"
            role="dialog"
            aria-modal="true"
            aria-label={`Editar função de ${editing.nome}`}
            data-role-editor="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="pilot-kicker">HIERARQUIA DA COMUNIDADE</p>
                <h2>{editing.nome}</h2>
                <p>Permissões extras nunca ultrapassam as do gestor atual.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} aria-label="Fechar">
                ×
              </button>
            </header>
            <form className="people-role-form" onSubmit={saveOfficial}>
              <label className="people-official-toggle">
                <input
                  type="checkbox"
                  checked={isOfficial}
                  onChange={(event) => setIsOfficial(event.target.checked)}
                />
                <span>
                  <strong>Esta pessoa é oficial da comunidade</strong>
                  <small>Ao desativar, volta a ser membro sem permissões extras.</small>
                </span>
              </label>
              {isOfficial && (
                <button type="button" className="people-remove-official" onClick={() => { setIsOfficial(false); setPermissionDraft([]); }}>
                  Remover título e permissões extras
                </button>
              )}
              {isOfficial ? <>
              <div className="people-role-grid">
                <label>
                  Papel no sistema
                  <select name="papel" defaultValue={editing.papel}>
                    <option value="MEMBRO">Membro</option>
                    <option value="LIDER">Líder</option>
                    <option value="PASTOR">Pastoral</option>
                    <option value="ADMIN_COMUNIDADE">Administrador</option>
                  </select>
                </label>
                <label>
                  Título oficial
                  <select
                    name="titulo"
                    value={officialTitle}
                    onChange={(event) => setOfficialTitle(event.target.value)}
                  >
                    {TITLE_CATEGORIES.map((category) => (
                      <optgroup key={category.label} label={category.label}>
                        {category.titles.map((title) => <option key={title} value={title}>{title}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>
              <section className="people-activity-model" aria-labelledby="activity-model-title">
                <header><h3 id="activity-model-title">Modelo de atuação</h3><p>Comece com um conjunto de permissões e ajuste abaixo.</p></header>
                <details>
                  <summary><span><small>Modelo selecionado</small><strong>{ACTIVITY_MODELS.find(model => model.title === presetTitle)?.label || presetTitle}</strong></span><span className="people-model-change">Trocar <span aria-hidden="true">⌄</span></span></summary>
                  <div className="people-model-options" role="group" aria-label="Modelos de atuação">
                    {ACTIVITY_MODELS.map(model => <button type="button" key={model.title} aria-pressed={presetTitle === model.title} onClick={(event) => { setPresetTitle(model.title); setModelApplied(false); const chooser = event.currentTarget.closest("details"); if (chooser) { chooser.open = false; chooser.querySelector("summary")?.focus(); } }}><strong>{model.label}</strong><small>{HIERARCHY_MODEL_COPY[model.title] || "Consulta agenda, ministérios e escalas."}</small></button>)}
                  </div>
                </details>
                <p>{HIERARCHY_MODEL_COPY[presetTitle] || "Consulta agenda, ministérios e escalas."}</p>
                <footer><small>Altera apenas as permissões abaixo. O título e o papel são mantidos.</small><button type="button" onClick={() => applyHierarchyModel(presetTitle)}>Aplicar modelo</button></footer>
                {modelApplied && <p className="people-model-feedback" role="status">Modelo aplicado ao formulário. Revise as permissões e salve para confirmar.</p>}
              </section>
              <fieldset>
                <legend>Permissões concedidas</legend>
                <p className="people-permission-intro">A função no sistema define o teto de acesso. Ajuste abaixo apenas o que esta pessoa realmente precisa para servir.</p>
                <div className="people-permission-groups">
                  {PERMISSION_GROUPS.map((group) => {
                    const permissions = group.permissions.filter((permission) => (data.permissionCatalog || []).includes(permission));
                    if (!permissions.length) return null;
                    return <section key={group.title} className="people-permission-group"><header><strong>{group.title}</strong><small>{group.detail}</small></header><div className="people-permission-grid">
                      {permissions.map((permission) => <label key={permission}>
                        <input type="checkbox" name="permissions" value={permission} checked={permissionDraft.includes(permission)} onChange={(event) => setPermissionDraft((current) => event.target.checked ? [...new Set([...current, permission])] : current.filter((item) => item !== permission))} />
                        <span>{PERMISSION_LABELS[permission] || permission}</span>
                      </label>)}
                    </div></section>;
                  })}
                </div>
              </fieldset>
              </> : (
                <p className="people-official-removal-note">Ao salvar, o título oficial e todas as permissões extras serão removidos. A pessoa voltará a ser membro.</p>
              )}
              <div className="people-form-actions">
                <button disabled={saving}>
                  {saving ? "Salvando…" : "Salvar função e permissões"}
                </button>
                <button type="button" onClick={() => setEditing(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {removing && (
        <div className="people-modal-backdrop" onMouseDown={() => { setRemoving(null); setRemoveConfirmation(""); setRemovalIssue(null); }}>
          <section
            className="people-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Remover ${removing.nome}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="pilot-kicker">AÇÃO PROTEGIDA E AUDITADA</p>
                <h2>Remover da comunidade</h2>
                <strong className="people-remove-name">{removing.nome}</strong>
                <p>O vínculo será removido, mas históricos e registros protegidos continuarão preservados.</p>
              </div>
              <button type="button" onClick={() => { setRemoving(null); setRemoveConfirmation(""); setRemovalIssue(null); }} aria-label="Fechar">×</button>
            </header>
            <form className="people-role-form" onSubmit={removePerson}>
              <label>
                Ação
                <select name="action" defaultValue="REMOVE_COMMUNITY">
                  <option value="REMOVE_COMMUNITY">Remover desta comunidade e liberar funções e escalas</option>
                  {data.canDeleteGlobal && <option value="DEACTIVATE_ACCOUNT">Desativar a conta inteira</option>}
                  {data.canDeleteGlobal && <option value="DELETE_ACCOUNT">Excluir conta e vínculos definitivamente</option>}
                </select>
                {data.canDeleteGlobal && <small>O proprietário pode encerrar o vínculo mesmo com funções ou escalas ativas. O VÍNKULO libera os compromissos, preserva o histórico e avisa os responsáveis.</small>}
              </label>
              {removalIssue && (
                <div className="people-removal-guidance" role="alert">
                  <strong>Não foi possível excluir definitivamente</strong>
                  <p>{removalIssue.message}</p>
                  <div>
                    {removalIssue.blockers.map((blocker) => (
                      <a href={blocker.href} key={`${blocker.label}-${blocker.href}`}>
                        <span>{blocker.label}</span>
                        <small>{blocker.detail}</small>
                        <b>Ir para o local →</b>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <label>
                <span>Confirmação</span>
                <small>Digite <strong>REMOVER</strong> para liberar a ação.</small>
                <input
                  name="confirmation"
                  required
                  pattern="REMOVER"
                  placeholder="Digite REMOVER"
                  title="Digite REMOVER para confirmar"
                  autoComplete="off"
                  value={removeConfirmation}
                  onChange={(event) => setRemoveConfirmation(event.target.value.toUpperCase())}
                />
              </label>
              <div className="people-modal-actions">
                <button type="button" className="secondary" onClick={() => { setRemoving(null); setRemoveConfirmation(""); setRemovalIssue(null); }}>
                  Cancelar
                </button>
                <button type="submit" className="danger" disabled={saving || removeConfirmation !== "REMOVER"}>
                  {saving ? "Processando…" : "Remover da comunidade"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function SelfProfile({
  me,
  saving,
  error,
  message,
  onSubmit,
  refreshError,
  onRetry,
  refreshing,
  links,
}: {
  me: Me | null;
  saving: boolean;
  error: string;
  message: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  refreshError: string;
  onRetry: () => void;
  refreshing: boolean;
  links: Array<{ label: string; href: string }>;
}) {
  if (!me) {
    return <div className="pilot-empty-state">Perfil indisponível.</div>;
  }
  return (
    <section className="people-workspace self-profile-workspace">
      <header className="workspace-heading people-heading">
        <div>
          <p className="pilot-kicker">MEU PERFIL</p>
          <h1>Olá, <VerifiedOwnerName name={me.nome} verified={Boolean(me.owner_verified)} official={Boolean(me.oficial)} officialTitle={me.oficial?me.titulo_oficial:null} /></h1>
          <p>
            Mantenha seus contatos atualizados e consulte seus vínculos nesta comunidade.
          </p>
        </div>
        <span className="scope-badge">{roleLabel(me.papel)}</span>
      </header>
      {links.length > 0 && <nav className="self-profile-links" aria-label="Minha participação"><strong>Minha participação</strong>{links.map(link => <a key={link.href} href={link.href}>{link.label}<span aria-hidden="true"> →</span></a>)}</nav>}
      {refreshError && <div className="directory-load-error" role="alert"><p>Não foi possível atualizar a consulta do perfil. Seu preenchimento continua abaixo. {refreshError}</p><button type="button" disabled={refreshing} onClick={onRetry}>Tentar novamente</button></div>}
      <div className="self-profile-card">
        <aside>
          <span className="self-profile-avatar" aria-hidden="true">{getInitials(me.nome)}</span>
          <VerifiedOwnerName name={me.nome} verified={Boolean(me.owner_verified)} official={Boolean(me.oficial)} officialTitle={me.oficial?me.titulo_oficial:null} />
          <small>{me.email}</small>
          <em>{me.oficial ? me.titulo_oficial || "Oficial" : "Membro"}</em>
        </aside>
        <form className="pilot-form" onSubmit={onSubmit}>
          <h2 className="self-profile-section-title">Meus dados de contato</h2>
          <label>
            Telefone
            <input
              name="telefone"
              type="tel"
              autoComplete="tel"
              maxLength={30}
              defaultValue={me.telefone || ""}
            />
          </label>
          <label>
            Data de nascimento
            <input
              name="dataNascimento"
              type="date"
              autoComplete="bday"
              max={new Date().toISOString().slice(0, 10)}
              defaultValue={me.data_nascimento || ""}
            />
          </label>
          <label className="composer-wide">
            Endereço
            <input
              name="endereco"
              autoComplete="street-address"
              maxLength={180}
              defaultValue={me.endereco || ""}
            />
          </label>
          <input type="hidden" name="ministerio" value={me.ministerio || ""} />
          <button disabled={saving}>
            {saving ? "Salvando…" : "Salvar meus dados"}
          </button>
          {error && <p className="self-profile-save-error" role="alert">{error} Seus dados preenchidos foram mantidos para tentar novamente.</p>}
          {message && <p className="self-profile-save-success" role="status">{message}</p>}
          <section className="self-profile-memberships" aria-labelledby="self-memberships-title"><h2 id="self-memberships-title">Meus vínculos na comunidade</h2><p>Estas informações são atualizadas pelos responsáveis de cada área.</p><dl><div><dt>Célula</dt><dd>{me.celula_vinculada || "Você ainda não está em uma célula."}</dd></div><div><dt>Ministérios</dt><dd>{me.ministerio || "Você ainda não está vinculado a um ministério."}</dd></div></dl></section>
        </form>
      </div>
    </section>
  );
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "US"
  );
}

function roleLabel(role: string) {
  return (
    {
      MEMBRO: "Membro",
      LIDER: "Líder",
      PASTOR: "Pastoral",
      ADMIN_COMUNIDADE: "Administrador",
      SUPERADMIN: "Superadministrador",
    }[role] || role
  );
}
