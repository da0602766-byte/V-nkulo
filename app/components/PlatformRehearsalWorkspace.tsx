"use client";

import { useCallback, useEffect, useState } from "react";
import {
  COMMUNITY_PALETTES,
  type CommunityPaletteId,
} from "../lib/community-theme";
import {
  COMMUNITY_MODULES,
  DEFAULT_COMMUNITY_MODULES,
  type CommunityModuleKey,
} from "../lib/community-modules";
import { ENSAIO_ASSUNTOS, type EnsaioAssunto } from "../lib/platform-rehearsal";

type Ensaio = {
  id: number;
  assunto: string;
  titulo: string;
  valor_json: string;
  estado: "RASCUNHO" | "PUBLICADO" | "REVERTIDO";
  alvo_tipo: string;
  alvo_json: string;
  observacao: string;
  criado_em: string;
  publicado_em: string | null;
  revertido_em: string | null;
  comunidades_afetadas: number;
  criado_por_nome: string | null;
  publicado_por_nome: string | null;
  reversivel: boolean;
};

type Comunidade = { id: number; nome: string };

export default function PlatformRehearsalWorkspace() {
  const [ensaios, setEnsaios] = useState<Ensaio[]>([]);
  const [comunidades, setComunidades] = useState<Comunidade[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [trabalhando, setTrabalhando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [assunto, setAssunto] = useState<EnsaioAssunto>("tema");
  const [titulo, setTitulo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [paleta, setPaleta] = useState<CommunityPaletteId>("CLASSICO");
  const [modulos, setModulos] = useState<CommunityModuleKey[]>(DEFAULT_COMMUNITY_MODULES);
  const [alvoTipo, setAlvoTipo] = useState<"TODAS" | "ESPECIFICAS">("TODAS");
  const [alvoIds, setAlvoIds] = useState<number[]>([]);
  const [confirmando, setConfirmando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await fetch("/api/pilot/plataforma-ensaios", { cache: "no-store" });
      const dados = (await resposta.json()) as {
        ensaios?: Ensaio[];
        comunidades?: Comunidade[];
        podeEditar?: boolean;
        error?: string;
      };
      if (!resposta.ok) throw new Error(dados.error || "Falha ao carregar os ensaios.");
      setEnsaios(dados.ensaios || []);
      setComunidades(dados.comunidades || []);
      setPodeEditar(Boolean(dados.podeEditar));
      setErro("");
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(timer);
  }, [carregar]);

  async function criarRascunho() {
    setTrabalhando(true);
    setMensagem("");
    setErro("");
    try {
      const resposta = await fetch("/api/pilot/plataforma-ensaios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assunto,
          titulo,
          observacao,
          valor: assunto === "tema" ? { paletteId: paleta } : modulos,
          alvoTipo,
          alvoIds,
        }),
      });
      const dados = (await resposta.json()) as { error?: string };
      if (!resposta.ok) throw new Error(dados.error || "Não foi possível criar o rascunho.");
      setTitulo("");
      setObservacao("");
      setMensagem("Rascunho criado. Nada foi aplicado ainda.");
      await carregar();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setTrabalhando(false);
    }
  }

  async function agir(id: number, acao: "PUBLICAR" | "REVERTER") {
    setTrabalhando(true);
    setMensagem("");
    setErro("");
    try {
      const resposta = await fetch("/api/pilot/plataforma-ensaios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao }),
      });
      const dados = (await resposta.json()) as {
        error?: string;
        comunidades?: number;
        chaves?: number;
      };
      if (!resposta.ok) throw new Error(dados.error || "A ação não foi concluída.");
      setMensagem(
        acao === "PUBLICAR"
          ? `Publicado em ${dados.comunidades} comunidade(s). Dá para reverter enquanto for o ensaio mais recente deste assunto.`
          : `Revertido: ${dados.chaves} configuração(ões) voltaram ao valor anterior.`,
      );
      setConfirmando(null);
      await carregar();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setTrabalhando(false);
    }
  }

  async function descartar(id: number) {
    setTrabalhando(true);
    try {
      const resposta = await fetch(`/api/pilot/plataforma-ensaios?id=${id}`, {
        method: "DELETE",
      });
      const dados = (await resposta.json()) as { error?: string };
      if (!resposta.ok) throw new Error(dados.error || "Não foi possível descartar.");
      await carregar();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setTrabalhando(false);
    }
  }

  const alvoDescrito =
    alvoTipo === "TODAS"
      ? `${comunidades.length} comunidade(s) — todas as ativas`
      : `${alvoIds.length} comunidade(s) escolhida(s)`;

  return (
    <section className="rehearsal-v6">
      <header className="rehearsal-intro-v6">
        <div>
          <p className="pilot-kicker">AMBIENTE DE ENSAIO</p>
          <h2>Altere aqui, veja, e só então publique</h2>
          <p>
            Um rascunho não toca em nenhuma comunidade. Ao publicar, o valor que
            existia antes é guardado comunidade por comunidade — é isso que
            permite voltar atrás em um clique.
          </p>
        </div>
      </header>

      {erro && <p className="pilot-form-message" role="alert">{erro}</p>}
      {mensagem && <p className="pilot-form-message" role="status">{mensagem}</p>}

      {podeEditar && (
        <form
          className="rehearsal-form-v6"
          onSubmit={(evento) => {
            evento.preventDefault();
            void criarRascunho();
          }}
        >
          <div className="rehearsal-field-v6">
            <label htmlFor="ensaio-assunto">O que vai mudar</label>
            <select
              id="ensaio-assunto"
              value={assunto}
              onChange={(evento) => setAssunto(evento.target.value as EnsaioAssunto)}
            >
              {ENSAIO_ASSUNTOS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <small>{ENSAIO_ASSUNTOS.find((item) => item.id === assunto)?.descricao}</small>
          </div>

          <div className="rehearsal-field-v6">
            <label htmlFor="ensaio-titulo">Nome do ensaio</label>
            <input
              id="ensaio-titulo"
              value={titulo}
              onChange={(evento) => setTitulo(evento.target.value)}
              maxLength={120}
              placeholder="Ex.: paleta Serenidade para as comunidades novas"
              required
            />
          </div>

          {assunto === "tema" ? (
            <div className="rehearsal-field-v6 rehearsal-wide-v6">
              <label>Paleta</label>
              <div className="rehearsal-palette-v6">
                {COMMUNITY_PALETTES.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={paleta === item.id ? "active" : ""}
                    aria-pressed={paleta === item.id}
                    onClick={() => setPaleta(item.id)}
                  >
                    <span
                      className="rehearsal-swatch-v6"
                      aria-hidden="true"
                      style={{
                        background: `linear-gradient(135deg, ${item.light.primary}, ${item.light.accent})`,
                      }}
                    />
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rehearsal-field-v6 rehearsal-wide-v6">
              <label>Módulos que ficam ativos</label>
              <div className="rehearsal-modules-v6">
                {COMMUNITY_MODULES.map((item) => (
                  <label key={item.key}>
                    <input
                      type="checkbox"
                      checked={modulos.includes(item.key)}
                      onChange={(evento) =>
                        setModulos((atual) =>
                          evento.target.checked
                            ? [...atual, item.key]
                            : atual.filter((chave) => chave !== item.key),
                        )
                      }
                    />
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="rehearsal-field-v6 rehearsal-wide-v6">
            <label>Quem recebe</label>
            <div className="rehearsal-target-v6">
              <button
                type="button"
                className={alvoTipo === "TODAS" ? "active" : ""}
                aria-pressed={alvoTipo === "TODAS"}
                onClick={() => setAlvoTipo("TODAS")}
              >
                Todas as comunidades
              </button>
              <button
                type="button"
                className={alvoTipo === "ESPECIFICAS" ? "active" : ""}
                aria-pressed={alvoTipo === "ESPECIFICAS"}
                onClick={() => setAlvoTipo("ESPECIFICAS")}
              >
                Escolher comunidades
              </button>
            </div>
            {alvoTipo === "ESPECIFICAS" && (
              <div className="rehearsal-communities-v6">
                {comunidades.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={alvoIds.includes(item.id)}
                      onChange={(evento) =>
                        setAlvoIds((atual) =>
                          evento.target.checked
                            ? [...atual, item.id]
                            : atual.filter((id) => id !== item.id),
                        )
                      }
                    />
                    {item.nome}
                  </label>
                ))}
                {!comunidades.length && <small>Nenhuma comunidade ativa.</small>}
              </div>
            )}
          </div>

          <div className="rehearsal-field-v6 rehearsal-wide-v6">
            <label htmlFor="ensaio-observacao">Por que esta mudança</label>
            <input
              id="ensaio-observacao"
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              maxLength={400}
              placeholder="Fica no histórico, para quem for reverter entender o motivo"
            />
          </div>

          <footer className="rehearsal-actions-v6">
            <p className="form-consequence-v5">
              <span aria-hidden="true">◉</span>
              Cria um rascunho. <strong>Nada é aplicado agora</strong> — o alvo
              seria {alvoDescrito}.
            </p>
            <button disabled={trabalhando || !titulo.trim()}>
              {trabalhando ? "Salvando…" : "Criar rascunho"}
            </button>
          </footer>
        </form>
      )}

      <section className="rehearsal-history-v6">
        <header><h3>Ensaios e publicações</h3></header>
        {carregando && <p>Carregando…</p>}
        {!carregando && !ensaios.length && (
          <p className="rehearsal-empty-v6">
            Nenhum ensaio ainda. O primeiro rascunho não muda nada até você publicar.
          </p>
        )}
        <ul>
          {ensaios.map((item) => (
            <li key={item.id} data-estado={item.estado}>
              <div className="rehearsal-item-head-v6">
                <span className="rehearsal-state-v6" data-estado={item.estado}>
                  {item.estado === "RASCUNHO"
                    ? "Rascunho"
                    : item.estado === "PUBLICADO"
                      ? "No ar"
                      : "Revertido"}
                </span>
                <strong>{item.titulo}</strong>
                <small>
                  {ENSAIO_ASSUNTOS.find((a) => a.id === item.assunto)?.label || item.assunto}
                  {" · "}
                  {item.alvo_tipo === "TODAS" ? "todas as comunidades" : "comunidades escolhidas"}
                  {item.estado !== "RASCUNHO" && ` · ${item.comunidades_afetadas} atingida(s)`}
                </small>
              </div>
              {item.observacao && <p className="rehearsal-note-v6">{item.observacao}</p>}
              <div className="rehearsal-item-actions-v6">
                {podeEditar && item.estado === "RASCUNHO" && (
                  <>
                    {confirmando === item.id ? (
                      <>
                        <span className="rehearsal-confirm-v6">
                          Publicar agora? Dá para reverter depois.
                        </span>
                        <button type="button" disabled={trabalhando} onClick={() => void agir(item.id, "PUBLICAR")}>
                          Confirmar publicação
                        </button>
                        <button type="button" className="ghost" onClick={() => setConfirmando(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => setConfirmando(item.id)}>
                          Publicar
                        </button>
                        <button type="button" className="ghost" disabled={trabalhando} onClick={() => void descartar(item.id)}>
                          Descartar
                        </button>
                      </>
                    )}
                  </>
                )}
                {podeEditar && item.estado === "PUBLICADO" && item.reversivel && (
                  <button type="button" className="rehearsal-revert-v6" disabled={trabalhando} onClick={() => void agir(item.id, "REVERTER")}>
                    Reverter para o valor anterior
                  </button>
                )}
                {item.estado === "PUBLICADO" && !item.reversivel && (
                  <small className="rehearsal-locked-v6">
                    Outro ensaio deste assunto foi publicado depois. Reverta o mais recente primeiro.
                  </small>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
