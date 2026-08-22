"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Network = {
  id: number;
  nome: string;
  slug: string;
  comunidade_mae_id: number;
  plano_id: number | null;
  comunidade_mae_nome: string;
  status: string;
  limite_afiliadas: number;
  valor_futuro_centavos: number;
  isenta: number;
  teste_inicio: string | null;
  teste_fim: string | null;
  status_comercial: string;
  plano_nome: string | null;
  can_manage: number;
};
type Unit = {
  id: number;
  rede_id: number;
  comunidade_id: number;
  comunidade_nome: string;
  comunidade_slug: string;
  tipo: string;
  regiao: string | null;
  status: string;
  restricao_nivel: number;
  prazo_responsavel: string | null;
  responsavel_nome: string | null;
  pastor_interino_nome: string | null;
};
type Manager = {
  id: number;
  rede_id: number;
  usuario_id: number;
  papel: string;
  regiao: string | null;
  nome: string;
  email: string;
};
type Option = { id: number; nome: string; comunidade_id?: number };
type NetworkPlan = {
  id: number;
  nome: string;
  slug: string;
  limite_afiliadas: number;
  valor_futuro_centavos: number;
};
type NetworkData = {
  redes: Network[];
  unidades: Unit[];
  gestores: Manager[];
  comunidadesDisponiveis: Option[];
  usuariosDisponiveis: Option[];
  planos: NetworkPlan[];
  canManageCommercial: boolean;
  flags: {
    networkModuleEnabled: boolean;
    affiliateCreationEnabled: boolean;
  };
  paymentsEnabled: false;
};

const UNIT_LABELS: Record<string, string> = {
  SEDE: "Sede",
  AFILIADA: "Afiliada",
  CONGREGACAO: "Congregação",
  UNIDADE_REGIONAL: "Unidade regional",
  INDEPENDENTE: "Independente",
};
const STATUS_LABELS: Record<string, string> = {
  ATIVA: "Ativa",
  AGUARDANDO_RESPONSAVEL: "Sem responsável",
  EM_REGULARIZACAO: "Em regularização",
  SOB_RESPONSABILIDADE_INTERINA: "Responsabilidade interina",
  RESTRITA_TEMPORARIAMENTE: "Restrita temporariamente",
  SUSPENSA: "Suspensa",
};
const ROLE_LABELS: Record<string, string> = {
  NETWORK_OWNER: "Responsável da rede",
  NETWORK_PRESIDENT: "Presidência",
  NETWORK_ADMIN: "Administração da rede",
  REGIONAL_SUPERVISOR: "Supervisão regional",
  NETWORK_AUDITOR: "Auditoria",
  LOCAL_PASTOR: "Pastor local",
  INTERIM_PASTOR: "Pastor interino",
  LOCAL_ADMIN: "Administração local",
};

