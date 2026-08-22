"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Space = {
  id: number;
  codigo: string;
  tipo: string;
  status: string;
  setor_id: number;
  setor_nome: string;
  setor_cor: string;
  ordem: number;
};
type Movement = {
  id: number;
  placa: string;
  tipo_veiculo: string;
  responsavel: string;
  vinculo: string;
  entrada_em: string;
  saida_em: string | null;
  status: string;
  vaga_codigo: string | null;
  setor_nome: string | null;
  operador_nome: string | null;
};
type Occurrence = {
  id: number;
  tipo: string;
  descricao: string;
  gravidade: string;
  status: string;
  criado_em: string;
  criado_por_nome: string | null;
};
type AvailableUser = { id: number; nome: string; papel: string };
type ParkingData = {
  config: {
    nome_modulo: string;
    cor_destaque: string;
    responsavelUsuarioId: number | null;
    instrucoes: string;
    responsavel: { id: number; nome: string; email: string } | null;
    atualizado_por_nome: string | null;
    atualizado_em: string;
  };
  stats: { total: number; ocupadas: number; livres: number; especiais: number };
  vagas: Space[];
  movimentacoes: Movement[];
  ocorrencias: Occurrence[];
  availableUsers: AvailableUser[];
  operator: {
    id: number;
    nome: string;
    papel: string;
    origemAcesso: "ESCALA_ATIVA" | "PERFIL_GESTOR";
    escala: {
      escala_id: number;
      titulo: string;
      inicia_em: string;
      termina_em: string;
      funcao: string;
    } | null;
  };
  permissions: string[];
};

