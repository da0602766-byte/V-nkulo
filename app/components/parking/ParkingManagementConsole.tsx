"use client";

import { DragEvent, FormEvent, useRef, useState } from "react";
import ParkingReservationTable from "./ParkingReservationTable";
import ParkingMovementHistory from "./ParkingMovementHistory";
import { spaceState } from "./ParkingSpaceMap";
import { ParkingQrCheckin, type ParkingQrValidationResult } from "../ParkingReservationQr";
import {
  formatTime,
  parkingLabel,
  getParkingCanvasHeight,
  getParkingCanvasWidth,
  hasCustomParkingLayout,
} from "./format";
import type { ParkingController } from "./useParkingData";
import type { Space } from "./types";

type Tab = "historico" | "visao" | "entradas" | "reservas" | "ocorrencias" | "relatorios" | "mapa" | "equipe";

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
    reports,
    working,
    feedback,
    error,
    canReviewReports,
    registerEntry,
    registerExit,
    registerOccurrence,
    submitJson,
    reservationAction,
    clearMovementHistory,
    reportAction,
    moveSpace,
  } = parking;

  const [tab, updateTab] = useState<Tab>("visao");
  const setTab = (next: Tab) => { if (next !== tab) parking.setReservationFilters(f => ({...f,status:"",page:1})); updateTab(next); };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exitSearch, setExitSearch] = useState("");
  const [mapEditing, setMapEditing] = useState(false);
  const [draggedSpace, setDraggedSpace] = useState<number | null>(null);
  const pointerDragRef = useRef<{ spaceId: number; offsetX: number; offsetY: number } | null>(null);

  if (!data) {
    return (
      <section className="gestao-console gestao-loading">
        {parking.loading ? <p role="status">Carregando painel de gestão…</p> : <><p role="alert">{error || "Não foi possível abrir o estacionamento."}</p><button type="button" onClick={()=>void parking.load()}>Tentar novamente</button></>}
      </section>
    );
  }

  const canEntry = data.permissions.includes("parking.entry");
  const canExit = data.permissions.includes("parking.exit");
  const canEdit = data.permissions.includes("parking.edit");
  const canConfigure = data.permissions.includes("parking.configure");
  const canManageHelpers = data.permissions.includes("parking.helpers.manage");

  const activeMovements = (data.movimentacoes || []).filter((item) => item.status === "NO_LOCAL");

  const sections: {id: Tab; label: string; show: boolean; description: string}[] = [
    {id:"visao",label:"Vagas",show:true,description:"Encontre uma vaga para consultar as reservas ou registrar a saída."},
    {id:"entradas",label:"Entradas e saídas",show:canEntry||canExit,description:"Use o QR de uma reserva aprovada ou registre uma entrada sem reserva. As saídas liberam a vaga."},
    {id:"reservas",label:"Reservas",show:true,description:"Aprove as solicitações pendentes e acompanhe as entradas. Uma solicitação ainda não é uma aprovação."},
    {id:"historico",label:"Histórico",show:canEntry||canExit||canEdit,description:"Consulte as movimentações de todas as atividades, inclusive veículos que já saíram."},
    {id:"ocorrencias",label:"Ocorrências",show:canEdit,description:"Registre o que aconteceu e o nível de atenção necessário. A lista mostra os 20 registros mais recentes."},
    {id:"relatorios",label:"Relatórios",show:true,description:"Acompanhe o envio e a revisão dos relatórios de plantão. São exibidos os 60 relatórios mais recentes."},
    {id:"mapa",label:"Mapa e vagas",show:true,description:"Organize os setores e as posições. As cores mostram a situação física atual; consulte Vagas para disponibilidade por atividade."},
    {id:"equipe",label:"Equipe e configuração",show:canConfigure||canManageHelpers,description:"Defina o responsável e as orientações. Auxiliares são convidados durante um plantão confirmado."},
  ];
  const activeSection = sections.find(item => item.id === tab);
  const visibleMovements = activeMovements.filter(item => [item.placa,item.responsavel,item.vaga_codigo].join(" ").toLocaleLowerCase("pt-BR").includes(exitSearch.toLocaleLowerCase("pt-BR")));
  const filteredSpaces = data.vagas.filter(space=>{const f=parking.reservationFilters;return (!f.q || space.codigo.toLowerCase().includes(f.q.toLowerCase()))&&(!f.setorId||String(space.setor_id)===f.setorId)&&(!f.tipo||space.tipo===f.tipo)&&(!f.status||spaceState(space).className===f.status);});

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
    const x = Math.max(0, Math.round((event.clientX - rect.left - drag.offsetX) * canvas.offsetWidth / rect.width + canvas.scrollLeft));
    const y = Math.max(0, Math.round((event.clientY - rect.top - drag.offsetY) * canvas.offsetHeight / rect.height + canvas.scrollTop));
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
    const x = Math.max(0, Math.round((event.clientX - rect.left) * event.currentTarget.offsetWidth / rect.width - 32));
    const y = Math.max(0, Math.round((event.clientY - rect.top) * event.currentTarget.offsetHeight / rect.height - 28));
    setDraggedSpace(null);
    void moveSpace(draggedSpace, x, y);
  }

  return (
    <section className="gestao-console parking-redesign">
      <header className="gestao-console-header">
        <div>
          <p className="gestao-kicker">GESTÃO · {communityName}</p>
          <h1>{data.config.nome_modulo || "Estacionamento"}</h1>
          <p>Gestão de vagas, reservas e movimentações.</p>
        </div>
        <div className="gestao-operator-chip">
          <strong>{data.operator.nome}</strong>
          <small>{data.operator.origemAcesso === "ESCALA_ATIVA" ? `Em plantão · ${data.operator.escala?.titulo}` : `${parkingLabel(data.operator.papel)} · acesso permanente`}</small>
        </div>
      </header>

      {(feedback || error) && <p className={`gestao-feedback${error ? " is-error" : ""}`} role="status">{error || feedback}</p>}

      <div className="parking-v2-sync"><span>{parking.stale ? 'Informações desatualizadas' : parking.lastSync ? 'Atualizado às '+new Date(parking.lastSync).toLocaleTimeString('pt-BR') : 'Atualizando…'}</span><button type="button" onClick={()=>void parking.load(true)}>Atualizar</button></div>
      <label className="parking-v3-mobile-tabs">Área de trabalho<select value={tab} onChange={event=>setTab(event.target.value as Tab)}>{sections.filter(item=>item.show).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <nav className="gestao-tabs" aria-label="Seções da gestão">
        <TabButton id="visao" tab={tab} setTab={setTab}>Vagas</TabButton>
        {(canEntry || canExit) && <TabButton id="entradas" tab={tab} setTab={setTab}>Entradas e saídas</TabButton>}
        <TabButton id="reservas" tab={tab} setTab={setTab}>Reservas</TabButton>
        {(canEntry || canExit || canEdit) && <TabButton id="historico" tab={tab} setTab={setTab}>Histórico</TabButton>}
        {canEdit && <TabButton id="ocorrencias" tab={tab} setTab={setTab}>Ocorrências</TabButton>}
        <TabButton id="relatorios" tab={tab} setTab={setTab}>Relatórios</TabButton>
        <TabButton id="mapa" tab={tab} setTab={setTab}>Mapa e vagas</TabButton>
        {(canConfigure || canManageHelpers) && <TabButton id="equipe" tab={tab} setTab={setTab}>Equipe e configuração</TabButton>}
      </nav>

      <div className="parking-v3-section-heading"><h2>{activeSection?.label}</h2><p>{activeSection?.description}</p></div>
      {["visao","reservas","entradas"].includes(tab) && <div className="parking-v2-context-bar"><label>Atividade<select value={parking.context.eventId} onChange={event=>{parking.setContext({eventId:event.target.value,start:'',end:''});parking.setReservationFilters(f=>({...f,page:1}));}}><option value="">{tab === "reservas" ? "Todas as atividades" : "Agora / todas as atividades"}</option>{parking.eventOptions.map(item=><option key={item.id} value={item.id}>{item.titulo} · {formatTime(item.inicia_em)}</option>)}</select></label><p>{parking.context.eventId ? "Reservas e vagas consultadas para esta atividade. As entradas e saídas mostram os veículos presentes agora." : tab === "reservas" ? "Mostrando reservas de todas as atividades." : "Mostrando a situação atual. Escolha uma atividade para consultar reservas futuras."}</p></div>}
      {tab==='visao' && <p className="parking-v2-summary">{parking.context.eventId ? 'Atividade selecionada' : 'Ocupação atual'} · {data.stats.total} vagas · {data.stats.livres} disponíveis · {data.stats.reservadas || 0} reservadas · {data.stats.ocupadas} ocupadas · {data.stats.indisponiveis || 0} indisponíveis</p>}
      {(tab==='visao'||tab==='reservas') && <div className={`parking-v3-filter-panel${filtersOpen ? " is-open" : ""}`}><button type="button" className="parking-v3-filter-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(value=>!value)}>{filtersOpen ? "Ocultar filtros" : "Buscar e filtrar"}{[parking.reservationFilters.q,parking.reservationFilters.setorId,parking.reservationFilters.tipo,parking.reservationFilters.status].filter(Boolean).length ? " · filtros ativos" : ""}</button><div className="parking-v2-filters">
        <label>Buscar {tab==='visao' ? 'vaga' : 'pessoa, placa, vaga ou reserva'}<input value={parking.reservationFilters.q} onChange={event=>parking.setReservationFilters(f=>({...f,q:event.target.value,page:1}))} /></label>
        <label>Setor<select value={parking.reservationFilters.setorId} onChange={event=>parking.setReservationFilters(f=>({...f,setorId:event.target.value,page:1}))}><option value="">Todos os setores</option>{sectors.map(sector=><option key={sector.id} value={sector.id.split(':')[0]}>{sector.name}</option>)}</select></label>
        <label>Tipo<select value={parking.reservationFilters.tipo} onChange={event=>parking.setReservationFilters(f=>({...f,tipo:event.target.value,page:1}))}><option value="">Todos os tipos</option><option value="COMUM">Comum</option><option value="PCD">PCD</option><option value="IDOSO">Idoso</option><option value="RESERVADA">Especial</option></select></label>
        <label>Status<select value={parking.reservationFilters.status} onChange={event=>parking.setReservationFilters(f=>({...f,status:event.target.value,page:1}))}><option value="">Todos os status</option>{(tab==='reservas' ? [['PENDENTE','Pendente'],['CONFIRMADA','Confirmada'],['CHECKIN','Entrada registrada'],['RECUSADA','Recusada'],['CANCELADA','Cancelada']] : [['available','Disponível'],['reserved','Reservada'],['occupied','Ocupada'],['blocked','Indisponível']]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <button type="button" onClick={()=>parking.setReservationFilters({q:'',setorId:'',tipo:'',status:'',page:1})}>Limpar filtros</button>
        {canConfigure && <button type="button" onClick={()=>setTab('mapa')}>Editar mapa</button>}
      </div></div>}
      {tab==='visao' && <section className="parking-v2-records"><div className="parking-v2-table-scroll"><table className="parking-v2-data-table"><thead><tr><th scope="col">Vaga</th><th scope="col">Setor</th><th scope="col">Tipo</th><th scope="col">Situação</th><th scope="col">Entrada atual</th><th scope="col">Ações</th></tr></thead><tbody>
        {filteredSpaces.map(space=>{const state=spaceState(space),movement=data.movimentacoes.find(m=>m.status==='NO_LOCAL'&&m.vaga_id===space.id);return <tr key={space.id}><td data-label="Vaga"><strong>{space.codigo}</strong></td><td data-label="Setor">{space.setor_nome}</td><td data-label="Tipo">{parkingLabel(space.tipo)}</td><td data-label="Situação"><span className={'parking-v2-status '+state.className}>{state.mark} {state.label}</span></td><td data-label="Entrada">{movement ? formatTime(movement.entrada_em) : '—'}</td><td data-label="Ações">{movement&&canExit ? <button type="button" disabled={working} onClick={()=>{if(window.confirm('Registrar saída do veículo '+movement.placa+'?')) void registerExit(movement.id);}}>Registrar saída</button> : <button type="button" onClick={()=>{parking.setReservationFilters(f=>({...f,q:space.codigo,status:'',page:1}));setTab('reservas');}}>Ver reservas</button>}</td></tr>;})}
      </tbody></table></div><p className="parking-v2-pagination">{filteredSpaces.length} de {data.vagas.length} vagas</p>{!filteredSpaces.length && <p className="gestao-empty">{data.vagas.length ? "Nenhuma vaga encontrada para estes filtros." : "Nenhuma vaga cadastrada. Configure os setores e as vagas para começar."}</p>}</section>}
      {tab==='historico' && <ParkingMovementHistory />}
      {tab === "entradas" && (
        <section className="gestao-card gestao-two-col">
          {canEntry && <div className="parking-v2-scan-inline"><h2>Ler QR Code da reserva</h2><ParkingQrCheckin disabled={working} onDetected={handleQr} /></div>}
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
                <legend>Entrada sem reserva</legend><p className="gestao-hint">Para uma reserva aprovada, use o QR acima ou a ação Registrar entrada na aba Reservas.</p>
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
            <header><h3>Veículos no local</h3><span>{activeMovements.length}</span></header><label>Buscar veículo para saída<input placeholder="Placa, pessoa ou vaga" value={exitSearch} onChange={event=>setExitSearch(event.target.value)} /></label>
            <div className="gestao-simple-list">
              {visibleMovements.length ? visibleMovements.map((item) => (
                <article key={item.id}>
                  <div><strong>{item.placa}</strong><small>{item.vaga_codigo || "Sem vaga"} · {item.responsavel}</small></div>
                  {canExit && <button type="button" disabled={working} onClick={() => {if(window.confirm(`Registrar saída de ${item.placa}?`)) void registerExit(item.id);}}>Registrar saída</button>}
                </article>
              )) : <p className="gestao-empty">{exitSearch ? "Nenhum veículo corresponde à busca. Tente parte da placa ou o nome." : "Nenhum veículo no local."}</p>}
            </div>
          </div>
        </section>
      )}

      {tab === "reservas" && <ParkingReservationTable parking={parking} />}

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
              <label className="gestao-wide">Descrição<textarea name="descricao" required minLength={8} rows={3} placeholder="Informe o local, o que aconteceu e a providência tomada." /></label>
            </fieldset>
            <button className="gestao-primary" disabled={working}>Registrar ocorrência</button>
          </form>
          <div className="gestao-card-inner">
            <header><h3>Últimas ocorrências</h3></header>
            <div className="gestao-simple-list">
              {data.ocorrencias.length ? data.ocorrencias.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{parkingLabel(item.tipo)} · atenção {parkingLabel(item.gravidade).toLocaleLowerCase("pt-BR")}</strong>
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
          <header><p className="gestao-kicker">FECHAMENTO DE ESCALA</p><h2>Envio e revisão dos plantões</h2></header>
          <div className="gestao-report-grid">
            {reports.length ? reports.map((report) => (
              <article key={report.id} className="gestao-report-form">
                <header>
                  <span className={`gestao-badge status-${report.status.toLowerCase()}`}>{parkingLabel(report.status)}</span>
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
            )) : <p className="gestao-empty">Nenhum relatório disponível. Os registros são vinculados aos plantões do ministério de estacionamento.</p>}
          </div>
        </section>
      )}

      {tab === "mapa" && (
        <section className="gestao-card">
          <header>
            <div><p className="gestao-kicker">MAPA</p><h2>Organização dos setores</h2></div>
            <div className="gestao-row-actions">
              <span>{data.stats.livres} livres</span>
              {canConfigure && <button type="button" className="gestao-ghost" onClick={() => setMapEditing((value) => !value)}>{mapEditing ? "Concluir edição" : "Reorganizar vagas"}</button>}
            </div>
          </header>
          {mapEditing && <p className="gestao-hint">Ao soltar uma vaga, a nova posição é salva. Para usar o teclado, abra Editar posições por campos e pressione Salvar posição.</p>}
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
                              { action: "ATUALIZAR_SETOR", setorId: Number(sector.id.split(":")[0]), previousNome: sector.name, previousCor: sector.color, previousOrdem: sector.order, ...values },
                              `Setor “${sector.name}” atualizado.`,
                              "PATCH",
                            ).then((saved) => {
                              if (saved && editor) editor.open = false;
                            });
                          }}
                        >
                          <label>Nome<input name="nome" defaultValue={sector.name} required maxLength={80} /></label>
                          <label>Cor<input name="cor" type="color" defaultValue={sector.color} /></label>
                          <label>Ordem do setor<input name="ordem" type="number" min="0" max="99" defaultValue={sector.order} /></label>
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
                        onPointerCancel={() => {pointerDragRef.current=null;setDraggedSpace(null);void parking.load(true);}}
                        style={usesCanvas ? { left: space.posicao_x, top: space.posicao_y } : undefined}
                        className={`gestao-slot small status-${space.status.toLowerCase()}${mapEditing ? " is-editing" : ""}`}
                        title={`${space.codigo} · ${parkingLabel(space.tipo)} · ${spaceState({...space,reservada:0}).label}`}
                      >{space.codigo}</button>
                    ))}
                  </div>
                </section>
              );
            })}
            {!sectors.length && <p className="gestao-empty">Nenhum setor cadastrado ainda.</p>}
          </div>
          {canConfigure && <details className="parking-v2-coordinate-editor"><summary>Editar posições por campos</summary><p>A posição horizontal cresce para a direita e a vertical, para baixo. Deixe pelo menos 72 pixels entre colunas e 64 entre linhas.</p>{data.vagas.map(space=><form key={space.id+'-'+space.posicao_x+'-'+space.posicao_y} onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget);void moveSpace(space.id,Number(values.get('x')),Number(values.get('y')));}}><strong>{space.codigo} · {space.setor_nome}</strong><label>Horizontal (px)<input name="x" type="number" min="0" max="10000" defaultValue={space.posicao_x} required /></label><label>Vertical (px)<input name="y" type="number" min="0" max="10000" defaultValue={space.posicao_y} required /></label><button disabled={working}>Salvar posição</button></form>)}</details>}
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
          {!data.operator.escala && <p className="parking-v3-empty">Você não está em um plantão confirmado agora. Os convites para auxiliares aparecem durante o plantão; os integrantes são cadastrados no ministério de estacionamento.</p>}
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
              <button className="gestao-primary" disabled={working}>Salvar configuração</button>
            </form>
          )}
          <details className="parking-v3-history-tools"><summary>Manutenção do histórico</summary><p>A limpeza exclui os registros encerrados. Confira o histórico antes de continuar.</p><div className="gestao-row-actions"><button type="button" onClick={()=>setTab('historico')}>Consultar histórico de movimentações</button>{canEdit && <button type="button" disabled={working} onClick={()=>{if(window.confirm('Excluir as movimentações encerradas?')) void clearMovementHistory();}}>Limpar movimentações encerradas</button>}</div></details>
        </section>
      )}
    </section>
  );
}

function TabButton({ id, tab, setTab, children }: { id: Tab; tab: Tab; setTab: (id: Tab) => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
      {children}
    </button>
  );
}
