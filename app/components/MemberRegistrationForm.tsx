"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "./StableLink";
import { DaySelector, PERIOD_LABELS } from "./MinistriesWorkspace";
import { formatLinkCountdown } from "../lib/member-registration-links";

type Community = { id: number; nome: string; ministerios: { id: number; nome: string }[] };

type FormState = {
  nome: string;
  email: string;
  cpf: string;
  cep: string;
  dataNascimento: string;
  comunidadeId: string;
  ministerioId: string;
  funcaoDesejada: string;
  periodoPreferido: string;
  diasDisponiveis: string[];
};

const EMPTY_FORM: FormState = {
  nome: "",
  email: "",
  cpf: "",
  cep: "",
  dataNascimento: "",
  comunidadeId: "",
  ministerioId: "",
  funcaoDesejada: "",
  periodoPreferido: "FLEXIVEL",
  diasDisponiveis: [],
};

export default function MemberRegistrationForm({
  token,
  expiresAt,
}: {
  token: string;
  expiresAt: string;
}) {
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [phase, setPhase] = useState<"form" | "review" | "done">("form");
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/cadastro-membro/${token}`, { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { communities?: Community[]; error?: string };
        if (cancelled) return;
        if (!response.ok || !result.communities) {
          setLoadError(result.error || "Não foi possível carregar este link.");
          return;
        }
        setCommunities(result.communities);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Falha de conexão. Atualize a página.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const selectedCommunity = useMemo(
    () => communities?.find((community) => String(community.id) === form.comunidadeId) || null,
    [communities, form.comunidadeId],
  );
  const countdown = formatLinkCountdown(Date.parse(expiresAt) - now);

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function goToReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (form.nome.trim().length < 3) return setError("Informe seu nome completo.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Informe um e-mail válido.");
    if (!form.cep.trim()) return setError("Informe seu CEP.");
    if (!form.dataNascimento) return setError("Informe sua data de nascimento.");
    if (!form.comunidadeId) return setError("Selecione uma comunidade.");
    // <DaySelector> usa checkboxes não controlados (defaultChecked) para reaproveitar
    // exatamente o componente já usado em MinistriesWorkspace; lemos a seleção do
    // próprio FormData em vez de duplicar o componente com uma versão controlada.
    const diasDisponiveis = new FormData(event.currentTarget)
      .getAll("diasDisponiveis")
      .map((value) => String(value));
    setForm((current) => ({ ...current, diasDisponiveis }));
    setPhase("review");
  }

  async function confirmSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/public/cadastro-membro/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          comunidadeId: Number(form.comunidadeId),
          ministerioId: form.ministerioId ? Number(form.ministerioId) : null,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Não foi possível enviar o cadastro.");
      }
      setPhase("done");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="pilot-legal-shell">
      <Link className="pilot-brand-inline" href="/">
        <span>V+</span>
        <strong>Vínkulo</strong>
      </Link>
      <section className="pilot-legal-card member-registration-card">
        <p className="pilot-kicker">VÍNKULO · CADASTRO TEMPORÁRIO</p>
        <h1 className="member-registration-title">Cadastro de novos membros</h1>
        <p className="member-registration-countdown">
          {countdown === "Encerrado" ? "Este link se encerrou." : `Aberto até ${new Date(expiresAt).toLocaleString("pt-BR")} · ${countdown}`}
        </p>

        {loadError && <p className="pilot-form-message" role="alert">{loadError}</p>}

        {!loadError && phase === "form" && !communities && (
          <p role="status">Carregando comunidades disponíveis…</p>
        )}

        {!loadError && phase === "form" && communities && (
          <form className="pilot-form member-registration-form" onSubmit={goToReview}>
            <section className="member-registration-step">
              <h2><span aria-hidden="true">1</span> Dados pessoais</h2>
              <p>Você poderá revisar tudo antes do envio.</p>
              <label>
                Nome completo*
                <input
                  value={form.nome}
                  onChange={(event) => update("nome", event.target.value)}
                  required
                  minLength={3}
                  autoComplete="name"
                />
              </label>
              <label>
                E-mail*
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                CPF <small>Opcional</small>
                <input value={form.cpf} onChange={(event) => update("cpf", event.target.value)} />
              </label>
              <label>
                CEP*
                <input
                  value={form.cep}
                  onChange={(event) => update("cep", event.target.value)}
                  required
                  placeholder="00000-000"
                  autoComplete="postal-code"
                />
              </label>
              <label>
                Data de nascimento*
                <input
                  type="date"
                  value={form.dataNascimento}
                  onChange={(event) => update("dataNascimento", event.target.value)}
                  required
                />
              </label>
            </section>

            <section className="member-registration-step">
              <h2><span aria-hidden="true">2</span> Comunidade e Função</h2>
              <p>Somente opções do proprietário deste link.</p>
              <label>
                Comunidade*
                <select
                  value={form.comunidadeId}
                  onChange={(event) => update("comunidadeId", event.target.value)}
                  required
                >
                  <option value="">Selecione…</option>
                  {communities.map((community) => (
                    <option key={community.id} value={community.id}>
                      {community.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Função*
                <select value="MEMBRO" disabled>
                  <option value="MEMBRO">Membro</option>
                </select>
              </label>
            </section>

            <section className="member-registration-step">
              <h2><span aria-hidden="true">3</span> Ministério</h2>
              <p>Funções e disponibilidade vêm do cadastro da comunidade escolhida.</p>
              <label>
                Ministério
                <select
                  value={form.ministerioId}
                  onChange={(event) => update("ministerioId", event.target.value)}
                  disabled={!selectedCommunity}
                >
                  <option value="">Nenhum por enquanto</option>
                  {selectedCommunity?.ministerios.map((ministry) => (
                    <option key={ministry.id} value={ministry.id}>
                      {ministry.nome}
                    </option>
                  ))}
                </select>
              </label>
              {form.ministerioId && (
                <label>
                  Função desejada
                  <input
                    value={form.funcaoDesejada}
                    onChange={(event) => update("funcaoDesejada", event.target.value)}
                    placeholder="Ex.: Vocal, recepção, mídia"
                  />
                </label>
              )}
              <DaySelector selected={form.diasDisponiveis} />
              <label>
                Período preferido
                <select
                  value={form.periodoPreferido}
                  onChange={(event) => update("periodoPreferido", event.target.value)}
                >
                  {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            {error && <p className="pilot-form-message" role="alert">{error}</p>}
            <button type="submit">Revisar cadastro →</button>
          </form>
        )}

        {phase === "review" && (
          <div className="member-registration-review">
            <h2>Confira antes de enviar</h2>
            <dl>
              <div><dt>Nome</dt><dd>{form.nome}</dd></div>
              <div><dt>E-mail</dt><dd>{form.email}</dd></div>
              <div><dt>CEP</dt><dd>{form.cep}</dd></div>
              <div><dt>Nascimento</dt><dd>{form.dataNascimento}</dd></div>
              <div><dt>Comunidade</dt><dd>{selectedCommunity?.nome}</dd></div>
              <div>
                <dt>Ministério</dt>
                <dd>
                  {selectedCommunity?.ministerios.find((m) => String(m.id) === form.ministerioId)?.nome ||
                    "Nenhum por enquanto"}
                </dd>
              </div>
            </dl>
            {error && <p className="pilot-form-message" role="alert">{error}</p>}
            <div className="member-registration-review-actions">
              <button type="button" className="secondary" onClick={() => setPhase("form")} disabled={submitting}>
                Voltar e editar
              </button>
              <button type="button" onClick={() => void confirmSubmit()} disabled={submitting}>
                {submitting ? "Enviando…" : "Confirmar e enviar"}
              </button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <p className="member-registration-done" role="status">
            ✓ Cadastro enviado! Assim que o responsável aprovar, você recebe um link para
            definir sua senha e acessar.
          </p>
        )}

        <footer>As informações ficam restritas ao proprietário das comunidades exibidas neste formulário.</footer>
      </section>
    </main>
  );
}
