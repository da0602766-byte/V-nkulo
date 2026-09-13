"use client";

import { useCallback, useEffect, useState } from "react";
import "./OwnerControlsWorkspaces.css";

type Limite = {
  usado: number;
  teto: number;
  percentual: number | null;
  nivel: string;
};

type Comunidade = {
  id: number;
  nome: string;
  slug: string;
  status: string;
  statusRotulo: string;
  criadoEm: string;
  dono: { id: number; nome: string };
  manutencao: { ativa: boolean; motivo: string; ate: string | null };
  assinatura: {
    planoId: number;
    plano: string;
    status: string;
    renovaEm: string | null;
    testeAte: string | null;
  } | null;
  limites: Record<string, number>;
  consumo: {
    membros: Limite;
    publicacoes: Limite;
    eventos: Limite;
    armazenamentoMb: Limite;
  };
  atividade: { membros: number; ativos30d: number };
  problemas: { incidentes: number; criticos: number; ultima: string };
};

type Dados = {
  comunidades: Comunidade[];
  limitesDisponiveis: { chave: string; rotulo: string }[];
  statusDisponiveis: string[];
  rotulosStatus: Record<string, string>;
  semMedicao: string[];
  geradoEm: string;
};

/**
 * Situação administrativa de cada comunidade e as ações do proprietário sobre
 * ela. Só contagens e metadados: nenhum conteúdo de comunidade é lido aqui.
 */
