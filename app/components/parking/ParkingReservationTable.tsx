"use client";

import PublicIcon from "../PublicIcon";
import { formatTime, parkingLabel } from "./format";
import type { Reservation } from "./types";
import type { ParkingController } from "./useParkingData";

function reservationState(reservation: Reservation) {
  if (reservation.status === "CHECKIN") return reservation.saida_em
    ? { tone: "closed", mark: "✓", label: "Encerrada", hint: "Saída registrada. Atendimento concluído." }
    : { tone: "present", mark: "●", label: "No local", hint: "Veículo presente. Registre a saída em Entradas e saídas." };
  if (reservation.status === "PENDENTE") return { tone: "pending", mark: "◷", label: "Aguardando aprovação", hint: "Confira os dados antes de aprovar a solicitação." };
  if (reservation.status === "CONFIRMADA") return { tone: "approved", mark: "✓", label: "Aprovada", hint: "Aguardando chegada. Confira a placa para registrar a entrada." };
  if (reservation.status === "CANCELADA") return { tone: "cancelled", mark: "×", label: "Cancelada", hint: "Reserva cancelada. Não permite entrada." };
  if (reservation.status === "RECUSADA") return { tone: "cancelled", mark: "×", label: "Recusada", hint: "Solicitação recusada. Não permite entrada." };
  return { tone: "closed", mark: "–", label: parkingLabel(reservation.status), hint: "Consulte os detalhes da reserva." };
}

