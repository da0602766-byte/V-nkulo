"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type LinkItem = {
  id: number;
  path: string;
  title: string;
  opensAt: string;
  closesAt: string;
  state: "AGUARDANDO" | "ABERTO" | "ENCERRADO" | "CANCELADO";
  originCommunityName: string;
  totalSubmissions: number;
  autoDelete: boolean;
};
type Submission = {
  id: number;
  linkId: number;
  fullName: string;
  email: string;
  cpf: string;
  cep: string;
  birthDate: string;
  anointing: string;
  photoUrl: string;
  ministryData: Record<string, unknown>;
  status: string;
  submittedAt: string;
  communityName: string;
  ministryName: string;
};

export default function MemberRegistrationLinkManager() {
  const defaults = defaultWindow();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<number | "create" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [createdPath, setCreatedPath] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pilot/cadastros-membros", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os links.");
      setLinks(result.links || []);
      setSubmissions(result.submissions || []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setWorking("create");
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/pilot/cadastros-membros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          opensAt: localToIso(data.get("opensAt")),
          closesAt: localToIso(data.get("closesAt")),
          autoDelete: data.get("autoDelete") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível criar o link.");
      setCreatedPath(String(result.path || ""));
      setFeedback("Link temporário criado. Revise o período e copie quando estiver pronto.");
      form.reset();
      await load();
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function saveLink(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await updateLink({
      id,
      title: data.get("title"),
      opensAt: localToIso(data.get("opensAt")),
      closesAt: localToIso(data.get("closesAt")),
      autoDelete: data.get("autoDelete") === "on",
    });
  }
  async function updateLink(body: Record<string, unknown>) {
    const id = Number(body.id || 0);
    setWorking(id);
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/pilot/cadastros-membros", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar o link.");
      setFeedback(body.action === "CANCEL" ? "Link cancelado." : "Período e título atualizados.");
      await load();
    } catch (updateError) {
      setError((updateError as Error).message);
    } finally {
      setWorking(null);
    }
  }
  async function deleteLink(link: LinkItem) {
    const submissionsWarning = link.totalSubmissions
      ? ` Os ${link.totalSubmissions} cadastro(s) recebido(s) por ele também serão excluídos.`
      : "";
    if (!window.confirm(`Excluir definitivamente o link “${link.title}”?${submissionsWarning} Esta ação não pode ser desfeita.`)) return;
    setWorking(link.id);
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/pilot/cadastros-membros", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: link.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir o link.");
      setFeedback("Link excluído definitivamente.");
      if (createdPath === link.path) setCreatedPath("");
      await load();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setWorking(null);
    }
  }
  async function copyPath(path: string) {
    const url = new URL(path, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setFeedback("Link copiado. Ele respeitará automaticamente a abertura e o fechamento.");
  }

  return (
    <section className="member-link-manager" aria-labelledby="member-link-manager-title">
      <header><div><p className="pilot-kicker">CADASTRO DE MEMBROS</p><h2 id="member-link-manager-title">Convites para novos membros</h2><p>Crie um convite seguro. A pessoa preencherá os dados, criará sua conta e entrará na comunidade escolhida.</p></div><span>{loading ? "Carregando…" : `${links.length} links`}</span></header>
      <form className="member-link-create" onSubmit={createLink}>
        <label>Título do formulário<input name="title" required minLength={3} maxLength={100} defaultValue="Cadastro de novos membros" /></label>
        <label>Abre em<input name="opensAt" type="datetime-local" required defaultValue={defaults.opensAt} /></label>
        <label>Fecha em<input name="closesAt" type="datetime-local" required defaultValue={defaults.closesAt} /></label>
        <label className="member-link-auto-delete"><input name="autoDelete" type="checkbox" /><span><strong>Limpeza automática</strong><small>Excluir o link quando for cancelado ou expirar</small></span></label>
        <button disabled={working === "create"}>{working === "create" ? "Criando…" : "Criar link temporário"}</button>
      </form>
      {(feedback || error) && <p className={`operations-feedback ${error ? "error" : ""}`} role="status">{error || feedback}</p>}
      {createdPath && <div className="member-link-created"><label>Novo link<input readOnly value={typeof window === "undefined" ? createdPath : new URL(createdPath, window.location.origin).toString()} onFocus={(event) => event.currentTarget.select()} /></label><button type="button" onClick={() => void copyPath(createdPath)}>Copiar link</button></div>}
      <div className="member-link-list">
        {links.map((link) => <form key={link.id} onSubmit={(event) => void saveLink(event, link.id)}>
          <header><span className={`member-link-status state-${link.state.toLowerCase()}`}>{statusLabel(link.state)}</span><small>{link.totalSubmissions} cadastro(s)</small></header>
          <label>Título<input name="title" required defaultValue={link.title} maxLength={100} disabled={link.state === "CANCELADO"} /></label>
          <div><label>Abertura<input name="opensAt" type="datetime-local" required defaultValue={toLocalInput(link.opensAt)} disabled={link.state === "CANCELADO"} /></label><label>Fechamento<input name="closesAt" type="datetime-local" required defaultValue={toLocalInput(link.closesAt)} disabled={link.state === "CANCELADO"} /></label></div>
          <p>{link.originCommunityName} · {formatDate(link.opensAt)} até {formatDate(link.closesAt)}</p>
          <label className="member-link-auto-delete"><input name="autoDelete" type="checkbox" defaultChecked={link.autoDelete} disabled={link.state === "CANCELADO"} /><span><strong>Limpeza automática</strong><small>Excluir ao cancelar ou expirar</small></span></label>
          <footer>
            {(link.state === "AGUARDANDO" || link.state === "ABERTO") && <button type="button" onClick={() => void copyPath(link.path)}>Copiar</button>}
            {link.state !== "CANCELADO" && <button disabled={working === link.id}>Salvar alterações</button>}
            {(link.state === "AGUARDANDO" || link.state === "ABERTO") && <button type="button" className="danger" disabled={working === link.id} onClick={() => void updateLink({ id: link.id, action: "CANCEL" })}>Cancelar link</button>}
            {(link.state === "ENCERRADO" || link.state === "CANCELADO") && <button type="button" className="danger" disabled={working === link.id} onClick={() => void deleteLink(link)}>{working === link.id ? "Excluindo…" : "Excluir link"}</button>}
          </footer>
        </form>)}
        {!loading && !links.length && <div className="pilot-empty-state"><strong>Nenhum link criado</strong><p>Defina abertura e fechamento para começar.</p></div>}
      </div>
      <section className="member-submission-panel"><header><div><p className="pilot-kicker">CADASTROS RECEBIDOS</p><h3>Informações para revisão</h3></div><span>{submissions.length}</span></header><div>{submissions.map((item) => <details key={item.id}><summary>{item.photoUrl ? <img loading="lazy" src={item.photoUrl} alt="" /> : <span>{item.fullName.slice(0, 1)}</span>}<div><strong>{item.fullName}</strong><small>{item.communityName} · {item.ministryName}</small></div><time>{formatDate(item.submittedAt)}</time><i aria-hidden="true">⌄</i></summary><dl><div><dt>E-mail</dt><dd>{item.email}</dd></div><div><dt>CPF</dt><dd>{item.cpf || "Não informado"}</dd></div><div><dt>CEP</dt><dd>{item.cep}</dd></div><div><dt>Nascimento</dt><dd>{formatSimpleDate(item.birthDate)}</dd></div><div><dt>Unção</dt><dd>{labelChoice(item.anointing)}</dd></div><div><dt>Dias disponíveis</dt><dd>{Array.isArray(item.ministryData.availableDays) && item.ministryData.availableDays.length ? item.ministryData.availableDays.join(", ") : "A combinar"}</dd></div><div><dt>Período</dt><dd>{labelChoice(String(item.ministryData.preferredPeriod || "FLEXIVEL"))}</dd></div><div><dt>Função</dt><dd>{String(item.ministryData.functionName || "A definir")}</dd></div></dl></details>)}{!submissions.length && <p>Nenhum cadastro recebido por estes links.</p>}</div></section>
    </section>
  );
}

function defaultWindow() { const start = new Date(Date.now() + 30 * 60_000); start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0); const end = new Date(start.getTime() + 7 * 86400_000); return { opensAt: toLocalInput(start.toISOString()), closesAt: toLocalInput(end.toISOString()) }; }
function localToIso(value: FormDataEntryValue | null) { const date = new Date(String(value || "")); return Number.isFinite(date.getTime()) ? date.toISOString() : ""; }
function toLocalInput(value: string) { const date = new Date(value); if (!Number.isFinite(date.getTime())) return ""; const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
function formatSimpleDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function statusLabel(value: LinkItem["state"]) { return ({ AGUARDANDO: "Programado", ABERTO: "Aberto", ENCERRADO: "Encerrado", CANCELADO: "Cancelado" } as const)[value]; }
function labelChoice(value: string) { return value.toLocaleLowerCase("pt-BR").split("_").map((part) => part ? part[0].toLocaleUpperCase("pt-BR") + part.slice(1) : "").join(" "); }
