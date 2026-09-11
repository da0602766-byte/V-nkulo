"use client";

import { type FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import NativeImageUpload from "../NativeImageUpload";
import { cellHealth, initialsOf, whatsappHref } from "./format";
import type { CellsData } from "./useCellsData";
import { DAY_LABELS, DAY_ORDER, type Cell, type CellHealthId, type CellMember } from "./types";

// Gestão de Células — Frame 1 (grade + filtros) e Frame 2 (célula em página
// cheia, com Configurações) do design aprovado. Reaproveita os dados e ações
// de useCellsData; ParticipacaoPortal usa o mesmo hook para a experiência do
// participante.
export default function CellManagementConsole({
  communityName,
  cells,
  onPreviewParticipacao,
}: {
  communityName: string;
  cells: CellsData;
  onPreviewParticipacao?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = cells.cells.find((cell) => cell.id === selectedId) || null;

  if (selected) {
    return (
      <CellDetailPage
        cell={selected}
        cells={cells}
        onBack={() => setSelectedId(null)}
      />
    );
  }
  return (
    <CellGrid
      communityName={communityName}
      cells={cells}
      onSelect={setSelectedId}
      onPreviewParticipacao={onPreviewParticipacao}
    />
  );
}

function OperationFeedback({ message, error }: { message: string; error: string }) {
  if (!message && !error) return null;
  return (
    <p className={`operations-feedback ${error ? "error" : ""}`} role="status">
      {error || message}
    </p>
  );
}

// ── Frame 1 — grade de células ─────────────────────────────────────────────
function CellGrid({
  communityName,
  cells,
  onSelect,
  onPreviewParticipacao,
}: {
  communityName: string;
  cells: CellsData;
  onSelect: (id: number) => void;
  onPreviewParticipacao?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [healthFilter, setHealthFilter] = useState<"all" | CellHealthId>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const list = cells.cells;
  const active = list.filter((cell) => cell.ativo);
  const archived = list.filter((cell) => !cell.ativo);
  const healthById = new Map(list.map((cell) => [cell.id, cellHealth(cell, cells.agora)]));
  const healthCounts = active.reduce<Record<string, number>>((acc, cell) => {
    const id = healthById.get(cell.id)!.id;
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});
  const pendingRequests = list.reduce((total, cell) => total + cell.solicitacoes.length, 0);
  const meetings = active.reduce((total, cell) => total + cell.agenda.length, 0);
  const people = active.reduce((total, cell) => total + cell.membros_total + cell.visitantes_ativos, 0);
  const ready = healthCounts.MULTIPLICAR || 0;
  const noReport = healthCounts.SEM_RELATORIO || 0;

  const term = search.trim().toLocaleLowerCase("pt-BR");
  const visible = list.filter((cell) => {
    if (status === "active" && !cell.ativo) return false;
    if (status === "archived" && cell.ativo) return false;
    if (healthFilter !== "all" && healthById.get(cell.id)!.id !== healthFilter) return false;
    if (!term) return true;
    return [cell.nome, cell.descricao_publica, cell.rede, cell.lider_nome, cell.responsavel]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term));
  });

  const healthPills: { key: "all" | CellHealthId; label: string; count: number }[] = [
    { key: "all", label: "Saúde: todas", count: 0 },
    { key: "SEM_RELATORIO", label: "Sem relatório", count: noReport },
    { key: "ATENCAO", label: "Atenção", count: healthCounts.ATENCAO || 0 },
    { key: "MULTIPLICAR", label: "Prontas p/ multiplicar", count: ready },
    { key: "SAUDAVEL", label: "Saudáveis", count: healthCounts.SAUDAVEL || 0 },
  ];

  return (
    <section className="cgestao-shell" aria-busy={cells.loading}>
      <header className="cgestao-header">
        <div>
          <p className="cgestao-kicker">CÉLULAS · {communityName}</p>
          <h1>Grupos que aproximam pessoas</h1>
          <p className="cgestao-subtitle">Acompanhe líderes, encontros e relatórios sem perder a visão de cada célula.</p>
        </div>
        <div className="cgestao-header-actions">
          {onPreviewParticipacao && (
            <button type="button" className="cgestao-btn-outline" onClick={onPreviewParticipacao}>
              Ver como participante
            </button>
          )}
          <button type="button" className="cgestao-btn-solid" onClick={() => setCreateOpen(true)}>
            <span aria-hidden="true">＋</span> Criar célula
          </button>
        </div>
      </header>

      <OperationFeedback message={cells.message} error={cells.error} />

      <section className="cgestao-stats" aria-label="Resumo das células">
        <StatCard tom="acc" label="Total de células" value={list.length} sub={`${archived.length} arquivadas`} />
        <StatCard tom="info" label="Ativas" value={active.length} sub={`${meetings} próximos encontros`} />
        <StatCard tom="warn" label="Solicitações" value={pendingRequests} sub="aguardando decisão" />
        <StatCard tom="bad" label="Sem relatório" value={noReport} sub="há mais de 3 semanas" alerta={noReport > 0} />
        <StatCard tom="ok" label="Pessoas nas células" value={people} sub="membros e visitantes ativos" />
        <StatCard tom="teal" label="Prontas p/ multiplicar" value={ready} sub="média de 15+ presentes" />
      </section>

      <div className="cgestao-filters">
        <label className="cgestao-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar célula, líder ou bairro"
            aria-label="Buscar célula, líder ou bairro"
          />
        </label>
        <div className="cgestao-status-toggle" role="group" aria-label="Filtrar por situação">
          {([["all", "Todas"], ["active", "Ativas"], ["archived", "Arquivadas"]] as const).map(([value, label]) => (
            <button key={value} type="button" className={status === value ? "active" : ""} onClick={() => setStatus(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="cgestao-health-filter" role="group" aria-label="Filtrar por saúde">
          {healthPills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              data-saude={pill.key}
              className={healthFilter === pill.key ? "active" : ""}
              onClick={() => setHealthFilter(pill.key)}
            >
              {pill.label}
              {pill.key !== "all" && <span>{pill.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="cgestao-empty">Nenhuma célula encontrada com os filtros aplicados.</p>
      ) : (
        <div className="cgestao-grid">
          {visible.map((cell) => (
            <CellCard key={cell.id} cell={cell} health={healthById.get(cell.id)!} onClick={() => onSelect(cell.id)} />
          ))}
        </div>
      )}

      {createOpen && typeof document !== "undefined" && createPortal(
        <CreateCellDialog cells={cells} onClose={() => setCreateOpen(false)} />,
        document.body,
      )}
    </section>
  );
}

function StatCard({
  tom,
  label,
  value,
  sub,
  alerta,
}: {
  tom: "acc" | "info" | "warn" | "bad" | "ok" | "teal";
  label: string;
  value: number;
  sub: string;
  alerta?: boolean;
}) {
  return (
    <article className="cgestao-stat" data-tom={tom} data-alerta={alerta ? "1" : undefined}>
      <span className="cgestao-stat-icon" aria-hidden="true" />
      <p className="cgestao-stat-label">{label}</p>
      <p className="cgestao-stat-value">{value}</p>
      <p className="cgestao-stat-sub">{sub}</p>
    </article>
  );
}

function MiniBarChart({ weeks }: { weeks: number[] }) {
  const teto = Math.max(1, ...weeks);
  return (
    <span className="cgestao-minibars" aria-hidden="true">
      {weeks.map((valor, index) => (
        <i key={index} data-vazio={valor === 0 ? "1" : undefined} style={{ height: `${Math.max(12, Math.round((valor / teto) * 100))}%` }} />
      ))}
    </span>
  );
}

function CellCard({
  cell,
  health,
  onClick,
}: {
  cell: Cell;
  health: ReturnType<typeof cellHealth>;
  onClick: () => void;
}) {
  const archived = !cell.ativo;
  return (
    <button type="button" onClick={onClick} className={`cgestao-card${archived ? " archived" : ""}`} data-saude={health.id}>
      <div className="cgestao-card-top">
        <div className="cgestao-card-avatar" aria-hidden="true">{initialsOf(cell.nome)}</div>
        <div className="cgestao-card-headline">
          <p className="cgestao-card-status">{archived ? "Arquivada" : "Ativa"}</p>
          <p className="cgestao-card-name">{cell.nome}</p>
        </div>
        {cell.solicitacoes.length > 0 && <span className="cgestao-card-badge">{cell.solicitacoes.length}</span>}
      </div>
      <p className="cgestao-card-desc">{cell.descricao_publica || "Descrição pública ainda não informada."}</p>
      <div className="cgestao-card-health">
        <span className="cgestao-health-pill" data-saude={health.id}>{health.label}</span>
        <span className="cgestao-card-weeks">
          <MiniBarChart weeks={health.weeks} />
          <small>{health.semanasEmDia}/8 rel.</small>
        </span>
      </div>
      <div className="cgestao-card-footer">
        <div>
          <p><strong>{cell.dias_reuniao.map((day) => DAY_LABELS[day] || day).join(", ") || "A definir"}</strong> · {cell.membros_total + cell.visitantes_ativos} pessoas</p>
          <p className="cgestao-card-lead">{cell.lider_nome || cell.responsavel || "Liderança a definir"}</p>
        </div>
        <span className="cgestao-card-cta">Gerenciar →</span>
      </div>
    </button>
  );
}

// ── Frame 2 — célula em página cheia ───────────────────────────────────────
type DetailTab = "visao" | "integrantes" | "agenda" | "relatorio" | "solicitacoes" | "config" | "entrar";

function CellDetailPage({ cell, cells, onBack }: { cell: Cell; cells: CellsData; onBack: () => void }) {
  const [tab, setTab] = useState<DetailTab>("visao");
  const [memberProfile, setMemberProfile] = useState<CellMember | null>(null);
  const health = cellHealth(cell, cells.agora);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const operatorTabs: [DetailTab, string][] = [
    ["visao", "Visão geral"],
    ["integrantes", "Integrantes"],
    ["agenda", "Agenda"],
    ["relatorio", "Relatório semanal"],
    ["solicitacoes", `Solicitações ${cell.solicitacoes.length || ""}`.trim()],
    ["config", "Configurações"],
  ];
  const visitorTabs: [DetailTab, string][] = [
    ["visao", "Informações"],
    ["agenda", "Próximos encontros"],
    ["entrar", "Solicitar entrada"],
  ];
  const tabs = cell.can_operate ? operatorTabs : visitorTabs;

  return (
    <div className="cgestao-shell cgestao-detail">
      <button type="button" className="cgestao-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Voltar às células
      </button>

      <header className="cgestao-detail-header">
        <div>
          <p className="cgestao-kicker">DETALHES DA CÉLULA</p>
          <div className="cgestao-detail-title">
            <h1>{cell.nome}</h1>
            <span className={cell.ativo ? "status-ativa" : "status-arquivada"}>{cell.ativo ? "Ativa" : "Arquivada"}</span>
          </div>
          <p className="cgestao-subtitle">{cell.descricao_publica || "Descrição pública ainda não informada."}</p>
          <div className="cgestao-day-pills">
            <small>Encontros</small>
            {cell.dias_reuniao.map((day) => <span key={day}>{DAY_LABELS[day] || day}</span>)}
            {cell.horario_texto && <span>{cell.horario_texto}</span>}
          </div>
        </div>
        {cell.can_operate && (
          <div className="cgestao-header-actions">
            <button type="button" className="cgestao-btn-outline" onClick={() => setTab("config")}>Editar</button>
            <button type="button" className="cgestao-btn-solid" onClick={() => setTab("relatorio")}>+ Relatório</button>
          </div>
        )}
      </header>

      <dl className="cgestao-metrics">
        <div><dt>Membros</dt><dd>{cell.membros_total}</dd></div>
        <div><dt>Visitantes</dt><dd>{cell.visitantes_ativos}</dd></div>
        <div><dt>Liderança</dt><dd>{cell.vice_lider_nome ? "2" : "1"}</dd></div>
        <div><dt>Próximos encontros</dt><dd>{cell.agenda.length}</dd></div>
      </dl>

      <div className="cgestao-body">
        <nav className="cgestao-tabs" aria-label="Seções da célula">
          {tabs.map(([id, label], index) => (
            <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <span>{String(index + 1).padStart(2, "0")}</span>{label}
            </button>
          ))}
        </nav>
        <div className="cgestao-panel">
          {tab === "visao" && <VisaoGeral cell={cell} health={health} />}
          {tab === "integrantes" && cell.can_operate && (
            <IntegrantesTab cell={cell} cells={cells} onOpenProfile={setMemberProfile} />
          )}
          {tab === "agenda" && <AgendaTab cell={cell} cells={cells} />}
          {tab === "relatorio" && cell.can_operate && <RelatorioTab cell={cell} cells={cells} />}
          {tab === "solicitacoes" && cell.can_operate && <SolicitacoesTab cell={cell} cells={cells} />}
          {tab === "config" && cell.can_operate && <ConfiguracoesTab cell={cell} cells={cells} />}
          {tab === "entrar" && !cell.can_operate && <EntrarTab cell={cell} cells={cells} onSent={() => setTab("visao")} />}
        </div>
      </div>

      {memberProfile && typeof document !== "undefined" && createPortal(
        <MemberProfileDialog member={memberProfile} onClose={() => setMemberProfile(null)} />,
        document.body,
      )}
    </div>
  );
}

function VisaoGeral({ cell, health }: { cell: Cell; health: ReturnType<typeof cellHealth> }) {
  return (
    <div className="cgestao-cards">
      <InfoCard title="Liderança">
        <div className="cgestao-info-row">
          <div className="cgestao-avatar" aria-hidden="true">{initialsOf(cell.lider_nome || cell.responsavel)}</div>
          <div>
            <p className="cgestao-info-name">{cell.lider_nome || cell.responsavel}</p>
            <p className="cgestao-info-sub">Líder principal{cell.rede ? ` · ${cell.rede}` : ""}</p>
          </div>
        </div>
        {cell.vice_lider_nome && <p className="cgestao-info-sub">Vice-líder: {cell.vice_lider_nome}</p>}
      </InfoCard>
      <InfoCard title="Local público">
        <p className="cgestao-info-body">{cell.endereco_publico || "A definir"}</p>
      </InfoCard>
      <InfoCard title="Último relatório">
        <div className="cgestao-info-row">
          <p className="cgestao-info-body">
            {cell.ultimo_relatorio_em ? new Date(cell.ultimo_relatorio_em).toLocaleDateString("pt-BR") : "Pendente"}
          </p>
          <span className="cgestao-health-pill" data-saude={health.id}>{health.label}</span>
        </div>
        {health.weeks.length > 0 && (
          <div className="cgestao-info-row">
            <MiniBarChart weeks={health.weeks} />
            <small>{health.semanasEmDia}/8 relatórios nas últimas 8 semanas</small>
          </div>
        )}
        <p className="cgestao-info-sub">Após 60 dias sem relatório, a célula é arquivada.</p>
      </InfoCard>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cgestao-info-card">
      <p className="cgestao-info-title">{title}</p>
      {children}
    </div>
  );
}

function IntegrantesTab({
  cell,
  cells,
  onOpenProfile,
}: {
  cell: Cell;
  cells: CellsData;
  onOpenProfile: (member: CellMember) => void;
}) {
  return (
    <div className="cgestao-members">
      <div className="cgestao-member-list">
        {cell.membros.map((member) => (
          <article key={member.id}>
            <span aria-hidden="true">{initialsOf(member.name)}</span>
            <div>
              <strong>{member.name}</strong>
              <small>
                {member.role === "LEADER" ? "Líder" : member.role === "VICE_LEADER" ? "Vice-líder" : member.kind === "EXTERNAL" ? `Visitante${member.note ? ` · ${member.note}` : ""}` : "Membro"}
              </small>
              {member.kind === "COMMUNITY" && (
                <button type="button" className="cgestao-link" onClick={() => onOpenProfile(member)}>Ver perfil</button>
              )}
            </div>
            {member.role !== "LEADER" && (
              <div className="cgestao-member-actions">
                {member.kind === "COMMUNITY" && member.role !== "VICE_LEADER" && (
                  <button type="button" onClick={() => void cells.cellAction(cell.id, { acao: "MEMBRO_PROMOVER_VICE", membroId: member.id })}>
                    Promover
                  </button>
                )}
                <button
                  type="button"
                  className="cgestao-link-danger"
                  onClick={() => void cells.cellAction(cell.id, { acao: "MEMBRO_REMOVER", membroId: member.id }, "Integrante removido.")}
                >
                  Remover
                </button>
              </div>
            )}
          </article>
        ))}
        {!cell.membros.length && <p className="cgestao-empty">Nenhum integrante cadastrado ainda.</p>}
      </div>
      <div className="cgestao-add-members">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void cells.cellAction(cell.id, { acao: "MEMBRO_ADICIONAR_INTERNO", usuarioId: Number(data.get("usuarioId")) }, "Integrante adicionado.").then((ok) => { if (ok) form.reset(); });
          }}
        >
          <label>Membro da comunidade
            <select name="usuarioId" required defaultValue="">
              <option value="" disabled>Selecione</option>
              {cells.availableUsers.map((user) => <option value={user.id} key={user.id}>{user.nome} · {user.papel}</option>)}
            </select>
          </label>
          <button disabled={cells.saving}>Adicionar</button>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void cells.cellAction(cell.id, { acao: "MEMBRO_ADICIONAR_EXTERNO", nomeExterno: data.get("nomeExterno"), descricaoExterna: data.get("descricaoExterna") }, "Visitante registrado.").then((ok) => { if (ok) form.reset(); });
          }}
        >
          <label>Visitante de fora<input name="nomeExterno" required placeholder="Nome completo" /></label>
          <label>Observação<input name="descricaoExterna" placeholder="Contato ou contexto" /></label>
          <button disabled={cells.saving}>Registrar</button>
        </form>
      </div>
    </div>
  );
}

function AgendaTab({ cell, cells }: { cell: Cell; cells: CellsData }) {
  return (
    <div className="cgestao-agenda">
      <div className="cgestao-agenda-list">
        {cell.agenda.map((item) => (
          <article key={item.id}>
            <time>{new Date(item.inicia_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</time>
            <div>
              <strong>{item.titulo}</strong>
              <small>
                {new Date(item.inicia_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}–{new Date(item.termina_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {item.visibilidade === "PUBLICO" ? "Público" : "Só liderança"}
              </small>
              {item.lembrete && <p>{item.lembrete}</p>}
            </div>
          </article>
        ))}
        {!cell.agenda.length && <p className="cgestao-empty">Nenhum encontro programado.</p>}
      </div>
      {cell.can_operate && (
        <form
          className="cgestao-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = Object.fromEntries(new FormData(form));
            void cells.cellAction(cell.id, { acao: "AGENDA_CRIAR", ...data }, "Encontro programado.").then((ok) => { if (ok) form.reset(); });
          }}
        >
          <h3>Programar sem publicar no feed</h3>
          <label>Título<input name="titulo" required /></label>
          <label>Início<input name="iniciaEm" type="datetime-local" required /></label>
          <label>Término<input name="terminaEm" type="datetime-local" required /></label>
          <label>Visibilidade
            <select name="visibilidade"><option value="PUBLICO">Público para a célula</option><option value="PRIVADO">Privado para liderança</option></select>
          </label>
          <label className="cgestao-wide">Lembrete<textarea name="lembrete" rows={2} /></label>
          <button disabled={cells.saving}>Verificar horários e salvar</button>
        </form>
      )}
    </div>
  );
}

function RelatorioTab({ cell, cells }: { cell: Cell; cells: CellsData }) {
  return (
    <div className="cgestao-reports">
      <form
        className="cgestao-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = Object.fromEntries(new FormData(form));
          void cells.cellAction(cell.id, { acao: "RELATORIO_CRIAR", ...data, aconteceu: data.aconteceu === "true" }, "Relatório enviado ao acompanhamento pastoral.").then((ok) => { if (ok) form.reset(); });
        }}
      >
        <h3>Formulário do encontro</h3>
        <label>Data<input name="dataReuniao" type="date" required /></label>
        <label>Aconteceu?<select name="aconteceu"><option value="true">Sim</option><option value="false">Não</option></select></label>
        <label>Presentes<input name="presentes" type="number" min="0" defaultValue="0" /></label>
        <label>Visitantes<input name="visitantes" type="number" min="0" defaultValue="0" /></label>
        <label className="cgestao-wide">Observações<textarea name="observacoes" rows={2} /></label>
        <button disabled={cells.saving}>Enviar ao pastor</button>
      </form>
      <div className="cgestao-report-history">
        {cell.relatorios.map((report) => (
          <article key={report.id}>
            <time>{new Date(`${report.data_reuniao}T12:00:00`).toLocaleDateString("pt-BR")}</time>
            <strong>{report.aconteceu ? `${report.presentes} pessoas · ${report.visitantes} visitantes` : "Encontro não realizado"}</strong>
            <small>{report.enviado_por_nome ? `Enviado por ${report.enviado_por_nome}` : "Relatório registrado"}</small>
          </article>
        ))}
        {!cell.relatorios.length && <p className="cgestao-empty">Nenhum relatório enviado ainda.</p>}
      </div>
    </div>
  );
}

function SolicitacoesTab({ cell, cells }: { cell: Cell; cells: CellsData }) {
  return (
    <div className="cgestao-requests">
      {cell.solicitacoes.map((request) => (
        <article key={request.id}>
          <div>
            <strong>{request.nome}</strong>
            <small>{request.contato || "Sem contato"}</small>
            <p>{request.mensagem}</p>
          </div>
          <div>
            <button type="button" onClick={() => void cells.cellAction(cell.id, { acao: "SOLICITACAO_DECIDIR", solicitacaoId: request.id, status: "APROVADA" }, "Solicitação aprovada.")}>Aprovar</button>
            <button type="button" className="cgestao-link-danger" onClick={() => void cells.cellAction(cell.id, { acao: "SOLICITACAO_DECIDIR", solicitacaoId: request.id, status: "RECUSADA" }, "Solicitação recusada.")}>Recusar</button>
          </div>
        </article>
      ))}
      {!cell.solicitacoes.length && <p className="cgestao-empty">Nenhuma solicitação pendente.</p>}
    </div>
  );
}

function EntrarTab({ cell, cells, onSent }: { cell: Cell; cells: CellsData; onSent: () => void }) {
  return (
    <section className="cgestao-entrar">
      <header>
        <p className="cgestao-kicker">ENTRAR NESTA CÉLULA</p>
        <h3>Envie seus dados à liderança</h3>
        <p>As informações serão usadas somente para analisar seu pedido e entrar em contato.</p>
      </header>
      <form
        className="cgestao-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = Object.fromEntries(new FormData(form));
          void cells.requestCellEntry(cell.id, cell.nome, data).then((ok) => { if (ok) { form.reset(); onSent(); } });
        }}
      >
        <label>Nome completo<input name="nome" required minLength={5} maxLength={120} autoComplete="name" /></label>
        <label>WhatsApp ou e-mail<input name="contato" required maxLength={160} autoComplete="email" /></label>
        <label className="cgestao-wide">Mensagem para a liderança<textarea name="mensagem" rows={3} maxLength={500} placeholder="Conte um pouco sobre você e o melhor horário para contato." /></label>
        <label className="cgestao-consent"><input type="checkbox" required />Autorizo o envio destes dados à liderança desta célula.</label>
        <button disabled={cells.saving}>{cells.saving ? "Enviando…" : "Solicitar entrada"}</button>
      </form>
    </section>
  );
}

function ConfiguracoesTab({ cell, cells }: { cell: Cell; cells: CellsData }) {
  const [temas, setTemas] = useState(cell.temas.join(", "));
  const [fotoCapa, setFotoCapa] = useState(cell.foto_capa || "");

  return (
    <div className="cgestao-config">
      <form
        className="cgestao-form cgestao-config-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          void cells.cellAction(cell.id, {
            acao: "CONFIGURACOES_ATUALIZAR",
            nome: data.get("nome"),
            horarioTexto: data.get("horarioTexto"),
            rede: data.get("rede"),
            diasReuniao: data.getAll("diasReuniao"),
            enderecoPublico: data.get("enderecoPublico"),
            descricaoPublica: data.get("descricaoPublica"),
            observacoes: data.get("observacoes"),
            temas: temas.split(",").map((item) => item.trim()).filter(Boolean),
            fotoCapa,
          }, "Configurações da célula salvas.");
        }}
      >
        <h3>Informações da célula</h3>
        <div className="cgestao-config-grid">
          <label>Nome<input name="nome" defaultValue={cell.nome} required maxLength={100} /></label>
          <label>Horário do encontro<input name="horarioTexto" defaultValue={cell.horario_texto} placeholder="Qua 19h30 · Sáb 10h" maxLength={120} /></label>
          <label>Rede<input name="rede" defaultValue={cell.rede} placeholder="Rede Centro" maxLength={80} /></label>
          <label>Endereço público<input name="enderecoPublico" defaultValue={cell.endereco_publico} maxLength={240} /></label>
        </div>

        <fieldset className="cgestao-days-field">
          <legend>Dias de encontro</legend>
          {DAY_ORDER.map((day) => (
            <label key={day}>
              <input type="checkbox" name="diasReuniao" value={day} defaultChecked={cell.dias_reuniao.includes(day)} />
              {DAY_LABELS[day]}
            </label>
          ))}
        </fieldset>

        <label className="cgestao-wide">Temas (separados por vírgula)
          <input value={temas} onChange={(event) => setTemas(event.target.value)} placeholder="Estudos bíblicos, Oração, Comunhão" maxLength={400} />
        </label>
        <label className="cgestao-wide">Descrição pública<textarea name="descricaoPublica" defaultValue={cell.descricao_publica} rows={3} maxLength={700} /></label>
        <label className="cgestao-wide">Observações internas <small>só a liderança vê</small><textarea name="observacoes" defaultValue={cell.observacoes || ""} rows={2} maxLength={1000} /></label>

        <div className="cgestao-wide">
          <NativeImageUpload
            label="Foto de capa"
            value={fotoCapa}
            purpose="cell-cover"
            resourceId={cell.id}
            previewMode="banner"
            onChange={setFotoCapa}
          />
        </div>

        <button disabled={cells.saving}>Salvar alterações</button>
      </form>

      {cells.canManage && (
        <div className="cgestao-danger">
          <p className="cgestao-danger-title">Área de risco</p>
          <p className="cgestao-danger-copy">Arquivar uma célula remove seus encontros futuros e torna o grupo invisível para participantes. Os dados são mantidos.</p>
          {cell.ativo ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Arquivar ${cell.nome}? A gestão pastoral poderá reativá-la depois.`)) {
                  void cells.archiveCell(cell);
                }
              }}
            >
              Arquivar célula
            </button>
          ) : (
            <button type="button" onClick={() => void cells.cellAction(cell.id, { acao: "REATIVAR" }, "Célula reativada.")}>Reativar célula</button>
          )}
        </div>
      )}
    </div>
  );
}

function MemberProfileDialog({ member, onClose }: { member: CellMember; onClose: () => void }) {
  return (
    <div className="cgestao-member-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="cgestao-member-dialog" role="dialog" aria-modal="true" aria-label={`Perfil de ${member.name}`}>
        <header>
          <span>{member.fotoPerfil ? <img loading="lazy" src={member.fotoPerfil} alt="" /> : initialsOf(member.name)}</span>
          <div>
            <p className="cgestao-kicker">PERFIL DO MEMBRO</p>
            <h2>{member.name}</h2>
            <p>{member.papelComunidade || "Membro da comunidade"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar perfil">×</button>
        </header>
        <dl>
          <div><dt>Função na célula</dt><dd>{member.role === "LEADER" ? "Líder" : member.role === "VICE_LEADER" ? "Vice-líder" : "Membro"}</dd></div>
          <div><dt>E-mail</dt><dd>{member.email || "Não informado"}</dd></div>
          <div><dt>WhatsApp</dt><dd>{member.telefone || "Não informado"}</dd></div>
        </dl>
        {whatsappHref(member.telefone) && (
          <a href={whatsappHref(member.telefone) || undefined} target="_blank" rel="noreferrer">Conversar pelo WhatsApp</a>
        )}
      </section>
    </div>
  );
}

function CreateCellDialog({ cells, onClose }: { cells: CellsData; onClose: () => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = { ...Object.fromEntries(data.entries()), diasReuniao: data.getAll("diasReuniao") };
    const ok = await cells.createCell(body);
    if (ok) onClose();
  }

  return (
    <div className="cgestao-create-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !cells.saving) onClose(); }}>
      <form className="cgestao-form cgestao-create-dialog" role="dialog" aria-modal="true" aria-label="Criar célula" onSubmit={submit}>
        <header>
          <div><p className="cgestao-kicker">NOVA CÉLULA</p><h2>Informações essenciais</h2></div>
          <button type="button" aria-label="Fechar" onClick={onClose}>×</button>
        </header>
        <label>Nome da célula<input name="nome" required maxLength={100} /></label>
        <label>Líder
          <select name="liderUsuarioId" required defaultValue="">
            <option value="" disabled>Selecione</option>
            {cells.availableUsers.map((user) => <option value={user.id} key={user.id}>{user.nome} · {user.papel}</option>)}
          </select>
        </label>
        <label>Rede<input name="rede" placeholder="Rede Centro" maxLength={80} /></label>
        <fieldset className="cgestao-days-field">
          <legend>Dias de encontro (obrigatório)</legend>
          {DAY_ORDER.map((day) => <label key={day}><input type="checkbox" name="diasReuniao" value={day} />{DAY_LABELS[day]}</label>)}
        </fieldset>
        <label className="cgestao-wide">Observações internas <small>só a liderança vê</small><textarea name="observacoes" rows={2} maxLength={1000} /></label>
        <fieldset className="cgestao-public-block">
          <legend>Página pública</legend>
          <p className="cgestao-public-warning"><span aria-hidden="true">◉</span>O que for preenchido aqui aparece na internet, no perfil público da comunidade. Deixe em branco para manter a célula fora do diretório.</p>
          <label>Endereço público<input name="enderecoPublico" maxLength={240} placeholder="Rua e bairro do encontro" /><small>Não use o endereço da casa de alguém sem permissão.</small></label>
          <label className="cgestao-wide">Descrição pública<textarea name="descricaoPublica" rows={2} maxLength={700} placeholder="Uma frase para quem procura uma célula perto de casa" /></label>
        </fieldset>
        <footer>
          <p className="cgestao-consequence"><span aria-hidden="true">◉</span>Cria a célula, dá acesso de líder a quem você escolheu e abre o primeiro ciclo de relatórios semanais. Só o nome é obrigatório para os demais campos.</p>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button disabled={cells.saving}>{cells.saving ? "Criando…" : "Criar célula"}</button>
        </footer>
      </form>
    </div>
  );
}