export default function NetworkWorkspace() {
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selectedNetworkId, setSelectedNetworkId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pilot/redes", { cache: "no-store" });
      const result = (await response.json()) as NetworkData & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar as redes.");
      }
      setData(result);
      setSelectedNetworkId((current) =>
        current && result.redes.some((network) => network.id === current)
          ? current
          : result.redes[0]?.id || null,
      );
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

  const selectedNetwork =
    data?.redes.find((network) => network.id === selectedNetworkId) || null;
  const selectedUnits = useMemo(
    () => (data?.unidades || []).filter((unit) => unit.rede_id === selectedNetworkId),
    [data?.unidades, selectedNetworkId],
  );
  const selectedManagers = useMemo(
    () => (data?.gestores || []).filter((manager) => manager.rede_id === selectedNetworkId),
    [data?.gestores, selectedNetworkId],
  );
  const unitsWithoutOwner = selectedUnits.filter(
    (unit) => !unit.responsavel_nome && !unit.pastor_interino_nome,
  );
  const restrictedUnits = selectedUnits.filter(
    (unit) => unit.restricao_nivel > 0 || unit.status.includes("RESTRITA"),
  );

  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setFeedback("");
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      action,
      ...Object.fromEntries(form.entries()),
    };
    if (action === "ATUALIZAR_COMERCIAL") {
      payload.isenta = form.get("isenta") === "on";
      payload.valorFuturoCentavos = Math.round(
        Number(form.get("valorFuturoReais") || 0) * 100,
      );
    }
    if (action === "SALVAR_PLANO") {
      payload.valorFuturoCentavos = Math.round(
        Number(form.get("valorFuturoReais") || 0) * 100,
      );
    }
    try {
      const response = await fetch("/api/pilot/redes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        paymentProcessed?: boolean;
      };
      if (!response.ok) throw new Error(result.error || "A alteração não foi salva.");
      setFeedback(
        action === "ATUALIZAR_COMERCIAL"
          ? "Preparação comercial salva. Nenhuma cobrança foi processada."
          : "Alteração salva e registrada na auditoria.",
      );
      if (action !== "ATUALIZAR_COMERCIAL") event.currentTarget.reset();
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <section className="network-workspace">
        <div className="network-loading">
          <span className="pilot-loader" />
          <p>Validando rede, unidade ativa e permissões…</p>
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="network-workspace">
        <div className="operations-feedback error" role="alert">{error}</div>
        <button className="network-retry" type="button" onClick={() => void load()}>
          Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <section className="network-workspace">
      <header className="network-heading">
        <div>
          <p className="pilot-kicker">REDES, SEDES E AFILIADAS</p>
          <h1>Visão consolidada</h1>
          <p>
            Governança entre unidades sem compartilhar automaticamente dados
            pastorais, denúncias, documentos ou atendimentos privados.
          </p>
        </div>
        <span className="network-secure-badge">Isolamento por unidade</span>
      </header>

      {feedback && <p className="operations-feedback" role="status">{feedback}</p>}
      {error && <p className="operations-feedback error" role="alert">{error}</p>}

      <div className="network-metrics">
        <Metric value={data?.redes.length || 0} label="Redes acessíveis" tone="purple" />
        <Metric value={selectedUnits.length} label="Unidades nesta rede" tone="blue" />
        <Metric value={unitsWithoutOwner.length} label="Sem responsável" tone="amber" />
        <Metric value={restrictedUnits.length} label="Com restrições" tone="red" />
      </div>

      {!data?.redes.length ? (
        <div className="network-empty">
          <span>⌘</span>
          <div>
            <h2>Nenhuma rede criada</h2>
            <p>
              A estrutura permanece independente até o superadministrador criar a
              rede e definir sua igreja-mãe.
            </p>
          </div>
        </div>
      ) : (
        <>
          <nav className="network-switcher" aria-label="Selecionar rede">
            {data.redes.map((network) => (
              <button
                key={network.id}
                type="button"
                className={network.id === selectedNetworkId ? "active" : ""}
                onClick={() => setSelectedNetworkId(network.id)}
              >
                <span>{network.nome.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{network.nome}</strong>
                  <small>{network.comunidade_mae_nome}</small>
                </div>
              </button>
            ))}
          </nav>

          {unitsWithoutOwner.length > 0 && (
            <div className="network-warning" role="status">
              <span>!</span>
              <div>
                <strong>{unitsWithoutOwner.length} unidade(s) sem responsável definido</strong>
                <p>Defina um responsável local ou pastor interino antes de ampliar o acesso.</p>
              </div>
            </div>
          )}

          <div className="network-dashboard-grid">
            <section className="network-hierarchy">
              <header>
                <div>
                  <p className="pilot-kicker">ESTRUTURA DA REDE</p>
                  <h2>{selectedNetwork?.nome}</h2>
                </div>
                <span>{selectedUnits.length} unidades</span>
              </header>
              <div className="network-unit-list">
                {selectedUnits.map((unit) => (
                  <article key={unit.id}>
                    <span className={`network-unit-icon restriction-${unit.restricao_nivel}`}>
                      {unit.tipo === "SEDE" ? "⌂" : "◇"}
                    </span>
                    <div>
                      <div className="network-unit-title">
                        <strong>{unit.comunidade_nome}</strong>
                        <em>{UNIT_LABELS[unit.tipo] || unit.tipo}</em>
                      </div>
                      <small>
                        {unit.regiao || "Região não definida"} ·{" "}
                        {unit.responsavel_nome ||
                          unit.pastor_interino_nome ||
                          "Sem responsável"}
                      </small>
                    </div>
                    <i className={`network-status status-${unit.status.toLowerCase()}`}>
                      {STATUS_LABELS[unit.status] || unit.status}
                    </i>
                  </article>
                ))}
              </div>
            </section>

            <aside className="network-summary">
              <header>
                <p className="pilot-kicker">GOVERNANÇA</p>
                <h2>Equipe da rede</h2>
              </header>
              <div className="network-manager-list">
                {selectedManagers.map((manager) => (
                  <article key={manager.id}>
                    <span>{manager.nome.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>{manager.nome}</strong>
                      <small>{ROLE_LABELS[manager.papel] || manager.papel}</small>
                    </div>
                  </article>
                ))}
                {!selectedManagers.length && <p>Nenhum gestor ativo.</p>}
              </div>
              <dl className="network-commercial-summary">
                <div><dt>Plano</dt><dd>{selectedNetwork?.plano_nome || "Sem plano"}</dd></div>
                <div><dt>Limite</dt><dd>{selectedNetwork?.limite_afiliadas || "Sem limite"}</dd></div>
                <div><dt>Status</dt><dd>{selectedNetwork?.status_comercial || "SEM_COBRANCA"}</dd></div>
                <div><dt>Cobrança</dt><dd>Não processada</dd></div>
              </dl>
            </aside>
          </div>
        </>
      )}

      <section className="network-actions-panel">
        <header>
          <div>
            <p className="pilot-kicker">CONFIGURAÇÃO CONTROLADA</p>
            <h2>Estrutura e responsabilidades</h2>
          </div>
          <span>Alterações auditadas</span>
        </header>
        <div className="network-form-grid">
          {data?.comunidadesDisponiveis.length ? (
            <details>
              <summary>Criar rede</summary>
              <form className="pilot-form" onSubmit={(event) => submit(event, "CRIAR_REDE")}>
                <label>Nome da rede<input name="nome" required minLength={3} /></label>
                <label>Igreja-mãe<select name="comunidadeMaeId" required defaultValue=""><option value="" disabled>Selecionar</option>{data.comunidadesDisponiveis.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
                <button disabled={working}>Criar estrutura</button>
              </form>
            </details>
          ) : null}

          {data?.canManageCommercial && (
            <details>
              <summary>Criar plano</summary>
              <form className="pilot-form" onSubmit={(event) => submit(event, "SALVAR_PLANO")}>
                <label>Nome do plano<input name="nome" required minLength={2} /></label>
                <label>Limite de afiliadas<input name="limiteAfiliadas" type="number" min="0" max="10000" defaultValue="0" /></label>
                <label>Valor futuro (R$)<input name="valorFuturoReais" type="number" min="0" step="0.01" defaultValue="0.00" /></label>
                <button disabled={working}>Salvar plano</button>
                <small>O cadastro não gera cobrança nem ativa pagamentos.</small>
              </form>
            </details>
          )}

          {selectedNetwork?.can_manage ? (
            <>
              <details>
                <summary>Vincular unidade</summary>
                <form className="pilot-form" onSubmit={(event) => submit(event, "VINCULAR_UNIDADE")}>
                  <input type="hidden" name="redeId" value={selectedNetwork.id} />
                  <label>Comunidade<select name="comunidadeId" required defaultValue=""><option value="" disabled>Selecionar</option>{data?.comunidadesDisponiveis.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
                  <label>Tipo<select name="tipo" defaultValue="AFILIADA"><option value="AFILIADA">Afiliada</option><option value="CONGREGACAO">Congregação</option><option value="UNIDADE_REGIONAL">Unidade regional</option></select></label>
                  <label>Região<input name="regiao" maxLength={80} /></label>
                  <button disabled={working || !data?.flags.affiliateCreationEnabled}>Vincular unidade</button>
                  {!data?.flags.affiliateCreationEnabled && <small>A criação de afiliadas está bloqueada pela feature flag.</small>}
                </form>
              </details>

              <details>
                <summary>Definir responsável</summary>
                <form className="pilot-form" onSubmit={(event) => submit(event, "DEFINIR_RESPONSAVEL")}>
                  <input type="hidden" name="redeId" value={selectedNetwork.id} />
                  <label>Unidade<select name="unidadeId" required defaultValue=""><option value="" disabled>Selecionar</option>{selectedUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.comunidade_nome}</option>)}</select></label>
                  <label>Responsável local<select name="responsavelUsuarioId" defaultValue=""><option value="">Não definido</option>{data?.usuariosDisponiveis.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</select></label>
                  <label>Pastor interino<select name="pastorInterinoUsuarioId" defaultValue=""><option value="">Não definido</option>{data?.usuariosDisponiveis.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</select></label>
                  <label>Status<select name="status" defaultValue="ATIVA">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Nível de restrição<select name="restricaoNivel" defaultValue="0"><option value="0">0 — Normal</option><option value="1">1 — Aviso</option><option value="2">2 — Operação limitada</option><option value="3">3 — Restrição crítica</option></select></label>
                  <label>Prazo para responsável<input name="prazoResponsavel" type="date" /></label>
                  <button disabled={working}>Salvar responsabilidade</button>
                </form>
              </details>

              <details>
                <summary>Adicionar gestor</summary>
                <form className="pilot-form" onSubmit={(event) => submit(event, "ADICIONAR_GESTOR")}>
                  <input type="hidden" name="redeId" value={selectedNetwork.id} />
                  <label>Pessoa<select name="usuarioId" required defaultValue=""><option value="" disabled>Selecionar integrante</option>{data?.usuariosDisponiveis.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</select></label>
                  <label>Função<select name="papel" defaultValue="NETWORK_ADMIN">{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Região<input name="regiao" maxLength={80} /></label>
                  <button disabled={working}>Adicionar gestor</button>
                </form>
              </details>

              {data?.canManageCommercial && <details>
                <summary>Preparação comercial</summary>
                <form className="pilot-form" onSubmit={(event) => submit(event, "ATUALIZAR_COMERCIAL")}>
                  <input type="hidden" name="redeId" value={selectedNetwork.id} />
                  <label>Plano<select name="planoId" defaultValue={selectedNetwork.plano_id || ""}><option value="">Sem plano</option>{data.planos.map((plan) => <option key={plan.id} value={plan.id}>{plan.nome}</option>)}</select></label>
                  <label>Limite de afiliadas<input name="limiteAfiliadas" type="number" min="0" max="10000" defaultValue={selectedNetwork.limite_afiliadas} /></label>
                  <label>Valor futuro (R$)<input name="valorFuturoReais" type="number" min="0" step="0.01" defaultValue={(selectedNetwork.valor_futuro_centavos / 100).toFixed(2)} /></label>
                  <label>Status comercial<select name="statusComercial" defaultValue={selectedNetwork.status_comercial}><option value="SEM_COBRANCA">Sem cobrança</option><option value="EM_TESTE">Em teste</option><option value="ISENTA">Isenta</option><option value="PREPARADA">Preparada</option><option value="PENDENTE_PAGAMENTO">Pendente</option><option value="ATIVA">Ativa</option><option value="EM_CARENCIA">Em carência</option><option value="RESTRITA_FINANCEIRAMENTE">Restrita financeiramente</option></select></label>
                  <label>Início do teste<input name="testeInicio" type="date" defaultValue={selectedNetwork.teste_inicio?.slice(0, 10)} /></label>
                  <label>Fim do teste<input name="testeFim" type="date" defaultValue={selectedNetwork.teste_fim?.slice(0, 10)} /></label>
                  <label className="network-checkbox"><input name="isenta" type="checkbox" defaultChecked={Boolean(selectedNetwork.isenta)} /> Rede isenta</label>
                  <button disabled={working}>Salvar preparação</button>
                  <small>Nenhuma cobrança ou pagamento será executado.</small>
                </form>
              </details>}
            </>
          ) : null}
        </div>
      </section>
    </section>
  );
}

function Metric({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "purple" | "blue" | "amber" | "red";
}) {
  return (
    <article className={`network-metric tone-${tone}`}>
      <span>◇</span>
      <div><strong>{value}</strong><small>{label}</small></div>
    </article>
  );
}
