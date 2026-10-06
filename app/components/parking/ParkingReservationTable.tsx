"use client";
import { formatTime, parkingLabel } from "./format";
import type { ParkingController } from "./useParkingData";

export default function ParkingReservationTable({parking}:{parking:ParkingController}) {
  const {data,reservations,reservationTotal,reservationFilters,working,reservationAction,deleteReservationHistory}=parking;
  const canEdit=Boolean(data?.permissions.includes("parking.edit"));
  const canEntry=Boolean(data?.permissions.includes("parking.entry"));
  return <section aria-label="Reservas" className="parking-v2-records">
    <div className="parking-v2-table-scroll"><table className="parking-v2-data-table">
      <caption className="parking-v2-sr-only">Reservas da atividade e dos filtros selecionados</caption>
      <thead><tr>{['Vaga / atividade','Tipo','Status','Responsável / veículo','Período reservado','Entrada','Saída','Ações'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{reservations.map(reservation=><tr key={reservation.id}>
        <td data-label="Vaga"><strong>{reservation.vaga_codigo}</strong><small>{reservation.setor_nome}</small><small className="parking-v4-table-event">{reservation.evento_titulo || "Sem atividade vinculada"}</small></td>
        <td data-label="Tipo">{parkingLabel(reservation.vaga_tipo || "COMUM")}</td>
        <td data-label="Status"><span className={`gestao-badge status-${reservation.status.toLowerCase()}`}>{reservation.status==='CHECKIN' ? reservation.saida_em ? 'Encerrada' : 'No local' : reservation.status==='PENDENTE' ? 'Aguardando aprovação' : reservation.status==='CONFIRMADA' ? 'Aprovada' : reservation.status==='CANCELADA' ? 'Cancelada' : 'Recusada'}</span></td>
        <td data-label="Responsável"><strong>{reservation.nome_completo}</strong><small>{reservation.placa_veiculo} · {reservation.modelo_veiculo}</small></td>
        <td data-label="Período reservado">{formatTime(reservation.inicio_em)}<small>até {formatTime(reservation.fim_em)}</small></td>
        <td data-label="Entrada">{reservation.checkin_em ? formatTime(reservation.checkin_em) : '—'}</td>
        <td data-label="Saída">{reservation.saida_em ? formatTime(reservation.saida_em) : '—'}</td>
        <td data-label="Ações"><div className="gestao-row-actions">
          {canEdit && reservation.status==='PENDENTE' && <button type="button" className="gestao-primary" disabled={working} onClick={()=>void reservationAction({id:reservation.id,acao:'CONFIRMAR'})}>Aprovar</button>}
          {canEntry && reservation.status==='CONFIRMADA' && <button type="button" disabled={working} onClick={()=>{if(window.confirm(`Registrar entrada de ${reservation.placa_veiculo} na vaga ${reservation.vaga_codigo}?`)) void reservationAction({id:reservation.id,acao:'CHECKIN'});}}>Registrar entrada</button>}
          <details><summary>Detalhes</summary><div className="parking-v2-row-detail"><p>Reserva #{reservation.id} · {reservation.evento_titulo || 'Sem evento vinculado'}</p><p>{reservation.email || "E-mail não informado"} · {reservation.telefone || "Celular não informado"}</p><p>{parkingLabel(reservation.tipo_veiculo)} · {reservation.modelo_veiculo} · {reservation.cor_veiculo}</p><p>Documento: {reservation.documento_mascarado}</p>
            {canEdit && ['PENDENTE','CONFIRMADA'].includes(reservation.status) && <button type="button" disabled={working} onClick={()=>{if(window.confirm(`Cancelar reserva #${reservation.id} da vaga ${reservation.vaga_codigo}?`)) void reservationAction({id:reservation.id,acao:'RECUSAR'});}}>{reservation.status === "PENDENTE" ? "Recusar solicitação" : "Cancelar reserva"}</button>}
            {(canEdit && (['RECUSADA','CANCELADA'].includes(reservation.status) || Boolean(reservation.saida_em))) && <button type="button" disabled={working} onClick={()=>{if(window.confirm('Excluir este registro encerrado do histórico?')) void deleteReservationHistory(reservation.id);}}>Excluir do histórico</button>}
          </div></details>
        </div></td>
      </tr>)}</tbody>
    </table></div>
    {!reservations.length && <p className="gestao-empty">Nenhuma reserva encontrada para estes filtros.</p>}
    <footer className="parking-v2-pagination"><span>{reservationTotal ? `${(reservationFilters.page-1)*40+1}–${Math.min(reservationFilters.page*40,reservationTotal)} de ${reservationTotal} reservas` : '0 reservas'}</span>
      <div><button type="button" disabled={reservationFilters.page<=1 || parking.loading} onClick={()=>parking.setReservationFilters(f=>({...f,page:f.page-1}))}>Anterior</button><span>Página {reservationFilters.page}</span><button type="button" disabled={reservationFilters.page*40>=reservationTotal || parking.loading} onClick={()=>parking.setReservationFilters(f=>({...f,page:f.page+1}))}>Próxima</button></div>
    </footer>
  </section>;
}
