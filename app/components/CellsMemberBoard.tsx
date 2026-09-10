"use client";

import { FormEvent, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Cell } from "./TenantOperations";

// A aba Célula atende duas pessoas diferentes. A gestão (pastor, presbítero,
// líder no computador) já tinha tela. Esta é a outra: o membro que precisa
// achar uma célula, pedir para entrar e acompanhar a própria — a mesma tela que
// o líder recebe no celular, onde ele só faz o que é urgente: mandar o
// relatório do encontro e responder quem pediu para entrar.

const DAY_LABELS: Record<string, string> = {
  DOM: "Domingo", SEG: "Segunda", TER: "Terça", QUA: "Quarta",
  QUI: "Quinta", SEX: "Sexta", SAB: "Sábado",
};
const DAY_SHORT: Record<string, string> = {
  DOM: "Dom", SEG: "Seg", TER: "Ter", QUA: "Qua", QUI: "Qui", SEX: "Sex", SAB: "Sáb",
};

type CellSituation = "MEMBRO" | "PENDENTE" | "ABERTA";

function situationOf(cell: Cell): CellSituation {
  if (cell.sou_membro) return "MEMBRO";
  if (cell.minha_solicitacao) return "PENDENTE";
  return "ABERTA";
}

const SITUATION_LABEL: Record<CellSituation, string> = {
  MEMBRO: "Já participo",
  PENDENTE: "Solicitação pendente",
  ABERTA: "Aberta",
};

function meetingLine(cell: Cell) {
  const days = cell.dias_reuniao.map((day) => DAY_SHORT[day] || day).join(", ");
  if (!days) return cell.horario_reuniao || "Encontros a definir";
  return cell.horario_reuniao ? `${days}, ${cell.horario_reuniao}` : days;
}

