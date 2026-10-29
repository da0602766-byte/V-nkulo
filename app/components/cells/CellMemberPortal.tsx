"use client";
import {useBrowserSearch} from "../useBrowserSearch";

import TransientFeedback from "../TransientFeedback";

import { useEffect, useMemo, useState } from "react";
import { initialsOf } from "./format";
import type { CellsData } from "./useCellsData";
import { DAY_LABELS, type Cell } from "./types";
import CellDirectoryFilters, { CellDirectoryEmpty, useCellDirectory, type CellDirectory, type ParticipationStatus } from "./CellDirectoryFilters";



const STATUS_BADGE: Record<ParticipationStatus, { label: string; tom: string }> = {
  participo: { label: "Já participo", tom: "acc" },
  pendente: { label: "Solicitação pendente", tom: "warn" },
  aberta: { label: "Aberta", tom: "ok" },
};

const PENDING_KEY = "vinkulo:celulas:solicitacoes-pendentes";

// A tabela de solicitações não guarda o usuário que pediu (ela também recebe
// pedidos de visitantes sem conta, pela página pública) — então "pendente"
// aqui é uma lembrança só deste aparelho, não um status vindo do servidor.
// Assim que a pessoa aparece como integrante da célula (minha_participacao),
// o lembrete perde a validade e some sozinho.
function readPendingIds(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(Number) : []);
  } catch {
    return new Set();
  }
}

function markPending(cellId: number) {
  const next = readPendingIds();
  next.add(cellId);
  window.localStorage.setItem(PENDING_KEY, JSON.stringify([...next]));
}

// Participação em células com apresentações próprias para computador e celular.
export default function CellMemberPortal({
  communityName,
  cells,
  onBackToGestao,
}: {
  communityName: string;
  cells: CellsData;
  onBackToGestao?: () => void;
}) {
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());
  const search=useBrowserSearch();
  const [mobileSelection, setMobileSelectedId] = useState<number | null | undefined>(undefined);
  const mobileSelectedId=mobileSelection===undefined?(Number(new URLSearchParams(search).get("celula"))||null):mobileSelection;
  // Abaixo de 680px, mostrar a interface própria do celular.
  const [isRealMobile, setIsRealMobile] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setPendingIds(readPendingIds()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 680px)");
    const sync = () => setIsRealMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const list = useMemo(() => cells.cells.filter((cell) => cell.ativo), [cells.cells]);

  function statusOf(cell: Cell): ParticipationStatus {
    if (cell.minha_participacao) return "participo";
    if (pendingIds.has(cell.id)) return "pendente";
    return "aberta";
  }

  const directory = useCellDirectory(list, statusOf);
  const mobileSelected = list.find((cell) => cell.id === mobileSelectedId) || null;

  async function requestEntry(cell: Cell, nome: string, contato: string, mensagem: string) {
    const ok = await cells.requestCellEntry(cell.id, cell.nome, { nome, contato, mensagem });
    if (ok) {
      markPending(cell.id);
      setPendingIds(readPendingIds());
    }
    return ok;
  }

  if (isRealMobile) {
    return (
      <section className="cpart-shell cpart-shell-mobile" aria-busy={cells.loading}>
        <OperationFeedback message={cells.message} error={cells.error} />
        {mobileSelected ? (
          <MobileDetail cell={mobileSelected} cells={cells} status={statusOf(mobileSelected)} onBack={() => setMobileSelectedId(null)} onBackToGestao={onBackToGestao} onRequestEntry={requestEntry} />
        ) : (
          <MobileList list={list} directory={directory} statusOf={statusOf} onSelect={(cell) => setMobileSelectedId(cell.id)} onBackToGestao={onBackToGestao} />
        )}
      </section>
    );
  }

  return (
    <section className="cpart-shell" aria-busy={cells.loading}>
      <CellPortalDesktop
        communityName={communityName}
        cells={cells}
        list={list}
        directory={directory}
        statusOf={statusOf}
        onRequestEntry={requestEntry}
        onBackToGestao={onBackToGestao}
      />
    </section>
  );
}

function OperationFeedback({ message, error }: { message: string; error: string }) {
  if (!message && !error) return null;
  return (
    <TransientFeedback className={`operations-feedback ${error ? "error" : ""}`} role="status">
      {error || message}
    </TransientFeedback>
  );
}

