"use client";

import { FormEvent, useMemo, useState } from "react";
import ParkingSpaceMap from "./ParkingSpaceMap";
import { ParkingReservationQr } from "../ParkingReservationQr";
import { formatTime, getEventParkingWindow, isSpaceAvailable, toLocalDateTimeInput } from "./format";
import type { ParkingController } from "./useParkingData";
import { canDeleteReservationHistory } from "./useParkingData";
import { useParkingGarage } from "./useParkingGarage";

type ContactForm = { nomeCompleto: string; email: string; documento: string; telefone: string };
type VehicleForm = { placa: string; tipo: string; modelo: string; cor: string };

const EMPTY_VEHICLE: VehicleForm = { placa: "", tipo: "CARRO", modelo: "", cor: "" };

export default function ParkingMemberPortal({
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
    eventOptions,
    loading,
    working,
    feedback,
    error,
    load,
    createReservation,
    deleteReservationHistory,
  } = parking;

  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const selectedEventId = parking.context.eventId;
  const [contact, setContact] = useState<ContactForm>({ nomeCompleto: "", email: "", documento: "", telefone: "" });
  const [vehicle, setVehicle] = useState<VehicleForm>(EMPTY_VEHICLE);
  const [saveVehicle, setSaveVehicle] = useState(true);
  const [window_, setWindow] = useState({ start: "", end: "" });
  const [justCreated, setJustCreated] = useState<{ codigo: string; spaceLabel: string; status: string } | null>(null);
  const [copyMessage, setCopyMessage] = useState("");

  const ownerKey = data ? (data.operator.email || `u${data.operator.id}`) : "";
  const garage = useParkingGarage(ownerKey);

  const selectedSector = sectors.find((sector) => sector.id === selectedSectorId) || sectors[0] || null;
  const selectedSpace = selectedSector?.spaces.find((space) => space.id === selectedSpaceId) || null;
  const selectedEvent = eventOptions.find((item) => String(item.id) === selectedEventId) || null;
  const gate = data?.reservationGate;
  const locked = Boolean(gate && !gate.unlocked) || parking.stale;
  const selectionLost = Boolean(selectedSpace && !isSpaceAvailable(selectedSpace));

  const myOpenReservations = useMemo(
    () => reservations.filter((item) => ["PENDENTE", "CONFIRMADA", "CHECKIN"].includes(item.status) && !item.saida_em),
    [reservations],
  );
  const myHistory = useMemo(() => reservations.filter(item => canDeleteReservationHistory(item) && (item.status !== "CHECKIN" || item.saida_em)), [reservations]);

  function pickSpace(sectorId: string, spaceId: number) {
    setSelectedSectorId(sectorId);
    setSelectedSpaceId(spaceId);
    setJustCreated(null);
    if (!contact.nomeCompleto && data) {
      setContact((current) => ({ ...current, nomeCompleto: data.operator.nome, email: data.operator.email }));
    }
    const recommended = selectedEvent ? getEventParkingWindow(selectedEvent) : null;
    // Esta função só roda a partir de um clique do usuário (nunca durante a
    // renderização), então ler o relógio aqui é seguro.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    setWindow({
      start: recommended?.start || toLocalDateTimeInput(new Date(now + 30 * 60 * 1000)),
      end: recommended?.end || toLocalDateTimeInput(new Date(now + 3 * 60 * 60 * 1000)),
    });
  }

  function applySavedVehicle(id: string) {
    const found = garage.vehicles.find((item) => item.id === id);
    if (!found) return;
    setVehicle({ placa: found.placa, tipo: found.tipo, modelo: found.modelo, cor: found.cor });
    setSaveVehicle(false);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const field = document.createElement("textarea");
      field.value = code;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopyMessage("Código copiado");
    window.setTimeout(() => setCopyMessage(""), 2_000);
  }

  function chooseEvent(id: string) {
    setSelectedSpaceId(null);
    parking.setContext({ eventId: id, start: "", end: "" });
    const event = eventOptions.find((item) => String(item.id) === id);
    if (!event) return;
    const recommended = getEventParkingWindow(event);
    setWindow(recommended);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSpace || !isSpaceAvailable(selectedSpace) || locked || working) return;
    const values = {
      vagaId: String(selectedSpace.id),
      nomeCompleto: contact.nomeCompleto,
      email: contact.email,
      documento: contact.documento,
      telefone: contact.telefone,
      placaVeiculo: vehicle.placa,
      tipoVeiculo: vehicle.tipo,
      modeloVeiculo: vehicle.modelo,
      corVeiculo: vehicle.cor,
      eventoId: selectedEventId,
      inicioEm: new Date(window_.start).toISOString(),
      fimEm: new Date(window_.end).toISOString(),
    };
    const result = await createReservation(values);
    if (result?.codigo) {
      if (saveVehicle && vehicle.placa) {
        garage.addVehicle({ apelido: vehicle.modelo || vehicle.placa, ...vehicle });
      }
      setJustCreated({ codigo: result.codigo, spaceLabel: `${selectedSpace.codigo} · ${selectedSector?.name}`, status: result.status || "PENDENTE" });
      setSelectedSpaceId(null);
      setSelectedSectorId("");
    }
  }

  if (loading && !data) {
    return (
      <section className="gestao-member gestao-loading">
        <span className="gestao-spinner" aria-hidden="true" />
        <p>Carregando vagas disponíveis…</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="gestao-member gestao-loading">
        <p role="alert">{error || "Não foi possível abrir o estacionamento."}</p>
        <button type="button" onClick={() => void load()}>Tentar novamente</button>
      </section>
    );
  }

  return (
    <section className="gestao-member parking-redesign">
      <header className="parking-v2-page-heading"><p>{communityName}</p><h1>Estacionamento</h1><p>Reserve sua vaga com tranquilidade.</p></header>
      <div className="parking-v2-context-bar">
        <label>Atividade
          <select value={selectedEventId} onChange={event => chooseEvent(event.target.value)}>
            <option value="">Selecione a atividade</option>
            {eventOptions.map(item => <option key={item.id} value={item.id}>{item.titulo} · {formatTime(item.inicia_em)}</option>)}
          </select>
        </label>
        {selectedEvent && <p>{formatTime(selectedEvent.inicia_em)} até {formatTime(selectedEvent.termina_em || selectedEvent.inicia_em)}</p>}
        <p role="status">{!gate?.eventAvailable ? "Não há atividades com estacionamento disponíveis neste momento." : !selectedEventId ? "Escolha uma atividade para consultar a disponibilidade do período." : locked ? gate?.reservationsOpenAt ? 'Reservas abrem em '+formatTime(gate.reservationsOpenAt) : "Atualizando disponibilidade…" : "Reservas abertas · sujeitas à aprovação da gestão"}</p>
      </div>
      {(feedback || error) && <p className={error ? "gestao-feedback is-error" : "gestao-feedback"} role="status">{error || feedback}</p>}
      <div className="parking-v2-sync"><span>{parking.stale ? "Disponibilidade desatualizada" : parking.lastSync ? 'Atualizado às '+new Date(parking.lastSync).toLocaleTimeString('pt-BR') : 'Carregando…'}</span><button type="button" onClick={() => void load(true)}>Atualizar</button></div>
      <div className="parking-v2-map-heading"><div><h2>Onde você quer parar?</h2><p>Toque em uma vaga disponível para selecionar.</p></div>
        <label>Setor<select value={selectedSector?.id || ''} onChange={event => {setSelectedSectorId(event.target.value);setSelectedSpaceId(null);}}>{sectors.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
      </div>
      <p className="parking-v2-summary">{selectedSector?.spaces.filter(isSpaceAvailable).length || 0} disponíveis no setor · selecionar não conclui a reserva</p>
      {justCreated && (
        <section className="gestao-receipt">
          <header>
            <span aria-hidden="true">✓</span>
            <div>
              <strong>{justCreated.status === "PENDENTE" ? "Reserva enviada" : "Reserva recuperada"}</strong>
              <p>{justCreated.spaceLabel} · {justCreated.status === "PENDENTE" ? "aguardando confirmação" : justCreated.status.toLocaleLowerCase("pt-BR")}</p>
            </div>
            <button type="button" onClick={() => setJustCreated(null)} aria-label="Fechar">×</button>
          </header>
          <ParkingReservationQr code={justCreated.codigo} label={justCreated.spaceLabel} />
          <button type="button" className="gestao-ghost" onClick={() => void copyCode(justCreated.codigo)}>{copyMessage || "Copiar código"}</button>
        </section>
      )}

      <ParkingSpaceMap spaces={selectedSector?.spaces || []} selectedId={selectedSpaceId} busy={working} onSelect={space => {
        if (space.minha_reserva) { document.getElementById('parking-my-reservations')?.scrollIntoView({behavior:'smooth'}); return; }
        if(selectedSector) pickSpace(selectedSector.id,space.id);
      }} />
      {selectedSpace && <div className="parking-v2-selection-summary" role="status"><div><strong>Vaga {selectedSpace.codigo}</strong><span>{selectedSector?.name} · {selectedSpace.tipo}</span></div><button type="button" onClick={()=>document.getElementById('parking-reservation-review')?.scrollIntoView({block:'start'})}>Revisar reserva</button></div>}
      {selectionLost && <p role="alert" className="gestao-feedback is-error">Esta vaga acabou de ficar indisponível. Escolha outra vaga.</p>}
      {selectedSpace && (
        <div className="parking-v2-booking">
          <section id="parking-reservation-review" aria-label="Revisão da reserva">
            <header>
              <div>
                <p className="gestao-kicker">VAGA SELECIONADA</p>
                <h2>{selectedSpace.codigo} · {selectedSector?.name}</h2><p>{selectedSpace.tipo} · confira os dados antes de confirmar.</p>
              </div>
              <button type="button" onClick={() => setSelectedSpaceId(null)} aria-label="Fechar">×</button>
            </header>
            <form className="gestao-form" onSubmit={submit}>
              <fieldset>
                <legend>Seus dados</legend>
                <label>Nome completo
                  <input required minLength={5} value={contact.nomeCompleto} onChange={(event) => setContact((c) => ({ ...c, nomeCompleto: event.target.value }))} />
                </label>
                <label>E-mail <small>ou informe CPF/CNPJ</small>
                  <input type="email" value={contact.email} onChange={(event) => setContact((c) => ({ ...c, email: event.target.value }))} />
                </label>
                <label>CPF ou CNPJ <small>ou informe e-mail</small>
                  <input inputMode="numeric" value={contact.documento} onChange={(event) => setContact((c) => ({ ...c, documento: event.target.value }))} />
                </label>
                <label>Celular
                  <input required inputMode="tel" placeholder="(47) 99999-9999" value={contact.telefone} onChange={(event) => setContact((c) => ({ ...c, telefone: event.target.value }))} />
                </label>
              </fieldset>

              <fieldset>
                <legend>Veículo</legend>
                {garage.vehicles.length > 0 && (
                  <div className="gestao-vehicle-chips">
                    {garage.vehicles.map((item) => (
                      <button type="button" key={item.id} className={vehicle.placa === item.placa ? "is-active" : ""} onClick={() => applySavedVehicle(item.id)}>
                        {item.apelido || item.placa}
                      </button>
                    ))}
                  </div>
                )}
                <label>Placa
                  <input required minLength={6} maxLength={10} autoCapitalize="characters" placeholder="ABC1D23" value={vehicle.placa} onChange={(event) => setVehicle((v) => ({ ...v, placa: event.target.value.toUpperCase() }))} />
                </label>
                <label>Tipo
                  <select value={vehicle.tipo} onChange={(event) => setVehicle((v) => ({ ...v, tipo: event.target.value }))}>
                    <option value="CARRO">Carro</option>
                    <option value="MOTO">Moto</option>
                    <option value="VAN">Van</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </label>
                <label>Marca e modelo
                  <input required minLength={2} placeholder="Ex.: Honda Civic" value={vehicle.modelo} onChange={(event) => setVehicle((v) => ({ ...v, modelo: event.target.value }))} />
                </label>
                <label>Cor
                  <input required placeholder="Ex.: Prata" value={vehicle.cor} onChange={(event) => setVehicle((v) => ({ ...v, cor: event.target.value }))} />
                </label>
                <label className="gestao-checkbox">
                  <input type="checkbox" checked={saveVehicle} onChange={(event) => setSaveVehicle(event.target.checked)} />
                  <span>Salvar este veículo na minha garagem <small>Fica só neste aparelho. CPF/CNPJ não será salvo.</small></span>
                </label>
              </fieldset>

              <fieldset>
                <legend>Evento e período</legend>
                <p>{selectedEvent?.titulo || 'Selecione uma atividade acima'}</p>
                <div className="gestao-time-grid">
                  <label>Chegada
                    <input type="datetime-local" required value={window_.start} onChange={(event) => { const start=event.target.value; setWindow(w => ({...w,start})); if(start && window_.end) parking.setContext(c => ({...c,start:new Date(start).toISOString(),end:new Date(window_.end).toISOString()})); }} />
                  </label>
                  <label>Saída
                    <input type="datetime-local" required value={window_.end} onChange={(event) => { const end=event.target.value; setWindow(w => ({...w,end})); if(end && window_.start) parking.setContext(c => ({...c,start:new Date(window_.start).toISOString(),end:new Date(end).toISOString()})); }} />
                  </label>
                </div>
              </fieldset>

              {locked && <p className="gestao-hint">A confirmação da reserva libera no horário programado do evento. Você já pode preencher os dados.</p>}
              <div className="parking-v2-booking-action"><p>{selectedSpace.codigo} · {selectedSector?.name} · {vehicle.placa || "Informe o veículo"}</p><button className="gestao-primary" disabled={working || locked || selectionLost}>{working ? "Aguarde…" : `Confirmar vaga ${selectedSpace.codigo}`}</button><small>A solicitação será enviada para aprovação da gestão.</small></div>
            </form>
          </section>
        </div>
      )}

      <section className="gestao-card" id="parking-my-reservations">
        <header>
          <p className="gestao-kicker">MINHAS RESERVAS</p>
          <h2>Histórico e comprovantes</h2>
        </header>
        <div className="gestao-reservation-list">
          {myOpenReservations.length ? myOpenReservations.map((reservation) => (
            <article key={reservation.id} className={`gestao-reservation-item status-${reservation.status.toLowerCase()}`}>
              <div>
                <strong>{reservation.vaga_codigo} · {reservation.setor_nome}</strong>
                <small>{reservation.evento_titulo || "Atividade vinculada"}</small>
                <small>{reservation.placa_veiculo} · {reservation.modelo_veiculo} · {reservation.cor_veiculo}</small>
                <small>{formatTime(reservation.inicio_em)} até {formatTime(reservation.fim_em)} · {reservation.status}</small>
              </div>
              {["PENDENTE", "CONFIRMADA"].includes(reservation.status) && <button type="button" disabled={working} onClick={() => {if(window.confirm(`Cancelar sua reserva da vaga ${reservation.vaga_codigo}?`)) void parking.reservationAction({id:reservation.id,acao:"CANCELAR_PROPRIA"});}}>Cancelar minha reserva</button>}
              {reservation.status === "CONFIRMADA" && reservation.codigo ? (
                <details className="gestao-qr-ticket">
                  <summary>Mostrar comprovante</summary>
                  <ParkingReservationQr code={reservation.codigo} label={`${reservation.vaga_codigo} · ${reservation.setor_nome}`} expiresAt={reservation.fim_em} />
                </details>
              ) : (
                <p>{reservation.status === "PENDENTE" ? "Aguardando confirmação." : "Entrada já liberada."}</p>
              )}
            </article>
          )) : <p className="gestao-empty">Nenhuma reserva ativa.</p>}
        </div>
        {myHistory.length > 0 && (
          <details className="gestao-history-collapse">
            <summary>Reservas encerradas <span>{myHistory.length}</span></summary>
            <div className="gestao-reservation-list">
              {myHistory.map((reservation) => (
                <article key={reservation.id} className={`gestao-reservation-item status-${reservation.status.toLowerCase()}`}>
                  <div>
                    <strong>{reservation.vaga_codigo} · {reservation.setor_nome}</strong>
                    <small>{reservation.evento_titulo || "Atividade vinculada"} · {reservation.placa_veiculo}</small>
                    <small>{formatTime(reservation.inicio_em)} até {formatTime(reservation.fim_em)} · {reservation.status}</small>
                  </div>
                  <button type="button" disabled={working} onClick={() => {if(window.confirm("Excluir este registro do histórico?")) void deleteReservationHistory(reservation.id);}}>Excluir</button>
                </article>
              ))}
            </div>
          </details>
        )}
      </section>

      <div className="parking-v2-pagination"><span>{parking.reservationTotal} reserva(s) · página {parking.reservationFilters.page}</span><div><button type="button" disabled={parking.reservationFilters.page<=1 || loading} onClick={()=>parking.setReservationFilters(f=>({...f,page:f.page-1}))}>Anterior</button><button type="button" disabled={parking.reservationFilters.page*40>=parking.reservationTotal || loading} onClick={()=>parking.setReservationFilters(f=>({...f,page:f.page+1}))}>Próxima</button></div></div>
      <section className="gestao-card">
        <header>
          <p className="gestao-kicker">MEUS VEÍCULOS</p>
          <h2>Garagem salva neste aparelho</h2>
        </header>
        <details><summary>Adicionar veículo neste aparelho</summary><form className="gestao-form" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const values=new FormData(form);garage.addVehicle({apelido:String(values.get('modelo')),placa:String(values.get('placa')).toUpperCase().replace(/[^A-Z0-9]/g,''),tipo:String(values.get('tipo')),modelo:String(values.get('modelo')),cor:String(values.get('cor'))});form.reset();}}><fieldset><label>Placa<input name="placa" required minLength={6} maxLength={10}/></label><label>Tipo<select name="tipo"><option value="CARRO">Carro</option><option value="MOTO">Moto</option><option value="VAN">Van</option><option value="OUTRO">Outro</option></select></label><label>Marca e modelo<input name="modelo" required minLength={2}/></label><label>Cor<input name="cor" required/></label></fieldset><button>Salvar neste aparelho</button></form></details>
        {garage.vehicles.length ? (
          <ul className="gestao-garage-list">
            {garage.vehicles.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.apelido || item.placa}</strong>
                  <small>{item.placa} · {item.modelo} · {item.cor}</small>
                </div>
                <button type="button" onClick={() => garage.removeVehicle(item.id)}>Remover</button>
              </li>
            ))}
          </ul>
        ) : <p className="gestao-empty">Nenhum veículo salvo ainda. Ele é adicionado automaticamente ao concluir uma reserva.</p>}
      </section>
    </section>
  );
}
