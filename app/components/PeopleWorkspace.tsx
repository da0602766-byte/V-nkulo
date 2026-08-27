"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import VerifiedOwnerName from "./VerifiedOwnerName";

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

type PeopleResponse = {
  me: Me | null;
  people: Person[];
  canViewPeople: boolean;
  canManage: boolean;
  canDeleteGlobal?: boolean;
  canRemoveCommunity?: boolean;
  canEditSelfHierarchy?: boolean;
  permissionCatalog?: string[];
  error?: string;
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
  "parking.report": "Registrar ocorrências",
  "feed.publish": "Publicar no feed",
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
  const [tab, setTab] = useState<"membros" | "oficiais">("membros");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Person | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pilot/pessoas", { cache: "no-store" });
      const result = (await response.json()) as PeopleResponse;
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar as pessoas.");
      }
      setData(result);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.people.filter((person) => {
      if (tab === "oficiais" && !person.oficial) return false;
      if (tab === "membros" && person.oficial) return false;
      return (
        !term ||
        person.nome.toLowerCase().includes(term) ||
        person.email.toLowerCase().includes(term) ||
        String(person.telefone || "").includes(term)
      );
    });
  }, [data.people, search, tab]);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedPeople = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
      await load(true);
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
          oficial: form.get("oficial") === "on",
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
      await load(true);
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
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir.");
      setRemoving(null);
      setMessage("A ação foi concluída e registrada na auditoria.");
      await load(true);
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

  const officials = data.people.filter((person) => Boolean(person.oficial));
  const members = data.people.length - officials.length;
  return (
    <section className="people-workspace">
      <header className="workspace-heading people-heading">
        <div>
          <p className="pilot-kicker">PESSOAS, MEMBROS E PERMISSÕES</p>
          <h1>Equipe de {communityName}</h1>
          <p>
            Membros ficam separados da lista de oficiais. Toda função e
            permissão é verificada no servidor e registrada na auditoria.
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
          <div><small>Pessoas vinculadas</small><strong>{data.people.length}</strong></div>
        </article>
        <article>
          <span>○</span>
          <div><small>Membros</small><strong>{members}</strong></div>
        </article>
        <article>
          <span>✦</span>
          <div><small>Oficiais</small><strong>{officials.length}</strong></div>
        </article>
        <article>
          <span>◇</span>
          <div>
            <small>Sem responsável</small>
            <strong>
              {officials.filter((person) => !person.titulo_oficial).length}
            </strong>
          </div>
        </article>
      </div>

      {(message || error) && (
        <p className={`operations-feedback ${error ? "error" : ""}`} role="status">
          {error || message}
        </p>
      )}

      <div className="people-toolbar">
        <div className="people-tabs" role="tablist" aria-label="Tipo de pessoa">
          <button
            type="button"
            className={tab === "membros" ? "active" : ""}
            onClick={() => { setTab("membros"); setPage(1); }}
          >
            Membros <span>{members}</span>
          </button>
          <button
            type="button"
            className={tab === "oficiais" ? "active" : ""}
            onClick={() => { setTab("oficiais"); setPage(1); }}
          >
            Oficiais <span>{officials.length}</span>
          </button>
        </div>
        <label>
          <span className="sr-only">Buscar pessoa</span>
          <input
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Buscar por nome, e-mail ou telefone"
          />
        </label>
      </div>

      <div className="people-list">
        {pagedPeople.map((person) => (
          <article key={person.membership_id} className="people-card">
            <span className="people-avatar">{getInitials(person.nome)}</span>
            <div className="people-card-main">
              <div>
                <VerifiedOwnerName name={person.nome} verified={Boolean(person.owner_verified)} />
                <small>{person.email}</small>
              </div>
              <div className="people-badges">
                <span>{roleLabel(person.papel)}</span>
                {person.oficial ? (
                  <em>{person.titulo_oficial || "Oficial"}</em>
                ) : (
                  <em className="member-badge">Membro</em>
                )}
              </div>
            </div>
            <div className="people-card-contact">
              <small>Contato</small>
              <span>{person.telefone || "Não informado"}</span>
            </div>
            <div className="people-card-actions">
              {data.canManage && (
                <button type="button" onClick={() => setEditing(person)}>
                  Editar função
                </button>
              )}
              {data.canRemoveCommunity && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => setRemoving(person)}
                >
                  Remover pessoa
                </button>
              )}
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

      {filtered.length > pageSize && (
        <nav className="people-pagination" aria-label="Paginação de pessoas">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            ← Anterior
          </button>
          <span>Página {currentPage} de {totalPages} · {filtered.length} pessoas</span>
          <button type="button" disabled={currentPage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
            Próxima →
          </button>
        </nav>
      )}

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
                  name="oficial"
                  type="checkbox"
                  defaultChecked={Boolean(editing.oficial)}
                />
                <span>
                  <strong>Esta pessoa é oficial da comunidade</strong>
                  <small>Ao desativar, volta a ser membro sem permissões extras.</small>
                </span>
              </label>
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
                    defaultValue={editing.titulo_oficial || "LÍDER"}
                  >
                    {TITLES.map((title) => (
                      <option key={title}>{title}</option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset>
                <legend>Permissões adicionais</legend>
                <div className="people-permission-grid">
                  {(data.permissionCatalog || []).map((permission) => (
                    <label key={permission}>
                      <input
                        type="checkbox"
                        name="permissions"
                        value={permission}
                        defaultChecked={editing.permissoes
                          .split(",")
                          .includes(permission)}
                      />
                      <span>{PERMISSION_LABELS[permission] || permission}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
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
        <div className="people-modal-backdrop" onMouseDown={() => setRemoving(null)}>
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
                <h2>Remover {removing.nome}</h2>
                <p>Históricos e registros protegidos nunca são apagados silenciosamente.</p>
              </div>
              <button type="button" onClick={() => setRemoving(null)} aria-label="Fechar">×</button>
            </header>
            <form className="people-role-form" onSubmit={removePerson}>
              <label>
                Ação
                <select name="action" defaultValue="REMOVE_COMMUNITY">
                  <option value="REMOVE_COMMUNITY">Remover somente desta comunidade</option>
                  {data.canDeleteGlobal && <option value="DEACTIVATE_ACCOUNT">Desativar a conta inteira</option>}
                  {data.canDeleteGlobal && <option value="DELETE_ACCOUNT">Excluir definitivamente se não houver histórico</option>}
                </select>
              </label>
              <label>
                Confirmação
                <input
                  required
                  pattern="REMOVER"
                  placeholder="Digite REMOVER"
                  title="Digite REMOVER para confirmar"
                />
              </label>
              <div className="people-modal-actions">
                <button type="button" className="secondary" onClick={() => setRemoving(null)}>
                  Cancelar
                </button>
                <button type="submit" className="danger" disabled={saving}>
                  {saving ? "Processando…" : "Confirmar ação"}
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
            <p className={`operations-feedback ${error ? "error" : ""}`} role="status">
              {error || message}
            </p>
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