export default function ParkingWorkspace({
  communityName,
}: {
  communityName: string;
}) {
  const [data, setData] = useState<ParkingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [mobileActions, setMobileActions] = useState(false);
  const entryRef = useRef<HTMLDetailsElement>(null);
  const exitRef = useRef<HTMLDetailsElement>(null);
  const occurrenceRef = useRef<HTMLDetailsElement>(null);
  const operatorRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pilot/estacionamento", {
        cache: "no-store",
      });
      const result = await readJson<ParkingData & { error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar o estacionamento.");
      }
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

  useEffect(() => {
    const open = () => setMobileActions(true);
    window.addEventListener("vinkulo:parking-action", open);
    return () => window.removeEventListener("vinkulo:parking-action", open);
  }, []);

  const sectors = useMemo(() => {
    const grouped = new Map<string, Space[]>();
    for (const space of data?.vagas || []) {
      const key = `${space.setor_id}:${space.setor_nome}`;
      grouped.set(key, [...(grouped.get(key) || []), space]);
    }
    return [...grouped.entries()].map(([key, spaces]) => ({
      id: key,
      name: spaces[0]?.setor_nome || "Setor",
      color: spaces[0]?.setor_cor || "#3b82f6",
      order: Number(spaces[0]?.ordem || 0),
      spaces,
    }));
  }, [data]);
  const visibleMovements = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data?.movimentacoes || [];
    return (data?.movimentacoes || []).filter((item) =>
      [item.placa, item.responsavel, item.vaga_codigo, item.setor_nome]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data, query]);
  const activeMovements = (data?.movimentacoes || []).filter(
    (item) => item.status === "NO_LOCAL",
  );
  const canEntry = data?.permissions.includes("parking.entry");
  const canExit = data?.permissions.includes("parking.exit");
  const canEdit = data?.permissions.includes("parking.edit");
  const canConfigure = data?.permissions.includes("parking.configure");
  const canManageHelpers =
    data?.permissions.includes("parking.helpers.manage") &&
    Boolean(data?.operator.escala);

  function openAction(ref: React.RefObject<HTMLDetailsElement | null>) {
    setMobileActions(false);
    if (!ref.current) return;
    ref.current.open = true;
    ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function registerEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setWorking(true);
    setFeedback("");
    setError("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/pilot/estacionamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Entrada não registrada.");
      setFeedback("Entrada registrada e vaga ocupada.");
      formElement.reset();
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function registerExit(id: number) {
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(`/api/pilot/estacionamento/${id}`, {
        method: "PATCH",
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Saída não registrada.");
      setFeedback("Saída registrada e vaga liberada.");
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function registerOccurrence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setWorking(true);
    setFeedback("");
    setError("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/pilot/estacionamento/ocorrencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error || "Ocorrência não registrada.");
      }
      setFeedback("Ocorrência registrada com auditoria.");
      formElement.reset();
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function submitJson(
    url: string,
    body: Record<string, unknown>,
    success: string,
    method?: "POST" | "PATCH",
  ) {
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(url, {
        method: method || (url.endsWith("configuracao") ? "PATCH" : "POST"),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Alteração não concluída.");
      setFeedback(success);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      className="parking-workspace"
      style={
        {
          "--parking-accent": data?.config.cor_destaque || "#d99a32",
        } as React.CSSProperties
      }
    >
      <header className="parking-heading">
        <div>
          <p className="pilot-kicker">GESTÃO DE ESTACIONAMENTO</p>
          <h1>{data?.config.nome_modulo || "Estacionamento"}</h1>
          <p>
            Operação isolada de {communityName}. Placas e responsáveis deste
            tenant não aparecem em outra comunidade.
          </p>
        </div>
        <span className="parking-live"><i />Atualização sob demanda</span>
      </header>

      {loading && !data && (
        <div className="parking-loading">
          <span className="pilot-loader" />
          <p>Carregando vagas e movimentações…</p>
        </div>
      )}
      {(feedback || error) && (
        <p className={`operations-feedback ${error ? "error" : ""}`} role="status">
          {error || feedback}
        </p>
      )}
      {data && (
        <>
          <section className="parking-operator" ref={operatorRef}>
            <span aria-hidden="true">◎</span>
            <div>
              <small>OPERADOR AUTENTICADO</small>
              <strong>{data.operator.nome}</strong>
              <p>
                {data.operator.origemAcesso === "ESCALA_ATIVA"
                  ? `${data.operator.escala?.funcao} · ${data.operator.escala?.titulo}`
                  : `${data.operator.papel} · acesso permanente de gestão`}
              </p>
            </div>
            <em>
              {data.config.responsavel
                ? `Responsável: ${data.config.responsavel.nome}`
                : "Responsável ainda não definido"}
            </em>
          </section>
          <div className="parking-metrics">
            <Metric icon="◆" label="Total de vagas" value={data.stats.total} tone="blue" />
            <Metric icon="●" label="Vagas ocupadas" value={data.stats.ocupadas} tone="green" />
            <Metric icon="○" label="Vagas disponíveis" value={data.stats.livres} tone="cyan" />
            <Metric icon="▣" label="Vagas reservadas" value={data.stats.especiais} tone="purple" />
            <Metric icon="!" label="Ocorrências abertas" value={data.ocorrencias.filter((item) => item.status === "ABERTA").length} tone="amber" />
          </div>

          <div className="parking-actions">
            {canEntry && (
              <details ref={entryRef}>
                <summary><span>↳</span><strong>Registrar entrada</strong><small>Ocupar uma vaga livre</small></summary>
                <form onSubmit={registerEntry} className="parking-action-form">
                  <label>Placa<input name="placa" required maxLength={10} placeholder="DEMO01" /></label>
                  <label>Responsável<input name="responsavel" required maxLength={120} placeholder="Pessoa demonstrativa" /></label>
                  <label>Tipo<select name="tipoVeiculo"><option value="CARRO">Carro</option><option value="MOTO">Moto</option><option value="VAN">Van</option><option value="ONIBUS">Ônibus</option><option value="OUTRO">Outro</option></select></label>
                  <label>Vínculo<select name="vinculo"><option value="VISITANTE">Visitante</option><option value="MEMBRO">Membro</option><option value="VOLUNTARIO">Voluntário</option><option value="EQUIPE">Equipe</option></select></label>
                  <label>Vaga<select name="vagaId" required defaultValue=""><option value="" disabled>Selecione</option>{data.vagas.filter((item) => item.status === "LIVRE").map((space) => <option key={space.id} value={space.id}>{space.codigo} · {space.setor_nome} · {space.tipo}</option>)}</select></label>
                  <button disabled={working}>Confirmar entrada</button>
                </form>
              </details>
            )}
            <details ref={exitRef}>
              <summary><span>↗</span><strong>Registrar saída</strong><small>Liberar vaga ocupada</small></summary>
              <div className="parking-quick-list">
                {activeMovements.length ? activeMovements.map((item) => (
                  <button key={item.id} disabled={!canExit || working} onClick={() => registerExit(item.id)}>
                    <strong>{item.placa}</strong><span>{item.vaga_codigo} · {item.responsavel}</span>
                  </button>
                )) : <p>Nenhum veículo no local.</p>}
              </div>
            </details>
            {canEdit && (
              <details ref={occurrenceRef}>
                <summary><span>!</span><strong>Relatar ocorrência</strong><small>Registrar sem apagar histórico</small></summary>
                <form onSubmit={registerOccurrence} className="parking-action-form occurrence">
                  <label>Tipo<select name="tipo"><option value="SEGURANCA">Segurança</option><option value="DANO">Dano</option><option value="BLOQUEIO">Bloqueio</option><option value="ORIENTACAO">Orientação</option><option value="OUTRO">Outro</option></select></label>
                  <label>Gravidade<select name="gravidade"><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option></select></label>
                  <label className="wide">Descrição<textarea name="descricao" required minLength={8} rows={3} /></label>
                  <button disabled={working}>Registrar ocorrência</button>
                </form>
              </details>
            )}
          </div>

          {canManageHelpers && (
            <section className="parking-management-card">
              <div>
                <p className="pilot-kicker">EQUIPE DO PLANTÃO</p>
                <h2>Convidar auxiliar</h2>
                <p>
                  Somente pessoas ativas em {communityName} podem ser chamadas.
                  O acesso só começa após a confirmação da escala e termina
                  automaticamente com o plantão.
                </p>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const values = Object.fromEntries(
                    new FormData(event.currentTarget).entries(),
                  );
                  void submitJson(
                    "/api/pilot/estacionamento/auxiliares",
                    {
                      ...values,
                      escalaId: data.operator.escala?.escala_id,
                    },
                    "Convite enviado ao auxiliar. Ele deverá confirmar a escala.",
                  );
                }}
              >
                <select name="usuarioId" required defaultValue="">
                  <option value="" disabled>Selecione uma pessoa da comunidade</option>
                  {data.availableUsers
                    .filter((item) => item.id !== data.operator.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} · {item.papel}
                      </option>
                    ))}
                </select>
                <button disabled={working}>Enviar convite</button>
              </form>
            </section>
          )}

          <div className="parking-grid">
            <section className="parking-history">
              <header>
                <div><p className="pilot-kicker">MOVIMENTAÇÕES</p><h2>Histórico recente</h2></div>
                <label>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar placa, pessoa ou vaga" /></label>
              </header>
              <div className="parking-table-wrap">
                <table>
                  <thead><tr><th>Placa</th><th>Responsável</th><th>Tipo</th><th>Entrada</th><th>Setor</th><th>Status</th><th>Ação</th></tr></thead>
                  <tbody>
                    {visibleMovements.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.placa}</strong></td>
                        <td>{item.responsavel}<small>{item.vinculo}</small></td>
                        <td>{item.tipo_veiculo}</td>
                        <td>{formatTime(item.entrada_em)}</td>
                        <td>{item.setor_nome || "—"}<small>{item.vaga_codigo || "Sem vaga"} · por {item.operador_nome || "sistema"}</small></td>
                        <td><span className={`parking-status status-${item.status.toLowerCase()}`}>{item.status === "NO_LOCAL" ? "No local" : "Encerrada"}</span></td>
                        <td>{item.status === "NO_LOCAL" && canExit ? <button disabled={working} onClick={() => registerExit(item.id)}>Saída</button> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleMovements.length && <p className="parking-empty">Nenhuma movimentação encontrada.</p>}
              </div>
            </section>

            <aside className="parking-map-panel">
              <header><div><p className="pilot-kicker">MAPA DO ESTACIONAMENTO</p><h2>Ocupação por setor</h2></div><span>{data.stats.livres} livres</span></header>
              <div className="parking-map">
                {sectors.map((sector) => (
                  <section key={sector.id} style={{ "--sector-color": sector.color } as React.CSSProperties}>
                    <header>
                      <strong>{sector.name}</strong>
                      {canConfigure && (
                        <details className="parking-sector-editor">
                          <summary>Editar</summary>
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              const values = Object.fromEntries(
                                new FormData(event.currentTarget).entries(),
                              );
                              void submitJson(
                                "/api/pilot/estacionamento/mapa",
                                {
                                  action: "ATUALIZAR_SETOR",
                                  setorId: Number(sector.id.split(":")[0]),
                                  ...values,
                                },
                                `Setor “${sector.name}” atualizado no mapa.`,
                                "PATCH",
                              );
                            }}
                          >
                            <label>
                              Nome
                              <input name="nome" defaultValue={sector.name} required maxLength={80} />
                            </label>
                            <label>
                              Cor
                              <input name="cor" type="color" defaultValue={sector.color} />
                            </label>
                            <label>
                              Posição
                              <input name="ordem" type="number" min="0" max="99" defaultValue={sector.order} />
                            </label>
                            <button disabled={working}>Salvar setor</button>
                          </form>
                        </details>
                      )}
                    </header>
                    <div>{sector.spaces.map((space) => <span key={space.id} className={`space-${space.status.toLowerCase()} type-${space.tipo.toLowerCase()}`} title={`${space.codigo} · ${space.tipo} · ${space.status}`}>{space.codigo}</span>)}</div>
                  </section>
                ))}
                <p>ENTRADA / SAÍDA</p>
              </div>
              <div className="parking-legend"><span><i className="free" />Livre</span><span><i className="busy" />Ocupada</span><span><i className="special" />Especial</span></div>
            </aside>
          </div>

          <section className="parking-occurrences">
            <header>
              <div>
                <p className="pilot-kicker">RELATÓRIOS OPERACIONAIS</p>
                <h2>Ocorrências recentes</h2>
              </div>
              <small>
                {data.config.responsavel
                  ? `Notificações enviadas para ${data.config.responsavel.nome}`
                  : "Defina um responsável para receber notificações"}
              </small>
            </header>
            <div>
              {data.ocorrencias.length ? data.ocorrencias.map((item) => (
                <article key={item.id}>
                  <span>{item.gravidade}</span>
                  <strong>{item.tipo}</strong>
                  <p>{item.descricao}</p>
                  <small>
                    {item.criado_por_nome || "Operador"} · {formatTime(item.criado_em)}
                  </small>
                </article>
              )) : <p className="parking-empty">Nenhuma ocorrência registrada.</p>}
            </div>
          </section>

          {canConfigure && (
            <section className="parking-configurator">
              <header>
                <div>
                  <p className="pilot-kicker">CONFIGURAÇÃO DA COMUNIDADE</p>
                  <h2>Operação e mapa</h2>
                </div>
                <small>Alterações persistentes, isoladas e auditadas</small>
              </header>
              <div className="parking-config-grid">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = Object.fromEntries(
                      new FormData(event.currentTarget).entries(),
                    );
                    void submitJson(
                      "/api/pilot/estacionamento/configuracao",
                      {
                        ativo: true,
                        nomeModulo: data.config.nome_modulo,
                        corDestaque: data.config.cor_destaque,
                        ...values,
                      },
                      "Responsável e instruções atualizados.",
                    );
                  }}
                >
                  <h3>Responsabilidade</h3>
                  <label>Responsável da diaconia
                    <select
                      name="responsavelUsuarioId"
                      defaultValue={data.config.responsavelUsuarioId || ""}
                    >
                      <option value="">Não definido</option>
                      {data.availableUsers.map((item) => (
                        <option key={item.id} value={item.id}>{item.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label>Instruções do plantão
                    <textarea
                      name="instrucoes"
                      rows={3}
                      defaultValue={data.config.instrucoes}
                      placeholder="Ex.: registrar ocorrências graves imediatamente."
                    />
                  </label>
                  <button disabled={working}>Salvar operação</button>
                </form>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = Object.fromEntries(
                      new FormData(event.currentTarget).entries(),
                    );
                    void submitJson(
                      "/api/pilot/estacionamento/mapa",
                      { action: "CRIAR_SETOR", ...values },
                      "Setor criado no mapa.",
                    );
                  }}
                >
                  <h3>Novo setor</h3>
                  <label>Nome<input name="nome" required placeholder="Setor C" /></label>
                  <label>Cor<input name="cor" type="color" defaultValue="#3b82f6" /></label>
                  <label>Posição<input name="ordem" type="number" min="0" max="99" defaultValue="3" /></label>
                  <button disabled={working}>Adicionar setor</button>
                </form>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = Object.fromEntries(
                      new FormData(event.currentTarget).entries(),
                    );
                    void submitJson(
                      "/api/pilot/estacionamento/mapa",
                      { action: "CRIAR_VAGAS", ...values },
                      "Vagas adicionadas ao mapa.",
                    );
                  }}
                >
                  <h3>Adicionar vagas</h3>
                  <label>Setor<select name="setorId" required defaultValue="">
                    <option value="" disabled>Selecione</option>
                    {sectors.map((sector) => (
                      <option key={sector.id} value={sector.id.split(":")[0]}>
                        {sector.name}
                      </option>
                    ))}
                  </select></label>
                  <label>Prefixo<input name="prefixo" required maxLength={5} placeholder="C" /></label>
                  <label>Quantidade<input name="quantidade" type="number" min="1" max="40" defaultValue="4" /></label>
                  <label>Tipo<select name="tipo"><option value="COMUM">Comum</option><option value="PCD">PCD</option><option value="IDOSO">Idoso</option><option value="RESERVADA">Reservada</option></select></label>
                  <button disabled={working}>Criar vagas</button>
                </form>
              </div>
              <p className="parking-future-note">
                Reserva com pagamento, cobrança adicional e punições permanecem
                desativadas. Essa etapa exigirá backend financeiro homologado.
              </p>
            </section>
          )}

          {mobileActions && (
            <div className="parking-mobile-overlay" role="presentation" onClick={() => setMobileActions(false)}>
              <section
                className="parking-mobile-actions"
                role="dialog"
                aria-modal="true"
                aria-label="Ações do estacionamento"
                onClick={(event) => event.stopPropagation()}
              >
                <header>
                  <div><small>ESTACIONAMENTO</small><h2>Ação rápida</h2></div>
                  <button onClick={() => setMobileActions(false)} aria-label="Fechar">×</button>
                </header>
                {canEntry && <button onClick={() => openAction(entryRef)}><span>↳</span><strong>Registrar entrada</strong></button>}
                {canExit && <button onClick={() => openAction(exitRef)}><span>↗</span><strong>Registrar saída</strong></button>}
                {canEdit && <button onClick={() => openAction(occurrenceRef)}><span>!</span><strong>Relatar problema</strong></button>}
                <button onClick={() => {
                  setMobileActions(false);
                  operatorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}><span>◎</span><strong>Ver meu acesso</strong></button>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}

async function readJson<T>(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
  tone: string;
}) {
  return <article className={`parking-metric tone-${tone}`}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></article>;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
