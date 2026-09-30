"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./EventsAgenda.module.css";
import TransientFeedback from "./TransientFeedback";

type Camada = "EVENTO" | "ESCALA" | "PESSOAL";

type ItemAgenda = {
  id: string;
  camada: Camada;
  titulo: string;
  descricao: string;
  categoria: string;
  iniciaEm: string;
  terminaEm: string | null;
  local: string;
  diaInteiro: boolean;
  status: string;
  origemId: number;
  visibilidade?: "PRIVADO" | "PUBLICO";
  meu?: boolean;
  aprovacaoStatus?: "PENDENTE" | "APROVADA";
};

type Visao = "dia" | "semana" | "mes";

const CAMADAS: { id: Camada; rotulo: string; ajuda: string }[] = [
  { id: "EVENTO", rotulo: "Cultos e eventos", ajuda: "Programação publicada pela comunidade" },
  { id: "ESCALA", rotulo: "Minhas escalas", ajuda: "Onde você foi designado para servir" },
  { id: "PESSOAL", rotulo: "Meus compromissos", ajuda: "O que você mesmo marcou" },
];

const CATEGORIAS_PESSOAIS = [
  { valor: "PESSOAL", rotulo: "Pessoal" },
  { valor: "VISITA", rotulo: "Visita" },
  { valor: "PREPARO", rotulo: "Preparo" },
  { valor: "REUNIAO", rotulo: "Reunião" },
  { valor: "META", rotulo: "Meta" },
];

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function chaveDia(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function gradeDoMes(referencia: Date) {
  const primeiro = new Date(referencia.getFullYear(), referencia.getMonth(), 1);
  const inicio = new Date(primeiro);
  inicio.setDate(1 - primeiro.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const dia = new Date(inicio);
    dia.setDate(inicio.getDate() + i);
    return dia;
  });
}

function gradeDaSemana(referencia: Date) {
  const inicio = new Date(referencia);
  inicio.setDate(referencia.getDate() - referencia.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(inicio);
    dia.setDate(inicio.getDate() + i);
    return dia;
  });
}

function hora(iso: string) {
  const data = new Date(iso);
  const m = data.getMinutes();
  return `${String(data.getHours()).padStart(2, "0")}${m ? `:${String(m).padStart(2, "0")}` : "h"}`;
}

function duracaoMin(item: ItemAgenda) {
  const duration = item.terminaEm ? (Date.parse(item.terminaEm) - Date.parse(item.iniciaEm)) / 60000 : 60;
  return duration > 0 ? duration : 60;
}

