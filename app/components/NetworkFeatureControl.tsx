"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Target = { id: number; nome: string };
type Rule = {
  id: number;
  flag_key: string;
  scope_type: string;
  scope_id: number;
  enabled: number;
  inicia_em: string | null;
  termina_em: string | null;
  alterado_em: string;
};
type FeatureControlData = {
  networkModuleEnabled: boolean;
  affiliateCreationEnabled: boolean;
  networkControl: {
    rules: Rule[];
    communities: Target[];
    networks: Target[];
    plans: Target[];
    activeCommunityId: number;
    requiresConfirmation: string;
  };
};

const SCOPE_OPTIONS = [
  { value: "GLOBAL", label: "Toda a plataforma", detail: "Disponível para todas as comunidades" },
  { value: "NETWORK", label: "Apenas uma rede", detail: "Libera somente as unidades da rede" },
  { value: "PLAN", label: "Apenas determinado plano", detail: "Aplica pela preparação comercial" },
  { value: "COMMUNITY", label: "Comunidade específica", detail: "Libera apenas a comunidade escolhida" },
  { value: "PILOT", label: "Período de teste", detail: "Acesso temporário com início e término" },
] as const;

export default function NetworkFeatureControl() {
  const [data, setData] = useState<FeatureControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [scopeType, setScopeType] = useState("GLOBAL");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pilot/feature-flags", {
        cache: "no-store",
      });
      const result = (await response.json()) as FeatureControlData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o controle.");
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

  const targets = useMemo(() => {
    if (!data) return [];
    if (scopeType === "NETWORK") return data.networkControl.networks;
    if (scopeType === "PLAN") return data.networkControl.plans;
    if (scopeType === "COMMUNITY" || scopeType === "PILOT") {
      return data.networkControl.communities;
    }
    return [];
  }, [data, scopeType]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setFeedback("");
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/pilot/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.get("enabled") === "true",
          affiliateCreationEnabled:
            form.get("affiliateCreationEnabled") === "on",
          scopeType,
          scopeId: scopeType === "GLOBAL" ? 0 : Number(form.get("scopeId")),
          startsAt: form.get("startsAt"),
          endsAt: form.get("endsAt"),
          reason: form.get("reason"),
          confirmation: form.get("confirmation"),
          password: form.get("password"),
        }),
      });
      const result = (await response.json()) as { error?: string; enabled?: boolean };
      if (!response.ok) throw new Error(result.error || "A configuração não foi salva.");
      setFeedback(
        result.enabled
          ? "Módulo ativado. Atualizando o painel…"
          : "Módulo desativado. Atualizando o painel…",
      );
      window.setTimeout(() => window.location.reload(), 700);
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const enabled = Boolean(data?.networkModuleEnabled);
  return (
    <section className="network-feature-control">
      <header className={enabled ? "enabled" : "disabled"}>
        <strong>2. REDES, SEDES E AFILIADAS</strong>
        <span>{enabled ? "ATIVADO" : "DESATIVADO POR PADRÃO"}</span>
      </header>
      {loading ? (
        <div className="network-control-loading">
          <span className="pilot-loader" />
          <p>Consultando a configuração atual…</p>
        </div>
      ) : (
        <div className="network-control-body">
          <form className="network-control-form" onSubmit={save}>
            <div>
              <p className="pilot-kicker">CONFIGURAÇÃO DA PLATAFORMA</p>
              <h2>Módulo de Redes e Afiliadas</h2>
              <p>
                Quando desativado, o menu, as rotas e a criação de afiliadas
                permanecem bloqueados.
              </p>
            </div>

            <fieldset className="network-status-choice">
              <legend>Status do módulo</legend>
              <label>
                <input type="radio" name="enabled" value="true" defaultChecked={enabled} />
                <span><strong>Ativado</strong><small>Liberar conforme o escopo</small></span>
              </label>
              <label>
                <input type="radio" name="enabled" value="false" defaultChecked={!enabled} />
                <span><strong>Desativado</strong><small>Bloquear menus, rotas e ações</small></span>
              </label>
            </fieldset>

            <fieldset className="network-scope-choice">
              <legend>Ativar para</legend>
              {SCOPE_OPTIONS.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="scopeType"
                    value={option.value}
                    checked={scopeType === option.value}
                    onChange={() => setScopeType(option.value)}
                  />
                  <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                </label>
              ))}
            </fieldset>

            {scopeType !== "GLOBAL" && (
              <label className="network-control-field">
                {scopeType === "NETWORK"
                  ? "Rede"
                  : scopeType === "PLAN"
                    ? "Plano"
                    : "Comunidade"}
                <select
                  name="scopeId"
                  required
                  defaultValue={
                    scopeType === "COMMUNITY" || scopeType === "PILOT"
                      ? data?.networkControl.activeCommunityId
                      : ""
                  }
                >
                  <option value="" disabled>Selecionar</option>
                  {targets.map((target) => (
                    <option key={target.id} value={target.id}>{target.nome}</option>
                  ))}
                </select>
                {!targets.length && (
                  <small>Nenhuma opção cadastrada para este escopo.</small>
                )}
              </label>
            )}

            {scopeType === "PILOT" && (
              <div className="network-test-dates">
                <label>Início<input name="startsAt" type="datetime-local" required /></label>
                <label>Término<input name="endsAt" type="datetime-local" required /></label>
              </div>
            )}

            <label className="network-affiliate-permission">
              <input
                name="affiliateCreationEnabled"
                type="checkbox"
                defaultChecked={Boolean(data?.affiliateCreationEnabled)}
              />
              <span>
                <strong>Permitir criar novas afiliadas</strong>
                <small>Ainda respeita plano, limite e permissões do servidor.</small>
              </span>
            </label>

            <div className="network-critical-confirmation">
              <label>Motivo da alteração<textarea name="reason" required minLength={5} rows={2} /></label>
              <label>Digite REDES para confirmar<input name="confirmation" required autoComplete="off" /></label>
              <label>Confirme sua senha<input name="password" type="password" required autoComplete="current-password" /></label>
            </div>
            <button className="network-control-submit" disabled={working || (scopeType !== "GLOBAL" && !targets.length)}>
              {working ? "Validando…" : "Salvar configuração"}
            </button>
            {feedback && <p className="operations-feedback" role="status">{feedback}</p>}
            {error && <p className="operations-feedback error" role="alert">{error}</p>}
          </form>

          <aside className="network-control-preview" aria-label="Exemplo de hierarquia de rede">
            <p className="pilot-kicker">EXEMPLO DE REDE DE IGREJAS</p>
            <div className="network-preview-root">
              <span>♟</span>
              <strong>Igreja-mãe / Sede central</strong>
            </div>
            <div className="network-preview-branches">
              {["Afiliada 1", "Afiliada 2", "Afiliada 3"].map((label) => (
                <article key={label}>
                  <span>♧</span>
                  <strong>{label}</strong>
                  <small>Comunidade</small>
                </article>
              ))}
            </div>
            <div className="network-preview-footer">
              Congregações / Unidades regionais
            </div>
            <div className="network-control-state">
              <span className={enabled ? "feature-on" : "feature-off"} />
              <div>
                <strong>{enabled ? "Módulo disponível" : "Módulo protegido"}</strong>
                <small>{data?.networkControl.rules.length || 0} regras de ativação registradas</small>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
