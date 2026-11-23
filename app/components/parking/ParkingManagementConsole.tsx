"use client";

import { FormEvent, useState } from "react";
import ParkingSceneEditor from "./ParkingSceneEditor";
import ParkingPublishedScene from "./ParkingPublishedScene";
import PublicIcon, { type PublicIconName } from "../PublicIcon";
import { ParkingEmpty, ParkingHeading, ParkingMetric, ParkingMovementCard } from "./ParkingUi";
import ParkingReservationTable from "./ParkingReservationTable";
import ParkingMovementHistory from "./ParkingMovementHistory";
import ParkingReportCard from "./ParkingReportCard";
import { useBrowserSearch } from "../useBrowserSearch";
import { spaceState } from "./ParkingSpaceMap";
import { ParkingQrCheckin, type ParkingQrValidationResult } from "../ParkingReservationQr";
import {
  formatTime,
  parkingLabel,
} from "./format";
import type { ParkingController } from "./useParkingData";

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
    registerEntry,
    registerExit,
    registerOccurrence,
    submitJson,
    reservationAction,
    clearMovementHistory,
    reportAction,
    } = parking;

  const search = useBrowserSearch();
  const [selectedTab, updateTab] = useState<Tab | null>(null);
  const tab = selectedTab ?? (parking.reportsEnabled && new URLSearchParams(search).get("aba") === "relatorios" ? "relatorios" : "visao");
  const [sceneDirty, setSceneDirty] = useState(false);
  const setTab = (next: Tab) => { if (tab === "mapa" && sceneDirty && next !== tab && !window.confirm("Sair sem salvar o rascunho?")) return; setSceneDirty(false); if (next !== tab) parking.setReservationFilters(f => ({...f,status:"",page:1})); updateTab(next); };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exitSearch, setExitSearch] = useState("");

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
    {id:"relatorios",label:"Relatórios",show:parking.reportsEnabled,description:"Acompanhe o envio e a revisão dos relatórios de plantão."},
    {id:"mapa",label:"Mapa e vagas",show:true,description:"Organize os setores e as posições. As cores mostram a situação física atual; consulte Vagas para disponibilidade por atividade."},
    {id:"equipe",label:"Equipe e configuração",show:canConfigure||canManageHelpers,description:"Defina o responsável e as orientações. Auxiliares são convidados durante um plantão confirmado."},
  ];
  const activeSection = sections.find(item => item.id === tab);
  const visibleMovements = activeMovements.filter(item => [item.placa,item.responsavel,item.vaga_codigo].join(" ").toLocaleLowerCase("pt-BR").includes(exitSearch.toLocaleLowerCase("pt-BR")));
  const filteredSpaces = data.vagas.filter(space=>{const f=parking.reservationFilters;return (!f.q || space.codigo.toLowerCase().includes(f.q.toLowerCase()))&&(!f.setorId||String(space.setor_id)===f.setorId)&&(!f.tipo||space.tipo===f.tipo)&&(!f.status||spaceState(space).className===f.status);});
  const activeFilters = [
    { key: "q", label: `Busca: ${parking.reservationFilters.q}` },
    { key: "setorId", label: sectors.find(sector => sector.id.split(":")[0] === parking.reservationFilters.setorId)?.name || "Setor selecionado" },
    { key: "tipo", label: parkingLabel(parking.reservationFilters.tipo) },
    { key: "status", label: ({ PENDENTE: "Aguardando aprovação", CONFIRMADA: "Aprovadas", CHECKIN: "Entradas registradas", RECUSADA: "Recusadas", CANCELADA: "Canceladas", available: "Disponíveis", reserved: "Reservadas", occupied: "Ocupadas", blocked: "Indisponíveis" } as Record<string,string>)[parking.reservationFilters.status] || parking.reservationFilters.status },
  ].filter(item => parking.reservationFilters[item.key as "q" | "setorId" | "tipo" | "status"]);

  function openReservationQueue(status: string) {
    parking.setReservationFilters({q:"",setorId:"",tipo:"",status,page:1});
    updateTab("reservas");
  }

  async function handleQr(code: string): Promise<ParkingQrValidationResult | boolean> {
    const result = await reservationAction({ codigo: code, acao: "CHECKIN" });
    if (result && typeof result === "object") return result as ParkingQrValidationResult;
    return Boolean(result);
  }


  return (
    <section className="gestao-console parking-redesign parking-management">
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
      <nav className="gestao-tabs" aria-label="Seções da gestão">
        <TabButton id="visao" tab={tab} setTab={setTab}>Vagas</TabButton>
        {(canEntry || canExit) && <TabButton id="entradas" tab={tab} setTab={setTab}>Entradas e saídas</TabButton>}
        <TabButton id="reservas" tab={tab} setTab={setTab}>Reservas</TabButton>
        {(canEntry || canExit || canEdit) && <TabButton id="historico" tab={tab} setTab={setTab}>Histórico</TabButton>}
        {canEdit && <TabButton id="ocorrencias" tab={tab} setTab={setTab}>Ocorrências</TabButton>}
        {parking.reportsEnabled && <TabButton id="relatorios" tab={tab} setTab={setTab}>Relatórios</TabButton>}
        <TabButton id="mapa" tab={tab} setTab={setTab}>Mapa e vagas</TabButton>
        {(canConfigure || canManageHelpers) && <TabButton id="equipe" tab={tab} setTab={setTab}>Equipe e configuração</TabButton>}
      </nav>

      <ParkingHeading icon={sectionIcons[tab]} eyebrow="ÁREA DE TRABALHO" title={activeSection?.label || "Estacionamento"}>{activeSection?.description}</ParkingHeading>
      {["visao","reservas","entradas"].includes(tab) && <div className="parking-v2-context-bar"><label>Atividade<select value={parking.context.eventId} onChange={event=>{parking.setContext({eventId:event.target.value,start:'',end:''});parking.setReservationFilters(f=>({...f,page:1}));}}><option value="">{tab === "reservas" ? "Todas as atividades" : "Agora / todas as atividades"}</option>{parking.eventOptions.map(item=><option key={item.id} value={item.id}>{item.titulo} · {formatTime(item.inicia_em)}</option>)}</select></label><p>{parking.context.eventId ? "Reservas e vagas consultadas para esta atividade. As entradas e saídas mostram os veículos presentes agora." : tab === "reservas" ? "Mostrando reservas de todas as atividades." : "Mostrando a situação atual. Escolha uma atividade para consultar reservas futuras."}</p></div>}
      {tab==='visao' && <section className="parking-overview" aria-label="Resumo das vagas"><div className="parking-overview-caption"><strong>{parking.context.eventId ? "Disponibilidade para a atividade" : "Ocupação atual"}</strong><span>{data.stats.total} vagas cadastradas</span></div><div className="parking-workspace-metrics"><ParkingMetric label="Disponíveis" value={data.stats.livres} tone="green" icon="pin" /><ParkingMetric label="Reservadas" value={data.stats.reservadas || 0} tone="amber" icon="calendar" /><ParkingMetric label="Ocupadas" value={data.stats.ocupadas} icon="user" /><ParkingMetric label="Indisponíveis" value={data.stats.indisponiveis || 0} tone="neutral" icon="shield" /></div></section>}
      {tab === "visao" && (canEdit || canEntry || canExit) && <div className="parking-v4-operation-actions" aria-label="Atalhos da operação"><span>O que você precisa fazer?</span><div>{canEdit && <button type="button" onClick={()=>openReservationQueue("PENDENTE")}>Analisar solicitações</button>}{canEntry && <button type="button" onClick={()=>openReservationQueue("CONFIRMADA")}>Consultar aprovadas</button>}{(canEntry || canExit) && <button type="button" onClick={()=>setTab("entradas")}>Controlar entradas e saídas</button>}</div></div>}
      {tab === "reservas" && <div className="parking-v4-queue"><div className="parking-v4-queue-options" role="group" aria-label="Filtrar fila de reservas">{[["","Todas"],["PENDENTE","Aguardando aprovação"],["CONFIRMADA","Aprovadas"],["CHECKIN","Entradas registradas"]].map(([value,label])=><button key={value} type="button" aria-pressed={parking.reservationFilters.status===value} onClick={()=>parking.setReservationFilters(f=>({...f,status:value,page:1}))}>{label}</button>)}</div><p>{parking.reservationFilters.status === "PENDENTE" ? "Confira atividade, veículo e período antes de aprovar. A aprovação disponibiliza o comprovante ao membro." : parking.reservationFilters.status === "CONFIRMADA" ? "Reservas aprovadas aguardando entrada. Confirme a placa e registre a chegada do veículo." : parking.reservationFilters.status === "CHECKIN" ? "Reservas com entrada registrada, incluindo as já encerradas. Confira a movimentação em cada cartão." : "Filtre a etapa que precisa de atenção ou use a busca para localizar uma reserva."}</p></div>}
      {(tab==='visao'||tab==='reservas') && <div className={`parking-v3-filter-panel${filtersOpen ? " is-open" : ""}`}><button type="button" className="parking-v3-filter-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(value=>!value)}><PublicIcon name="search" size={18} />{filtersOpen ? "Ocultar filtros" : "Buscar e filtrar"}{[parking.reservationFilters.q,parking.reservationFilters.setorId,parking.reservationFilters.tipo,parking.reservationFilters.status].filter(Boolean).length ? " · filtros ativos" : ""}</button><div className="parking-v2-filters">
        <label>Buscar {tab==='visao' ? 'vaga' : 'pessoa, placa, vaga ou reserva'}<input value={parking.reservationFilters.q} onChange={event=>parking.setReservationFilters(f=>({...f,q:event.target.value,page:1}))} /></label>
        <label>Setor<select value={parking.reservationFilters.setorId} onChange={event=>parking.setReservationFilters(f=>({...f,setorId:event.target.value,page:1}))}><option value="">Todos os setores</option>{sectors.map(sector=><option key={sector.id} value={sector.id.split(':')[0]}>{sector.name}</option>)}</select></label>
        <label>Tipo<select value={parking.reservationFilters.tipo} onChange={event=>parking.setReservationFilters(f=>({...f,tipo:event.target.value,page:1}))}><option value="">Todos os tipos</option><option value="COMUM">Comum</option><option value="PCD">PCD</option><option value="IDOSO">Idoso</option><option value="RESERVADA">Especial</option></select></label>
        <label>Status<select value={parking.reservationFilters.status} onChange={event=>parking.setReservationFilters(f=>({...f,status:event.target.value,page:1}))}><option value="">Todos os status</option>{(tab==='reservas' ? [['PENDENTE','Aguardando aprovação'],['CONFIRMADA','Aprovada'],['CHECKIN','Entrada registrada'],['RECUSADA','Recusada'],['CANCELADA','Cancelada']] : [['available','Disponível'],['reserved','Reservada'],['occupied','Ocupada'],['blocked','Indisponível']]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <button type="button" onClick={()=>parking.setReservationFilters({q:'',setorId:'',tipo:'',status:'',page:1})}>Limpar filtros</button>
        {canConfigure && <button type="button" onClick={()=>setTab('mapa')}>Editar mapa</button>}
      </div>{activeFilters.length > 0 && <div className="parking-active-filters" aria-label="Filtros ativos">{activeFilters.map(filter=><button key={filter.key} type="button" aria-label={`Remover filtro: ${filter.label}`} onClick={()=>parking.setReservationFilters(f=>({...f,[filter.key]:"",page:1}))}>{filter.label}<span aria-hidden="true">×</span></button>)}</div>}</div>}
      {tab==='visao' && <section className="parking-space-overview" aria-label="Vagas do estacionamento"><div className="parking-overview-caption"><h3>Encontre uma vaga</h3><span>{filteredSpaces.length} de {data.vagas.length} vagas</span></div><div className="parking-space-cards">
        {filteredSpaces.map(space=>{const state=spaceState(space),movement=data.movimentacoes.find(m=>m.status==='NO_LOCAL'&&m.vaga_id===space.id),bookings=(data.reservasVagas || []).filter(r=>r.vaga_id===space.id);return <article key={space.id} className={'parking-space-card '+state.className}><header><strong>{space.codigo}</strong><span className={'parking-v2-status '+state.className}>{state.mark} {state.label}</span></header><p>{space.setor_nome} · {parkingLabel(space.tipo)}</p><div className="parking-space-current">{movement ? <><strong>{movement.placa}</strong><span>{movement.responsavel}</span><small>{parkingLabel(movement.tipo_veiculo)}</small><small>Entrada {formatTime(movement.entrada_em)}</small></> : <span>{state.className==='available' ? "Consulte as reservas desta vaga." : state.className==='reserved' ? "Vaga reservada neste período." : "Confira os registros desta vaga."}</span>}</div>{bookings.length > 0 && <div className="parking-space-reservations">{bookings.map(reservation=><div key={reservation.id}><small>{reservation.status === "PENDENTE" ? "Aguardando aprovação" : reservation.status === "CHECKIN" ? "Entrada registrada" : "Reserva confirmada"}</small><strong>{reservation.placa_veiculo} · {reservation.modelo_veiculo || parkingLabel(reservation.tipo_veiculo)}</strong><span>{reservation.cor_veiculo} · {reservation.nome_completo}</span><small>{reservation.evento_titulo} · {formatTime(reservation.inicio_em)} até {formatTime(reservation.fim_em)}</small></div>)}{bookings[0].total > bookings.length && <small>+ {bookings[0].total-bookings.length} reserva(s) em Ver reservas</small>}</div>}{movement&&canExit ? <button type="button" disabled={working} onClick={()=>{if(window.confirm('Registrar saída do veículo '+movement.placa+'?')) void registerExit(movement.id);}}>Registrar saída <PublicIcon name="logout" size={16}/></button> : <button type="button" onClick={()=>{parking.setReservationFilters(f=>({...f,q:space.codigo,status:'',page:1}));setTab('reservas');}}>Ver reservas <PublicIcon name="arrow" size={16}/></button>}</article>;})}
      </div>{!filteredSpaces.length && <ParkingEmpty icon="search" title={data.vagas.length ? "Nenhuma vaga encontrada" : "Nenhuma vaga cadastrada"}>{data.vagas.length ? "Revise a busca, o setor ou os filtros para localizar a vaga." : "Cadastre setores e vagas em Mapa e vagas para iniciar a operação."}</ParkingEmpty>}</section>}
      {tab==='historico' && <ParkingMovementHistory />}
      {tab === "entradas" && (
        <section className="gestao-card gestao-two-col parking-entry-workspace">
          {canEntry && <div className="parking-v2-scan-inline"><ParkingHeading icon="shield" eyebrow="COM RESERVA APROVADA" title="Ler QR Code da reserva">Valide o comprovante para identificar a reserva e registrar a chegada.</ParkingHeading><ParkingQrCheckin disabled={working} onDetected={handleQr} /></div>}
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
            <ParkingHeading icon="logout" eyebrow="REGISTRAR SAÍDA" title="Veículos no local">{`${activeMovements.length} veículos presentes. Confira a placa antes de liberar a vaga.`}</ParkingHeading><label>Buscar veículo para saída<input placeholder="Placa, pessoa ou vaga" value={exitSearch} onChange={event=>setExitSearch(event.target.value)} /></label>
            <div className="gestao-simple-list">
              {visibleMovements.length ? visibleMovements.map((item) => (
<ParkingMovementCard key={item.id} movement={item}>{canExit && <button type="button" disabled={working} onClick={() => {if(window.confirm(`Registrar saída de ${item.placa}?`)) void registerExit(item.id);}}>Registrar saída <PublicIcon name="logout" size={16}/></button>}</ParkingMovementCard>
              )) : <p className="gestao-empty">{exitSearch ? "Nenhum veículo corresponde à busca. Tente parte da placa ou o nome." : "Nenhum veículo no local."}</p>}
            </div>
          </div>
        </section>
      )}

      {tab === "reservas" && <ParkingReservationTable parking={parking} />}

      {tab === "ocorrencias" && canEdit && (
        <section className="gestao-card gestao-two-col parking-occurrence-workspace">
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
            <ParkingHeading icon="shield" title="Últimas ocorrências">Acompanhe o relato, a gravidade e quem registrou.</ParkingHeading>
            <div className="gestao-simple-list">
              {data.ocorrencias.length ? data.ocorrencias.map((item) => (
                <article key={item.id} className={`parking-occurrence-card severity-${item.gravidade.toLowerCase()}`}><header><strong><PublicIcon name="shield" size={18}/>{parkingLabel(item.tipo)}</strong><span className="parking-state">Atenção {parkingLabel(item.gravidade).toLocaleLowerCase("pt-BR")}</span></header><p>{item.descricao}</p><footer><span>{item.criado_por_nome || "Operador"}</span><span>{formatTime(item.criado_em)}</span><span className="parking-state tone-neutral">{item.status === "RESOLVIDA" ? "Resolvida" : item.status === "ABERTA" ? "Aberta" : parkingLabel(item.status)}</span></footer></article>
              )) : <ParkingEmpty icon="shield" title="Nenhuma ocorrência registrada">Use o formulário para registrar o local, o que aconteceu e a providência tomada.</ParkingEmpty>}
            </div>
          </div>
        </section>
      )}

      {tab === "relatorios" && (
        <section className="gestao-card">
          <ParkingHeading icon="layers" eyebrow="FECHAMENTO DE ESCALA" title="Envio e revisão dos plantões">Confira os números e o resumo antes de encaminhar à liderança.</ParkingHeading>
          <div className="gestao-report-grid">
            {reports.length ? reports.map(report => <ParkingReportCard key={report.id} report={report} working={working} onAction={reportAction} />) : <ParkingEmpty icon="layers" title="Nenhum relatório disponível">Os relatórios aparecem a partir dos plantões do ministério. Aqui você acompanha o envio e a revisão de cada fechamento.</ParkingEmpty>}
          </div>
        </section>
      )}

      {tab === "mapa" && (canConfigure
        ? <ParkingSceneEditor spaces={data.vagas} onPublished={()=>void parking.load(true)} onDirtyChange={setSceneDirty}/>
        : <ParkingPublishedScene spaces={data.vagas} selectedId={null} onSelect={()=>{}} fallback={<p>O cenário ainda não foi publicado pela Gestão.</p>} />)}

      {tab === "equipe" && (
        <section className="gestao-card gestao-two-col parking-team-workspace">
          {!data.operator.escala && <ParkingEmpty icon="users" title="Convites disponíveis durante o plantão">Você não está em um plantão confirmado agora. Os integrantes são cadastrados no ministério de estacionamento; durante o plantão, você pode convidar auxiliares.</ParkingEmpty>}
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
          <section className="parking-team-roster"><ParkingHeading icon="users" title="Integrantes do estacionamento">{`${data.ministryMembers.length} pessoas cadastradas no ministério.`}</ParkingHeading><div className="parking-team-list">{data.ministryMembers.map(person=><article key={person.id}><span className="parking-record-avatar"><PublicIcon name="user"/></span><div><strong>{person.nome}</strong><small>{parkingLabel(person.papel)}</small></div></article>)}{!data.ministryMembers.length && <p className="gestao-empty">Cadastre os integrantes no ministério para organizar a equipe.</p>}</div></section>
          <details className="parking-v3-history-tools"><summary>Manutenção do histórico</summary><p>A limpeza exclui os registros encerrados. Confira o histórico antes de continuar.</p><div className="gestao-row-actions"><button type="button" onClick={()=>setTab('historico')}>Consultar histórico de movimentações</button>{canEdit && <button type="button" disabled={working} onClick={()=>{if(window.confirm('Excluir as movimentações encerradas?')) void clearMovementHistory();}}>Limpar movimentações encerradas</button>}</div></details>
        </section>
      )}
    </section>
  );
}

const sectionIcons: Record<Tab, PublicIconName> = {visao:"pin",entradas:"logout",reservas:"calendar",historico:"layers",ocorrencias:"shield",relatorios:"message",mapa:"community",equipe:"users"};

function TabButton({ id, tab, setTab, children }: { id: Tab; tab: Tab; setTab: (id: Tab) => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
      <PublicIcon name={sectionIcons[id]} size={20}/><span>{children}</span>
    </button>
  );
}
