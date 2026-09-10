"use client";

import { DragEvent, FormEvent, useRef, useState } from "react";
import { ParkingQrCheckin, type ParkingQrValidationResult } from "../ParkingReservationQr";
import {
  formatTime,
  getParkingCanvasHeight,
  getParkingCanvasWidth,
  hasCustomParkingLayout,
} from "./format";
import type { ParkingController } from "./useParkingData";
import type { Movement, Space } from "./types";

type Tab = "visao" | "entradas" | "reservas" | "ocorrencias" | "relatorios" | "mapa" | "equipe";

export default function ParkingManagementConsole({
  communityName,
  parking,
}: {
  communityName: string;
  parking: ParkingController;
}) {
  const {
    data,
    sectors,
    reservations,
    reports,
    working,
    feedback,
    error,
    canManageReservations,
    canReviewReports,
    registerEntry,
    registerExit,
    registerOccurrence,
    submitJson,
    reservationAction,
    deleteReservationHistory,
    clearReservationHistory,
    clearMovementHistory,
    reportAction,
    moveSpace,
  } = parking;

  const [tab, setTab] = useState<Tab>("visao");
  const [query, setQuery] = useState("");
  const [mapEditing, setMapEditing] = useState(false);
  const [draggedSpace, setDraggedSpace] = useState<number | null>(null);
  const pointerDragRef = useRef<{ spaceId: number; offsetX: number; offsetY: number } | null>(null);

  if (!data) {
    return (
      <section className="gestao-console gestao-loading">
        <span className="gestao-spinner" aria-hidden="true" />
        <p>Carregando painel de gestão…</p>
      </section>
    );
  }

  const canEntry = data.permissions.includes("parking.entry");
  const canExit = data.permissions.includes("parking.exit");
  const canEdit = data.permissions.includes("parking.edit");
  const canConfigure = data.permissions.includes("parking.configure");
  const canManageHelpers = data.permissions.includes("parking.helpers.manage");

  const activeMovements = (data.movimentacoes || []).filter((item) => item.status === "NO_LOCAL");
  const visibleMovements = filterMovements(data.movimentacoes, query);
  const openOccurrences = data.ocorrencias.filter((item) => item.status !== "RESOLVIDA").length;
  const pendingReports = reports.filter((item) => item.status === "AGUARDANDO_LIDER").length;
  const activeReservations = reservations.filter((item) => ["PENDENTE", "CONFIRMADA", "CHECKIN"].includes(item.status)).length;

  async function handleQr(code: string): Promise<ParkingQrValidationResult | boolean> {
    const result = await reservationAction({ codigo: code, acao: "CHECKIN" });
    if (result && typeof result === "object") return result as ParkingQrValidationResult;
    return Boolean(result);
  }

  function startPointerMove(event: React.PointerEvent<HTMLButtonElement>, spaceId: number) {
    if (!mapEditing) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    pointerDragRef.current = { spaceId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    setDraggedSpace(spaceId);
  }

  function continuePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = pointerDragRef.current;
    const canvas = event.currentTarget.parentElement;
    if (!mapEditing || !drag || drag.spaceId !== Number(event.currentTarget.dataset.spaceId) || !canvas) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.round(event.clientX - rect.left + canvas.scrollLeft - drag.offsetX));
    const y = Math.max(0, Math.round(event.clientY - rect.top + canvas.scrollTop - drag.offsetY));
    event.currentTarget.style.left = `${x}px`;
    event.currentTarget.style.top = `${y}px`;
  }

  function finishPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = pointerDragRef.current;
    if (!drag || drag.spaceId !== Number(event.currentTarget.dataset.spaceId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointerDragRef.current = null;
    setDraggedSpace(null);
    const x = Number(event.currentTarget.style.left.replace("px", "")) || 0;
    const y = Number(event.currentTarget.style.top.replace("px", "")) || 0;
    void moveSpace(drag.spaceId, x, y);
  }

  function dropSpace(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!mapEditing || !draggedSpace) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.round(event.clientX - rect.left - 26));
    const y = Math.max(0, Math.round(event.clientY - rect.top - 18));
    setDraggedSpace(null);
    void moveSpace(draggedSpace, x, y);
  }

  return (
    <section className="gestao-console" style={{ "--gestao-accent": data.config.cor_destaque || "#d99a32" } as React.CSSProperties}>
      <header className="gestao-console-header">
        <div>
          <p className="gestao-kicker">GESTÃO · {communityName}</p>
          <h1>{data.config.nome_modulo || "Estacionamento"}</h1>
          <p>Operação isolada desta comunidade. Placas e responsáveis não aparecem em outra comunidade.</p>
        </div>
        <div className="gestao-operator-chip">
          <strong>{data.operator.nome}</strong>
          <small>{data.operator.origemAcesso === "ESCALA_ATIVA" ? `Em plantão · ${data.operator.escala?.titulo}` : `${data.operator.papel} · acesso permanente`}</small>
        </div>
      </header>

      {(feedback || error) && <p className={`gestao-feedback${error ? " is-error" : ""}`} role="status">{error || feedback}</p>}

      <div className="gestao-kpi-row">
        <Kpi label="Ocupadas" value={data.stats.ocupadas} tone="amber" />
        <Kpi label="Disponíveis" value={data.stats.livres} tone="teal" />
        <Kpi label="Reservas ativas" value={activeReservations} tone="violet" />
        <Kpi label="Ocorrências" value={openOccurrences} tone="rose" />
        <Kpi label="Relatórios p/ revisar" value={pendingReports} tone="blue" />
      </div>

      <nav className="gestao-tabs" aria-label="Seções da gestão">
        <TabButton id="visao" tab={tab} setTab={setTab}>Visão geral</TabButton>
        {(canEntry || canExit) && <TabButton id="entradas" tab={tab} setTab={setTab}>Entradas / Saídas</TabButton>}
        <TabButton id="reservas" tab={tab} setTab={setTab}>Reservas</TabButton>
        {canEdit && <TabButton id="ocorrencias" tab={tab} setTab={setTab}>Ocorrências</TabButton>}
        <TabButton id="relatorios" tab={tab} setTab={setTab}>Relatórios</TabButton>
        <TabButton id="mapa" tab={tab} setTab={setTab}>Mapa e vagas</TabButton>
        {(canConfigure || canManageHelpers) && <TabButton id="equipe" tab={tab} setTab={setTab}>Equipe e configuração</TabButton>}
      </nav>

      {tab === "visao" && (
        <section className="gestao-card gestao-overview">
          {canEntry && (
            <div className="gestao-scan-hub">
              <div>
                <p className="gestao-kicker">PORTARIA DIGITAL</p>
                <h2>Ler QR Code da reserva</h2>
                <p>Aponte a câmera para o código do visitante ou digite manualmente.</p>
              </div>
              <ParkingQrCheckin disabled={working} onDetected={handleQr} />
            </div>
          )}
          <div className="gestao-overview-grid">
            <article>
              <h3>Movimentações recentes</h3>
              <ul>
                {(data.movimentacoes || []).slice(0, 6).map((item) => (
                  <li key={item.id}><strong>{item.placa}</strong> {item.responsavel} · {item.vaga_codigo || "—"} · {item.status === "NO_LOCAL" ? "no local" : "encerrada"}</li>
                ))}
                {!data.movimentacoes.length && <li className="gestao-empty">Sem movimentações ainda.</li>}
              </ul>
            </article>
            <article>
              <h3>Últimas reservas</h3>
              <ul>
                {reservations.slice(0, 6).map((item) => (
                  <li key={item.id}><strong>{item.vaga_codigo}</strong> {item.nome_completo} · {item.status}</li>
                ))}
                {!reservations.length && <li className="gestao-empty">Nenhuma reserva neste período.</li>}
              </ul>
            </article>
          </div>
        </section>
      )}

      {tab === "entradas" && (
        <section className="gestao-card gestao-two-col">
          {canEntry && (
            <form
              className="gestao-form"
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form = event.currentTarget;
                const values = Object.fromEntries(new FormData(form).entries());
                const ok = await registerEntry(values);
                if (ok) form.reset();
              }}
            >
              <fieldset>
                <legend>Registrar entrada</legend>
                <label>Placa<input name="placa" required maxLength={10} placeholder="ABC1D23" /></label>
                <label>Responsável<input name="responsavel" required maxLength={120} placeholder="Nome de quem estaciona" /></label>
                <label>Tipo<select name="tipoVeiculo"><option value="CARRO">Carro</option><option value="MOTO">Moto</option><option value="VAN">Van</option><option value="ONIBUS">Ônibus</option><option value="OUTRO">Outro</option></select></label>
                <label>Vínculo<select name="vinculo"><option value="VISITANTE">Visitante</option><option value="MEMBRO">Membro</option><option value="VOLUNTARIO">Voluntário</option><option value="EQUIPE">Equipe</option></select></label>
                <label>Vaga
                  <select name="vagaId" required defaultValue="">
                    <option value="" disabled>Selecione</option>
                    {data.vagas.filter((space) => space.status === "LIVRE").map((space) => (
                      <option key={space.id} value={space.id}>{space.codigo} · {space.setor_nome}</option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <button className="gestao-primary" disabled={working}>Confirmar entrada</button>
            </form>
          )}
          <div className="gestao-card-inner">
            <header><h3>Veículos no local</h3><span>{activeMovements.length}</span></header>
            <div className="gestao-simple-list">
              {activeMovements.length ? activeMovements.map((item) => (
                <article key={item.id}>
                  <div><strong>{item.placa}</strong><small>{item.vaga_codigo || "Sem vaga"} · {item.responsavel}</small></div>
                  {canExit && <button type="button" disabled={working} onClick={() => void registerExit(item.id)}>Registrar saída</button>}
                </article>
              )) : <p className="gestao-empty">Nenhum veículo no local.</p>}
            </div>
          </div>
        </section>
      )}

      {tab === "reservas" && (
        <section className="gestao-card">
          <header>
            <div><p className="gestao-kicker">RESERVAS</p><h2>Confirmações, cancelamentos e código de acesso</h2></div>
            {canManageReservations && <button type="button" className="gestao-ghost" onClick={() => void clearReservationHistory()} disabled={working}>Limpar histórico</button>}
          </header>
          <div className="gestao-reservation-table">
            {reservations.length ? reservations.map((reservation) => (
              <article key={reservation.id} className={`status-${reservation.status.toLowerCase()}`}>
                <div>
                  <strong>{reservation.vaga_codigo} · {reservation.setor_nome}</strong>
                  <small>{reservation.nome_completo} · {formatTime(reservation.inicio_em)} até {formatTime(reservation.fim_em)}</small>
                  {reservation.evento_titulo && <em>{reservation.evento_titulo}</em>}
                </div>
                <span className={`gestao-badge status-${reservation.status.toLowerCase()}`}>{reservation.status}</span>
                {canManageReservations && (
                  <details className="gestao-reservation-details">
                    <summary>Detalhes</summary>
                    <dl>
                      <div><dt>Documento</dt><dd>{reservation.documento_mascarado}</dd></div>
                      <div><dt>E-mail</dt><dd>{reservation.email || "Não informado"}</dd></div>
                      <div><dt>Celular</dt><dd>{reservation.telefone}</dd></div>
                      <div><dt>Veículo</dt><dd>{reservation.placa_veiculo} · {reservation.tipo_veiculo} · {reservation.modelo_veiculo} · {reservation.cor_veiculo}</dd></div>
                    </dl>
                  </details>
                )}
                {canManageReservations && reservation.status === "PENDENTE" && (
                  <div className="gestao-row-actions">
                    <button type="button" className="gestao-primary" disabled={working} onClick={() => void reservationAction({ id: reservation.id, acao: "CONFIRMAR" })}>Confirmar</button>
                    <button type="button" className="gestao-danger" disabled={working} onClick={() => void reservationAction({ id: reservation.id, acao: "RECUSAR" })}>Recusar / cancelar</button>
                  </div>
                )}
                {["RECUSADA", "CANCELADA", "CHECKIN"].includes(reservation.status) && (
                  <div className="gestao-row-actions">
                    <button type="button" className="gestao-ghost" disabled={working} onClick={() => void deleteReservationHistory(reservation.id)}>Excluir do histórico</button>
                  </div>
                )}
              </article>
            )) : <p className="gestao-empty">Nenhuma reserva neste período.</p>}
          </div>
        </section>
      )}

      {tab === "ocorrencias" && canEdit && (
        <section className="gestao-card gestao-two-col">
          <form
            className="gestao-form"
            onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = event.currentTarget;
              const values = Object.fromEntries(new FormData(form).entries());
              const ok = await registerOccurrence(values);
              if (ok) form.reset();
            }}
          >
            <fieldset>
              <legend>Relatar ocorrência</legend>
              <label>Tipo<select name="tipo"><option value="SEGURANCA">Segurança</option><option value="DANO">Dano</option><option value="BLOQUEIO">Bloqueio</option><option value="ORIENTACAO">Orientação</option><option value="OUTRO">Outro</option></select></label>
              <label>Gravidade<select name="gravidade"><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option></select></label>
              <label className="gestao-wide">Descrição<textarea name="descricao" required minLength={8} rows={3} /></label>
            </fieldset>
            <button className="gestao-primary" disabled={working}>Registrar ocorrência</button>
          </form>
          <div className="gestao-card-inner">
            <header><h3>Histórico de problemas</h3></header>
            <div className="gestao-simple-list">
              {data.ocorrencias.length ? data.ocorrencias.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.tipo} · {item.gravidade}</strong>
                    <small>{item.descricao}</small>
                    <small>{item.criado_por_nome || "Operador"} · {formatTime(item.criado_em)}</small>
                  </div>
                </article>
              )) : <p className="gestao-empty">Nenhuma ocorrência registrada.</p>}
            </div>
          </div>
        </section>
      )}

      {tab === "relatorios" && (
        <section className="gestao-card">
          <header><p className="gestao-kicker">FECHAMENTO DE ESCALA</p><h2>Relatórios enviados ao final de cada plantão</h2></header>
          <div className="gestao-report-grid">
            {reports.length ? reports.map((report) => (
              <article key={report.id} className="gestao-report-form">
                <header>
                  <span className={`gestao-badge status-${report.status.toLowerCase()}`}>{report.status.replaceAll("_", " ")}</span>
                  <h3>{report.titulo}</h3>
                </header>
                <dl>
                  <div><dt>Responsável</dt><dd>{report.membro_nome}</dd></div>
                  <div><dt>Período</dt><dd>{formatTime(report.inicia_em)} até {formatTime(report.termina_em)}</dd></div>
                  <div><dt>Entradas</dt><dd>{report.entradas}</dd></div>
                  <div><dt>Saídas</dt><dd>{report.saidas}</dd></div>
                  <div><dt>Ocorrências</dt><dd>{report.ocorrencias}</dd></div>
                  <div className="gestao-wide"><dt>Resumo</dt><dd>{report.resumo || "Relatório enviado automaticamente ao encerrar a escala."}</dd></div>
                </dl>
                {canReviewReports && report.status === "AGUARDANDO_LIDER" && (
                  <div className="gestao-row-actions">
                    <button type="button" disabled={working} onClick={() => void reportAction({ id: report.id, acao: "CONFIRMAR" })}>Confirmar e enviar ao pastor</button>
                    <button type="button" className="gestao-ghost" disabled={working} onClick={() => void reportAction({ id: report.id, acao: "CORRIGIR", resumo: report.resumo })}>Solicitar correção</button>
                  </div>
                )}
              </article>
            )) : <p className="gestao-empty">Nenhum relatório de escala ainda.</p>}
          </div>
        </section>
      )}

      {tab === "mapa" && (
        <section className="gestao-card">
          <header>
            <div><p className="gestao-kicker">MAPA</p><h2>Ocupação por setor</h2></div>
            <div className="gestao-row-actions">
              <span>{data.stats.livres} livres</span>
              {canConfigure && <button type="button" className="gestao-ghost" onClick={() => setMapEditing((value) => !value)}>{mapEditing ? "Concluir edição" : "Reorganizar vagas"}</button>}
            </div>
          </header>
          {mapEditing && <p className="gestao-hint">Clique, segure e arraste cada vaga para reposicioná-la.</p>}
          <div className="gestao-map">
            {sectors.map((sector) => {
              const positioned = hasCustomParkingLayout(sector.spaces);
              const usesCanvas = mapEditing || positioned;
              return (
                <section key={sector.id} className={usesCanvas ? "is-positioned" : ""} style={{ "--sector-color": sector.color } as React.CSSProperties}>
                  <header>
                    <strong>{sector.name}</strong>
                    <small>{sector.spaces.length} vagas</small>
                    {canConfigure && (
                      <details className="gestao-sector-editor">
                        <summary>Editar setor</summary>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            const editor = event.currentTarget.closest("details");
                            const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                            void submitJson(
                              "/api/pilot/estacionamento/mapa",
                              { action: "ATUALIZAR_SETOR", setorId: Number(sector.id.split(":")[0]), ...values },
                              `Setor “${sector.name}” atualizado.`,
                              "PATCH",
                            ).then(() => {
                              if (editor) editor.open = false;
                            });
                          }}
                        >
                          <label>Nome<input name="nome" defaultValue={sector.name} required maxLength={80} /></label>
                          <label>Cor<input name="cor" type="color" defaultValue={sector.color} /></label>
                          <label>Posição<input name="ordem" type="number" min="0" max="99" defaultValue={sector.order} /></label>
                          <button className="gestao-primary" disabled={working}>Salvar setor</button>
                        </form>
                      </details>
                    )}
                  </header>
                  <div
                    className={usesCanvas ? "gestao-position-canvas" : "gestao-flow-canvas"}
                    onDragOver={(event) => mapEditing && event.preventDefault()}
                    onDrop={dropSpace}
                    style={usesCanvas ? { width: getParkingCanvasWidth(sector.spaces), height: getParkingCanvasHeight(sector.spaces) } : undefined}
                  >
                    {sector.spaces.map((space: Space) => (
                      <button
                        type="button"
                        key={space.id}
                        draggable={mapEditing}
                        data-space-id={space.id}
                        onDragStart={() => setDraggedSpace(space.id)}
                        onDragEnd={() => setDraggedSpace(null)}
                        onPointerDown={(event) => startPointerMove(event, space.id)}
                        onPointerMove={continuePointerMove}
                        onPointerUp={finishPointerMove}
                        onPointerCancel={finishPointerMove}
                        style={usesCanvas ? { left: space.posicao_x, top: space.posicao_y } : undefined}
                        className={`gestao-slot small status-${space.status.toLowerCase()}${mapEditing ? " is-editing" : ""}`}
                        title={`${space.codigo} · ${space.tipo} · ${space.status}`}
                      >{space.codigo}</button>
                    ))}
                  </div>
                </section>
              );
            })}
            {!sectors.length && <p className="gestao-empty">Nenhum setor cadastrado ainda.</p>}
          </div>
          {canConfigure && (
            <details className="gestao-settings-block">
              <summary>Criar setores e vagas</summary>
              <div className="gestao-settings-grid">
                <form
                  className="gestao-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                    void submitJson("/api/pilot/estacionamento/mapa", { action: "CRIAR_SETOR", ...values }, "Setor criado.");
                  }}
                >
                  <fieldset>
                    <legend>Novo setor</legend>
                    <label>Nome<input name="nome" required placeholder="Ex.: Visitantes" /></label>
                    <label>Cor<input name="cor" type="color" defaultValue="#3b82f6" /></label>
                    <input type="hidden" name="ordem" value={sectors.length + 1} />
                  </fieldset>
                  <button className="gestao-primary" disabled={working}>Adicionar setor</button>
                </form>
                <form
                  className="gestao-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                    void submitJson("/api/pilot/estacionamento/mapa", { action: "CRIAR_VAGAS", tipo: "COMUM", ...values }, "Vagas adicionadas.");
                  }}
                >
                  <fieldset>
                    <legend>Adicionar vagas</legend>
                    <label>Setor
                      <select name="setorId" required defaultValue="">
                        <option value="" disabled>Selecione</option>
                        {sectors.map((sector) => <option key={sector.id} value={sector.id.split(":")[0]}>{sector.name}</option>)}
                      </select>
                    </label>
                    <label>Prefixo<input name="prefixo" required maxLength={5} placeholder="Ex.: A" /></label>
                    <label>Quantidade<input name="quantidade" type="number" min="1" max="40" defaultValue="4" /></label>
                  </fieldset>
                  <button className="gestao-primary" disabled={working}>Criar vagas</button>
                </form>
              </div>
            </details>
          )}
        </section>
      )}

      {tab === "equipe" && (
        <section className="gestao-card gestao-two-col">
          {canManageHelpers && data.operator.escala && (
            <form
              className="gestao-form"
              onSubmit={(event) => {
                event.preventDefault();
                const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                void submitJson("/api/pilot/estacionamento/auxiliares", { ...values, escalaId: data.operator.escala?.escala_id }, "Convite enviado ao auxiliar.");
              }}
            >
              <fieldset>
                <legend>Escalar auxiliar</legend>
                <p className="gestao-hint">Somente pessoas já cadastradas no ministério de estacionamento podem ser escaladas.</p>
                <label>Pessoa
                  <select name="usuarioId" required defaultValue="">
                    <option value="" disabled>Selecione um membro do ministério</option>
                    {data.ministryMembers.filter((item) => item.id !== data.operator.id).map((item) => (
                      <option key={item.id} value={item.id}>{item.nome} · {item.papel === "LIDER" ? "líder" : "voluntário"}</option>
                    ))}
                  </select>
                </label>
                {!data.ministryMembers.length && <p className="gestao-empty">Ninguém está cadastrado no ministério de estacionamento ainda.</p>}
              </fieldset>
              <button className="gestao-primary" disabled={working || !data.ministryMembers.length}>Enviar convite</button>
            </form>
          )}
          {canConfigure && (
            <form
              className="gestao-form"
              onSubmit={(event) => {
                event.preventDefault();
                const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                void submitJson("/api/pilot/estacionamento/configuracao", { ativo: true, nomeModulo: data.config.nome_modulo, corDestaque: data.config.cor_destaque, ...values }, "Configuração atualizada.");
              }}
            >
              <fieldset>
                <legend>Responsável e instruções</legend>
                <label>Responsável
                  <select name="responsavelUsuarioId" defaultValue={data.config.responsavelUsuarioId || ""}>
                    <option value="">Automático pelo ministério</option>
                    {data.availableUsers.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                  </select>
                </label>
                <label className="gestao-wide">Instruções da equipe<textarea name="instrucoes" rows={3} defaultValue={data.config.instrucoes} /></label>
              </fieldset>
              <button className="gestao-primary" disabled={working}>Salvar</button>
            </form>
          )}
          <div className="gestao-card-inner gestao-wide">
            <header><h3>Histórico de movimentações</h3></header>
            <div className="gestao-toolbar">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar placa, pessoa ou vaga" />
              {canEdit && <button type="button" className="gestao-ghost" onClick={() => void clearMovementHistory()} disabled={working}>Limpar encerrados</button>}
            </div>
            <div className="gestao-table-wrap">
              <table>
                <thead><tr><th>Placa</th><th>Responsável</th><th>Entrada</th><th>Saída</th><th>Vaga</th><th>Status</th></tr></thead>
                <tbody>
                  {visibleMovements.map((item) => (
                    <tr key={item.id}>
                      <td>{item.placa}</td>
                      <td>{item.responsavel}</td>
                      <td>{formatTime(item.entrada_em)}</td>
                      <td>{item.saida_em ? formatTime(item.saida_em) : "—"}</td>
                      <td>{item.vaga_codigo || "—"}</td>
                      <td><span className={`gestao-badge status-${item.status.toLowerCase()}`}>{item.status === "NO_LOCAL" ? "No local" : "Encerrada"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleMovements.length && <p className="gestao-empty">Nenhuma movimentação encontrada.</p>}
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

function filterMovements(movements: Movement[] | undefined, query: string) {
  const term = query.trim().toLowerCase();
  const list = movements || [];
  const filtered = term
    ? list.filter((item) => [item.placa, item.responsavel, item.vaga_codigo, item.setor_nome].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)))
    : list;
  return filtered.slice(0, 40);
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <article className={`gestao-kpi tone-${tone}`}>
      <strong>{value}</strong>
      <small>{label}</small>
    </article>
  );
}

function TabButton({ id, tab, setTab, children }: { id: Tab; tab: Tab; setTab: (id: Tab) => void; children: React.ReactNode }) {
  return (
    <button type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
      {children}
    </button>
  );
}
