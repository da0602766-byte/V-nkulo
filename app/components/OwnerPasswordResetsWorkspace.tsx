"use client";

// Fila de aprovação de redefinição de senha. Toda decisão é validada e
// auditada no servidor (/api/proprietario/redefinicoes); aqui só há a
// apresentação do fluxo e o disparo das ações.

import { useCallback, useEffect, useState } from "react";
import "./OwnerOperationsWorkspaces.css";

const FLUXO = [
  ["SOLICITADO", "Solicitado"],
  ["EM_ANALISE", "Em análise"],
  ["APROVADO", "Aprovado"],
  ["RECUSADO", "Recusado"],
  ["ENVIADO", "Link enviado"],
  ["CONCLUIDO", "Concluído"],
  ["EXPIRADO", "Expirado"],
] as const;

const ROTULOS: Record<string, string> = Object.fromEntries(FLUXO);

type ResetRequest = {
  id: number;
  status: string;
  solicitante: { nome: string; email: string; perfil: string };
  comunidade: string;
  solicitadoEm: string;
  expiraEm: string | null;
  motivo: string;
  decisaoMotivo: string;
  tentativas: number;
  responsavel: string | null;
  linkGerado: boolean;
};

type Payload = {
  requests: ResetRequest[];
  resumo: Record<string, number>;
  linkMinutos: number;
};

export default function OwnerPasswordResetsWorkspace() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(0);
  const [link, setLink] = useState<{ id: number; url: string; expiraEm: string } | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const response = await fetch(`/api/proprietario/redefinicoes${query}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar.");
      setData(result);
      setError("");
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(filter), 0);
    return () => window.clearTimeout(timer);
  }, [load, filter]);

  const act = useCallback(
    async (request: ResetRequest, action: string) => {
      let motivo = "";
      if (action === "REJECT") {
        motivo = (window.prompt("Motivo da recusa (obrigatório):") || "").trim();
        if (!motivo) return;
      }
      setBusy(request.id);
      setError("");
      try {
        const response = await fetch("/api/proprietario/redefinicoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: request.id, action, motivo }),
        });
        const result = (await response.json()) as {
          error?: string;
          link?: string;
          expiraEm?: string;
        };
        if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
        if (action === "SEND_LINK" && result.link)
          setLink({
            id: request.id,
            url: `${window.location.origin}${result.link}`,
            expiraEm: result.expiraEm || "",
          });
        await load(filter);
      } catch (actionError) {
        setError((actionError as Error).message);
      } finally {
        setBusy(0);
      }
    },
    [filter, load],
  );

  const requests = data?.requests || [];

  return (
    <section className="owner-ops owner-directory-panel" aria-label="Redefinições de senha">
      <header className="owner-ops-head owner-directory-header">
        <div>
          <p className="pilot-kicker">REDEFINIÇÃO DE SENHA</p>
          <h1>Fila de aprovação</h1>
          <p>
            Cada pedido passa por análise antes de qualquer link ser gerado. O
            link é temporário e aparece uma única vez, no momento da geração.
          </p>
        </div>
        <div className="owner-ops-actions">
          <label htmlFor="reset-filter" className="owner-ops-note">
            Status
          </label>
          <select
            id="reset-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">Todos</option>
            {FLUXO.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void load(filter)} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      <div className="owner-ops-flow" aria-label="Etapas do fluxo">
        {FLUXO.map(([value, label], index) => (
          <span key={value}>
            <b>{label}</b>
            {data?.resumo ? ` · ${data.resumo[value] ?? 0}` : ""}
            {index < FLUXO.length - 1 ? " →" : ""}
          </span>
        ))}
      </div>

      {error && (
        <p className="operations-feedback error" role="alert">
          {error}
        </p>
      )}

      {link && (
        <div className="owner-ops-link" role="status">
          <strong>Link temporário gerado para a solicitação #{link.id}</strong>
          <code>{link.url}</code>
          <span>
            Copie agora: por segurança, ele não será exibido de novo. Expira em{" "}
            {link.expiraEm ? formatDate(link.expiraEm) : `${data?.linkMinutos ?? 30} minutos`}.
          </span>
          <button type="button" onClick={() => setLink(null)}>
            Já copiei, ocultar
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="owner-empty" role="status">
          <span>◌</span>
          <strong>Carregando solicitações…</strong>
          <p>Buscando a fila de redefinição de senha.</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="owner-empty" role="status">
          <span>◌</span>
          <strong>Nenhuma solicitação neste filtro</strong>
          <p>Quando alguém pedir redefinição de senha, o pedido aparece aqui.</p>
        </div>
      ) : (
        <div className="owner-ops-table-wrap">
          <table className="owner-ops-table">
            <thead>
              <tr>
                <th>Solicitante</th>
                <th>Comunidade</th>
                <th>Solicitado em</th>
                <th>Status</th>
                <th>Prazo</th>
                <th>Tentativas</th>
                <th>Responsável</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.solicitante.nome}</strong>
                    <br />
                    <small>{item.solicitante.email}</small>
                    {item.motivo ? (
                      <>
                        <br />
                        <small>Motivo: {item.motivo}</small>
                      </>
                    ) : null}
                  </td>
                  <td>{item.comunidade}</td>
                  <td>{formatDate(item.solicitadoEm)}</td>
                  <td>
                    <span className={`owner-ops-badge ${item.status.toLowerCase()}`}>
                      {ROTULOS[item.status] || item.status}
                    </span>
                    {item.decisaoMotivo ? (
                      <>
                        <br />
                        <small>{item.decisaoMotivo}</small>
                      </>
                    ) : null}
                  </td>
                  <td>{item.expiraEm ? formatDate(item.expiraEm) : "—"}</td>
                  <td>{item.tentativas}</td>
                  <td>{item.responsavel || "—"}</td>
                  <td>
                    <div className="owner-ops-row-actions">
                      <button
                        type="button"
                        disabled={busy === item.id || item.status !== "SOLICITADO"}
                        onClick={() => void act(item, "ANALYZE")}
                      >
                        Analisar
                      </button>
                      <button
                        type="button"
                        disabled={
                          busy === item.id ||
                          (item.status !== "SOLICITADO" && item.status !== "EM_ANALISE")
                        }
                        onClick={() => void act(item, "APPROVE")}
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={
                          busy === item.id ||
                          item.status === "RECUSADO" ||
                          item.status === "CONCLUIDO"
                        }
                        onClick={() => void act(item, "REJECT")}
                      >
                        Recusar
                      </button>
                      <button
                        type="button"
                        disabled={
                          busy === item.id ||
                          (item.status !== "APROVADO" && item.status !== "ENVIADO")
                        }
                        onClick={() => void act(item, "SEND_LINK")}
                      >
                        Gerar link
                      </button>
                      <button
                        type="button"
                        disabled={
                          busy === item.id ||
                          item.status === "EXPIRADO" ||
                          item.status === "CONCLUIDO"
                        }
                        onClick={() => void act(item, "EXPIRE")}
                      >
                        Expirar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