export default function ParkingReservationTable({ parking }: { parking: ParkingController }) {
  const { data, reservations, reservationTotal, reservationFilters, working, reservationAction, deleteReservationHistory } = parking;
  const canEdit = Boolean(data?.permissions.includes("parking.edit"));
  const canEntry = Boolean(data?.permissions.includes("parking.entry"));

  return <section aria-label="Reservas" className="parking-reservations" aria-busy={parking.loading}>
    <header className="parking-reservations-heading">
      <div><span className="parking-record-eyebrow">ACOMPANHAMENTO</span><h3>Reservas <span>{reservationTotal}</span></h3></div>
      <p>{parking.loading ? "Atualizando resultados…" : "Conforme a atividade e os filtros selecionados"}</p>
    </header>
    <div className="parking-reservation-grid">
      {reservations.map(reservation => {
        const state = reservationState(reservation);
        return <article key={reservation.id} className={`parking-reservation-card tone-${state.tone}`} aria-label={`Reserva ${reservation.id}, vaga ${reservation.vaga_codigo}`}>
          <header className="parking-record-header">
            <div className="parking-record-space"><span>VAGA</span><strong>{reservation.vaga_codigo}</strong></div>
            <div className="parking-record-location"><strong>{reservation.setor_nome}</strong><span>{parkingLabel(reservation.vaga_tipo || "COMUM")} · #{reservation.id}</span></div>
            <span className="parking-record-status"><span aria-hidden="true">{state.mark}</span><span>{state.label}</span></span>
          </header>
          <div className="parking-record-event"><PublicIcon name="calendar" size={17} /><span>{reservation.evento_titulo || "Sem atividade vinculada"}</span></div>
          <div className="parking-record-person">
            <span className="parking-record-avatar" aria-hidden="true"><PublicIcon name="user" /></span>
            <div><span className="parking-record-eyebrow">Responsável</span><h4>{reservation.nome_completo}</h4><div className="parking-record-vehicle"><strong aria-label={`Placa ${reservation.placa_veiculo}`}>{reservation.placa_veiculo || "Sem placa"}</strong><span>{[reservation.modelo_veiculo, reservation.cor_veiculo].filter(Boolean).join(" · ") || "Veículo não informado"}</span></div></div>
          </div>
          <div className="parking-record-period">
            <span className="parking-record-eyebrow"><PublicIcon name="calendar" size={16} /> Período reservado</span>
            <div><div><small>De</small><strong>{formatTime(reservation.inicio_em)}</strong></div><span aria-hidden="true"><PublicIcon name="arrow" size={18} /></span><div><small>Até</small><strong>{formatTime(reservation.fim_em)}</strong></div></div>
          </div>
          <dl className="parking-record-timeline" aria-label="Movimentação do veículo">
            <div className={reservation.checkin_em ? "is-recorded" : ""}><dt><span aria-hidden="true">↳</span> Entrada</dt><dd>{reservation.checkin_em ? formatTime(reservation.checkin_em) : "Não registrada"}</dd></div>
            <div className={reservation.saida_em ? "is-recorded" : ""}><dt><span aria-hidden="true">↗</span> Saída</dt><dd>{reservation.saida_em ? formatTime(reservation.saida_em) : "Não registrada"}</dd></div>
          </dl>
          <p className="parking-record-guidance"><span aria-hidden="true">{state.mark}</span>{state.hint}</p>
          <footer className="parking-record-actions">
            {canEdit && reservation.status === "PENDENTE" && <button type="button" className="gestao-primary" disabled={working} onClick={() => void reservationAction({ id: reservation.id, acao: "CONFIRMAR" })}><span aria-hidden="true">✓</span> Aprovar</button>}
            {canEntry && reservation.status === "CONFIRMADA" && <button type="button" className="gestao-primary" disabled={working} onClick={() => { if (window.confirm(`Registrar entrada de ${reservation.placa_veiculo} na vaga ${reservation.vaga_codigo}?`)) void reservationAction({ id: reservation.id, acao: "CHECKIN" }); }}>Registrar entrada <PublicIcon name="arrow" size={18} /></button>}
            <details className="parking-record-details"><summary>Detalhes</summary>
              <div className="parking-record-detail-content">
                <dl>
                  <div><dt>E-mail</dt><dd>{reservation.email || "Não informado"}</dd></div>
                  <div><dt>Celular</dt><dd>{reservation.telefone || "Não informado"}</dd></div>
                  <div><dt>Veículo</dt><dd>{[parkingLabel(reservation.tipo_veiculo), reservation.modelo_veiculo, reservation.cor_veiculo].filter(Boolean).join(" · ")}</dd></div>
                  <div><dt>Documento</dt><dd>{reservation.documento_mascarado || "Não informado"}</dd></div>
                </dl>
                {canEdit && ["PENDENTE", "CONFIRMADA"].includes(reservation.status) && <button type="button" className="parking-record-danger" disabled={working} onClick={() => { if (window.confirm(`Cancelar reserva #${reservation.id} da vaga ${reservation.vaga_codigo}?`)) void reservationAction({ id: reservation.id, acao: "RECUSAR" }); }}>{reservation.status === "PENDENTE" ? "Recusar solicitação" : "Cancelar reserva"}</button>}
                {canEdit && (["RECUSADA", "CANCELADA"].includes(reservation.status) || Boolean(reservation.saida_em)) && <button type="button" className="parking-record-danger" disabled={working} onClick={() => { if (window.confirm("Excluir este registro encerrado do histórico?")) void deleteReservationHistory(reservation.id); }}>Excluir do histórico</button>}
              </div>
            </details>
          </footer>
        </article>;
      })}
    </div>
    {!reservations.length && <div className="parking-reservations-empty"><PublicIcon name="search" size={30} /><h3>{parking.loading ? "Buscando reservas…" : "Nenhuma reserva encontrada para estes filtros."}</h3><p>Revise a atividade selecionada ou limpe os filtros para ampliar a consulta.</p></div>}
    <footer className="parking-v2-pagination parking-reservations-pagination"><span>{reservationTotal ? `${(reservationFilters.page - 1) * 40 + 1}–${Math.min(reservationFilters.page * 40, reservationTotal)} de ${reservationTotal} reservas` : "0 reservas"}</span>
      <div><button type="button" disabled={reservationFilters.page <= 1 || parking.loading} onClick={() => parking.setReservationFilters(f => ({ ...f, page: f.page - 1 }))}>Anterior</button><span>Página {reservationFilters.page}</span><button type="button" disabled={reservationFilters.page * 40 >= reservationTotal || parking.loading} onClick={() => parking.setReservationFilters(f => ({ ...f, page: f.page + 1 }))}>Próxima</button></div>
    </footer>
  </section>;
}