export default function OwnerCommunityAdminWorkspace() {
  const [data, setData] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [aberta, setAberta] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [horas, setHoras] = useState("4");
  const [novoDono, setNovoDono] = useState("");
  const [limites, setLimites] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/proprietario/comunidades", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar.");
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

  // Trocar de comunidade limpa os campos, para um motivo digitado para uma não
  // ser enviado para outra. Dentro do setTimeout por causa da regra de lint do
  // projeto contra setState síncrono em efeito.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMotivo("");
      setNovoDono("");
      setHoras("4");
      const alvo = (data?.comunidades || []).find((item) => item.id === aberta);
      setLimites(
        Object.fromEntries(
          (data?.limitesDisponiveis || []).map((limite) => [
            limite.chave,
            String(alvo?.limites?.[limite.chave] ?? ""),
          ]),
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [aberta, data]);

  const agir = async (
    comunidadeId: number,
    corpo: Record<string, unknown>,
    sucesso: string,
  ) => {
    setSaving(comunidadeId);
    setError("");
    setAviso("");
    try {
      const response = await fetch("/api/proprietario/comunidades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comunidadeId, ...corpo }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir.");
      setAviso(sucesso);
      setMotivo("");
      await load();
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setSaving(0);
    }
  };

  return (
    <section className="owner-directory-panel ctrl-workspace" aria-label="Gestão de comunidades">
      <header className="owner-directory-header">
        <div>
          <strong>Situação administrativa das comunidades</strong>
          <span>
            {data ? `${data.comunidades.length} comunidade(s)` : "Carregando"} · plano,
            consumo, manutenção e problemas técnicos
          </span>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </header>

      {error && (
        <p className="operations-feedback error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="operations-feedback" role="status">
          {aviso}
        </p>
      )}

      {!data ? (
        <div className="owner-empty" role="status">
          <span>◌</span>
          <strong>{loading ? "Carregando comunidades…" : "Sem dados"}</strong>
        </div>
      ) : data.comunidades.length === 0 ? (
        <div className="owner-empty" role="status">
          <span>◌</span>
          <strong>Nenhuma comunidade cadastrada</strong>
          <p>As comunidades aparecem aqui depois de aprovadas.</p>
        </div>
      ) : (
        <>
          <div className="ctrl-table-wrap">
            <table className="ctrl-table">
              <thead>
                <tr>
                  <th>Comunidade</th>
                  <th>Situação</th>
                  <th>Plano</th>
                  <th>Membros / limite</th>
                  <th>Ativos (30d)</th>
                  <th>Problemas</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.comunidades.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Comunidade">
                      <strong>{item.nome}</strong>
                      <small className="ctrl-sub">Dono: {item.dono.nome}</small>
                    </td>
                    <td data-label="Situação">
                      <b className={`ctrl-tag ${classeStatus(item.status)}`}>
                        {item.statusRotulo}
                      </b>
                      {item.manutencao.ativa && item.manutencao.ate && (
                        <small className="ctrl-sub">até {formatarData(item.manutencao.ate)}</small>
                      )}
                    </td>
                    <td data-label="Plano">
                      {item.assinatura ? (
                        <>
                          {item.assinatura.plano}
                          <small className="ctrl-sub">{item.assinatura.status}</small>
                        </>
                      ) : (
                        <span className="ctrl-quiet">Sem assinatura</span>
                      )}
                    </td>
                    <td data-label="Membros / limite">
                      {item.consumo.membros.teto
                        ? `${item.consumo.membros.usado} / ${item.consumo.membros.teto}`
                        : `${item.consumo.membros.usado} · sem limite`}
                      {item.consumo.membros.percentual !== null && (
                        <small
                          className={`ctrl-sub ${
                            item.consumo.membros.nivel === "ESTOURADO"
                              ? "bad"
                              : item.consumo.membros.nivel === "ATENCAO"
                                ? "warn"
                                : ""
                          }`}
                        >
                          {item.consumo.membros.percentual}% do limite
                        </small>
                      )}
                    </td>
                    <td data-label="Ativos (30d)">{item.atividade.ativos30d}</td>
                    <td data-label="Problemas">
                      {item.problemas.incidentes === 0 ? (
                        <span className="ctrl-quiet">—</span>
                      ) : (
                        <b
                          className={`ctrl-tag ${item.problemas.criticos ? "critical" : "warn"}`}
                        >
                          {item.problemas.incidentes} aberto(s)
                          {item.problemas.criticos ? ` · ${item.problemas.criticos} crítico(s)` : ""}
                        </b>
                      )}
                    </td>
                    <td data-label="Ações">
                      <button
                        type="button"
                        onClick={() => setAberta(aberta === item.id ? 0 : item.id)}
                      >
                        {aberta === item.id ? "Fechar" : "Administrar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.comunidades
            .filter((item) => item.id === aberta)
            .map((item) => (
              <section className="ctrl-block ctrl-admin" key={item.id}>
                <header>
                  <p className="pilot-kicker">ADMINISTRAR</p>
                  <h2>{item.nome}</h2>
                </header>
                <p className="ctrl-quiet">
                  Manutenção, arquivamento, bloqueio e transferência de propriedade
                  exigem motivo com pelo menos 10 caracteres — a validação é feita no
                  servidor e a ação vai para a auditoria.
                </p>

                <label className="ctrl-wide">
                  <span>Motivo</span>
                  <input
                    value={motivo}
                    onChange={(event) => setMotivo(event.target.value)}
                    placeholder="Por que esta ação está sendo tomada"
                  />
                </label>

                <div className="ctrl-actions">
                  {item.manutencao.ativa ? (
                    <button
                      type="button"
                      disabled={saving === item.id}
                      onClick={() =>
                        void agir(
                          item.id,
                          { action: "CLEAR_MAINTENANCE", motivo },
                          "Manutenção encerrada.",
                        )
                      }
                    >
                      Encerrar manutenção
                    </button>
                  ) : (
                    <>
                      <label className="ctrl-inline">
                        <span>Horas</span>
                        <input
                          type="number"
                          min={1}
                          max={720}
                          value={horas}
                          onChange={(event) => setHoras(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={saving === item.id}
                        onClick={() =>
                          void agir(
                            item.id,
                            { action: "SET_MAINTENANCE", motivo, horas: Number(horas) || 4 },
                            "Comunidade em manutenção.",
                          )
                        }
                      >
                        Colocar em manutenção
                      </button>
                    </>
                  )}

                  {item.status === "SUSPENSA" ? (
                    <button
                      type="button"
                      disabled={saving === item.id}
                      onClick={() =>
                        void agir(item.id, { action: "UNBLOCK", motivo }, "Bloqueio removido.")
                      }
                    >
                      Remover bloqueio
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ctrl-danger"
                      disabled={saving === item.id}
                      onClick={() => {
                        if (!window.confirm(`Bloquear administrativamente "${item.nome}"?`)) return;
                        void agir(item.id, { action: "BLOCK", motivo }, "Comunidade bloqueada.");
                      }}
                    >
                      Bloquear
                    </button>
                  )}

                  {item.status !== "ARQUIVADA" && (
                    <button
                      type="button"
                      className="ctrl-danger"
                      disabled={saving === item.id}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Arquivar "${item.nome}"? A comunidade sai de operação e os dados são preservados.`,
                          )
                        )
                          return;
                        void agir(item.id, { action: "ARCHIVE", motivo }, "Comunidade arquivada.");
                      }}
                    >
                      Arquivar
                    </button>
                  )}
                </div>

                <div className="ctrl-subblock">
                  <strong>Limites da comunidade</strong>
                  <div className="ctrl-form">
                    {data.limitesDisponiveis.map((limite) => (
                      <label key={limite.chave}>
                        <span>
                          {limite.rotulo}
                          {data.semMedicao.includes(limite.chave) ? " (sem medição)" : ""}
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={limites[limite.chave] ?? ""}
                          placeholder="0 = sem limite"
                          onChange={(event) =>
                            setLimites((atual) => ({
                              ...atual,
                              [limite.chave]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      className="ctrl-primary"
                      disabled={saving === item.id}
                      onClick={() =>
                        void agir(
                          item.id,
                          { action: "SET_LIMITS", limites, motivo },
                          "Limites atualizados.",
                        )
                      }
                    >
                      Salvar limites
                    </button>
                  </div>
                  <p className="ctrl-quiet">
                    Zero significa sem limite. O armazenamento aceita um teto, mas o
                    consumo depende de medição do provedor e por isso aparece em zero em
                    vez de um valor estimado.
                  </p>
                </div>

                <div className="ctrl-subblock">
                  <strong>Redefinir o Dono da Comunidade</strong>
                  <p className="ctrl-quiet">
                    Dono atual: {item.dono.nome}. O novo dono precisa ser uma conta ativa
                    e já vinculada a esta comunidade — a checagem é feita no servidor,
                    justamente para a transferência não virar entrada para alguém de fora.
                  </p>
                  <div className="ctrl-form">
                    <label>
                      <span>ID da pessoa</span>
                      <input
                        type="number"
                        min={1}
                        value={novoDono}
                        onChange={(event) => setNovoDono(event.target.value)}
                        placeholder="ID do novo dono"
                      />
                    </label>
                    <button
                      type="button"
                      className="ctrl-danger"
                      disabled={saving === item.id || !novoDono}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Transferir a propriedade de "${item.nome}" para a pessoa #${novoDono}?`,
                          )
                        )
                          return;
                        void agir(
                          item.id,
                          { action: "TRANSFER_OWNER", novoDonoId: Number(novoDono), motivo },
                          "Propriedade transferida.",
                        );
                      }}
                    >
                      Transferir propriedade
                    </button>
                  </div>
                </div>
              </section>
            ))}

          <p className="ctrl-updated">Atualizado em {formatarData(data.geradoEm)}</p>
        </>
      )}
    </section>
  );
}

function classeStatus(status: string) {
  if (status === "ATIVA") return "ok";
  if (status === "MANUTENCAO") return "warn";
  if (status === "SUSPENSA") return "critical";
  return "off";
}

function formatarData(value: string) {
  if (!value) return "—";
  const data = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(data.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}