function fullMeetingLine(cell: Cell) {
  const days = cell.dias_reuniao.map((day) => DAY_LABELS[day] || day).join(" e ");
  if (!days) return cell.horario_reuniao || "A definir";
  return cell.horario_reuniao ? `${days}, ${cell.horario_reuniao}` : days;
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

function formatMeetingDate(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })} • ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function CellsMemberBoard({
  cells,
  loading,
  saving,
  isMobile,
  agora,
  onRequestEntry,
  onCancelRequest,
  onSendReport,
  onDecideRequest,
}: {
  cells: Cell[];
  loading: boolean;
  saving: boolean;
  isMobile: boolean;
  agora: number;
  onRequestEntry: (cell: Cell, data: Record<string, unknown>) => Promise<boolean>;
  onCancelRequest: (cell: Cell) => Promise<void>;
  onSendReport: (cell: Cell, data: Record<string, unknown>, form: HTMLFormElement) => Promise<void>;
  onDecideRequest: (cell: Cell, requestId: number, status: "APROVADA" | "RECUSADA") => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [network, setNetwork] = useState("");
  const [day, setDay] = useState("");
  const [situation, setSituation] = useState<"" | CellSituation>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const activeCells = useMemo(() => cells.filter((cell) => cell.ativo), [cells]);
  const myCells = useMemo(() => activeCells.filter((cell) => cell.sou_membro), [activeCells]);
  const pendingCells = useMemo(
    () => activeCells.filter((cell) => cell.minha_solicitacao),
    [activeCells],
  );
  const networks = useMemo(
    () => [...new Set(activeCells.map((cell) => cell.rede).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [activeCells],
  );

  // Os encontros vêm da agenda real das células em que a pessoa está; a rota já
  // devolve só o que ainda não terminou, então a lista não precisa de relógio
  // para existir — o relógio só decide o que já passou nesta sessão.
  const upcomingMeetings = useMemo(() => {
    return myCells
      .flatMap((cell) => cell.agenda.map((item) => ({ ...item, cellName: cell.nome })))
      .filter((item) => !agora || Date.parse(item.inicia_em) >= agora)
      .sort((left, right) => Date.parse(left.inicia_em) - Date.parse(right.inicia_em));
  }, [myCells, agora]);

  const visibleCells = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return activeCells.filter((cell) => {
      if (network && cell.rede !== network) return false;
      if (day && !cell.dias_reuniao.includes(day)) return false;
      if (situation && situationOf(cell) !== situation) return false;
      if (!term) return true;
      return [cell.nome, cell.endereco_publico, cell.lider_nome, cell.rede, ...cell.tags]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [activeCells, search, network, day, situation]);

  // Abre já na célula da pessoa: é a que ela veio ver. Sem célula, na primeira
  // da lista, para o painel de perfil nunca aparecer vazio no computador. A
  // escolha é derivada na renderização — guardar isso em efeito faria o painel
  // piscar a cada recarga da lista.
  const selected =
    cells.find((cell) => cell.id === selectedId) ||
    myCells[0] ||
    pendingCells[0] ||
    visibleCells[0] ||
    null;
  const selectedSituation = selected ? situationOf(selected) : "ABERTA";
  const nextMeeting = selected
    ? [...selected.agenda]
        .filter((item) => !agora || Date.parse(item.inicia_em) >= agora)
        .sort((left, right) => Date.parse(left.inicia_em) - Date.parse(right.inicia_em))[0]
    : undefined;

  function openCell(cell: Cell) {
    setSelectedId(cell.id);
    if (isMobile) setSheetOpen(true);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const done = await onRequestEntry(selected, data);
    if (done) setRequestOpen(false);
  }

  const profile = selected && (
    <>
      <div className="cell-member-cover-v7">
        {selected.capa_url
          ? <img src={selected.capa_url} alt="" loading="lazy" />
          : <span className="cell-member-cover-fallback-v7" aria-hidden="true" />}
        <div className="cell-member-cover-copy-v7">
          <strong>{selected.nome}</strong>
          <span>{selected.rede || "Célula da comunidade"}</span>
        </div>
        <i className="cell-member-cover-tag-v7" data-situacao={selectedSituation}>{SITUATION_LABEL[selectedSituation]}</i>
      </div>
      <div className="cell-member-profile-body-v7">
        <dl className="cell-member-info-v7">
          <div><dt>Líder</dt><dd>{selected.lider_nome || selected.responsavel || "A definir"}</dd></div>
          <div><dt>Encontro</dt><dd>{fullMeetingLine(selected)}</dd></div>
          <div><dt>Local</dt><dd>{selected.endereco_publico || "Combinado com a liderança"}</dd></div>
          <div><dt>Pessoas</dt><dd>{selected.membros_total + selected.visitantes_ativos} participantes</dd></div>
        </dl>

        <p className="cell-member-desc-v7">
          {selected.descricao_publica || "Esta célula ainda não escreveu uma apresentação pública. Fale com a liderança para saber como são os encontros."}
        </p>

        {Boolean(selected.tags.length) && (
          <div className="cell-member-tags-v7">
            {selected.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        )}

        {nextMeeting && (
          <div className="cell-member-next-v7">
            <div><small>Próximo encontro</small><strong>{formatMeetingDate(nextMeeting.inicia_em)}</strong></div>
            {nextMeeting.lembrete && <p>{nextMeeting.lembrete}</p>}
          </div>
        )}

        {selected.sou_membro && selected.membros.length > 0 && (
          <div className="cell-member-people-v7">
            <small>Quem caminha com você</small>
            <div>
              {selected.membros.map((member) => (
                <span key={member.id} title={member.name}>
                  <i aria-hidden="true">{initialsOf(member.name)}</i>
                  {member.name.split(/\s+/)[0]}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="cell-member-actions-v7">
          {selectedSituation === "ABERTA" && (
            <button type="button" className="cell-member-primary-v7" onClick={() => setRequestOpen(true)}>
              Solicitar entrada
            </button>
          )}
          {selectedSituation === "PENDENTE" && (
            <button type="button" className="cell-member-cancel-v7" disabled={saving} onClick={() => void onCancelRequest(selected)}>
              Cancelar solicitação
            </button>
          )}
          {selectedSituation === "MEMBRO" && (
            <span className="cell-member-badge-v7">Você participa desta célula</span>
          )}
          {selected.lider_usuario_id && (
            <button
              type="button"
              className="cell-member-secondary-v7"
              onClick={() => window.dispatchEvent(new CustomEvent("vinkulo:open-chat", { detail: { userId: selected.lider_usuario_id } }))}
            >
              Falar com o líder
            </button>
          )}
        </div>

        {/* No celular a liderança faz só o que não pode esperar pelo computador:
            registrar o encontro e responder quem pediu para entrar. */}
        {selected.can_operate && isMobile && (
          <section className="cell-member-leader-v7" aria-label="Ações da liderança">
            <header><small>LIDERANÇA DESTA CÉLULA</small><strong>O essencial no celular</strong></header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = Object.fromEntries(new FormData(form).entries());
                void onSendReport(selected, { ...data, aconteceu: data.aconteceu === "true" }, form);
              }}
            >
              <strong>Relatório do encontro</strong>
              <label>Data<input name="dataReuniao" type="date" required /></label>
              <label>Aconteceu?<select name="aconteceu"><option value="true">Sim</option><option value="false">Não</option></select></label>
              <label>Presentes<input name="presentes" type="number" min="0" defaultValue="0" /></label>
              <label>Visitantes<input name="visitantes" type="number" min="0" defaultValue="0" /></label>
              <button disabled={saving}>{saving ? "Enviando…" : "Enviar relatório"}</button>
            </form>
            <div className="cell-member-leader-requests-v7">
              <strong>Pedidos para entrar <i>{selected.solicitacoes.length}</i></strong>
              {selected.solicitacoes.map((request) => (
                <article key={request.id}>
                  <div><strong>{request.nome}</strong><small>{request.contato || "Sem contato"}</small>{request.mensagem && <p>{request.mensagem}</p>}</div>
                  <div>
                    <button type="button" disabled={saving} onClick={() => void onDecideRequest(selected, request.id, "APROVADA")}>Aprovar</button>
                    <button type="button" disabled={saving} className="danger" onClick={() => void onDecideRequest(selected, request.id, "RECUSADA")}>Recusar</button>
                  </div>
                </article>
              ))}
              {!selected.solicitacoes.length && <p className="cell-member-empty-v7">Nenhum pedido esperando resposta.</p>}
            </div>
            <p className="cell-member-leader-note-v7">Integrantes, agenda e configurações da célula ficam no computador.</p>
          </section>
        )}
      </div>
    </>
  );

  return (
    <section className="cell-member-board-v7" aria-busy={loading}>
      <header className="cell-member-head-v7">
        <div>
          <h1>Célula</h1>
          <p>Descubra, acompanhe e solicite entrada em uma célula.</p>
        </div>
        <blockquote className="cell-member-verse-v7">
          “Porque onde estiverem dois ou três reunidos em meu nome, ali estou eu no meio deles.”
          <cite>Mateus 18:20</cite>
        </blockquote>
      </header>

      <section className="cell-member-stats-v7" aria-label="Resumo da sua participação">
        <article data-tone="violet">
          <span aria-hidden="true">◉</span>
          <div>
            <small>Minha célula</small>
            <strong>{myCells[0]?.nome || "Ainda não faz parte"}</strong>
            <p>{myCells[0] ? `${myCells[0].rede ? `${myCells[0].rede} • ` : ""}${myCells[0].membros_total} membros` : "Escolha uma célula abaixo para pedir entrada"}</p>
          </div>
        </article>
        <article data-tone="amber">
          <span aria-hidden="true">◔</span>
          <div>
            <small>Minhas solicitações</small>
            <strong>{pendingCells.length}</strong>
            <p>{pendingCells.length ? "Aguardando resposta da liderança" : "Nenhum pedido em aberto"}</p>
          </div>
        </article>
        <article data-tone="blue">
          <span aria-hidden="true">▤</span>
          <div>
            <small>Próximos encontros</small>
            <strong>{upcomingMeetings.length}</strong>
            <p>{upcomingMeetings[0] ? formatMeetingDate(upcomingMeetings[0].inicia_em) : "Sem encontros marcados"}</p>
          </div>
        </article>
        <article data-tone="green">
          <span aria-hidden="true">⌖</span>
          <div>
            <small>Células disponíveis</small>
            <strong>{activeCells.filter((cell) => !cell.sou_membro).length}</strong>
            <p>Abertas para novos participantes</p>
          </div>
        </article>
      </section>

      <div className="cell-member-filters-v7">
        <label className="cell-member-search-v7">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por célula, bairro ou líder" aria-label="Buscar célula" />
        </label>
        {Boolean(networks.length) && (
          <label className="cell-member-select-v7">
            <span className="sr-only-v7">Rede</span>
            <select value={network} onChange={(event) => setNetwork(event.target.value)} aria-label="Filtrar por rede">
              <option value="">Todas as redes</option>
              {networks.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        )}
        <label className="cell-member-select-v7">
          <select value={day} onChange={(event) => setDay(event.target.value)} aria-label="Filtrar por dia">
            <option value="">Todos os dias</option>
            {Object.entries(DAY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="cell-member-select-v7">
          <select value={situation} onChange={(event) => setSituation(event.target.value as "" | CellSituation)} aria-label="Filtrar por situação">
            <option value="">Todas as situações</option>
            <option value="MEMBRO">Minha célula</option>
            <option value="PENDENTE">Com solicitação minha</option>
            <option value="ABERTA">Abertas para entrar</option>
          </select>
        </label>
      </div>

      <div className="cell-member-workspace-v7">
        <div className="cell-member-list-v7">
          <header>
            <strong>Células da comunidade</strong>
            <span>{visibleCells.length} {visibleCells.length === 1 ? "encontrada" : "encontradas"}</span>
          </header>
          {visibleCells.map((cell) => {
            const cellSituation = situationOf(cell);
            return (
              <button
                type="button"
                key={cell.id}
                className={`cell-member-row-v7${selected?.id === cell.id ? " selected" : ""}`}
                onClick={() => openCell(cell)}
              >
                <span className="cell-member-row-icon-v7" aria-hidden="true">{initialsOf(cell.nome.replace(/^célula\s+/i, ""))}</span>
                <span className="cell-member-row-copy-v7">
                  <strong>{cell.nome}</strong>
                  <small>{[cell.endereco_publico, meetingLine(cell), cell.rede].filter(Boolean).join(" • ")}</small>
                </span>
                <span className="cell-member-row-leader-v7">
                  <small>Líder</small>
                  <strong>{cell.lider_nome || cell.responsavel || "A definir"}</strong>
                </span>
                <span className="cell-member-row-count-v7">
                  <strong>{cell.membros_total}</strong>
                  <small>membros</small>
                </span>
                <i className="cell-member-status-v7" data-situacao={cellSituation}>{SITUATION_LABEL[cellSituation]}</i>
                <span className="cell-member-row-arrow-v7" aria-hidden="true">›</span>
              </button>
            );
          })}
          {!loading && !visibleCells.length && (
            <p className="cell-member-empty-v7">Nenhuma célula encontrada com esses filtros.</p>
          )}
        </div>

        {!isMobile && selected && (
          <aside className="cell-member-profile-v7" aria-label={`Perfil da célula ${selected.nome}`}>
            {profile}
          </aside>
        )}
      </div>

      <section className="cell-member-bottom-v7">
        <article>
          <header><strong>Minhas solicitações</strong></header>
          {pendingCells.map((cell) => (
            <div key={cell.id}>
              <div><strong>{cell.nome}</strong><small>Enviada em {new Date(cell.minha_solicitacao!.criado_em).toLocaleDateString("pt-BR")}</small></div>
              <i className="cell-member-status-v7" data-situacao="PENDENTE">Aguardando</i>
            </div>
          ))}
          {!pendingCells.length && <p className="cell-member-empty-v7">Você não tem pedidos em aberto.</p>}
        </article>

        <article>
          <header><strong>Próximos encontros</strong></header>
          {upcomingMeetings.slice(0, 4).map((item) => (
            <div key={item.id}>
              <div><strong>{item.titulo}</strong><small>{item.cellName} • {formatMeetingDate(item.inicia_em)}</small></div>
            </div>
          ))}
          {!upcomingMeetings.length && <p className="cell-member-empty-v7">Nenhum encontro marcado por enquanto.</p>}
        </article>

        <article className="cell-member-steps-v7">
          <header><strong>Como funciona</strong></header>
          <ol>
            <li><i>1</i><div><strong>Escolha uma célula</strong><small>Use os filtros e veja o perfil de cada uma.</small></div></li>
            <li><i>2</i><div><strong>Solicite entrada</strong><small>A liderança recebe seu pedido com o que você escrever.</small></div></li>
            <li><i>3</i><div><strong>Aguarde a resposta</strong><small>Você acompanha o pedido aqui mesmo e pode cancelar.</small></div></li>
            <li><i>4</i><div><strong>Participe</strong><small>Aprovado, você passa a ver os encontros da célula.</small></div></li>
          </ol>
        </article>
      </section>

      {isMobile && sheetOpen && selected && typeof document !== "undefined" && createPortal(
        <div className="cell-member-sheet-v7" role="dialog" aria-modal="true" aria-label={`Perfil da célula ${selected.nome}`}>
          <header>
            <button type="button" onClick={() => setSheetOpen(false)} aria-label="Voltar">←</button>
            <strong>Perfil da célula</strong>
          </header>
          <div className="cell-member-sheet-body-v7">{profile}</div>
        </div>,
        document.body,
      )}

      {requestOpen && selected && typeof document !== "undefined" && createPortal(
        <div className="cell-member-modal-v7" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setRequestOpen(false); }}>
          <form className="cell-member-modal-card-v7" role="dialog" aria-modal="true" aria-label="Solicitar entrada" onSubmit={submitRequest}>
            <header>
              <div><small>SOLICITAR ENTRADA</small><h2>{selected.nome}</h2><p>A liderança da célula recebe seu nome, seu contato e o que você escrever aqui.</p></div>
              <button type="button" aria-label="Fechar" onClick={() => setRequestOpen(false)}>×</button>
            </header>
            <label>Seu nome<input name="nome" required minLength={5} maxLength={120} autoComplete="name" /></label>
            <label>WhatsApp ou e-mail<input name="contato" required maxLength={160} autoComplete="email" /></label>
            <label>Por que quer participar? <small>opcional</small>
              <textarea name="mensagem" rows={3} maxLength={500} placeholder="Conte um pouco sobre você e o melhor horário para contato." />
            </label>
            <label className="cell-member-consent-v7">
              <input type="checkbox" required />
              Autorizo a liderança desta célula a entrar em contato comigo sobre este pedido.
            </label>
            <footer>
              <button type="button" onClick={() => setRequestOpen(false)}>Cancelar</button>
              <button disabled={saving}>{saving ? "Enviando…" : "Enviar solicitação"}</button>
            </footer>
          </form>
        </div>,
        document.body,
      )}
    </section>
  );
}