export default function AgendaCalendar({
  podeVerEventos,
  podeAprovar,
  aoCriarEvento,
  atualizacao = 0,
}: {
  podeVerEventos: boolean;
  podeAprovar: boolean;
  // Quem hospeda o calendário decide o que "criar evento" faz; aqui só existe
  // o lugar certo para essa ação morar — junto da navegação de período.
  aoCriarEvento?: (dia?: string) => void;
  atualizacao?: number;
}) {
  const formId = useId();
  const [referencia, setReferencia] = useState(() => inicioDoDia(new Date()));
  const [visao, setVisao] = useState<Visao>("mes");
  const [itens, setItens] = useState<ItemAgenda[]>([]);
  const [camadasAtivas, setCamadasAtivas] = useState<Camada[]>(["EVENTO", "ESCALA", "PESSOAL"]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [erroCarregamento, setErroCarregamento] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [formDia, setFormDia] = useState("");
  const [salvando, setSalvando] = useState(false);

  const dias = useMemo(() => {
    if (visao === "mes") return gradeDoMes(referencia);
    if (visao === "semana") return gradeDaSemana(referencia);
    return [referencia];
  }, [referencia, visao]);

  const requestRef = useRef<AbortController | null>(null);
  const carregar = useCallback(async () => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setCarregando(true);
    try {
      const de = inicioDoDia(dias[0]);
      const ate = new Date(dias[dias.length - 1]);
      ate.setHours(23, 59, 59, 999);
      const resposta = await fetch(
        `/api/pilot/agenda?de=${encodeURIComponent(de.toISOString())}&ate=${encodeURIComponent(ate.toISOString())}`,
        { cache: "no-store", signal: request.signal },
      );
      const dados = (await resposta.json()) as { itens?: ItemAgenda[]; error?: string };
      if (!resposta.ok) throw new Error(dados.error || "Não foi possível carregar a agenda.");
      if (!request.signal.aborted) {
        setItens(dados.itens || []);
        setErroCarregamento("");
      }
    } catch (motivo) {
      if (request.signal.aborted) return;
      setErroCarregamento(motivo instanceof Error ? motivo.message : "Não foi possível carregar a agenda.");
      setItens([]);
    } finally {
      if (!request.signal.aborted) setCarregando(false);
    }
  }, [dias]);
  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    // Adiar a busca tira o setState do corpo síncrono do efeito, que dispara
    // renderizações em cascata. É o mesmo padrão do resto do painel.
    const timer = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(timer);
  }, [carregar, atualizacao]);

  const visiveis = useMemo(
    () => itens.filter((item) => camadasAtivas.includes(item.camada)),
    [itens, camadasAtivas],
  );

  const porDia = useMemo(() => {
    const mapa = new Map<string, ItemAgenda[]>();
    for (const item of visiveis) {
      const chave = chaveDia(new Date(item.iniciaEm));
      const lista = mapa.get(chave) || [];
      lista.push(item);
      mapa.set(chave, lista);
    }
    return mapa;
  }, [visiveis]);

  function alternarCamada(camada: Camada) {
    setCamadasAtivas((atuais) =>
      atuais.includes(camada) ? atuais.filter((c) => c !== camada) : [...atuais, camada],
    );
  }

  function mover(passo: number) {
    setDiaAberto(null);
    setReferencia((atual) => {
      const proximo = new Date(atual);
      if (visao === "mes") {
        proximo.setDate(1);
        proximo.setMonth(atual.getMonth() + passo);
      }
      else if (visao === "semana") proximo.setDate(atual.getDate() + passo * 7);
      else proximo.setDate(atual.getDate() + passo);
      return proximo;
    });
  }

  function abrirCompromisso(dia = chaveDia(referencia)) {
    setFormDia(dia);
    setFormAberto(true);
    window.setTimeout(() => {
      const form = document.querySelector<HTMLFormElement>(".agenda-form");
      form?.scrollIntoView({ behavior: "smooth", block: "center" });
      form?.querySelector<HTMLInputElement>('[name="titulo"]')?.focus({ preventScroll: true });
    }, 0);
  }

  async function criarCompromisso(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    // Publicar expõe o compromisso para a comunidade inteira. Confirmar antes
    // evita que um clique em "Salvar" vire uma publicação sem querer.
    if (form.get("visibilidade") === "PUBLICO") {
      const titulo = String(form.get("titulo") || "").trim();
      const segue = window.confirm(
        `Publicar "${titulo}" na agenda da comunidade?

Todos os membros vão ver o título, o horário e o local. As observações continuam só suas.`,
      );
      if (!segue) return;
    }
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      const resposta = await fetch("/api/pilot/agenda", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          titulo: form.get("titulo"),
          descricao: form.get("descricao"),
          categoria: form.get("categoria"),
          iniciaEm: form.get("iniciaEm"),
          terminaEm: form.get("terminaEm"),
          local: form.get("local"),
          visibilidade: form.get("visibilidade"),
        }),
      });
      const dados = (await resposta.json()) as { error?: string; message?: string };
      if (!resposta.ok) throw new Error(dados.error || "Não foi possível salvar.");
      setSucesso(dados.message || "Compromisso salvo.");
      setFormAberto(false);
      await carregar();
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function removerCompromisso(origemId: number) {
    setErro("");
    setSucesso("");
    try {
      const resposta = await fetch(`/api/pilot/agenda?id=${origemId}`, { method: "DELETE" });
      if (!resposta.ok) {
        const dados = (await resposta.json()) as { error?: string };
        throw new Error(dados.error || "Não foi possível remover.");
      }
      setSucesso("Compromisso removido.");
      await carregar();
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : "Não foi possível remover.");
    }
  }

  async function aprovarCompromisso(origemId: number) {
    setErro("");
    setSucesso("");
    try {
      const resposta = await fetch("/api/pilot/agenda", { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ id:origemId, acao:"APROVAR" }) });
      const dados = await resposta.json() as { error?:string };
      if (!resposta.ok) throw new Error(dados.error || "Não foi possível aprovar.");
      setSucesso("Publicação aprovada.");
      await carregar();
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : "Não foi possível aprovar.");
    }
  }

  const camadasVisiveis = CAMADAS.filter((c) => c.id !== "EVENTO" || podeVerEventos);
  // "Hoje" precisa vir de estado, nunca de `new Date()` durante a renderização:
  // servidor e cliente calculariam valores diferentes na virada do dia e a
  // hidratação quebraria. Mesmo padrão já adotado em DayThreadWorkspace.
  // Começa vazio, então nenhum dia é marcado até o cliente acertar o relógio.
  const [hojeChave, setHojeChave] = useState("");
  useEffect(() => {
    const acertar = () => setHojeChave(chaveDia(new Date()));
    // Agendado em vez de chamado direto: escrever estado no corpo do efeito
    // dispara renderização em cascata.
    const primeiro = window.setTimeout(acertar, 0);
    const relogio = window.setInterval(acertar, 60000);
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(relogio);
    };
  }, []);
  const itensDoDiaAberto = diaAberto ? porDia.get(diaAberto) || [] : [];
  const diaSelecionado = visao === "dia" ? chaveDia(referencia) : diaAberto;

  const rotuloPeriodo =
    visao === "dia"
      ? referencia.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
      : visao === "semana"
        ? `${dias[0].toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${dias[6].toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`
        : referencia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <section className={`agenda-calendario agenda-studio ${styles.calendar}`} aria-label="Calendário da agenda">
      <header className="agenda-calendario-topo">
        <div className="agenda-calendario-periodo">
          <button type="button" onClick={() => mover(-1)} aria-label="Período anterior">‹</button>
          <button type="button" onClick={() => mover(1)} aria-label="Próximo período">›</button>
          <strong aria-live="polite" aria-atomic="true">{rotuloPeriodo}</strong>
          <button
            type="button"
            className="agenda-hoje"
            onClick={() => { setDiaAberto(null); setReferencia(inicioDoDia(new Date())); }}
          >
            Hoje
          </button>
        </div>
        <div className="agenda-calendario-acoes">
        <div className="agenda-calendario-visoes" role="group" aria-label="Formato do calendário">
          {(["dia", "semana", "mes"] as Visao[]).map((modo) => (
            <button
              key={modo}
              type="button"
              className={visao === modo ? "active" : ""}
              aria-pressed={visao === modo}
              onClick={() => { setDiaAberto(null); setVisao(modo); }}
            >
              {modo === "dia" ? "Dia" : modo === "semana" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
        <a
          className="agenda-fio-link"
          href="/painel?view=fio"
          title="Ver o registro cronológico do dia, com pedidos e visitantes"
        >
          Ver Fio do dia →
        </a>
        </div>
      </header>

      <div className="agenda-camadas">
        <div className={styles.layers} role="group" aria-label="Camadas do calendário">
        {camadasVisiveis.map((camada) => (
          <button
            key={camada.id}
            type="button"
            className={`agenda-camada camada-${camada.id.toLowerCase()}${
              camadasAtivas.includes(camada.id) ? " active" : ""
            }`}
            aria-pressed={camadasAtivas.includes(camada.id)}
            title={camada.ajuda}
            onClick={() => alternarCamada(camada.id)}
          >
            <span aria-hidden="true" />
            {camada.rotulo}
          </button>
        ))}
        </div>
        <div className={styles.createActions} role="group" aria-label="Criar na agenda">
        {aoCriarEvento && (
          <button type="button" className="agenda-novo-evento" onClick={() => aoCriarEvento(diaSelecionado || undefined)}>
            + Novo evento
          </button>
        )}
        <button
          type="button"
          className="agenda-novo"
          aria-expanded={formAberto}
          aria-controls={formAberto ? formId : undefined}
          onClick={() => formAberto ? setFormAberto(false) : abrirCompromisso(diaSelecionado || chaveDia(referencia))}
        >
          {formAberto ? "Cancelar" : "Novo compromisso"}
        </button>
        </div>
      </div>

      {erro && <TransientFeedback className="agenda-erro" role="alert">{erro}</TransientFeedback>}
      {sucesso && <TransientFeedback className="operations-feedback" role="status" tone="success">{sucesso}</TransientFeedback>}
      {erroCarregamento && <TransientFeedback className="agenda-erro" role="alert">
        <span>{erroCarregamento}</span>
        <button type="button" onClick={() => void carregar()}>Tentar novamente</button>
      </TransientFeedback>}

      <div className="agenda-studio-layout"><div className="agenda-studio-planner">
      {!erroCarregamento && !carregando && diaSelecionado && <section className="agenda-day-actions" aria-label="Planejar dia selecionado">
        <div><small>DIA SELECIONADO</small><strong>{new Date(`${diaSelecionado}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</strong><span>{(porDia.get(diaSelecionado) || []).length ? `${(porDia.get(diaSelecionado) || []).length} compromisso(s) neste dia` : "Que tal planejar um novo encontro?"}</span></div>
        <div className="agenda-day-buttons">
          {aoCriarEvento && <button type="button" onClick={() => aoCriarEvento(diaSelecionado)}>Criar evento</button>}
          <button type="button" onClick={() => abrirCompromisso(diaSelecionado)}>Novo compromisso</button>
          {visao === "mes" && <button type="button" className="agenda-day-close" aria-label="Fechar dia selecionado" onClick={() => setDiaAberto(null)}>×</button>}
        </div>
      </section>}
      {/* Criar exige confirmação explícita no formulário, com a data escolhida preservada. */}
      <div className={`agenda-corpo${formAberto ? " com-form" : ""}`}>
      {formAberto && (
        <form id={formId} className="agenda-form" key={formDia} onSubmit={criarCompromisso}>
          <header className="agenda-form-larga"><strong>Novo compromisso</strong><button type="button" onClick={() => setFormAberto(false)} aria-label="Fechar formulário de compromisso">×</button></header>
          <label>
            Título
            <input name="titulo" required maxLength={140} placeholder="Visita à família Silva" />
          </label>
          <label>
            Categoria
            <select name="categoria" defaultValue="PESSOAL">
              {CATEGORIAS_PESSOAIS.map((c) => (
                <option key={c.valor} value={c.valor}>{c.rotulo}</option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input name="iniciaEm" type="datetime-local" required defaultValue={formDia ? `${formDia}T09:00` : ""} />
          </label>
          <label>
            Término
            <input name="terminaEm" type="datetime-local" defaultValue={formDia ? `${formDia}T10:00` : ""} />
          </label>
          <label>
            Quem vê
            <select name="visibilidade" defaultValue="PRIVADO">
              <option value="PRIVADO">Só eu</option>
              <option value="PUBLICO">Toda a comunidade</option>
            </select>
          </label>
          <label className="agenda-form-larga">
            Local
            <input name="local" maxLength={180} placeholder="Onde vai acontecer" />
          </label>
          <label className="agenda-form-larga">
            Observações
            <textarea name="descricao" rows={2} maxLength={1000} />
          </label>
          <button type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar compromisso"}
          </button>
        </form>
      )}

      {/* DIA — linha do tempo vertical: a hora à esquerda, um marcador por
          camada e o cartão com os detalhes à direita. */}
      {erroCarregamento && <div className="agenda-studio-empty">
        <strong>Agenda indisponível no momento</strong>
        <p>Não foi possível consultar os compromissos deste período.</p>
        <button type="button" disabled={carregando} onClick={() => void carregar()}>{carregando ? "Tentando novamente…" : "Tentar novamente"}</button>
      </div>}
      {!erroCarregamento && visao === "dia" && (
        <div className="agenda-linha-tempo" aria-busy={carregando}>
          {(porDia.get(chaveDia(referencia)) || []).length === 0 ? (
            <p className="agenda-vazio">{carregando ? "Carregando compromissos…" : "Nada marcado neste dia."}</p>
          ) : (
            (porDia.get(chaveDia(referencia)) || []).map((item) => (
              <article key={item.id} className={`agenda-tempo-item camada-${item.camada.toLowerCase()}`}>
                <span className="agenda-tempo-hora">{hora(item.iniciaEm)}</span>
                <span className="agenda-tempo-marca" aria-hidden="true" />
                <div className="agenda-tempo-cartao">
                  <strong>{item.titulo}</strong>
                  {item.descricao && <small>{item.descricao}</small>}
                  <span className="agenda-tempo-meta">
                    {item.terminaEm && <em>{duracaoMin(item)} min</em>}
                    {item.local && <em>{item.local}</em>}
                    <em className="agenda-tempo-camada">
                      {item.camada === "EVENTO" ? "Evento" : item.camada === "ESCALA" ? "Escala" : "Pessoal"}
                    </em>
                  </span>
                  {item.camada === "PESSOAL" && item.meu !== false && (
                    <button
                      type="button"
                      className="agenda-remover"
                      onClick={() => void removerCompromisso(item.origemId)}
                    >
                      Remover
                    </button>
                  )}
                  {item.camada === "PESSOAL" && item.aprovacaoStatus === "PENDENTE" && podeAprovar && (
                    <button type="button" className="agenda-aprovar" onClick={() => void aprovarCompromisso(item.origemId)}>Aprovar publicação</button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* SEMANA — grade de horas: cada compromisso ocupa a altura da sua
          duração, e os que se cruzam dividem a largura. */}
      {!erroCarregamento && visao === "semana" && (
        <div className="agenda-week-list" aria-busy={carregando}>
          {dias.map((dia) => { const items = porDia.get(chaveDia(dia)) || []; return <section key={chaveDia(dia)} className={chaveDia(dia) === hojeChave ? "today" : ""}>
            <button type="button" className="agenda-week-date" onClick={() => { setReferencia(inicioDoDia(dia)); setVisao("dia"); }}><small>{DIAS_CURTOS[dia.getDay()]}</small><strong>{dia.getDate()}</strong></button>
            <div>{items.length ? items.map((item) => <button type="button" key={item.id} className={"agenda-week-entry camada-" + item.camada.toLowerCase()} onClick={() => { setReferencia(inicioDoDia(dia)); setVisao("dia"); }}><time>{item.diaInteiro ? "Dia inteiro" : hora(item.iniciaEm)}</time><strong>{item.titulo}</strong><span>{item.local || CAMADAS.find(layer => layer.id === item.camada)?.rotulo}</span></button>) : <p>{carregando ? "Carregando…" : "Dia livre"}</p>}</div>
          </section>; })}
        </div>
      )}

      {/* MÊS — visão de planejamento: chips compactos e "+N" quando não cabe. */}
      {!erroCarregamento && visao === "mes" && (
        <div className="agenda-grade" aria-busy={carregando}>
          {DIAS_CURTOS.map((dia) => (
            <span className="agenda-grade-cabecalho" key={dia}>{dia}</span>
          ))}
          {dias.map((dia) => {
            const chave = chaveDia(dia);
            const doPeriodo = dia.getMonth() === referencia.getMonth();
            const doDia = porDia.get(chave) || [];
            return (
              <button
                type="button"
                key={chave}
                className={`agenda-dia${doPeriodo ? "" : " fora"}${chave === hojeChave ? " hoje" : ""}${chave === diaAberto ? " selected" : ""}`}
                onClick={() => setDiaAberto(chave === diaAberto ? null : chave)}
                aria-label={`${dia.getDate()} — ${carregando ? "Carregando compromissos" : `${doDia.length} compromisso(s)`}`}
                aria-pressed={chave === diaAberto}
              >
                <span className="agenda-dia-numero">{dia.getDate()}</span>
                <span className="agenda-dia-itens">
                  {doDia.slice(0, 3).map((item) => (
                    <span key={item.id} className={`agenda-marca camada-${item.camada.toLowerCase()}`}>
                      <b>{hora(item.iniciaEm)}</b> {item.titulo}
                    </span>
                  ))}
                  {doDia.length > 3 && (
                    <span className="agenda-marca mais">+{doDia.length - 3} mais</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {visao === "mes" && diaAberto && itensDoDiaAberto.length > 0 && (
        <div className="agenda-detalhe">
          <header>
            <strong>
              {new Date(`${diaAberto}T12:00:00`).toLocaleDateString("pt-BR", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </strong>
            <button type="button" onClick={() => setDiaAberto(null)} aria-label="Fechar dia">×</button>
          </header>
          {itensDoDiaAberto.length === 0 ? (
            <p className="agenda-vazio">Nada marcado neste dia.</p>
          ) : (
            <ul>
              {itensDoDiaAberto.map((item) => (
                <li key={item.id} className={`camada-${item.camada.toLowerCase()}`}>
                  <span className="agenda-detalhe-hora">{hora(item.iniciaEm)}</span>
                  <span className="agenda-detalhe-corpo">
                    <strong>{item.titulo}</strong>
                    {item.descricao && <small>{item.descricao}</small>}
                    {item.local && <small>{item.local}</small>}
                  </span>
                  {item.camada === "PESSOAL" && item.meu !== false && (
                    <button
                      type="button"
                      className="agenda-remover"
                      onClick={() => void removerCompromisso(item.origemId)}
                    >
                      Remover
                    </button>
                  )}
                  {item.camada === "PESSOAL" && item.aprovacaoStatus === "PENDENTE" && podeAprovar && (
                    <button type="button" className="agenda-aprovar" onClick={() => void aprovarCompromisso(item.origemId)}>Aprovar publicação</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>
      </div><details className="agenda-studio-upcoming"><summary><span>Compromissos deste período</span><small>{carregando ? "Carregando…" : erroCarregamento ? "Indisponível" : `${visiveis.length} compromisso(s)`}</small><span aria-hidden="true">⌄</span></summary>
      {carregando ? <p role="status">Carregando compromissos…</p> : erroCarregamento ? <p>Não foi possível consultar os compromissos deste período.</p> : !visiveis.length ? <div className="agenda-studio-empty"><span aria-hidden="true">♡</span><strong>Tempo para novos encontros</strong><p>Não há compromissos nas categorias selecionadas. Adicione um ou navegue para outro período.</p></div> : <ol>{[...visiveis].sort((a,b) => Date.parse(a.iniciaEm)-Date.parse(b.iniciaEm)).map(item => <li key={item.id}><button type="button" onClick={() => { setReferencia(inicioDoDia(new Date(item.iniciaEm))); setVisao("dia"); }}><time dateTime={item.iniciaEm}><b>{new Date(item.iniciaEm).getDate()}</b><span>{new Date(item.iniciaEm).toLocaleDateString("pt-BR",{month:"short"})}</span></time><div><small>{CAMADAS.find(layer => layer.id === item.camada)?.rotulo}</small><strong>{item.titulo}</strong><span>{item.diaInteiro ? "Dia inteiro" : hora(item.iniciaEm)}{item.local ? ` · ${item.local}` : ""}</span></div><span aria-hidden="true">→</span></button></li>)}</ol>}
      <a href="/painel?view=fio">Acompanhar o Fio do dia →</a></details></div>
    </section>
  );
}
