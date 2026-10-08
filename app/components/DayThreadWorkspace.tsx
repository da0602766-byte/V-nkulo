"use client";

import TransientFeedback from "./TransientFeedback";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CareNotesBoard from "./CareNotesBoard";
import "./day-thread-ux.css";

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

export default function DayThreadWorkspace({
  permissions,
}: {
  permissions: string[];
}) {
  const hoje = useMemo(() => diaLocal(new Date()), []);
  const [dia, setDia] = useState(hoje);
  const [resultadoAtual, setResultadoAtual] = useState<{ key: string; itens: ItemFio[]; resumo: ResumoFio | null } | null>(null);
  const [falhaConsulta, setFalhaConsulta] = useState<{ key: string; message: string } | null>(null);
  const [camadasAtivas, setCamadasAtivas] = useState<ItemFio["camada"][]>([]);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const envioEmCurso = useRef(false);
  const tituloInput = useRef<HTMLInputElement>(null);
  const registrarButton = useRef<HTMLButtonElement>(null);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoDetalhe, setNovoDetalhe] = useState("");
  const [novaCamada, setNovaCamada] = useState<ItemFio["camada"]>("PESSOAS");
  const [novaVisibilidade, setNovaVisibilidade] = useState("LIDERANCA");
  const podeRegistrar = permissions.includes("leadership.panel.view");
  const podeRegistrarPastoral =
    permissions.includes("pastoral.panel.view") ||
    permissions.includes("community.admin.view");
  const visibilidadesDisponiveis = podeRegistrarPastoral
    ? VISIBILIDADES
    : VISIBILIDADES.filter((item) => item.id !== "PASTORAL");

  const [recarga, setRecarga] = useState(0);
  const recarregar = useCallback(() => setRecarga((n) => n + 1), []);
  const consultaKey = JSON.stringify([dia, recarga]);
  const atual = resultadoAtual?.key === consultaKey ? resultadoAtual : null;
  const erroConsulta = falhaConsulta?.key === consultaKey ? falhaConsulta.message : "";
  const carregando = !atual && !erroConsulta;
  const itens = useMemo(() => atual?.itens || [], [atual]);
  const resumo = atual?.resumo;

  // A chave oculta o dia anterior já na primeira renderização da nova data.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const resposta = await fetch(`/api/pilot/fio?dia=${dia}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const resultado = await resposta.json();
        if (controller.signal.aborted) return;
        if (!resposta.ok) {
          throw new Error(resultado.error || "Não foi possível abrir o fio do dia.");
        }
        if (!Array.isArray(resultado.itens)) throw new Error("Não foi possível ler os registros. Tente novamente.");
        setResultadoAtual({ key: consultaKey, itens: resultado.itens, resumo: resultado.resumo || null });
        setFalhaConsulta(null);
      } catch (falha) {
        if (!controller.signal.aborted) setFalhaConsulta({ key: consultaKey, message: (falha as Error).message });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [dia, consultaKey]);

  useEffect(() => {
    if (formAberto) tituloInput.current?.focus();
  }, [formAberto]);

  function fecharFormulario() {
    setFormAberto(false);
    registrarButton.current?.focus();
  }

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
    if (!novoTitulo.trim() || envioEmCurso.current) return;
    envioEmCurso.current = true;
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
      fecharFormulario();
      setAviso(resultado.message || "Registro adicionado ao fio do dia.");
      recarregar();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      envioEmCurso.current = false;
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
              : erroConsulta ? "Consulta indisponível"
              : `${visiveis.length} ${visiveis.length === 1 ? "registro" : "registros"} ${camadasAtivas.length ? `de ${itens.length} · filtros ativos` : "no fio"}`}
          </p>
        </div>
        <div className="day-thread-actions">
          <label className="day-thread-date">
            <span>Dia</span>
            <input
              type="date"
              value={dia}
              max={hoje}
              disabled={salvando}
              onChange={(evento) => {
                setDia(evento.target.value || hoje);
              }}
            />
          </label>
          {dia !== hoje && <button type="button" className="day-thread-secondary" disabled={salvando} onClick={() => setDia(hoje)}>Voltar para hoje</button>}
          {podeRegistrar && (
            <button
              type="button"
              className="day-thread-register"
              ref={registrarButton}
              disabled={salvando}
              onClick={() => setFormAberto((aberto) => !aberto)}
              aria-expanded={formAberto}
              aria-controls="day-thread-register-form"
            >
              Registrar no fio
            </button>
          )}
          <a
            className="day-thread-agenda-link"
            href="/painel?view=eventos"
            title="Ver a semana e o mês em formato de calendário"
          >
            Ver agenda completa →
          </a>
        </div>
      </header>

      {resumo && (
        <div className="day-thread-stats-v5">
          <article>
            <small>Registros</small>
            <strong>{resumo.registros}</strong>
            <em>{dia === hoje ? "no fio de hoje" : "no dia selecionado"}</em>
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
            <em>{resumo.escalas.total === 0 ? "nenhuma neste dia" : "confirmadas"}</em>
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

      {podeRegistrar && formAberto && (
        <form id="day-thread-register-form" className="day-thread-form" onSubmit={registrar} aria-busy={salvando}>
          <p className="day-thread-form-context">Registrar em <strong>{formatarDiaLongo(dia)}</strong>. Título obrigatório.</p>
          <label>
            Título
            <input
              ref={tituloInput}
              disabled={salvando}
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
              disabled={salvando}
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
              disabled={salvando}
              value={novoDetalhe}
              rows={2}
              maxLength={900}
              onChange={(evento) => setNovoDetalhe(evento.target.value)}
            />
          </label>
          <label>
            Quem vê
            <select
              disabled={salvando}
              aria-describedby="day-thread-visibility-hint"
              value={novaVisibilidade}
              onChange={(evento) => setNovaVisibilidade(evento.target.value)}
            >
              {visibilidadesDisponiveis.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {erro && <p className="day-thread-form-error" role="alert">{erro} Seus dados continuam no formulário.</p>}
          <footer>
            <small id="day-thread-visibility-hint">{visibilidadeEscolhida?.hint}</small>
            <button type="button" disabled={salvando} onClick={fecharFormulario}>
              Fechar
            </button>
            <button type="submit" disabled={salvando || !novoTitulo.trim()}>
              {salvando ? "Registrando…" : "Registrar"}
            </button>
          </footer>
        </form>
      )}

      {aviso && (
        <TransientFeedback tone="success" role="status">
          {aviso}
        </TransientFeedback>
      )}

      <div className="day-thread-body-v5">
      <div className="day-thread-main-v5" aria-busy={carregando}>
      {carregando ? (
        <p className="home-thread-empty" role="status">Organizando o dia…</p>
      ) : erroConsulta ? (
        <div className="day-thread-load-error"><p role="alert">{erroConsulta}</p><button type="button" className="day-thread-secondary" onClick={recarregar}>Tentar novamente</button></div>
      ) : visiveis.length ? (
        <ol className="home-timeline day-thread-timeline">
          {visiveis.map((item, indice) => (
            <li
              key={item.id}
              data-camada={item.camada}
              data-status={
                dia !== hoje
                  ? dia < hoje ? "concluido" : "futuro"
                  : indice === indiceAgora
                    ? "agora"
                    : agora && Date.parse(item.ocorreEm) < agora
                      ? "concluido"
                      : "futuro"
              }
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
              ? "Nenhum registro nas camadas selecionadas"
              : "Nada registrado neste dia"}
          </strong>
          <p>
            {camadasAtivas.length
              ? "Limpe o filtro para ver o dia inteiro."
              : "O fio reúne cultos, escalas, visitantes, pedidos e mural. O que não for captado automaticamente pode ser registrado à mão."}
          </p>
          {camadasAtivas.length > 0 && <button type="button" className="day-thread-secondary" onClick={() => setCamadasAtivas([])}>Limpar filtros</button>}
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
        {atual && dia === hoje && <section>
          <h3>Ainda hoje</h3>
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
        </section>}
        <CareNotesBoard compact />
      </aside>
      </div>
    </section>
  );
}
