"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

// A grade de horas precisa de um piso e um teto: sem isso, um compromisso às
// 5h esticaria a tela inteira para mostrar horas vazias.
const HORA_MIN_PADRAO = 7;
const HORA_MAX_PADRAO = 22;
const ALTURA_HORA = 56;
const DURACAO_PADRAO_MIN = 60;

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

function minutosDoDia(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function duracaoMin(item: ItemAgenda) {
  if (!item.terminaEm) return DURACAO_PADRAO_MIN;
  const dur = (Date.parse(item.terminaEm) - Date.parse(item.iniciaEm)) / 60000;
  return dur > 0 ? dur : DURACAO_PADRAO_MIN;
}

// Compromissos que se cruzam dividem a largura da coluna, em vez de um cobrir
// o outro. É o mínimo para a semana continuar legível num domingo cheio.
function distribuirColunas(itens: ItemAgenda[]) {
  const ordenados = [...itens].sort(
    (a, b) => minutosDoDia(a.iniciaEm) - minutosDoDia(b.iniciaEm),
  );
  const faixas: ItemAgenda[][] = [];
  for (const item of ordenados) {
    const inicio = minutosDoDia(item.iniciaEm);
    let alocado = false;
    for (const faixa of faixas) {
      const ultimo = faixa[faixa.length - 1];
      if (minutosDoDia(ultimo.iniciaEm) + duracaoMin(ultimo) <= inicio) {
        faixa.push(item);
        alocado = true;
        break;
      }
    }
    if (!alocado) faixas.push([item]);
  }
  const mapa = new Map<string, { coluna: number; total: number }>();
  faixas.forEach((faixa, coluna) => {
    for (const item of faixa) mapa.set(item.id, { coluna, total: faixas.length });
  });
  return mapa;
}

export default function AgendaCalendar({
  podeVerEventos,
  podeAprovar,
  aoCriarEvento,
}: {
  podeVerEventos: boolean;
  podeAprovar: boolean;
  // Quem hospeda o calendário decide o que "criar evento" faz; aqui só existe
  // o lugar certo para essa ação morar — junto da navegação de período.
  aoCriarEvento?: () => void;
}) {
  const [referencia, setReferencia] = useState(() => inicioDoDia(new Date()));
  const [visao, setVisao] = useState<Visao>("semana");
  const [itens, setItens] = useState<ItemAgenda[]>([]);
  const [camadasAtivas, setCamadasAtivas] = useState<Camada[]>(["EVENTO", "ESCALA", "PESSOAL"]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const dias = useMemo(() => {
    if (visao === "mes") return gradeDoMes(referencia);
    if (visao === "semana") return gradeDaSemana(referencia);
    return [referencia];
  }, [referencia, visao]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const de = inicioDoDia(dias[0]);
      const ate = new Date(dias[dias.length - 1]);
      ate.setHours(23, 59, 59, 999);
      const resposta = await fetch(
        `/api/pilot/agenda?de=${encodeURIComponent(de.toISOString())}&ate=${encodeURIComponent(ate.toISOString())}`,
        { cache: "no-store" },
      );
      const dados = (await resposta.json()) as { itens?: ItemAgenda[]; error?: string };
      if (!resposta.ok) throw new Error(dados.error || "Não foi possível carregar a agenda.");
      setItens(dados.itens || []);
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : "Não foi possível carregar a agenda.");
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => {
    // Adiar a busca tira o setState do corpo síncrono do efeito, que dispara
    // renderizações em cascata. É o mesmo padrão do resto do painel.
    const timer = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(timer);
  }, [carregar]);

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

  // A faixa de horas acompanha o conteúdo: se há algo às 6h, a grade abre às 6h.
  const [horaMin, horaMax] = useMemo(() => {
    let min = HORA_MIN_PADRAO;
    let max = HORA_MAX_PADRAO;
    for (const item of visiveis) {
      const inicio = Math.floor(minutosDoDia(item.iniciaEm) / 60);
      const fim = Math.ceil((minutosDoDia(item.iniciaEm) + duracaoMin(item)) / 60);
      if (inicio < min) min = inicio;
      if (fim > max) max = fim;
    }
    return [Math.max(0, min), Math.min(24, Math.max(max, min + 4))];
  }, [visiveis]);

  const horas = useMemo(
    () => Array.from({ length: horaMax - horaMin }, (_, i) => horaMin + i),
    [horaMin, horaMax],
  );

  function alternarCamada(camada: Camada) {
    setCamadasAtivas((atuais) =>
      atuais.includes(camada) ? atuais.filter((c) => c !== camada) : [...atuais, camada],
    );
  }

  function mover(passo: number) {
    setReferencia((atual) => {
      const proximo = new Date(atual);
      if (visao === "mes") proximo.setMonth(atual.getMonth() + passo);
      else if (visao === "semana") proximo.setDate(atual.getDate() + passo * 7);
      else proximo.setDate(atual.getDate() + passo);
      return proximo;
    });
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
      if (dados.message) setErro(dados.message);
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
    const resposta = await fetch(`/api/pilot/agenda?id=${origemId}`, { method: "DELETE" });
    if (!resposta.ok) {
      const dados = (await resposta.json()) as { error?: string };
      setErro(dados.error || "Não foi possível remover.");
      return;
    }
    await carregar();
  }

  async function aprovarCompromisso(origemId: number) {
    setErro("");
    const resposta = await fetch("/api/pilot/agenda", { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ id:origemId, acao:"APROVAR" }) });
    const dados = await resposta.json() as { error?:string };
    if (!resposta.ok) { setErro(dados.error || "Não foi possível aprovar."); return; }
    await carregar();
  }

  const camadasVisiveis = CAMADAS.filter((c) => c.id !== "EVENTO" || podeVerEventos);
  const hojeChave = chaveDia(new Date());
  const itensDoDiaAberto = diaAberto ? porDia.get(diaAberto) || [] : [];

  const rotuloPeriodo =
    visao === "dia"
      ? referencia.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
      : visao === "semana"
        ? `${dias[0].toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${dias[6].toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`
        : referencia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  function blocoEstilo(item: ItemAgenda, coluna: number, total: number) {
    const topo = ((minutosDoDia(item.iniciaEm) - horaMin * 60) / 60) * ALTURA_HORA;
    const altura = Math.max((duracaoMin(item) / 60) * ALTURA_HORA, 26);
    return {
      top: `${topo}px`,
      height: `${altura}px`,
      left: `calc(${(coluna / total) * 100}% + 2px)`,
      width: `calc(${100 / total}% - 4px)`,
    };
  }

  return (
    <section className="agenda-calendario" aria-label="Calendário da agenda">
      <header className="agenda-calendario-topo">
        <div className="agenda-calendario-periodo">
          <button type="button" onClick={() => mover(-1)} aria-label="Período anterior">‹</button>
          <button type="button" onClick={() => mover(1)} aria-label="Próximo período">›</button>
          <strong>{rotuloPeriodo}</strong>
          <button
            type="button"
            className="agenda-hoje"
            onClick={() => setReferencia(inicioDoDia(new Date()))}
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
              onClick={() => setVisao(modo)}
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

      <div className="agenda-camadas" role="group" aria-label="Camadas do calendário">
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
        {aoCriarEvento && (
          <button type="button" className="agenda-novo-evento" onClick={aoCriarEvento}>
            + Novo evento
          </button>
        )}
        <button
          type="button"
          className="agenda-novo"
          onClick={() => setFormAberto((aberto) => !aberto)}
        >
          {formAberto ? "Cancelar" : "Novo compromisso"}
        </button>
      </div>

      {erro && <p className="agenda-erro" role="alert">{erro}</p>}

      {/* O formulário fica ao lado do calendário, não empurrando-o para baixo:
          quem está marcando algo precisa continuar vendo os dias ocupados. */}
      <div className={`agenda-corpo${formAberto ? " com-form" : ""}`}>
      {formAberto && (
        <form className="agenda-form" onSubmit={criarCompromisso}>
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
            <input name="iniciaEm" type="datetime-local" required />
          </label>
          <label>
            Término
            <input name="terminaEm" type="datetime-local" />
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
      {visao === "dia" && (
        <div className="agenda-linha-tempo" aria-busy={carregando}>
          {(porDia.get(chaveDia(referencia)) || []).length === 0 ? (
            <p className="agenda-vazio">Nada marcado neste dia.</p>
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
      {visao === "semana" && (
        <div className="agenda-semana" aria-busy={carregando}>
          <div className="agenda-semana-cabecalho">
            <span className="agenda-semana-canto" />
            {dias.map((dia) => (
              <span
                key={chaveDia(dia)}
                className={`agenda-semana-dia${chaveDia(dia) === hojeChave ? " hoje" : ""}`}
              >
                <small>{DIAS_CURTOS[dia.getDay()]}</small>
                <b>{dia.getDate()}</b>
              </span>
            ))}
          </div>
          <div className="agenda-semana-corpo" style={{ height: `${horas.length * ALTURA_HORA}px` }}>
            <div className="agenda-semana-horas">
              {horas.map((h) => (
                <span key={h} style={{ height: `${ALTURA_HORA}px` }}>{String(h).padStart(2, "0")}h</span>
              ))}
            </div>
            {dias.map((dia) => {
              const doDia = porDia.get(chaveDia(dia)) || [];
              const colunas = distribuirColunas(doDia);
              return (
                <div className="agenda-semana-coluna" key={chaveDia(dia)}>
                  {horas.map((h) => (
                    <span key={h} className="agenda-semana-linha" style={{ height: `${ALTURA_HORA}px` }} />
                  ))}
                  {doDia.map((item) => {
                    const pos = colunas.get(item.id) || { coluna: 0, total: 1 };
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`agenda-bloco camada-${item.camada.toLowerCase()}`}
                        style={blocoEstilo(item, pos.coluna, pos.total)}
                        onClick={() => { setVisao("dia"); setReferencia(inicioDoDia(dia)); }}
                        title={`${hora(item.iniciaEm)} — ${item.titulo}`}
                      >
                        <b>{hora(item.iniciaEm)}</b>
                        <span>{item.titulo}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MÊS — visão de planejamento: chips compactos e "+N" quando não cabe. */}
      {visao === "mes" && (
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
                className={`agenda-dia${doPeriodo ? "" : " fora"}${chave === hojeChave ? " hoje" : ""}`}
                onClick={() => setDiaAberto(chave === diaAberto ? null : chave)}
                aria-label={`${dia.getDate()} — ${doDia.length} compromisso(s)`}
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

      {visao === "mes" && diaAberto && (
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
    </section>
  );
}
