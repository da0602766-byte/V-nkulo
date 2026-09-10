"use client";

import { FormEvent, useMemo, useState } from "react";
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
  const [selectedEventId, setSelectedEventId] = useState("");
  const [contact, setContact] = useState<ContactForm>({ nomeCompleto: "", email: "", documento: "", telefone: "" });
  const [vehicle, setVehicle] = useState<VehicleForm>(EMPTY_VEHICLE);
  const [saveVehicle, setSaveVehicle] = useState(true);
  const [window_, setWindow] = useState({ start: "", end: "" });
  const [justCreated, setJustCreated] = useState<{ codigo: string; spaceLabel: string } | null>(null);
  const [copyMessage, setCopyMessage] = useState("");

  const ownerKey = data ? (data.operator.email || `u${data.operator.id}`) : "";
  const garage = useParkingGarage(ownerKey);

  const selectedSector = sectors.find((sector) => sector.id === selectedSectorId) || null;
  const selectedSpace = selectedSector?.spaces.find((space) => space.id === selectedSpaceId) || null;
  const selectedEvent = eventOptions.find((item) => String(item.id) === selectedEventId) || null;
  const gate = data?.reservationGate;
  const locked = Boolean(gate && !gate.unlocked);

  const myOpenReservations = useMemo(
    () => reservations.filter((item) => ["PENDENTE", "CONFIRMADA", "CHECKIN"].includes(item.status)),
    [reservations],
  );
  const myHistory = useMemo(() => reservations.filter(canDeleteReservationHistory), [reservations]);

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
    setSelectedEventId(id);
    const event = eventOptions.find((item) => String(item.id) === id);
    if (!event) return;
    const recommended = getEventParkingWindow(event);
    setWindow(recommended);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSpace) return;
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
      inicioEm: window_.start,
      fimEm: window_.end,
    };
    const result = await createReservation(values);
    if (result?.codigo) {
      if (saveVehicle && vehicle.placa) {
        garage.addVehicle({ apelido: vehicle.modelo || vehicle.placa, ...vehicle });
      }
      setJustCreated({ codigo: result.codigo, spaceLabel: `${selectedSpace.codigo} · ${selectedSector?.name}` });
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
    <section className="gestao-member" style={{ "--gestao-accent": data.config.cor_destaque || "#d99a32" } as React.CSSProperties}>
      <header className="gestao-member-header">
        <div>
          <p className="gestao-kicker">GESTÃO · {communityName}</p>
          <h1>Reserve sua vaga</h1>
          <p>Escolha um setor, depois toque em uma vaga livre.</p>
        </div>
        <div className="gestao-member-count">
          <strong>{data.stats.livres}</strong>
          <span>livres</span>
        </div>
      </header>

      {(feedback || error) && (
        <p className={`gestao-feedback${error ? " is-error" : ""}`} role="status">{error || feedback}</p>
      )}

      {locked && gate && (
        <section className="gestao-gate-notice" role="status">
          <span aria-hidden="true">◷</span>
          <div>
            <strong>{gate.reason === "WAIT_OPENING" ? "Reserva libera em breve" : "Mapa disponível para consulta"}</strong>
            <p>
              {gate.reason === "WAIT_OPENING"
                ? `Você pode escolher a vaga agora. A confirmação abre no horário programado para “${gate.eventTitle}”.`
                : "As vagas aparecem aqui, mas a reserva libera quando houver um evento publicado."}
            </p>
          </div>
        </section>
      )}

      {justCreated && (
        <section className="gestao-receipt">
          <header>
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Reserva enviada</strong>
              <p>{justCreated.spaceLabel} · aguardando confirmação</p>
            </div>
            <button type="button" onClick={() => setJustCreated(null)} aria-label="Fechar">×</button>
          </header>
          <ParkingReservationQr code={justCreated.codigo} label={justCreated.spaceLabel} />
          <button type="button" className="gestao-ghost" onClick={() => void copyCode(justCreated.codigo)}>{copyMessage || "Copiar código"}</button>
        </section>
      )}

      <section className="gestao-lot-map" aria-label="Vagas por setor">
        {sectors.map((sector) => {
          const free = sector.spaces.filter(isSpaceAvailable).length;
          return (
            <article key={sector.id} className="gestao-lot-sector" style={{ "--sector-color": sector.color } as React.CSSProperties}>
              <header>
                <strong>{sector.name}</strong>
                <span>{free} livres</span>
              </header>
              <div className="gestao-lot-grid">
                {sector.spaces.map((space) => {
                  const free2 = isSpaceAvailable(space);
                  const reserved = Boolean(space.reservada);
                  const selected = selectedSpaceId === space.id;
                  return (
                    <button
                      key={space.id}
                      type="button"
                      disabled={!free2}
                      className={`gestao-slot ${free2 ? "is-free" : reserved ? "is-reserved" : "is-busy"}${selected ? " is-selected" : ""}`}
                      onClick={() => pickSpace(sector.id, space.id)}
                      title={`${space.codigo} · ${free2 ? "Livre" : reserved ? "Reservada" : "Ocupada"}`}
                    >
                      <span>{space.codigo}</span>
                      {space.tipo !== "COMUM" && <small>{space.tipo}</small>}
                    </button>
                  );
                })}
                {!sector.spaces.length && <p className="gestao-empty">Nenhuma vaga cadastrada.</p>}
              </div>
            </article>
          );
        })}
        {!sectors.length && <p className="gestao-empty">O responsável ainda não cadastrou vagas.</p>}
        <div className="gestao-lot-legend">
          <span><i className="is-free" />Livre</span>
          <span><i className="is-reserved" />Reservada</span>
          <span><i className="is-busy" />Ocupada</span>
        </div>
      </section>

      {selectedSpace && (
        <div className="gestao-drawer-backdrop" role="presentation" onClick={() => setSelectedSpaceId(null)}>
          <section className="gestao-drawer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <p className="gestao-kicker">VAGA SELECIONADA</p>
                <h2>{selectedSpace.codigo} · {selectedSector?.name}</h2>
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
                <label>Evento ou culto
                  <select value={selectedEventId} onChange={(event) => chooseEvent(event.target.value)}>
                    <option value="">Reserva sem evento vinculado</option>
                    {eventOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.titulo} · {formatTime(item.inicia_em)}</option>
                    ))}
                  </select>
                </label>
                <div className="gestao-time-grid">
                  <label>Chegada
                    <input type="datetime-local" required value={window_.start} onChange={(event) => setWindow((w) => ({ ...w, start: event.target.value }))} />
                  </label>
                  <label>Saída
                    <input type="datetime-local" required value={window_.end} onChange={(event) => setWindow((w) => ({ ...w, end: event.target.value }))} />
                  </label>
                </div>
              </fieldset>

              {locked && <p className="gestao-hint">A confirmação da reserva libera no horário programado do evento. Você já pode preencher os dados.</p>}
              <button className="gestao-primary" disabled={working || locked}>{working ? "Enviando…" : `Reservar ${selectedSpace.codigo}`}</button>
            </form>
          </section>
        </div>
      )}

      <section className="gestao-card">
        <header>
          <p className="gestao-kicker">MINHAS RESERVAS</p>
          <h2>Histórico e comprovantes</h2>
        </header>
        <div className="gestao-reservation-list">
          {myOpenReservations.length ? myOpenReservations.map((reservation) => (
            <article key={reservation.id} className={`gestao-reservation-item status-${reservation.status.toLowerCase()}`}>
              <div>
                <strong>{reservation.vaga_codigo} · {reservation.setor_nome}</strong>
                <small>{formatTime(reservation.inicio_em)} · {reservation.status}</small>
              </div>
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
                    <small>{formatTime(reservation.inicio_em)} · {reservation.status}</small>
                  </div>
                  <button type="button" disabled={working} onClick={() => void deleteReservationHistory(reservation.id)}>Excluir</button>
                </article>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="gestao-card">
        <header>
          <p className="gestao-kicker">MEUS VEÍCULOS</p>
          <h2>Garagem salva neste aparelho</h2>
        </header>
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
