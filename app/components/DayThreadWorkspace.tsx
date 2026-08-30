"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

// O fio reúne o que já aconteceu e o que ainda vai acontecer no dia, numa
// ordem só. O que o sistema não capta sozinho entra como registro manual.

type ResumoFio = {
  visitantes: number | null;
  pedidos: number;
  registros: number;
  escalas: { total: number; confirmadas: number };
  visitantesPorCategoria: { nome: string; total: number }[];
};

type ItemFio = {
  id: string;
  camada: "CULTOS" | "PESSOAS" | "OPERACAO" | "CUIDADO";
  titulo: string;
  detalhe: string;
  ocorreEm: string;
  origem: string;
  origemId: number;
  manual: boolean;
  autor?: string;
};

const CAMADAS: { id: ItemFio["camada"]; label: string }[] = [
  { id: "CULTOS", label: "Cultos" },
  { id: "PESSOAS", label: "Pessoas" },
  { id: "OPERACAO", label: "Operação" },
  { id: "CUIDADO", label: "Cuidado" },
];

const VISIBILIDADES: { id: string; label: string; hint: string }[] = [
  {
    id: "LIDERANCA",
    label: "Liderança",
    hint: "Pastoral, líderes e administração.",
  },
  {
    id: "COMUNIDADE",
    label: "Toda a comunidade",
    hint: "Aparece no fio de qualquer pessoa vinculada.",
  },
  {
    id: "PASTORAL",
    label: "Só a pastoral",
    hint: "Fica fora do fio geral e dos relatórios.",
  },
];

function diaLocal(valor: Date) {
  const mes = String(valor.getMonth() + 1).padStart(2, "0");
  const dia = String(valor.getDate()).padStart(2, "0");
  return `${valor.getFullYear()}-${mes}-${dia}`;
}

function formatarHora(valor: string) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? "--:--"
    : data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatarDiaLongo(valor: string) {
  const data = new Date(`${valor}T12:00:00`);
  return Number.isNaN(data.getTime())
    ? valor
    : data.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
}

