import type { ReactNode } from "react";
import PublicIcon, { type PublicIconName } from "../PublicIcon";
import { formatTime, parkingLabel } from "./format";
import type { Movement, Reservation } from "./types";

export function ParkingHeading({ icon, eyebrow, title, children }: { icon: PublicIconName; eyebrow?: string; title: string; children?: ReactNode }) {
  return <header className="parking-section-title"><span className="parking-section-icon"><PublicIcon name={icon} size={23} /></span><div>{eyebrow && <span className="parking-record-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{children && <p>{children}</p>}</div></header>;
}

export function ParkingEmpty({ icon = "layers", title, children }: { icon?: PublicIconName; title: string; children: ReactNode }) {
  return <div className="parking-empty-state"><span className="parking-section-icon"><PublicIcon name={icon} size={25} /></span><strong>{title}</strong><p>{children}</p></div>;
}

export function ParkingMetric({ label, value, tone = "violet", icon }: { label: string; value: number; tone?: string; icon: PublicIconName }) {
  return <div className={`parking-workspace-metric tone-${tone}`}><span><PublicIcon name={icon} size={18} />{label}</span><strong>{value}</strong></div>;
}

export function ParkingMovementCard({ movement, children }: { movement: Movement; children?: ReactNode }) {
  const present = movement.status === "NO_LOCAL";
  return <article className={`parking-movement-card ${present ? "is-present" : "is-closed"}`}>
    <header><strong className="parking-plate">{movement.placa}</strong><span className={`parking-state ${present ? "tone-violet" : "tone-neutral"}`}><span aria-hidden="true">{present ? "●" : "✓"}</span>{present ? "No local" : "Encerrada"}</span></header>
    <div className="parking-movement-person"><PublicIcon name="user" size={18} /><strong>{movement.responsavel}</strong></div>
    <p className="parking-movement-location"><PublicIcon name="pin" size={16} />{movement.vaga_codigo ? `Vaga ${movement.vaga_codigo}` : "Sem vaga vinculada"}{movement.setor_nome ? ` · ${movement.setor_nome}` : ""}</p>
    <dl className="parking-record-timeline"><div className="is-recorded"><dt>↳ Entrada</dt><dd>{formatTime(movement.entrada_em)}</dd></div><div className={movement.saida_em ? "is-recorded" : ""}><dt>↗ Saída</dt><dd>{movement.saida_em ? formatTime(movement.saida_em) : "Não registrada"}</dd></div></dl>
    {children && <footer>{children}</footer>}
  </article>;
}

export function ParkingReservationIdentity({ reservation }: { reservation: Reservation }) {
  return <div className="parking-member-identity">
    <header className="parking-record-header"><div className="parking-record-space"><span>VAGA</span><strong>{reservation.vaga_codigo}</strong></div><div className="parking-record-location"><strong>{reservation.setor_nome}</strong><span>Reserva #{reservation.id}</span></div><span className={`gestao-badge status-${reservation.status.toLowerCase()}`}>{reservation.saida_em ? "Encerrada" : parkingLabel(reservation.status)}</span></header>
    <div className="parking-record-event"><PublicIcon name="calendar" size={17} /><span>{reservation.evento_titulo || "Atividade vinculada"}</span></div>
    <div className="parking-member-vehicle"><strong className="parking-plate">{reservation.placa_veiculo}</strong><span>{reservation.modelo_veiculo} · {reservation.cor_veiculo}</span></div>
    <div className="parking-record-period"><span className="parking-record-eyebrow">Período reservado</span><div><div><small>De</small><strong>{formatTime(reservation.inicio_em)}</strong></div><PublicIcon name="arrow" size={16} /><div><small>Até</small><strong>{formatTime(reservation.fim_em)}</strong></div></div></div>
  </div>;
}
