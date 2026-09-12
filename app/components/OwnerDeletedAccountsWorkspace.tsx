"use client";

// Contas excluídas: só o registro administrativo mínimo é preservado —
// referência técnica, comunidade, data, motivo e janela de restauração.
// Nenhum dado pessoal (nome, e-mail, conteúdo) é mantido ou exibido.

import { useCallback, useEffect, useState } from "react";
import "./OwnerOperationsWorkspaces.css";

type DeletedAccount = {
  id: number;
  referenciaTecnica: string;
  comunidade: string;
  perfil: string;
  motivo: string;
  origem: string;
  excluidoEm: string;
  restauravelAte: string | null;
  restauradoEm: string | null;
  purgadoEm: string | null;
  restauravel: boolean;
};

type Payload = {
  total: number;
  restauraveis: number;
  purgadas: number;
  restauradas: number;
  accounts: DeletedAccount[];
};

export default function OwnerDeletedAccountsWorkspace() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/proprietario/contas-excluidas", {
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
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const act = useCallback(
    async (account: DeletedAccount, action: "RESTORE" | "PURGE") => {
      if (
        action === "PURGE" &&
        !window.confirm(
          `Purgar definitivamente o registro ${account.referenciaTecnica}? A conta deixa de ser restaurável.`,
        )
      )
        return;
      const motivo = (window.prompt("Motivo administrativo (opcional):") || "").trim();
      setBusy(account.id);
      setError("");
      try {
        const response = await fetch("/api/proprietario/contas-excluidas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: account.id, action, motivo }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
        await load();
      } catch (actionError) {
        setError((actionError as Error).message);
      } finally {
        setBusy(0);
      }
    },
    [load],
  );

  const accounts = data?.accounts || [];

  return (
    <section className="owner-ops owner-directory-panel" aria-label="Contas excluídas">
      <header className="owner-ops-head owner-directory-header">
        <div>
          <p className="pilot-kicker">CONTAS EXCLUÍDAS</p>
          <h1>Registro administrativo e janela de restauração</h1>
          <p>
            Ao excluir uma conta, preservamos apenas o mínimo administrativo: uma
            referência técnica, a comunidade, a data, o motivo e o prazo de
            restauração. Nome, e-mail e conteúdo não são mantidos aqui.
          </p>
        </div>
        <div className="owner-ops-actions">
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {error && (
        <p className="operations-feedback error" role="alert">
          {error}
        </p>
      )}

      {data && (
        <div className="owner-ops-cards">
          <article>
            <span>REGISTROS</span>
            <strong>{data.total}</strong>
            <small>Contas excluídas registradas</small>
          </article>
          <article>
            <span>RESTAURÁVEIS</span>
            <strong>{data.restauraveis}</strong>
            <small>Ainda dentro da janela</small>
          </article>
          <article>
            <span>RESTAURADAS</span>
            <strong>{data.restauradas}</strong>
            <small>Reativadas pelo proprietário</small>
          </article>
          <article>
            <span>PURGADAS</span>
            <strong>{data.purgadas}</strong>
            <small>Exclusão definitiva do registro</small>
          </article>
        </div>
      )}

      {loading && !data ? (
        <div className="owner-empty" role="status">
          <span>◌</span>
          <strong>Carregando registros…</strong>
          <p>Buscando as contas excluídas.</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="owner-empty" role="status">
          <span>◌</span>
          <strong>Nenhuma conta excluída</strong>
          <p>Nada foi excluído até agora nesta plataforma.</p>
        </div>
      ) : (
        <div className="owner-ops-table-wrap">
          <table className="owner-ops-table">
            <thead>
              <tr>
                <th>Referência técnica</th>
                <th>Comunidade</th>
                <th>Excluída em</th>
                <th>Motivo</th>
                <th>Janela de restauração</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((item) => (
                <tr key={item.id}>
                  <td>
                    <code>{item.referenciaTecnica}</code>
                    {item.perfil ? (
                      <>
                        <br />
                        <small>Perfil: {item.perfil}</small>
                      </>
                    ) : null}
                  </td>
                  <td>{item.comunidade}</td>
                  <td>{formatDate(item.excluidoEm)}</td>
                  <td>
                    {item.motivo || "—"}
                    {item.origem ? (
                      <>
                        <br />
                        <small>Origem: {item.origem}</small>
                      </>
                    ) : null}
                  </td>
                  <td>{windowLabel(item)}</td>
                  <td>
                    <div className="owner-ops-row-actions">
                      <button
                        type="button"
                        disabled={busy === item.id || !item.restauravel}
                        onClick={() => void act(item, "RESTORE")}
                      >
                        Restaurar
                      </button>
                      <button
                        type="button"
                        disabled={busy === item.id || Boolean(item.purgadoEm)}
                        onClick={() => void act(item, "PURGE")}
                      >
                        Purgar
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

function windowLabel(item: DeletedAccount) {
  if (item.purgadoEm) return `Purgada em ${formatDate(item.purgadoEm)}`;
  if (item.restauradoEm) return `Restaurada em ${formatDate(item.restauradoEm)}`;
  if (!item.restauravelAte) return "Sem janela de restauração";
  if (!item.restauravel) return `Janela encerrada em ${formatDate(item.restauravelAte)}`;
  const remaining = parseDate(item.restauravelAte).getTime() - Date.now();
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  return `Restaurável até ${formatDate(item.restauravelAte)} (${days > 0 ? `${days} d ` : ""}${hours} h)`;
}

function parseDate(value: string) {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

function formatDate(value: string) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
