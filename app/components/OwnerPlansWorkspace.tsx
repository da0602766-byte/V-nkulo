"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./OwnerBillingWorkspaces.css";

type Plan = {
  id: number;
  nome: string;
  slug: string;
  descricao: string;
  precoCentavos: number;
  periodicidade: string;
  limiteMembros: number;
  limiteArmazenamentoMb: number;
  modulos: string[];
  recursos: string[];
  diasTeste: number;
  duracaoMeses: number;
  descontoPercentual: number;
  comunidadeExclusivaId: number | null;
  comunidadeExclusivaNome: string | null;
  status: string;
  assinaturas: number;
  assinaturasAtivas: number;
};

type Coupon = {
  id: number;
  codigo: string;
  tipo: string;
  valor: number;
  planoId: number | null;
  planoNome: string | null;
  validoAte: string | null;
  usosMaximos: number;
  usos: number;
  ativo: boolean;
};

type Community = { id: number; nome: string; status: string };

type Payload = {
  plans: Plan[];
  communities: Community[];
  coupons: Coupon[];
  periodicidades: string[];
};

const PERIODICIDADE_LABEL: Record<string, string> = {
  MENSAL: "Mensal",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
  PERSONALIZADO: "Personalizado",
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatCents(value: number) {
  return money.format((Number(value) || 0) / 100);
}

function parseMoneyToCents(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function splitList(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const EMPTY_FORM = {
  id: 0,
  nome: "",
  descricao: "",
  preco: "",
  periodicidade: "MENSAL",
  limiteMembros: "0",
  limiteArmazenamentoMb: "0",
  modulos: "",
  recursos: "",
  diasTeste: "0",
  duracaoMeses: "0",
  descontoPercentual: "0",
  comunidadeExclusivaId: "",
};

type Form = typeof EMPTY_FORM;

const EMPTY_COUPON = {
  codigo: "",
  tipo: "PERCENTUAL",
  valor: "",
  planoId: "",
  validoAte: "",
  usosMaximos: "0",
};

export default function OwnerPlansWorkspace() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [coupon, setCoupon] = useState(EMPTY_COUPON);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/proprietario/planos", { cache: "no-store" });
      const result = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os planos.");
      setData(result);
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

  const send = useCallback(
    async (method: "POST" | "PATCH", body: Record<string, unknown>, success: string) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/proprietario/planos", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
        setNotice(success);
        await load();
        return true;
      } catch (sendError) {
        setError((sendError as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const removePlan = useCallback(
    async (plan: Plan) => {
      if (!window.confirm(`Excluir definitivamente o plano "${plan.nome}"?`)) return;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch(`/api/proprietario/planos?id=${plan.id}`, { method: "DELETE" });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível excluir o plano.");
        setNotice("Plano excluído.");
        await load();
      } catch (removeError) {
        setError((removeError as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const startEdit = useCallback((plan: Plan) => {
    setForm({
      id: plan.id,
      nome: plan.nome,
      descricao: plan.descricao,
      preco: (plan.precoCentavos / 100).toFixed(2).replace(".", ","),
      periodicidade: plan.periodicidade,
      limiteMembros: String(plan.limiteMembros),
      limiteArmazenamentoMb: String(plan.limiteArmazenamentoMb),
      modulos: plan.modulos.join(", "),
      recursos: plan.recursos.join("\n"),
      diasTeste: String(plan.diasTeste),
      duracaoMeses: String(plan.duracaoMeses),
      descontoPercentual: String(plan.descontoPercentual),
      comunidadeExclusivaId: plan.comunidadeExclusivaId ? String(plan.comunidadeExclusivaId) : "",
    });
    setFormOpen(true);
    setNotice("");
  }, []);

  const submitPlan = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (form.nome.trim().length < 2) {
        setError("Informe um nome com pelo menos 2 caracteres.");
        return;
      }
      const body = {
        id: form.id || undefined,
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        precoCentavos: parseMoneyToCents(form.preco),
        periodicidade: form.periodicidade,
        limiteMembros: Number(form.limiteMembros) || 0,
        limiteArmazenamentoMb: Number(form.limiteArmazenamentoMb) || 0,
        modulos: splitList(form.modulos),
        recursos: splitList(form.recursos),
        diasTeste: Number(form.diasTeste) || 0,
        duracaoMeses: Number(form.duracaoMeses) || 0,
        descontoPercentual: Number(form.descontoPercentual) || 0,
        comunidadeExclusivaId: form.comunidadeExclusivaId ? Number(form.comunidadeExclusivaId) : 0,
      };
      const done = form.id
        ? await send("PATCH", body, "Plano atualizado.")
        : await send("POST", body, "Plano criado.");
      if (done) {
        setForm(EMPTY_FORM);
        setFormOpen(false);
      }
    },
    [form, send],
  );

  const submitCoupon = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const done = await send(
        "PATCH",
        {
          action: "COUPON_CREATE",
          codigo: coupon.codigo,
          tipo: coupon.tipo,
          valor: coupon.tipo === "PERCENTUAL" ? Number(coupon.valor) || 0 : parseMoneyToCents(coupon.valor),
          planoId: coupon.planoId ? Number(coupon.planoId) : 0,
          validoAte: coupon.validoAte || null,
          usosMaximos: Number(coupon.usosMaximos) || 0,
        },
        "Cupom criado.",
      );
      if (done) setCoupon(EMPTY_COUPON);
    },
    [coupon, send],
  );

  const plans = useMemo(() => data?.plans || [], [data]);
  const totals = useMemo(
    () => ({
      ativos: plans.filter((plan) => plan.status === "ATIVO").length,
      arquivados: plans.filter((plan) => plan.status !== "ATIVO").length,
      assinaturas: plans.reduce((sum, plan) => sum + plan.assinaturasAtivas, 0),
    }),
    [plans],
  );

  return (
    <section aria-label="Planos da plataforma">
      <header className="billing-header">
        <div>
          <p className="pilot-kicker">CATÁLOGO DE PLANOS</p>
          <h1>Planos da plataforma</h1>
          <p>
            Configure preço, periodicidade, limites e módulos de cada plano. Planos
            com assinaturas vinculadas só podem ser arquivados.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </header>

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

      {!loading && data && (
        <div className="billing-metrics">
          <article>
            <span>PLANOS ATIVOS</span>
            <strong>{totals.ativos}</strong>
            <small>{totals.arquivados} arquivado(s)</small>
          </article>
          <article>
            <span>ASSINATURAS VIGENTES</span>
            <strong>{totals.assinaturas}</strong>
            <small>Comunidades vinculadas a algum plano</small>
          </article>
          <article>
            <span>CUPONS</span>
            <strong>{data.coupons.filter((item) => item.ativo).length}</strong>
            <small>{data.coupons.length} cupom(ns) cadastrados</small>
          </article>
        </div>
      )}

      <details
        className="billing-details"
        open={formOpen}
        onToggle={(event) => setFormOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span>{form.id ? `Editando: ${form.nome || "plano"}` : "Criar novo plano"}</span>
          <span className="billing-badge info">{form.id ? "EDIÇÃO" : "NOVO"}</span>
        </summary>
        <div>
          <form className="billing-form" onSubmit={submitPlan}>
            <div className="billing-form-grid">
              <label>
                <span>NOME DO PLANO</span>
                <input
                  value={form.nome}
                  onChange={(event) => setForm({ ...form, nome: event.target.value })}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                <span>PREÇO (R$)</span>
                <input
                  value={form.preco}
                  onChange={(event) => setForm({ ...form, preco: event.target.value })}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </label>
              <label>
                <span>PERIODICIDADE</span>
                <select
                  value={form.periodicidade}
                  onChange={(event) => setForm({ ...form, periodicidade: event.target.value })}
                >
                  {(data?.periodicidades || Object.keys(PERIODICIDADE_LABEL)).map((item) => (
                    <option key={item} value={item}>
                      {PERIODICIDADE_LABEL[item] || item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>LIMITE DE MEMBROS (0 = ILIMITADO)</span>
                <input
                  value={form.limiteMembros}
                  onChange={(event) => setForm({ ...form, limiteMembros: event.target.value })}
                  inputMode="numeric"
                />
              </label>
              <label>
                <span>ARMAZENAMENTO (MB)</span>
                <input
                  value={form.limiteArmazenamentoMb}
                  onChange={(event) => setForm({ ...form, limiteArmazenamentoMb: event.target.value })}
                  inputMode="numeric"
                />
              </label>
              <label>
                <span>DIAS DE TESTE</span>
                <input
                  value={form.diasTeste}
                  onChange={(event) => setForm({ ...form, diasTeste: event.target.value })}
                  inputMode="numeric"
                />
              </label>
              <label>
                <span>DURAÇÃO (MESES, 0 = CONTÍNUO)</span>
                <input
                  value={form.duracaoMeses}
                  onChange={(event) => setForm({ ...form, duracaoMeses: event.target.value })}
                  inputMode="numeric"
                />
              </label>
              <label>
                <span>DESCONTO PADRÃO (%)</span>
                <input
                  value={form.descontoPercentual}
                  onChange={(event) => setForm({ ...form, descontoPercentual: event.target.value })}
                  inputMode="numeric"
                />
              </label>
              <label>
                <span>PLANO EXCLUSIVO DE</span>
                <select
                  value={form.comunidadeExclusivaId}
                  onChange={(event) => setForm({ ...form, comunidadeExclusivaId: event.target.value })}
                >
                  <option value="">Disponível para todas</option>
                  {(data?.communities || []).map((community) => (
                    <option key={community.id} value={community.id}>
                      {community.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                <span>DESCRIÇÃO</span>
                <input
                  value={form.descricao}
                  onChange={(event) => setForm({ ...form, descricao: event.target.value })}
                  maxLength={600}
                />
              </label>
              <label className="wide">
                <span>MÓDULOS LIBERADOS (SEPARE POR VÍRGULA)</span>
                <input
                  value={form.modulos}
                  onChange={(event) => setForm({ ...form, modulos: event.target.value })}
                  placeholder="AGENDA, FINANCEIRO, MENSAGENS"
                />
              </label>
              <label className="wide">
                <span>RECURSOS INCLUÍDOS (UM POR LINHA)</span>
                <textarea
                  value={form.recursos}
                  onChange={(event) => setForm({ ...form, recursos: event.target.value })}
                />
              </label>
            </div>
            <footer>
              <button type="submit" disabled={busy}>
                {busy ? "Salvando…" : form.id ? "Salvar alterações" : "Criar plano"}
              </button>
              {form.id > 0 && (
                <button type="button" onClick={() => setForm(EMPTY_FORM)} disabled={busy}>
                  Cancelar edição
                </button>
              )}
            </footer>
          </form>
        </div>
      </details>

      <section className="owner-directory-panel billing-panel" aria-label="Lista de planos">
        <header>
          <div>
            <h2>Planos cadastrados</h2>
            <p>Preços em reais; limites iguais a zero significam sem limite.</p>
          </div>
        </header>
        {loading ? (
          <div className="billing-loading" role="status">
            <span className="pilot-loader" />
            <p>Carregando o catálogo de planos…</p>
          </div>
        ) : plans.length === 0 ? (
          <div className="owner-empty" role="status">
            <span>◌</span>
            <strong>Nenhum plano cadastrado</strong>
            <p>Crie o primeiro plano para começar a vincular comunidades.</p>
          </div>
        ) : (
          <div className="billing-table-scroll">
            <table className="billing-table">
              <thead>
                <tr>
                  <th scope="col">Plano</th>
                  <th scope="col" className="numeric">Preço</th>
                  <th scope="col">Periodicidade</th>
                  <th scope="col" className="numeric">Membros</th>
                  <th scope="col" className="numeric">Armazenamento</th>
                  <th scope="col" className="numeric">Assinaturas</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <strong>{plan.nome}</strong>
                      <small>{plan.descricao || plan.slug}</small>
                      {plan.comunidadeExclusivaNome && (
                        <span className="billing-badge info" style={{ marginTop: 6, display: "inline-block" }}>
                          EXCLUSIVO · {plan.comunidadeExclusivaNome}
                        </span>
                      )}
                      {plan.modulos.length > 0 && (
                        <div className="billing-chips">
                          {plan.modulos.map((modulo) => (
                            <span key={modulo}>{modulo}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="numeric">
                      <strong>{formatCents(plan.precoCentavos)}</strong>
                      {plan.descontoPercentual > 0 && <small>-{plan.descontoPercentual}% padrão</small>}
                    </td>
                    <td>
                      {PERIODICIDADE_LABEL[plan.periodicidade] || plan.periodicidade}
                      {plan.diasTeste > 0 && <small>{plan.diasTeste} dias de teste</small>}
                    </td>
                    <td className="numeric">{plan.limiteMembros > 0 ? plan.limiteMembros : "Ilimitado"}</td>
                    <td className="numeric">
                      {plan.limiteArmazenamentoMb > 0 ? `${plan.limiteArmazenamentoMb} MB` : "Ilimitado"}
                    </td>
                    <td className="numeric">
                      <strong>{plan.assinaturasAtivas}</strong>
                      <small>{plan.assinaturas} no total</small>
                    </td>
                    <td>
                      <span className={`billing-badge ${plan.status === "ATIVO" ? "good" : "neutral"}`}>
                        {plan.status}
                      </span>
                    </td>
                    <td className="actions">
                      <button type="button" onClick={() => startEdit(plan)} disabled={busy}>
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void send(
                            "PATCH",
                            { id: plan.id, action: plan.status === "ATIVO" ? "ARCHIVE" : "RESTORE" },
                            plan.status === "ATIVO" ? "Plano arquivado." : "Plano restaurado.",
                          )
                        }
                      >
                        {plan.status === "ATIVO" ? "Arquivar" : "Restaurar"}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy || plan.assinaturas > 0}
                        title={plan.assinaturas > 0 ? "Plano com assinaturas vinculadas não pode ser excluído." : undefined}
                        onClick={() => void removePlan(plan)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="owner-directory-panel billing-panel" aria-label="Cupons de assinatura">
        <header>
          <div>
            <h2>Cupons</h2>
            <p>Descontos aplicáveis no momento de vincular uma comunidade a um plano.</p>
          </div>
        </header>

        <form className="billing-form" onSubmit={submitCoupon}>
          <div className="billing-form-grid">
            <label>
              <span>CÓDIGO</span>
              <input
                value={coupon.codigo}
                onChange={(event) => setCoupon({ ...coupon, codigo: event.target.value.toUpperCase() })}
                maxLength={40}
                required
              />
            </label>
            <label>
              <span>TIPO</span>
              <select value={coupon.tipo} onChange={(event) => setCoupon({ ...coupon, tipo: event.target.value })}>
                <option value="PERCENTUAL">Percentual (%)</option>
                <option value="VALOR">Valor fixo (R$)</option>
              </select>
            </label>
            <label>
              <span>{coupon.tipo === "PERCENTUAL" ? "DESCONTO (%)" : "DESCONTO (R$)"}</span>
              <input
                value={coupon.valor}
                onChange={(event) => setCoupon({ ...coupon, valor: event.target.value })}
                inputMode="decimal"
                required
              />
            </label>
            <label>
              <span>RESTRITO AO PLANO</span>
              <select value={coupon.planoId} onChange={(event) => setCoupon({ ...coupon, planoId: event.target.value })}>
                <option value="">Todos os planos</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>VÁLIDO ATÉ</span>
              <input
                type="date"
                value={coupon.validoAte}
                onChange={(event) => setCoupon({ ...coupon, validoAte: event.target.value })}
              />
            </label>
            <label>
              <span>USOS MÁXIMOS (0 = ILIMITADO)</span>
              <input
                value={coupon.usosMaximos}
                onChange={(event) => setCoupon({ ...coupon, usosMaximos: event.target.value })}
                inputMode="numeric"
              />
            </label>
          </div>
          <footer>
            <button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Criar cupom"}
            </button>
          </footer>
        </form>

        {loading ? null : (data?.coupons.length || 0) === 0 ? (
          <div className="owner-empty" role="status">
            <span>◌</span>
            <strong>Nenhum cupom cadastrado</strong>
            <p>Cupons aparecem aqui assim que forem criados.</p>
          </div>
        ) : (
          <div className="billing-cards">
            {(data?.coupons || []).map((item) => (
              <article key={item.id}>
                <div>
                  <h3>{item.codigo}</h3>
                  <p>
                    {item.tipo === "PERCENTUAL" ? `${item.valor}% de desconto` : `${formatCents(item.valor)} de desconto`}
                    {" · "}
                    {item.planoNome ? `plano ${item.planoNome}` : "todos os planos"}
                    {" · "}
                    {item.usos} uso(s)
                    {item.usosMaximos > 0 ? ` de ${item.usosMaximos}` : ""}
                    {item.validoAte ? ` · válido até ${item.validoAte}` : ""}
                  </p>
                </div>
                <div className="billing-row-actions">
                  <span className={`billing-badge ${item.ativo ? "good" : "neutral"}`}>
                    {item.ativo ? "ATIVO" : "INATIVO"}
                  </span>{" "}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void send(
                        "PATCH",
                        { action: "COUPON_TOGGLE", cupomId: item.id },
                        item.ativo ? "Cupom desativado." : "Cupom ativado.",
                      )
                    }
                  >
                    {item.ativo ? "Desativar" : "Ativar"}
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
