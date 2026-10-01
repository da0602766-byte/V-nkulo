"use client";

import TransientFeedback from "./TransientFeedback";

import { FormEvent, useCallback, useEffect, useState } from "react";
import VerifiedOwnerName from "./VerifiedOwnerName";
import PersonRecord from "./PersonRecord";
import SafeImage from "./SafeImage";

type Person = {
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
  "visitors.view": "Consultar visitantes",
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

const TITLES = [
  "LÍDER",
  "DIÁCONO",
  "DIACONISA",
  "PRESBÍTERO",
  "PRESBÍTERA",
  "EVANGELISTA",
  "MISSIONÁRIO",
  "MISSIONÁRIA",
  "PASTOR",
  "PASTORA",
  "SECRETÁRIO",
  "SECRETÁRIA",
  "COORDENADOR DE MINISTÉRIO",
  "COORDENADORA DE MINISTÉRIO",
  "SUPERVISOR DE CÉLULAS",
  "SUPERVISORA DE CÉLULAS",
  "GESTOR DE CUIDADO",
  "GESTORA DE CUIDADO",
];

const TITLE_CATEGORIES = [
  { label: "Liderança de células", titles: ["LÍDER", "SUPERVISOR DE CÉLULAS", "SUPERVISORA DE CÉLULAS"] },
  { label: "Cuidado e diaconia", titles: ["GESTOR DE CUIDADO", "GESTORA DE CUIDADO", "DIÁCONO", "DIACONISA"] },
  { label: "Ministérios", titles: ["COORDENADOR DE MINISTÉRIO", "COORDENADORA DE MINISTÉRIO", "EVANGELISTA", "MISSIONÁRIO", "MISSIONÁRIA"] },
  { label: "Pastoral", titles: ["PRESBÍTERO", "PRESBÍTERA", "PASTOR", "PASTORA"] },
  { label: "Administração", titles: ["SECRETÁRIO", "SECRETÁRIA"] },
] as const;

const HIERARCHY_PERMISSION_PRESETS: Record<string, string[]> = {
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

const PERMISSION_GROUPS = [
  { title: "Pessoas e cuidado", detail: "Visitantes, acompanhamentos e células.", permissions: ["visitors.view", "visitors.create", "visitors.edit", "visitor.categories.manage", "followups.view", "followups.manage", "cells.view", "requests.manage"] },
  { title: "Agenda e equipes", detail: "Eventos, ministérios e escalas.", permissions: ["events.view", "events.manage", "ministries.view", "schedules.view", "schedules.manage"] },
  { title: "Diaconia e apoio", detail: "Rotinas de serviço e relatórios.", permissions: ["diaconia.view", "diaconia.checklist.update", "diaconia.manage", "diaconia.report", "parking.view", "parking.reserve", "parking.report"] },
  { title: "Comunicação", detail: "Publicações no mural da comunidade.", permissions: ["feed.publish"] },
];

export default function PeopleWorkspace({
  communityName,
  mode = "manage",
}: {
  communityName: string;
  mode?: "self" | "manage";
}) {
  const [data, setData] = useState<PeopleResponse>({
    me: null,
    people: [],
    canViewPeople: false,
    canManage: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"todos" | "membros" | "oficiais">("todos");
  const [record, setRecord] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<string[]>([]);
  const [presetTitle, setPresetTitle] = useState("LÍDER");
  const [officialTitle, setOfficialTitle] = useState("LÍDER");
  const [isOfficial, setIsOfficial] = useState(false);
  const [removing, setRemoving] = useState<Person | null>(null);
  const [removeConfirmation, setRemoveConfirmation] = useState("");
  const [removalIssue, setRemovalIssue] = useState<{ message: string; blockers: RemovalBlocker[] } | null>(null);

  // `cursor` vazio recomeça a lista (troca de aba, nova busca, recarga depois de
  // uma alteração); com cursor, o lote novo é anexado ao que já está na tela.
  const load = useCallback(
    async (options: { quiet?: boolean; cursor?: string | null } = {}) => {
      const { quiet = false, cursor = null } = options;
      if (cursor) setLoadingMore(true);
      else if (!quiet) setLoading(true);
      setError("");
      try {
        const address = new URL("/api/pilot/pessoas", window.location.origin);
        address.searchParams.set("aba", tab);
        const term = search.trim();
        if (term) address.searchParams.set("busca", term);
        if (cursor) address.searchParams.set("cursor", cursor);
        const response = await fetch(address, { cache: "no-store" });
        const result = (await response.json()) as PeopleResponse;
        if (!response.ok) {
          throw new Error(result.error || "Não foi possível carregar as pessoas.");
        }
        setData((current) =>
          cursor
            ? { ...result, people: [...current.people, ...result.people] }
            : result,
        );
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoadingMore(false);
        if (!quiet) setLoading(false);
      }
    },
    [search, tab],
  );

  // A busca agora roda no banco, então cada tecla viraria uma consulta; o
  // intervalo abaixo espera a digitação parar antes de recomeçar a lista.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  // A aba e a busca são resolvidas no servidor, então o que chega já é o
  // resultado filtrado: filtrar de novo aqui esconderia gente do lote seguinte.
  const filtered = data.people;
  const pagedPeople = filtered;

  function applyHierarchyModel(title: string) {
    setPresetTitle(title);
    setOfficialTitle(title);
    setPermissionDraft((HIERARCHY_PERMISSION_PRESETS[title] || ["events.view", "ministries.view", "schedules.view"])
      .filter((permission) => (data.permissionCatalog || []).includes(permission)));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  if (loading) {
    return (
      <section className="people-workspace">
        <div className="people-loading" role="status">
          Carregando pessoas da comunidade…
        </div>
      </section>
    );
  }

  if (mode === "self") {
    return (
      <SelfProfile
        me={data.me}
        saving={saving}
        error={error}
        message={message}
        onSubmit={saveProfile}
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
          <h1>Pessoas</h1>
          <p>
            Consulte os vínculos, a disponibilidade e a participação de cada pessoa.
          </p>
        </div>
        <span className="scope-badge">Escopo: comunidade ativa</span>
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

      <div className="people-metrics">
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
      </div>

      {(message || error) && (
        <TransientFeedback className={`operations-feedback ${error ? "error" : ""}`} role="status">
          {error || message}
        </TransientFeedback>
      )}

      <div className="people-toolbar">
        <div className="people-tabs" aria-label="Tipo de pessoa">
          <button type="button" className={tab === "todos" ? "active" : ""} aria-pressed={tab === "todos"} onClick={() => setTab("todos")}>Todas <span>{members + totals.oficiais}</span></button>
          <button
            type="button"
            className={tab === "membros" ? "active" : ""}
            aria-pressed={tab === "membros"}
            onClick={() => setTab("membros")}
          >
            Membros <span>{members}</span>
          </button>
          <button
            type="button"
            className={tab === "oficiais" ? "active" : ""}
            aria-pressed={tab === "oficiais"}
            onClick={() => setTab("oficiais")}
          >
            Oficiais <span>{totals.oficiais}</span>
          </button>
        </div>
        <label>
          <span className="sr-only">Buscar pessoa</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone"
          />
        </label>
      </div>

      <div className="people-list people-directory-list">
        <div className="people-directory-columns" aria-hidden="true"><span>Pessoa / função</span><span>Ministérios</span><span>Contato</span><span>Próximas escalas</span><span>Ficha</span></div>
        {pagedPeople.map((person) => (
          <article key={person.membership_id} className="people-card people-directory-row">
            <div className="people-card-main">
              <button type="button" className="people-person-button" onClick={() => setRecord(person)} aria-label={`Abrir ficha de ${person.nome}`}>
                <span className="people-avatar">{person.foto_perfil ? <SafeImage src={person.foto_perfil} alt="" fallbackName={person.nome} fallbackKind="avatar" /> : getInitials(person.nome)}</span>
                <span><VerifiedOwnerName name={person.nome} verified={Boolean(person.owner_verified)} /><small>{person.oficial ? person.titulo_oficial || "Oficial" : roleLabel(person.papel)}</small></span>
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
              {(data.canManage || data.canRemoveCommunity) && <details className="people-row-menu"><summary aria-label={`Mais ações para ${person.nome}`}>⋯</summary><div>
              {data.canManage && (
                <button type="button" onClick={() => { const title = person.titulo_oficial || "LÍDER"; setEditing(person); setPermissionDraft(person.permissoes.split(",").filter(Boolean)); setPresetTitle(title); setOfficialTitle(title); setIsOfficial(Boolean(person.oficial)); }}>
                  Editar função
                </button>
              )}
              {data.canRemoveCommunity && (
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
            <p>A busca considera somente a comunidade ativa.</p>
          </div>
        )}
      </div>

      {(data.nextCursor || filtered.length > 0) && (
        <nav className="people-pagination" aria-label="Paginação de pessoas">
          <span>
            {filtered.length} {filtered.length === 1 ? "pessoa carregada" : "pessoas carregadas"}
            {" · "}
            {tab === "todos" ? members + totals.oficiais : tab === "oficiais" ? totals.oficiais : totals.membros} nesta aba
          </span>
          {data.nextCursor && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void load({ cursor: data.nextCursor, quiet: true })}
            >
              {loadingMore ? "Carregando…" : "Carregar mais"}
            </button>
          )}
        </nav>
      )}

      {record && <PersonRecord membershipId={record.membership_id} name={record.nome} permissionLabels={PERMISSION_LABELS} onClose={() => setRecord(null)} />}
      {editing && (
        <div className="people-modal-backdrop" onMouseDown={() => setEditing(null)}>
          <section
            className="people-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Editar função de ${editing.nome}`}
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
                    onChange={(event) => { setOfficialTitle(event.target.value); setPresetTitle(event.target.value); }}
                  >
                    {TITLE_CATEGORIES.map((category) => (
                      <optgroup key={category.label} label={category.label}>
                        {category.titles.map((title) => <option key={title} value={title}>{title}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>
              <section className="people-hierarchy-builder" aria-label="Modelo de permissões por hierarquia">
                <div><strong>Modelo de atuação</strong><small>Escolha uma hierarquia pronta; ela só preenche permissões que você já pode conceder.</small></div>
                <select value={presetTitle} onChange={(event) => setPresetTitle(event.target.value)} aria-label="Hierarquia usada como modelo">
                  {TITLE_CATEGORIES.map((category) => <optgroup key={category.label} label={category.label}>{category.titles.map((title) => <option key={title} value={title}>{title}</option>)}</optgroup>)}
                </select>
                <button type="button" onClick={() => applyHierarchyModel(presetTitle)}>Aplicar modelo</button>
                <p>{HIERARCHY_MODEL_COPY[presetTitle] || "Base inicial para organizar a atuação desta pessoa."}</p>
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
                  {data.canDeleteGlobal && <option value="DELETE_ACCOUNT">Excluir definitivamente se não houver histórico</option>}
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
}: {
  me: Me | null;
  saving: boolean;
  error: string;
  message: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!me) {
    return <div className="pilot-empty-state">Perfil indisponível.</div>;
  }
  return (
    <section className="people-workspace self-profile-workspace">
      <header className="workspace-heading people-heading">
        <div>
          <p className="pilot-kicker">MEU PERFIL</p>
          <h1>Olá, <VerifiedOwnerName name={me.nome} verified={Boolean(me.owner_verified)} /></h1>
          <p>
            Você pode atualizar apenas seus próprios dados. Funções e
            permissões são administradas pela comunidade.
          </p>
        </div>
        <span className="scope-badge">{roleLabel(me.papel)}</span>
      </header>
      <div className="self-profile-card">
        <aside>
          <span className="self-profile-avatar" aria-hidden="true">{getInitials(me.nome)}</span>
          <VerifiedOwnerName name={me.nome} verified={Boolean(me.owner_verified)} />
          <small>{me.email}</small>
          <em>{me.oficial ? me.titulo_oficial || "Oficial" : "Membro"}</em>
        </aside>
        <form className="pilot-form" onSubmit={onSubmit}>
          <label>
            Telefone
            <input
              name="telefone"
              type="tel"
              maxLength={30}
              defaultValue={me.telefone || ""}
            />
          </label>
          <label>
            Data de nascimento
            <input
              name="dataNascimento"
              type="date"
              defaultValue={me.data_nascimento || ""}
            />
          </label>
          <label className="composer-wide">
            Endereço
            <input
              name="endereco"
              maxLength={180}
              defaultValue={me.endereco || ""}
            />
          </label>
          <label>
            Célula
            <span className="self-profile-readonly">
              {me.celula_vinculada || "Você ainda não está em uma célula."}
            </span>
            <small>O vínculo é definido pelos responsáveis da célula.</small>
          </label>
          <label>
            Ministério
            <span className="self-profile-readonly">
              {me.ministerio || "Você ainda não está vinculado a um ministério."}
            </span>
            <input type="hidden" name="ministerio" value={me.ministerio || ""} />
            <small>Preenchido automaticamente conforme seus vínculos ativos.</small>
          </label>
          <button disabled={saving}>
            {saving ? "Salvando…" : "Salvar meus dados"}
          </button>
          {(message || error) && (
            <TransientFeedback className={`operations-feedback ${error ? "error" : ""}`} role="status">
              {error || message}
            </TransientFeedback>
          )}
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