// ── Caixinha de destaque, editável pela liderança ──────────────────────────
function HighlightCard({ cells }: { cells: CellsData }) {
  const [editing, setEditing] = useState(false);
  const [titulo, setTitulo] = useState(cells.highlight.titulo);
  const [mensagem, setMensagem] = useState(cells.highlight.mensagem);

  function openEditing() {
    // Semeia o formulário com o valor atual só ao abrir — não precisa de
    // efeito: enquanto fechado, o card lê cells.highlight direto.
    setTitulo(cells.highlight.titulo);
    setMensagem(cells.highlight.mensagem);
    setEditing(true);
  }

  if (editing) {
    return (
      <form
        className="cpart-highlight cpart-highlight-editing"
        onSubmit={(event) => {
          event.preventDefault();
          void cells.saveHighlight(titulo.trim(), mensagem.trim()).then((ok) => { if (ok) setEditing(false); });
        }}
      >
        <label>Título ou referência<input value={titulo} onChange={(event) => setTitulo(event.target.value)} maxLength={80} required /></label>
        <label>Mensagem<textarea value={mensagem} onChange={(event) => setMensagem(event.target.value)} maxLength={400} rows={3} required /></label>
        <div className="cpart-highlight-actions">
          <button type="button" onClick={() => setEditing(false)}>Cancelar</button>
          <button disabled={cells.saving}>{cells.saving ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    );
  }

  return (
    <div className="cpart-highlight">
      {cells.highlight.podeEditar && (
        <button type="button" className="cpart-highlight-edit" onClick={openEditing} aria-label="Editar mensagem de destaque" title="Editar mensagem de destaque">
          ✎
        </button>
      )}
      <p className="cpart-kicker">{cells.highlight.titulo}</p>
      <p className="cpart-highlight-text">&ldquo;{cells.highlight.mensagem}&rdquo;</p>
    </div>
  );
}

// ── Frame 3 — computador ────────────────────────────────────────────────────
function CellPortalDesktop({
  communityName,
  cells,
  list,
  directory,
  statusOf,
  onRequestEntry,
  onBackToGestao,
}: {
  communityName: string;
  cells: CellsData;
  list: Cell[];
  directory: CellDirectory;
  statusOf: (cell: Cell) => ParticipationStatus;
  onRequestEntry: (cell: Cell, nome: string, contato: string, mensagem: string) => Promise<boolean>;
  onBackToGestao?: () => void;
}) {
  const search=useBrowserSearch();
  const [selection, setSelectedId] = useState<number | null | undefined>(undefined);
  const selectedId=selection===undefined?(Number(new URLSearchParams(search).get("celula"))||null):selection;
  const { filtered } = directory;
  const selected = filtered.find((cell) => cell.id === selectedId) || filtered[0] || null;
  const myCell = list.find((cell) => cell.minha_participacao);
  const pendingCount = list.filter((cell) => statusOf(cell) === "pendente").length;
  const myMeetings = list.filter((cell) => cell.minha_participacao).reduce((total, cell) => total + cell.agenda.length, 0);
  const openCells = list.filter((cell) => statusOf(cell) === "aberta").length;
  const myUpcoming = list
    .filter((cell) => cell.minha_participacao)
    .flatMap((cell) => cell.agenda.map((item) => ({ ...item, cellName: cell.nome })))
    .sort((a, b) => Date.parse(a.inicia_em) - Date.parse(b.inicia_em))
    .slice(0, 3);

  return (
    <div className="cpart-desktop">
      <header className="cpart-header">
        <div>
          <p className="cpart-kicker">CÉLULAS · {communityName}</p>
          <h1>Células</h1>
          <p className="cpart-subtitle">Descubra, acompanhe e solicite entrada em uma célula.</p>
          {onBackToGestao && (
            <button type="button" className="cpart-back-to-gestao" onClick={onBackToGestao}>← Ver como gestão</button>
          )}
        </div>
        <HighlightCard cells={cells} />
      </header>

      <OperationFeedback message={cells.message} error={cells.error} />

      <div className="cpart-stats">
        <article className="cpart-stat cpart-stat-accent">
          <p className="cpart-stat-label">Minha célula</p>
          <p className="cpart-stat-value">{myCell?.nome || "Nenhuma"}</p>
          <p className="cpart-stat-sub">{myCell ? `${myCell.rede || "Sem rede"} · ${myCell.membros_total} membros` : "Você ainda não participa de uma célula"}</p>
        </article>
        <article className="cpart-stat">
          <p className="cpart-stat-label">Minhas solicitações</p>
          <p className="cpart-stat-value">{pendingCount}</p>
          <p className="cpart-stat-sub">aguardando resposta</p>
        </article>
        <article className="cpart-stat">
          <p className="cpart-stat-label">Próximos encontros</p>
          <p className="cpart-stat-value">{myMeetings}</p>
          <p className="cpart-stat-sub">nos próximos dias</p>
        </article>
        <article className="cpart-stat">
          <p className="cpart-stat-label">Células disponíveis</p>
          <p className="cpart-stat-value">{openCells}</p>
          <p className="cpart-stat-sub">abertas a novas entradas</p>
        </article>
      </div>

      <CellDirectoryFilters directory={directory} total={list.length} />

      <div className="cpart-body">
        <div className="cpart-list">
          {filtered.map((cell) => {
            const status = statusOf(cell);
            return (
              <button key={cell.id} type="button" aria-pressed={selected?.id === cell.id} className={`cpart-row${selected?.id === cell.id ? " active" : ""}`} onClick={() => setSelectedId(cell.id)}>
                <span className="cpart-avatar" aria-hidden="true">{initialsOf(cell.nome)}</span>
                <span className="cpart-row-copy">
                  <strong>{cell.nome}</strong>
                  <small>{[cell.rede, cell.dias_reuniao.map((day) => DAY_LABELS[day] || day).join(", "), cell.lider_nome || cell.responsavel].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="cpart-row-end">
                  <span className="cpart-badge" data-tom={STATUS_BADGE[status].tom}>{STATUS_BADGE[status].label}</span>
                  <small>{cell.membros_total} membros</small>
                </span>
              </button>
            );
          })}
          {!filtered.length && <CellDirectoryEmpty total={list.length} />}
        </div>
        <div className="cpart-profile">
          {selected ? (
            <CellProfilePanel key={selected.id} cell={selected} status={statusOf(selected)} onRequestEntry={onRequestEntry} saving={cells.saving} />
          ) : (
            <p className="cpart-empty">Selecione uma célula para ver o perfil.</p>
          )}
        </div>
      </div>

      <div className="cpart-footer-cards">
        <div className="cpart-footer-card">
          <p className="cpart-kicker">Minhas solicitações</p>
          {list.filter((cell) => statusOf(cell) === "pendente").map((cell) => (
            <div className="cpart-footer-row" key={cell.id}>
              <span className="cpart-avatar" aria-hidden="true">{initialsOf(cell.nome)}</span>
              <div><strong>{cell.nome}</strong><small>Aguardando resposta da liderança</small></div>
              <span className="cpart-badge" data-tom="warn">Pendente</span>
            </div>
          ))}
          {pendingCount === 0 && <p className="cpart-empty">Nenhuma solicitação em aberto.</p>}
        </div>
        <div className="cpart-footer-card">
          <p className="cpart-kicker">Próximos encontros</p>
          {myUpcoming.map((item) => (
            <div className="cpart-footer-meeting" key={item.id}>
              <span aria-hidden="true" />
              <div>
                <strong>{item.cellName}</strong>
                <small>{new Date(item.inicia_em).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} — {new Date(item.inicia_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>
              </div>
            </div>
          ))}
          {!myUpcoming.length && <p className="cpart-empty">Nenhum encontro programado.</p>}
        </div>
        <div className="cpart-footer-card">
          <p className="cpart-kicker">Como funciona</p>
          {[
            "Encontre uma célula próxima de você",
            "Envie uma solicitação de entrada",
            "Aguarde a aprovação do líder",
            "Participe do próximo encontro",
          ].map((passo, index) => (
            <div className="cpart-step" key={passo}>
              <span aria-hidden="true">{index + 1}</span>
              <p>{passo}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CellProfilePanel({
  cell,
  status,
  onRequestEntry,
  saving,
}: {
  cell: Cell;
  status: ParticipationStatus;
  onRequestEntry: (cell: Cell, nome: string, contato: string, mensagem: string) => Promise<boolean>;
  saving: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="cpart-panel">
      <div className="cpart-panel-cover">
        <span className="cpart-badge" data-tom={STATUS_BADGE[status].tom}>{STATUS_BADGE[status].label}</span>
        <h2>{cell.nome}</h2>
        <p>{cell.rede}</p>
      </div>
      <div className="cpart-panel-body">
        <div className="cpart-panel-grid">
          <div><p>Líder</p><strong>{cell.lider_nome || cell.responsavel}</strong></div>
          <div><p>Encontro</p><strong>{cell.horario_texto || cell.dias_reuniao.map((day) => DAY_LABELS[day] || day).join(", ") || "A definir"}</strong></div>
          <div><p>Local</p><strong>{cell.endereco_publico || "A definir"}</strong></div>
          <div><p>Pessoas</p><strong>{cell.membros_total + cell.visitantes_ativos}</strong></div>
        </div>
        <p className="cpart-panel-desc">{cell.descricao_publica || "Descrição pública ainda não informada."}</p>
        {cell.temas.length > 0 && (
          <div className="cpart-tags">
            {cell.temas.map((tema) => <span key={tema}>{tema}</span>)}
          </div>
        )}
        {cell.agenda.length > 0 && (
          <div className="cpart-next-meeting">
            <p className="cpart-kicker">Próximo encontro</p>
            <strong>{new Date(cell.agenda[0].inicia_em).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} — {new Date(cell.agenda[0].inicia_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong>
            <p>{cell.endereco_publico}</p>
          </div>
        )}
        {formOpen ? (
          <form
            className="cgestao-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = Object.fromEntries(new FormData(form));
              void onRequestEntry(cell, String(data.nome || ""), String(data.contato || ""), String(data.mensagem || "")).then((ok) => { if (ok) setFormOpen(false); });
            }}
          >
            <label>Nome completo<input name="nome" required minLength={5} maxLength={120} /></label>
            <label>WhatsApp ou e-mail<input name="contato" required maxLength={160} /></label>
            <label className="cgestao-wide">Mensagem<textarea name="mensagem" rows={2} maxLength={500} placeholder="Conte um pouco sobre você e o melhor horário para contato." /></label>
            <div className="cpart-panel-actions">
              <button type="button" onClick={() => setFormOpen(false)}>Cancelar</button>
              <button disabled={saving}>{saving ? "Enviando…" : "Enviar"}</button>
            </div>
          </form>
        ) : (
          <div className="cpart-panel-actions">
            {status === "aberta" && <button type="button" className="cgestao-btn-solid" onClick={() => setFormOpen(true)}>Solicitar entrada</button>}
            {status === "pendente" && <button type="button" className="cgestao-btn-outline" disabled>Aguardando aprovação</button>}
            {status === "participo" && <button type="button" className="cgestao-btn-outline" disabled>Você já participa</button>}
            {status !== "participo" && <button type="button" className="cgestao-btn-outline" onClick={() => setFormOpen(true)}>Falar com o líder</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Frame 4 — prévia e experiência de celular ──────────────────────────────
function MobileList({
  list,
  directory,
  statusOf,
  onSelect,
  onBackToGestao,
}: {
  list: Cell[];
  directory: CellDirectory;
  statusOf: (cell: Cell) => ParticipationStatus;
  onSelect: (cell: Cell) => void;
  onBackToGestao?: () => void;
}) {
  const myCell = list.find((cell) => cell.minha_participacao);
  const pendingCount = list.filter((cell) => statusOf(cell) === "pendente").length;
  const openCount = list.filter((cell) => statusOf(cell) === "aberta").length;
  return (
    <div>
      {onBackToGestao && <MobileManagementLink onClick={onBackToGestao} />}
      <div className="cpart-mobile-head">
        <h1>Células</h1>
        <p>Descubra, acompanhe e solicite entrada</p>
      </div>
      <div className="cpart-mobile-stats">
        <div><p>Minha célula</p><strong>{myCell?.nome || "Nenhuma"}</strong></div>
        <div><p>Solicitações</p><strong>{pendingCount}</strong></div>
        <div><p>Encontros</p><strong>{myCell?.agenda.length ?? 0}</strong></div>
        <div><p>Disponíveis</p><strong>{openCount}</strong></div>
      </div>
      <CellDirectoryFilters directory={directory} total={list.length} />
      {!directory.filtered.length && <CellDirectoryEmpty total={list.length} />}
      <div className="cpart-mobile-list">
        {directory.filtered.map((cell) => {
          const status = statusOf(cell);
          return (
            <button key={cell.id} type="button" onClick={() => onSelect(cell)}>
              <span className="cpart-avatar" aria-hidden="true">{initialsOf(cell.nome)}</span>
              <span className="cpart-row-copy"><strong>{cell.nome}</strong><small>{[cell.rede, cell.dias_reuniao.map((day) => DAY_LABELS[day] || day).join(", ")].filter(Boolean).join(" · ")}</small></span>
              <span className="cpart-badge" data-tom={STATUS_BADGE[status].tom}>{STATUS_BADGE[status].label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileDetail({
  cell,
  cells,
  status,
  onBack,
  onBackToGestao,
  onRequestEntry,
}: {
  cell: Cell;
  cells: CellsData;
  status: ParticipationStatus;
  onBack: () => void;
  onBackToGestao?: () => void;
  onRequestEntry: (cell: Cell, nome: string, contato: string, mensagem: string) => Promise<boolean>;
}) {
  return (
    <div className="cpart-mobile-profile">
      <div className="cpart-mobile-topbar">
        <button type="button" onClick={onBack} aria-label="Voltar">←</button>
        <span>Perfil da célula</span>
        {onBackToGestao && <button type="button" className="cpart-profile-management" onClick={onBackToGestao}>Gestão</button>}
      </div>
      <div className="cpart-panel-cover cpart-mobile-cover">
        <h2>{cell.nome}</h2>
        <p>{cell.rede}</p>
      </div>
      <div className="cpart-mobile-content">
        <div className="cpart-panel-grid">
          <div><p>Líder</p><strong>{cell.lider_nome || cell.responsavel}</strong></div>
          <div><p>Encontro</p><strong>{cell.horario_texto || cell.dias_reuniao.map((day) => DAY_LABELS[day] || day).join(", ") || "A definir"}</strong></div>
          <div><p>Local</p><strong>{cell.endereco_publico || "A definir"}</strong></div>
          <div><p>Pessoas</p><strong>{cell.membros_total + cell.visitantes_ativos}</strong></div>
        </div>
        <p className="cpart-panel-desc">{cell.descricao_publica}</p>
        {status !== "participo" && (
          <MobileEntryForm cell={cell} status={status} saving={cells.saving} onRequestEntry={onRequestEntry} />
        )}
        {cell.can_operate && <MobileLeaderEssentials cell={cell} cells={cells} />}
      </div>
    </div>
  );
}

function MobileManagementLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="cpart-mobile-back-gestao" onClick={onClick}>
      ← Voltar para gestão
    </button>
  );
}

function MobileEntryForm({
  cell,
  status,
  saving,
  onRequestEntry,
}: {
  cell: Cell;
  status: ParticipationStatus;
  saving: boolean;
  onRequestEntry: (cell: Cell, nome: string, contato: string, mensagem: string) => Promise<boolean>;
}) {
  if (status === "pendente") {
    return <p className="cpart-empty">Solicitação enviada. Aguarde a aprovação da liderança.</p>;
  }
  return (
    <form
      className="cgestao-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        void onRequestEntry(cell, String(data.nome || ""), String(data.contato || ""), String(data.mensagem || ""));
      }}
    >
      <label>Nome completo<input name="nome" required minLength={5} maxLength={120} /></label>
      <label>WhatsApp ou e-mail<input name="contato" required maxLength={160} /></label>
      <button disabled={saving}>{saving ? "Enviando…" : "Solicitar entrada"}</button>
    </form>
  );
}

function MobileLeaderEssentials({ cell, cells }: { cell: Cell; cells: CellsData }) {
  return (
    <div className="cpart-mobile-essentials">
      <p className="cpart-kicker">O essencial no celular</p>
      <div className="cpart-mobile-card">
        <p className="cpart-mobile-card-title">Relatório do encontro</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = Object.fromEntries(new FormData(form));
            void cells.cellAction(cell.id, { acao: "RELATORIO_CRIAR", ...data, aconteceu: data.aconteceu === "true" }, "Relatório enviado ao acompanhamento pastoral.").then((ok) => { if (ok) form.reset(); });
          }}
        >
          <label>Data<input name="dataReuniao" type="date" required /></label>
          <label>Aconteceu?<select name="aconteceu"><option value="true">Sim</option><option value="false">Não</option></select></label>
          <label>Presentes<input name="presentes" type="number" min="0" defaultValue="0" /></label>
          <label>Visitantes<input name="visitantes" type="number" min="0" defaultValue="0" /></label>
          <button disabled={cells.saving}>Enviar relatório</button>
        </form>
      </div>
      {cell.solicitacoes.length > 0 && (
        <div className="cpart-mobile-card">
          <p className="cpart-mobile-card-title">Pedidos para entrar <span className="cpart-badge" data-tom="warn">{cell.solicitacoes.length}</span></p>
          {cell.solicitacoes.map((request) => (
            <div className="cpart-mobile-request" key={request.id}>
              <span className="cpart-avatar" aria-hidden="true">{initialsOf(request.nome)}</span>
              <div>
                <strong>{request.nome}</strong>
                <small>{request.mensagem}</small>
                <div className="cpart-panel-actions">
                  <button type="button" onClick={() => void cells.cellAction(cell.id, { acao: "SOLICITACAO_DECIDIR", solicitacaoId: request.id, status: "APROVADA" }, "Solicitação aprovada.")}>Aprovar</button>
                  <button type="button" className="cgestao-link-danger" onClick={() => void cells.cellAction(cell.id, { acao: "SOLICITACAO_DECIDIR", solicitacaoId: request.id, status: "RECUSADA" }, "Solicitação recusada.")}>Recusar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="cpart-mobile-note">Integrantes, agenda e configurações da célula ficam no computador.</p>
    </div>
  );
}
