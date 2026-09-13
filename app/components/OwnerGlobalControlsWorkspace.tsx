"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./OwnerControlsWorkspaces.css";

type Catalogo = {
  chave: string;
  rotulo: string;
  descricao: string;
  tipo: string;
  critica: boolean;
  padrao: unknown;
  escopos: string[];
};

type Configuracao = {
  id: number;
  chave: string;
  rotulo: string;
  escopoTipo: string;
  escopoId: number;
  escopoNome: string | null;
  valor: unknown;
  versao: number;
  critica: boolean;
  motivo: string;
  alteradoPor: string | null;
  atualizadoEm: string;
};

type Flag = {
  id: number;
  chave: string;
  rotulo: string;
  critica: boolean;
  escopoTipo: string;
  escopoId: number;
  escopoNome: string | null;
  habilitado: boolean;
  iniciaEm: string | null;
  terminaEm: string | null;
  percentual: number | null;
  comunidades: number[];
  alteradoPor: string | null;
};

type HistoricoConfig = {
  id: number;
  chave: string;
  rotulo: string;
  escopoTipo: string;
  escopoId: number;
  valorAnterior: unknown;
  valorNovo: unknown;
  versao: number;
  motivo: string;
  critica: boolean;
  alteradoPor: string | null;
  criadoEm: string;
};

type HistoricoFlag = {
  id: number;
  chave: string;
  rotulo: string;
  escopoTipo: string;
  escopoId: number;
  habilitadoAnterior: boolean;
  habilitadoNovo: boolean;
  motivo: string;
  alteradoPor: string | null;
  criadoEm: string;
};

type Dados = {
  catalogo: Catalogo[];
  escopos: string[];
  modulos: { chave: string; rotulo: string }[];
  flagsConhecidas: { chave: string; rotulo: string; critica: boolean }[];
  configuracoes: Configuracao[];
  flags: Flag[];
  historicoConfiguracoes: HistoricoConfig[];
  historicoFlags: HistoricoFlag[];
  comunidades: { id: number; nome: string }[];
  geradoEm?: string;
};

/**
 * Controle global da plataforma: catálogo de configurações, feature flags com
 * liberação gradual, manutenção por escopo e reversão rápida pelo histórico.
 *
 * Alteração crítica exige motivo — a regra é validada no servidor; aqui o campo
 * só fica em evidência para a decisão não passar batida.
 */
