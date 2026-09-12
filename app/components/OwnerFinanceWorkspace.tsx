"use client";

import { useCallback, useEffect, useState } from "react";
import "./OwnerBillingWorkspaces.css";

// Enquanto não houver gateway conectado, os pagamentos são registrados
// administrativamente pelo proprietário. Nenhum número é estimado: todos os
// totais vêm das cobranças efetivamente lançadas no banco.

type Charge = {
  id: number;
  assinaturaId: number;
  comunidadeId: number;
  comunidadeNome: string;
  planoNome: string;
  competencia: string;
  valorCentavos: number;
  descontoCentavos: number;
  liquidoCentavos: number;
  status: string;
  venceEm: string;
  pagoEm: string | null;
  metodo: string;
  provedor: string;
  referenciaExterna: string;
  observacoes: string;
};

type Subscription = {
  id: number;
  comunidadeId: number;
  comunidadeNome: string;
  planoNome: string;
  status: string;
  renovaEm: string | null;
  testeAte: string | null;
  carenciaAte: string | null;
  precoCentavos: number;
  periodicidade: string;
  renovacaoAutomatica: boolean;
};

type Payload = {
  summary: {
    receitaCentavos: number;
    pendenteCentavos: number;
    vencidoCentavos: number;
    cobrancas: number;
    cobrancasPagas: number;
    comunidadesInadimplentes: number;
    assinaturas: number;
    assinaturasAtivas: number;
    assinaturasEmTeste: number;
  };
  charges: Charge[];
  upcoming: Subscription[];
  communities: { id: number; nome: string }[];
  plans: { id: number; nome: string; precoCentavos: number; periodicidade: string; diasTeste: number }[];
  chargeStatus: string[];
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatCents(value: number) {
  return money.format((Number(value) || 0) / 100);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function statusTone(status: string) {
  if (status === "PAGA" || status === "ATIVA") return "good";
  if (status === "VENCIDA" || status === "INADIMPLENTE" || status === "SUSPENSA") return "bad";
  if (status === "PENDENTE" || status === "CARENCIA" || status === "TESTE") return "warn";
  return "neutral";
}

const EMPTY_FILTERS = { status: "", comunidade: "", de: "", ate: "" };

export default function OwnerFinanceWorkspace() {
  const [data, setData] = useState<Payload | null>(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (active: typeof EMPTY_FILTERS) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (active.status) params.set("status", active.status);
      if (active.comunidade) params.set("comunidade", active.comunidade);
      if (active.de) params.set("de", active.de);
      if (active.ate) params.set("ate", active.ate);
      const response = await fetch(`/api/proprietario/financeiro?${params.toString()}`, { cache: "no-store" });
      const result = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o financeiro.");
      setData(result);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(filters), 0);
    return () => window.clearTimeout(timer);
  }, [load, filters]);

  const act = useCallback(
    async (body: Record<string, unknown>, success: string) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/proprietario/financeiro", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
        setNotice(success);
        await load(filters);
      } catch (actError) {
        setError((actError as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [filters, load],
  );

  const summary = data?.summary;
  const charges = data?.charges || [];
  const upcoming = data?.upcoming || [];

  return (
    <section aria-label="Financeiro da plataforma">
      <header className="billing-header">
        <div>
          <p className="pilot-kicker">FINANCEIRO</p>
          <h1>Assinaturas e cobranças</h1>
          <p>
            Totais calculados a partir das cobranças efetivamente lançadas. Períodos
            sem lançamentos aparecem zerados.
          </p>
        </div>
        <button type="button" onClick={() => void load(filters)} disabled={loading || busy}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </header>

      <p className="billing-note">
        <span aria-hidden="true">ⓘ</span>
        <span>
          <strong>Registro administrativo.</strong> Ainda não há gateway de pagamento
          conectado: a confirmação de cada cobrança é lançada manualmente pelo
          proprietário e fica auditada. Quando houver integração, o provedor e a
          referência externa passarão a ser preenchidos automaticamente nos mesmos
          campos.
        </span>
      </p>

      {error && (
        <p className="operations-feedback error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="operations-feedback" role="status">
          {notice}
        </p>
      )}

      {summary && (
        <div className="billing-metrics">
          <article className="good">
            <span>RECEITA RECONHECIDA</span>
            <strong>{formatCents(summary.receitaCentavos)}</strong>
            <small>{summary.cobrancasPagas} cobrança(s) paga(s) no recorte</small>
          </article>
          <article>
            <span>A RECEBER</span>
            <strong>{formatCents(summary.pendenteCentavos)}</strong>
            <small>Cobranças pendentes dentro do prazo</small>
          </article>
          <article className="warn">
            <span>VENCIDO</span>
            <strong>{formatCents(summary.vencidoCentavos)}</strong>
            <small>Cobranças vencidas ou em atraso</small>
          </article>
          <article className="warn">
            <span>COMUNIDADES INADIMPLENTES</span>
            <strong>{summary.comunidadesInadimplentes}</strong>
            <small>
              {summary.assinaturasAtivas} assinatura(s) vigente(s) · {summary.assinaturasEmTeste} em teste
            </small>
          </article>
        </div>
      )}

      <div className="billing-filters">
        <label>
          <span>STATUS DA COBRANÇA</span>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">Todos</option>
            {(data?.chargeStatus || ["PENDENTE", "PAGA", "VENCIDA", "CANCELADA", "ESTORNADA"]).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>COMUNIDADE</span>
          <select
            value={filters.comunidade}
            onChange={(event) => setFilters({ ...filters, comunidade: event.target.value })}
          >
            <option value="">Todas</option>
            {(data?.communities || []).map((community) => (
              <option key={community.id} value={community.id}>
                {community.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>COMPETÊNCIA INICIAL</span>
          <input type="month" value={filters.de} onChange={(event) => setFilters({ ...filters, de: event.target.value })} />
        </label>
        <label>
          <span>COMPETÊNCIA FINAL</span>
          <input type="month" value={filters.ate} onChange={(event) => setFilters({ ...filters, ate: event.target.value })} />
        </label>
      </div>

      <section className="owner-directory-panel billing-panel" aria-label="Cobranças">
        <header>
          <div>
            <h2>Cobranças</h2>
            <p>{charges.length} lançamento(s) no recorte atual.</p>
          </div>
          {(filters.status || filters.comunidade || filters.de || filters.ate) && (
            <button
              type="button"
              className="billing-badge neutral"
              style={{ border: 0, cursor: "pointer" }}
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              LIMPAR FILTROS
            </button>
          )}
        </header>
        {loading ? (
          <div className="billing-loading" role="status">
            <span className="pilot-loader" />
            <p>Carregando lançamentos financeiros…</p>
          </div>
        ) : charges.length === 0 ? (
          <div className="owner-empty" role="status">
            <span>◌</span>
            <strong>Nenhuma cobrança neste recorte</strong>
            <p>
              Assim que uma assinatura gerar cobranças, elas aparecem aqui com valores
              reais. Nada é estimado.
            </p>
          </div>
        ) : (
          <div className="billing-table-scroll">
            <table className="billing-table">
              <thead>
                <tr>
                  <th scope="col">Comunidade</th>
                  <th scope="col">Competência</th>
                  <th scope="col" className="numeric">Valor</th>
                  <th scope="col">Vencimento</th>
                  <th scope="col">Status</th>
                  <th scope="col">Registro</th>
                  <th scope="col" className="actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((charge) => (
                  <tr key={charge.id}>
                    <td>
                      <strong>{charge.comunidadeNome}</strong>
                      <small>{charge.planoNome}</small>
                    </td>
                    <td>{charge.competencia}</td>
                    <td className="numeric">
                      <strong>{formatCents(charge.liquidoCentavos)}</strong>
                      {charge.descontoCentavos > 0 && <small>desc. {formatCents(charge.descontoCentavos)}</small>}
                    </td>
                    <td>
                      {formatDate(charge.venceEm)}
                      {charge.pagoEm && <small>pago em {formatDate(charge.pagoEm)}</small>}
                    </td>
                    <td>
                      <span className={`billing-badge ${statusTone(charge.status)}`}>{charge.status}</span>
                    </td>
                    <td>
                      {charge.provedor || charge.metodo || "Manual"}
                      {charge.referenciaExterna && <small>{charge.referenciaExterna}</small>}
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        disabled={busy || charge.status === "PAGA" || charge.status === "CANCELADA" || charge.status === "ESTORNADA"}
                        onClick={() => void act({ action: "MARK_PAID", cobrancaId: charge.id }, "Pagamento registrado.")}
                      >
                        Marcar paga
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy || charge.status === "CANCELADA" || charge.status === "ESTORNADA"}
                        onClick={() => {
                          const label = charge.status === "PAGA" ? "Estornar esta cobrança?" : "Cancelar esta cobrança?";
                          if (!window.confirm(label)) return;
                          void act(
                            { action: "CANCEL_CHARGE", cobrancaId: charge.id },
                            charge.status === "PAGA" ? "Cobrança estornada." : "Cobrança cancelada.",
                          );
                        }}
                      >
                        {charge.status === "PAGA" ? "Estornar" : "Cancelar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="owner-directory-panel billing-panel" aria-label="Assinaturas com renovação próxima">
        <header>
          <div>
            <h2>Renovações próximas</h2>
            <p>Assinaturas vigentes com renovação nos próximos 45 dias.</p>
          </div>
        </header>
        {loading ? null : upcoming.length === 0 ? (
          <div className="owner-empty" role="status">
            <span>◌</span>
            <strong>Nenhuma renovação no horizonte</strong>
            <p>Assinaturas com data de renovação próxima aparecem aqui.</p>
          </div>
        ) : (
          <div className="billing-cards">
            {upcoming.map((subscription) => (
              <article key={subscription.id}>
                <div>
                  <h3>{subscription.comunidadeNome}</h3>
                  <p>
                    {subscription.planoNome} · {formatCents(subscription.precoCentavos)} ·{" "}
                    renova em {formatDate(subscription.renovaEm)}
                    {subscription.testeAte ? ` · teste até ${formatDate(subscription.testeAte)}` : ""}
                    {subscription.carenciaAte ? ` · carência até ${formatDate(subscription.carenciaAte)}` : ""}
                    {subscription.renovacaoAutomatica ? "" : " · renovação automática desligada"}
                  </p>
                </div>
                <div className="billing-row-actions">
                  <span className={`billing-badge ${statusTone(subscription.status)}`}>{subscription.status}</span>{" "}
                  <button
                    type="button"
                    disabled={busy || subscription.status === "CARENCIA"}
                    onClick={() => void act({ action: "SET_GRACE", assinaturaId: subscription.id, dias: 15 }, "Carência de 15 dias registrada.")}
                  >
                    Carência 15d
                  </button>
                  <button
                    type="button"
                    disabled={busy || subscription.status === "ATIVA" || subscription.status === "TESTE"}
                    onClick={() => void act({ action: "REACTIVATE", assinaturaId: subscription.id }, "Assinatura reativada.")}
                  >
                    Reativar
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={busy || subscription.status === "CANCELADA"}
                    onClick={() => {
                      if (!window.confirm(`Cancelar a assinatura de ${subscription.comunidadeNome}?`)) return;
                      void act({ action: "CANCEL_SUBSCRIPTION", assinaturaId: subscription.id }, "Assinatura cancelada.");
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
