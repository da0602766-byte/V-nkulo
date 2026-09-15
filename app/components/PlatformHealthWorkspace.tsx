"use client";

import { useCallback, useEffect, useState } from "react";

type Rota = { rota: string; total: number; erros: number; falhas: number };

type Resumo = {
  total: number;
  porClasse: Record<string, number>;
  taxaErro: number;
  taxaFalha: number;
  rotas: Rota[];
  horas: number;
};

type PontoSerie = { janela: string; "2xx": number; "3xx": number; "4xx": number; "5xx": number };

type Janela = "24h" | "7d";

export default function PlatformHealthWorkspace() {
  const [janela, setJanela] = useState<Janela>("24h");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [serie, setSerie] = useState<PontoSerie[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [recarga, setRecarga] = useState(0);

  // A regra de lint do projeto recusa `setState` síncrono dentro de um efeito
  // (dispara renderização em cascata). Por isso o efeito abaixo só mexe em
  // estado depois do `await`, e quem liga o "carregando" é o manipulador do
  // clique — ver a mesma armadilha registrada em COORDENACAO_IA.md.
  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const resposta = await fetch(`/api/proprietario/saude?janela=${janela}`, {
          cache: "no-store",
        });
        const dados = await resposta.json();
        if (!ativo) return;
        if (!resposta.ok) {
          throw new Error(dados?.error || "Não foi possível ler os indicadores.");
        }
        setResumo(dados.resumo);
        setSerie(dados.serie || []);
        setErro("");
      } catch (falha) {
        if (!ativo) return;
        setErro(falha instanceof Error ? falha.message : "Não foi possível ler os indicadores.");
      } finally {
        // Trocar de janela antes da resposta chegar não pode deixar a tela
        // exibindo o número da janela anterior.
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [janela, recarga]);

  const recarregar = useCallback((proxima?: Janela) => {
    setCarregando(true);
    if (proxima) setJanela(proxima);
    else setRecarga((valor) => valor + 1);
  }, []);

  const picoSerie = Math.max(1, ...serie.map((ponto) => somaPonto(ponto)));

  return (
    <section className="owner-health-panel">
      <header>
        <div>
          <h2>Saúde técnica</h2>
          <p>
            Contagem de respostas das rotas de API. Mostra se a taxa de erro
            mudou e qual rota está falhando — não guarda quem acessou o quê.
          </p>
        </div>
        <div className="owner-health-window">
          <button
            type="button"
            className={janela === "24h" ? "active" : ""}
            onClick={() => recarregar("24h")}
          >
            24 horas
          </button>
          <button
            type="button"
            className={janela === "7d" ? "active" : ""}
            onClick={() => recarregar("7d")}
          >
            7 dias
          </button>
          <button type="button" className="secondary" onClick={() => recarregar()} disabled={carregando}>
            {carregando ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {erro && <p className="owner-health-error" role="alert">{erro}</p>}

      {resumo && resumo.total === 0 && !carregando && (
        <p className="owner-health-empty" role="note">
          Nenhuma requisição registrada nesta janela. A contagem começa depois
          que a versão com medição entra no ar; registros com mais de sete dias
          são descartados.
        </p>
      )}

      {resumo && resumo.total > 0 && (
        <>
          <div className="owner-health-cards">
            <article>
              <small>Requisições</small>
              <strong>{resumo.total.toLocaleString("pt-BR")}</strong>
              <span>últimas {resumo.horas} horas</span>
            </article>
            <article className={resumo.taxaFalha > 1 ? "alerta" : ""}>
              <small>Falhas do servidor</small>
              <strong>{resumo.taxaFalha}%</strong>
              <span>{(resumo.porClasse["5xx"] || 0).toLocaleString("pt-BR")} respostas 5xx</span>
            </article>
            <article>
              <small>Recusas</small>
              <strong>{resumo.taxaErro}%</strong>
              <span>{(resumo.porClasse["4xx"] || 0).toLocaleString("pt-BR")} respostas 4xx</span>
            </article>
            <article>
              <small>Sucesso</small>
              <strong>{(resumo.porClasse["2xx"] || 0).toLocaleString("pt-BR")}</strong>
              <span>respostas 2xx</span>
            </article>
          </div>

          {serie.length > 1 && (
            <div className="owner-health-series" role="img" aria-label="Volume de respostas por hora">
              {serie.map((ponto) => {
                const total = somaPonto(ponto);
                const falhas = ponto["5xx"] || 0;
                return (
                  <span
                    key={ponto.janela}
                    title={`${ponto.janela}h — ${total} respostas, ${falhas} falhas`}
                    style={{ height: `${Math.max(4, (total / picoSerie) * 100)}%` }}
                    className={falhas > 0 ? "com-falha" : ""}
                  />
                );
              })}
            </div>
          )}

          <div className="owner-health-routes">
            <h3>Rotas com mais problemas</h3>
            <table>
              <thead>
                <tr>
                  <th>Rota</th>
                  <th>Falhas</th>
                  <th>Recusas</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {resumo.rotas.map((rota) => (
                  <tr key={rota.rota} className={rota.falhas > 0 ? "com-falha" : ""}>
                    <td><code>{rota.rota}</code></td>
                    <td>{rota.falhas.toLocaleString("pt-BR")}</td>
                    <td>{(rota.erros - rota.falhas).toLocaleString("pt-BR")}</td>
                    <td>{rota.total.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="owner-health-note" role="note">
              Os identificadores das rotas aparecem como <code>:id</code>: a
              medição agrupa acessos e não registra qual comunidade, pessoa ou
              registro foi aberto.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function somaPonto(ponto: PontoSerie) {
  return (ponto["2xx"] || 0) + (ponto["3xx"] || 0) + (ponto["4xx"] || 0) + (ponto["5xx"] || 0);
}