export default function OwnerGlobalControlsWorkspace() {
  const [data, setData] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const [chave, setChave] = useState("");
  const [escopoTipo, setEscopoTipo] = useState("GLOBAL");
  const [escopoId, setEscopoId] = useState(0);
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");

  const [flagChave, setFlagChave] = useState("");
  const [flagEscopo, setFlagEscopo] = useState("GLOBAL");
  const [flagComunidade, setFlagComunidade] = useState(0);
  const [flagAtiva, setFlagAtiva] = useState(false);
  const [flagPercentual, setFlagPercentual] = useState("100");
  const [flagInicio, setFlagInicio] = useState("");
  const [flagFim, setFlagFim] = useState("");
  const [flagMotivo, setFlagMotivo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/proprietario/configuracoes", { cache: "no-store" });
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

  const selecionada = useMemo(
    () => (data?.catalogo || []).find((item) => item.chave === chave) || null,
    [data, chave],
  );

  const enviar = async (corpo: Record<string, unknown>, sucesso: string) => {
    setSaving(true);
    setError("");
    setAviso("");
    try {
      const response = await fetch("/api/proprietario/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");
      setAviso(sucesso);
      await load();
      return true;
    } catch (actionError) {
      setError((actionError as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const salvarConfiguracao = async () => {
    if (!selecionada) {
      setError("Escolha a configuração que quer alterar.");
      return;
    }
    const ok = await enviar(
      {
        action: "CONFIG_SET",
        chave,
        escopoTipo,
        escopoId: escopoTipo === "GLOBAL" ? 0 : escopoId,
        valor: selecionada.tipo === "BOOLEANO" ? valor === "true" : valor,
        motivo,
      },
      `${selecionada.rotulo} atualizada.`,
    );
    if (ok) setMotivo("");
  };

  const salvarFlag = async () => {
    if (!flagChave) {
      setError("Escolha a funcionalidade.");
      return;
    }
    const ok = await enviar(
      {
        action: "FLAG_SET",
        chave: flagChave,
        escopoTipo: flagEscopo,
        escopoId: flagEscopo === "GLOBAL" ? 0 : flagComunidade,
        habilitado: flagAtiva,
        percentual: Number(flagPercentual) || 0,
        iniciaEm: flagInicio || null,
        terminaEm: flagFim || null,
        motivo: flagMotivo,
      },
      "Funcionalidade atualizada.",
    );
    if (ok) setFlagMotivo("");
  };

  return (
    <section className="owner-directory-panel ctrl-workspace" aria-label="Configurações globais">
      <header className="owner-directory-header">
        <div>
          <strong>Controle global da plataforma</strong>
          <span>Configurações versionadas, feature flags e reversão rápida</span>
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
          <strong>{loading ? "Carregando configurações…" : "Sem dados"}</strong>
        </div>
      ) : (
        <>
          <section className="ctrl-block">
            <header>
              <p className="pilot-kicker">CONFIGURAÇÃO</p>
              <h2>Alterar uma configuração</h2>
            </header>
            <div className="ctrl-form">
              <label>
                <span>Configuração</span>
                <select
                  value={chave}
                  onChange={(event) => {
                    const proxima = event.target.value;
                    setChave(proxima);
                    const item = (data.catalogo || []).find((c) => c.chave === proxima);
                    setEscopoTipo(item?.escopos[0] || "GLOBAL");
                    setValor("");
                  }}
                >
                  <option value="">Selecione…</option>
                  {data.catalogo.map((item) => (
                    <option key={item.chave} value={item.chave}>
                      {item.rotulo}
                      {item.critica ? " · crítica" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selecionada && (
                <>
                  <label>
                    <span>Escopo</span>
                    <select
                      value={escopoTipo}
                      onChange={(event) => setEscopoTipo(event.target.value)}
                    >
                      {selecionada.escopos.map((item) => (
                        <option key={item} value={item}>
                          {item === "GLOBAL"
                            ? "Toda a plataforma"
                            : item === "COMUNIDADE"
                              ? "Uma comunidade"
                              : "Um módulo"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {escopoTipo === "COMUNIDADE" && (
                    <label>
                      <span>Comunidade</span>
                      <select
                        value={escopoId}
                        onChange={(event) => setEscopoId(Number(event.target.value))}
                      >
                        <option value={0}>Selecione…</option>
                        {data.comunidades.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {escopoTipo === "MODULO" && (
                    <label>
                      <span>Módulo</span>
                      <select
                        value={escopoId}
                        onChange={(event) => setEscopoId(Number(event.target.value))}
                      >
                        <option value={0}>Selecione…</option>
                        {data.modulos.map((item, indice) => (
                          <option key={item.chave} value={indice + 1}>
                            {item.rotulo}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    <span>Valor</span>
                    {selecionada.tipo === "BOOLEANO" ? (
                      <select value={valor} onChange={(event) => setValor(event.target.value)}>
                        <option value="false">Desativado</option>
                        <option value="true">Ativado</option>
                      </select>
                    ) : (
                      <input
                        value={valor}
                        onChange={(event) => setValor(event.target.value)}
                        placeholder={
                          selecionada.tipo === "VERSAO" ? "Ex.: 1.4.0" : "Valor"
                        }
                      />
                    )}
                  </label>
                  <label className="ctrl-wide">
                    <span>
                      Motivo{selecionada.critica ? " (obrigatório nesta configuração)" : ""}
                    </span>
                    <input
                      value={motivo}
                      onChange={(event) => setMotivo(event.target.value)}
                      placeholder="Por que esta mudança está sendo feita"
                    />
                  </label>
                </>
              )}
              <button
                type="button"
                className="ctrl-primary"
                onClick={() => void salvarConfiguracao()}
                disabled={saving || !chave}
              >
                {saving ? "Salvando…" : "Salvar configuração"}
              </button>
            </div>
            {selecionada && (
              <p className="ctrl-hint">
                {selecionada.descricao}
                {selecionada.critica && (
                  <b className="ctrl-tag critical"> alteração crítica · gera auditoria</b>
                )}
              </p>
            )}
          </section>

          <section className="ctrl-block">
            <header>
              <p className="pilot-kicker">VALORES VIGENTES</p>
              <h2>O que está configurado agora</h2>
            </header>
            {data.configuracoes.length === 0 ? (
              <p className="ctrl-quiet">
                Nenhuma configuração alterada — tudo segue o valor padrão do catálogo.
              </p>
            ) : (
              <div className="ctrl-table-wrap">
                <table className="ctrl-table">
                  <thead>
                    <tr>
                      <th>Configuração</th>
                      <th>Escopo</th>
                      <th>Valor</th>
                      <th>Versão</th>
                      <th>Alterado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.configuracoes.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Configuração">
                          {item.rotulo}
                          {item.critica && <b className="ctrl-tag critical">crítica</b>}
                        </td>
                        <td data-label="Escopo">
                          {item.escopoTipo === "GLOBAL"
                            ? "Plataforma"
                            : item.escopoNome || `#${item.escopoId}`}
                        </td>
                        <td data-label="Valor">{formatarValor(item.valor)}</td>
                        <td data-label="Versão">v{item.versao}</td>
                        <td data-label="Alterado por">{item.alteradoPor || "Sistema"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="ctrl-block">
            <header>
              <p className="pilot-kicker">FUNCIONALIDADES</p>
              <h2>Feature flags e liberação gradual</h2>
            </header>
            <p className="ctrl-quiet">
              O percentual de liberação é determinístico por comunidade: a mesma
              comunidade recebe sempre a mesma resposta, então ninguém entra e sai do
              teste entre uma tela e outra.
            </p>
            <div className="ctrl-form">
              <label>
                <span>Funcionalidade</span>
                <select value={flagChave} onChange={(event) => setFlagChave(event.target.value)}>
                  <option value="">Selecione…</option>
                  {data.flagsConhecidas.map((item) => (
                    <option key={item.chave} value={item.chave}>
                      {item.rotulo}
                      {item.critica ? " · crítica" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Escopo</span>
                <select value={flagEscopo} onChange={(event) => setFlagEscopo(event.target.value)}>
                  <option value="GLOBAL">Toda a plataforma</option>
                  <option value="COMUNIDADE">Uma comunidade</option>
                </select>
              </label>
              {flagEscopo === "COMUNIDADE" && (
                <label>
                  <span>Comunidade</span>
                  <select
                    value={flagComunidade}
                    onChange={(event) => setFlagComunidade(Number(event.target.value))}
                  >
                    <option value={0}>Selecione…</option>
                    {data.comunidades.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span>Estado</span>
                <select
                  value={flagAtiva ? "true" : "false"}
                  onChange={(event) => setFlagAtiva(event.target.value === "true")}
                >
                  <option value="false">Desligada</option>
                  <option value="true">Ligada</option>
                </select>
              </label>
              <label>
                <span>Liberação (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={flagPercentual}
                  onChange={(event) => setFlagPercentual(event.target.value)}
                />
              </label>
              <label>
                <span>Início</span>
                <input
                  type="date"
                  value={flagInicio}
                  onChange={(event) => setFlagInicio(event.target.value)}
                />
              </label>
              <label>
                <span>Fim</span>
                <input
                  type="date"
                  value={flagFim}
                  onChange={(event) => setFlagFim(event.target.value)}
                />
              </label>
              <label className="ctrl-wide">
                <span>Motivo</span>
                <input
                  value={flagMotivo}
                  onChange={(event) => setFlagMotivo(event.target.value)}
                  placeholder="Por que esta liberação está sendo feita"
                />
              </label>
              <button
                type="button"
                className="ctrl-primary"
                onClick={() => void salvarFlag()}
                disabled={saving || !flagChave}
              >
                {saving ? "Salvando…" : "Aplicar"}
              </button>
            </div>

            {data.flags.length === 0 ? (
              <p className="ctrl-quiet">Nenhuma funcionalidade com estado registrado.</p>
            ) : (
              <div className="ctrl-table-wrap">
                <table className="ctrl-table">
                  <thead>
                    <tr>
                      <th>Funcionalidade</th>
                      <th>Escopo</th>
                      <th>Estado</th>
                      <th>Liberação</th>
                      <th>Janela</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.flags.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Funcionalidade">
                          {item.rotulo}
                          {item.critica && <b className="ctrl-tag critical">crítica</b>}
                        </td>
                        <td data-label="Escopo">
                          {item.escopoTipo === "GLOBAL"
                            ? "Plataforma"
                            : item.escopoNome || `#${item.escopoId}`}
                        </td>
                        <td data-label="Estado">
                          <b className={item.habilitado ? "ctrl-tag ok" : "ctrl-tag off"}>
                            {item.habilitado ? "Ligada" : "Desligada"}
                          </b>
                        </td>
                        <td data-label="Liberação">
                          {item.percentual === null ? "100%" : `${item.percentual}%`}
                        </td>
                        <td data-label="Janela">
                          {item.iniciaEm || item.terminaEm
                            ? `${item.iniciaEm || "—"} → ${item.terminaEm || "—"}`
                            : "Sem janela"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="ctrl-block">
            <header>
              <p className="pilot-kicker">REVERSÃO RÁPIDA</p>
              <h2>Histórico de alterações</h2>
            </header>
            <p className="ctrl-quiet">
              Reverter reaplica um estado já registrado e gera um novo registro: a
              trilha não é reescrita nem apagada.
            </p>
            {data.historicoConfiguracoes.length === 0 && data.historicoFlags.length === 0 ? (
              <p className="ctrl-quiet">Nenhuma alteração registrada ainda.</p>
            ) : (
              <ul className="ctrl-history">
                {data.historicoConfiguracoes.map((item) => (
                  <li key={`c-${item.id}`} data-critica={item.critica ? "1" : "0"}>
                    <div>
                      <strong>
                        {item.rotulo}
                        {item.critica && <b className="ctrl-tag critical">crítica</b>}
                      </strong>
                      <p>
                        {formatarValor(item.valorAnterior)} → {formatarValor(item.valorNovo)} ·
                        v{item.versao}
                      </p>
                      <small>
                        {item.alteradoPor || "Sistema"} · {formatarData(item.criadoEm)}
                        {item.motivo ? ` · ${item.motivo}` : ""}
                      </small>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Reverter "${item.rotulo}" para o valor anterior (${formatarValor(item.valorAnterior)})?`,
                          )
                        )
                          return;
                        void enviar(
                          { action: "CONFIG_ROLLBACK", historicoId: item.id, motivo: "Reversão pelo histórico" },
                          `${item.rotulo} revertida.`,
                        );
                      }}
                    >
                      Reverter
                    </button>
                  </li>
                ))}
                {data.historicoFlags.map((item) => (
                  <li key={`f-${item.id}`}>
                    <div>
                      <strong>{item.rotulo}</strong>
                      <p>
                        {item.habilitadoAnterior ? "Ligada" : "Desligada"} →{" "}
                        {item.habilitadoNovo ? "Ligada" : "Desligada"}
                      </p>
                      <small>
                        {item.alteradoPor || "Sistema"} · {formatarData(item.criadoEm)}
                        {item.motivo ? ` · ${item.motivo}` : ""}
                      </small>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        if (!window.confirm(`Reverter "${item.rotulo}" para o estado anterior?`))
                          return;
                        void enviar(
                          { action: "FLAG_ROLLBACK", historicoId: item.id, motivo: "Reversão pelo histórico" },
                          `${item.rotulo} revertida.`,
                        );
                      }}
                    >
                      Reverter
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function formatarValor(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Ativado" : "Desativado";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
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