export default function DayThreadWorkspace() {
  const hoje = useMemo(() => diaLocal(new Date()), []);
  const [dia, setDia] = useState(hoje);
  const [itens, setItens] = useState<ItemFio[]>([]);
  const [resumo, setResumo] = useState<ResumoFio | null>(null);
  const [camadasAtivas, setCamadasAtivas] = useState<ItemFio["camada"][]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoDetalhe, setNovoDetalhe] = useState("");
  const [novaCamada, setNovaCamada] = useState<ItemFio["camada"]>("PESSOAS");
  const [novaVisibilidade, setNovaVisibilidade] = useState("LIDERANCA");

  const [recarga, setRecarga] = useState(0);
  const recarregar = useCallback(() => setRecarga((n) => n + 1), []);

  // Toda escrita de estado acontece depois de um await: escrever de forma
  // síncrona dentro do efeito dispara renderização em cascata. O sinalizador
  // de cancelamento evita que a resposta de um dia antigo sobrescreva a de um
  // dia mais novo quando alguém troca a data rápido.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const resposta = await fetch(`/api/pilot/fio?dia=${dia}`, {
          cache: "no-store",
        });
        const resultado = await resposta.json();
        if (cancelado) return;
        if (!resposta.ok) {
          throw new Error(resultado.error || "Não foi possível abrir o fio do dia.");
        }
        setItens(resultado.itens || []);
        setResumo(resultado.resumo || null);
        setErro("");
      } catch (falha) {
        if (!cancelado) setErro((falha as Error).message);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [dia, recarga]);

  // "Agora" precisa vir de estado, nunca de Date.now() durante a renderização:
  // no servidor e no cliente o valor seria diferente e a hidratação quebraria.
  const [agora, setAgora] = useState(0);
  useEffect(() => {
    const acertar = () => setAgora(Date.now());
    // O primeiro acerto é agendado em vez de chamado direto: escrever estado
    // no corpo do efeito dispara renderização em cascata.
    const primeiro = window.setTimeout(acertar, 0);
    const relogio = window.setInterval(acertar, 60000);
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(relogio);
    };
  }, []);

  const visiveis = useMemo(
    () =>
      camadasAtivas.length
        ? itens.filter((item) => camadasAtivas.includes(item.camada))
        : itens,
    [camadasAtivas, itens],
  );

  // O marcador "agora" só faz sentido no dia de hoje. Num dia passado tudo já
  // aconteceu, e num dia futuro nada aconteceu ainda. Enquanto o relógio não
  // acerta no cliente (agora === 0), nada é marcado.
  const indiceAgora =
    dia === hoje && agora
      ? visiveis.findIndex((item) => Date.parse(item.ocorreEm) >= agora)
      : -1;
  const horaAgora = agora
    ? new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  function alternarCamada(camada: ItemFio["camada"]) {
    setCamadasAtivas((atuais) =>
      atuais.includes(camada)
        ? atuais.filter((item) => item !== camada)
        : [...atuais, camada],
    );
  }

  async function registrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!novoTitulo.trim()) return;
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const resposta = await fetch("/api/pilot/fio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: novoTitulo,
          detalhe: novoDetalhe,
          camada: novaCamada,
          visibilidade: novaVisibilidade,
          ocorreEm: dia === hoje ? new Date().toISOString() : `${dia}T12:00:00`,
        }),
      });
      const resultado = await resposta.json();
      if (!resposta.ok) {
        throw new Error(resultado.error || "Não foi possível registrar.");
      }
      setNovoTitulo("");
      setNovoDetalhe("");
      setFormAberto(false);
      setAviso(resultado.message || "Registro adicionado ao fio do dia.");
      recarregar();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const visibilidadeEscolhida = VISIBILIDADES.find(
    (item) => item.id === novaVisibilidade,
  );

  return (
    <section className="day-thread-workspace" aria-labelledby="day-thread-title">
      <header className="day-thread-head">
        <div>
          <p className="pilot-kicker">FIO DO DIA</p>
          <h2 id="day-thread-title">{formatarDiaLongo(dia)}</h2>
          <p className="day-thread-count">
            {carregando
              ? "Organizando o dia…"
              : `${visiveis.length} ${visiveis.length === 1 ? "registro" : "registros"} no fio`}
          </p>
        </div>
        <div className="day-thread-actions">
          <label className="day-thread-date">
            <span>Dia</span>
            <input
              type="date"
              value={dia}
              max={hoje}
              onChange={(evento) => {
                setCarregando(true);
                setDia(evento.target.value || hoje);
              }}
            />
          </label>
          <button
            type="button"
            className="day-thread-register"
            onClick={() => setFormAberto((aberto) => !aberto)}
            aria-expanded={formAberto}
          >
            Registrar no fio
          </button>
        </div>
      </header>

      {resumo && (
        <div className="day-thread-stats-v5">
          <article>
            <small>Registros</small>
            <strong>{resumo.registros}</strong>
            <em>no fio de hoje</em>
          </article>
          {resumo.visitantes !== null && (
            <article>
              <small>Visitantes</small>
              <strong>{resumo.visitantes}</strong>
              <em>{resumo.visitantes === 1 ? "recebido" : "recebidos"}</em>
            </article>
          )}
          <article>
            <small>Pedidos</small>
            <strong>{resumo.pedidos}</strong>
            <em>{resumo.pedidos === 1 ? "aberto" : "abertos"}</em>
          </article>
          <article data-alerta={
            resumo.escalas.total > 0 && resumo.escalas.confirmadas < resumo.escalas.total
              ? "1"
              : undefined
          }>
            <small>Escalas</small>
            <strong>{resumo.escalas.confirmadas}<span>/{resumo.escalas.total}</span></strong>
            <em>{resumo.escalas.total === 0 ? "nenhuma hoje" : "confirmadas"}</em>
          </article>
        </div>
      )}

      <div className="day-thread-layers" role="group" aria-label="Camadas do fio">
        <button
          type="button"
          className={camadasAtivas.length === 0 ? "active" : ""}
          aria-pressed={camadasAtivas.length === 0}
          onClick={() => setCamadasAtivas([])}
        >
          Tudo
        </button>
        {CAMADAS.map((camada) => (
          <button
            key={camada.id}
            type="button"
            className={camadasAtivas.includes(camada.id) ? "active" : ""}
            aria-pressed={camadasAtivas.includes(camada.id)}
            onClick={() => alternarCamada(camada.id)}
          >
            <i data-camada={camada.id} aria-hidden="true" />
            {camada.label}
          </button>
        ))}
      </div>

      {formAberto && (
        <form className="day-thread-form" onSubmit={registrar}>
          <label>
            Título
            <input
              value={novoTitulo}
              maxLength={160}
              required
              placeholder="Visita à família Bento"
              onChange={(evento) => setNovoTitulo(evento.target.value)}
            />
          </label>
          <label>
            Camada
            <select
              value={novaCamada}
              onChange={(evento) =>
                setNovaCamada(evento.target.value as ItemFio["camada"])
              }
            >
              {CAMADAS.map((camada) => (
                <option key={camada.id} value={camada.id}>
                  {camada.label}
                </option>
              ))}
            </select>
          </label>
          <label className="day-thread-form-wide">
            Detalhe <small>opcional</small>
            <textarea
              value={novoDetalhe}
              rows={2}
              maxLength={900}
              onChange={(evento) => setNovoDetalhe(evento.target.value)}
            />
          </label>
          <label>
            Quem vê
            <select
              value={novaVisibilidade}
              onChange={(evento) => setNovaVisibilidade(evento.target.value)}
            >
              {VISIBILIDADES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <footer>
            <small>{visibilidadeEscolhida?.hint}</small>
            <button type="button" onClick={() => setFormAberto(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando || !novoTitulo.trim()}>
              {salvando ? "Registrando…" : "Registrar"}
            </button>
          </footer>
        </form>
      )}

      {(erro || aviso) && (
        <p className={`operations-feedback ${erro ? "error" : ""}`} role="status">
          {erro || aviso}
        </p>
      )}

      <div className="day-thread-body-v5">
      <div className="day-thread-main-v5">
      {carregando && !itens.length ? (
        <p className="home-thread-empty">Organizando o dia…</p>
      ) : visiveis.length ? (
        <ol className="home-timeline day-thread-timeline">
          {visiveis.map((item, indice) => (
            <li
              key={item.id}
              data-camada={item.camada}
              data-futuro={
                dia === hoje && agora && Date.parse(item.ocorreEm) > agora ? "1" : undefined
              }
            >
              {indice === indiceAgora && (
                <div className="home-timeline-now" aria-label="Momento atual">
                  <time>{horaAgora}</time>
                  <span>Agora</span>
                </div>
              )}
              <time dateTime={item.ocorreEm}>{formatarHora(item.ocorreEm)}</time>
              <span className="home-timeline-node" aria-hidden="true" />
              <div className="home-timeline-content">
                <small>
                  {item.origem}
                  {item.autor ? ` · ${item.autor}` : ""}
                </small>
                <h3>{item.titulo}</h3>
                {item.detalhe && <p>{item.detalhe}</p>}
              </div>
            </li>
          ))}
          {indiceAgora < 0 && dia === hoje && agora > 0 && (
            <li className="home-timeline-now-row">
              <div className="home-timeline-now">
                <time>{horaAgora}</time>
                <span>Agora</span>
              </div>
            </li>
          )}
        </ol>
      ) : (
        <div className="home-thread-empty">
          <strong>
            {camadasAtivas.length
              ? "Nenhum registro nessa camada"
              : "Nada registrado neste dia"}
          </strong>
          <p>
            {camadasAtivas.length
              ? "Limpe o filtro para ver o dia inteiro."
              : "O fio reúne cultos, escalas, visitantes, pedidos e mural. O que não for captado automaticamente pode ser registrado à mão."}
          </p>
        </div>
      )}
      </div>

      <aside className="day-thread-aside-v5" aria-label="Resumo do dia">
        {resumo && resumo.visitantesPorCategoria.length > 0 && (
          <section>
            <h3>Visitantes por categoria</h3>
            {(() => {
              const teto = Math.max(
                1,
                ...resumo.visitantesPorCategoria.map((linha) => linha.total),
              );
              return resumo.visitantesPorCategoria.map((linha) => (
                <div key={linha.nome} className="day-thread-bar-v5">
                  <span>{linha.nome}<b>{linha.total}</b></span>
                  <i><em style={{ width: `${Math.round((linha.total / teto) * 100)}%` }} /></i>
                </div>
              ));
            })()}
          </section>
        )}
        <section>
          <h3>{dia === hoje ? "Ainda hoje" : "Depois deste ponto"}</h3>
          {(() => {
            const futuros = agora
              ? visiveis.filter((item) => Date.parse(item.ocorreEm) > agora)
              : [];
            if (!futuros.length) {
              return <p className="day-thread-aside-empty-v5">Nada mais marcado.</p>;
            }
            return futuros.slice(0, 5).map((item) => (
              <div key={item.id} className="day-thread-next-v5">
                <span>{formatarHora(item.ocorreEm)}</span>
                <div><strong>{item.titulo}</strong><small>{item.origem}</small></div>
              </div>
            ));
          })()}
        </section>
      </aside>
      </div>
    </section>
  );
}
