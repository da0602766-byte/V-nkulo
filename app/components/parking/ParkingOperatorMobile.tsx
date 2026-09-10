"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ParkingQrCheckin, type ParkingQrValidationResult } from "../ParkingReservationQr";
import { formatClock, formatCountdown, formatTime } from "./format";
import type { ParkingController } from "./useParkingData";

const WARNING_MS = 15 * 60 * 1000;
const DANGER_MS = 5 * 60 * 1000;

export default function ParkingOperatorMobile({
  communityName,
  parking,
}: {
  communityName: string;
  parking: ParkingController;
}) {
  const { data, reservations, reports, working, feedback, error, registerExit, reservationAction, reportAction } = parking;
  const escala = data?.operator.escala || null;
  const [now, setNow] = useState(() => Date.now());
  const autoSentRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const startsAt = escala ? new Date(escala.inicia_em).getTime() : 0;
  const endsAt = escala ? new Date(escala.termina_em).getTime() : 0;
  const remaining = Math.max(0, endsAt - now);
  const shiftEnded = Boolean(escala) && now >= endsAt;
  const phase = !escala ? "none" : now < startsAt ? "pre" : shiftEnded ? "ended" : "active";
  const urgency = remaining <= DANGER_MS ? "danger" : remaining <= WARNING_MS ? "warning" : "normal";

  const pendingReservations = useMemo(
    () => reservations
      .filter((item) => ["PENDENTE", "CONFIRMADA"].includes(item.status))
      .sort((a, b) => a.inicio_em.localeCompare(b.inicio_em)),
    [reservations],
  );
  const onSite = useMemo(
    () => (data?.movimentacoes || []).filter((item) => item.status === "NO_LOCAL"),
    [data],
  );
  const recentCheckouts = useMemo(
    () => (data?.movimentacoes || [])
      .filter((item) => item.status === "ENCERRADA" && item.saida_em)
      .slice(0, 12),
    [data],
  );

  const shiftStats = useMemo(() => {
    if (!escala) return { entradas: 0, saidas: 0, ocorrencias: 0 };
    const from = startsAt;
    const entradas = (data?.movimentacoes || []).filter((item) => Date.parse(item.entrada_em) >= from).length;
    const saidas = (data?.movimentacoes || []).filter((item) => item.saida_em && Date.parse(item.saida_em) >= from).length;
    const ocorrencias = (data?.ocorrencias || []).filter((item) => Date.parse(item.criado_em) >= from).length;
    return { entradas, saidas, ocorrencias };
  }, [data, escala, startsAt]);

  const myReport = useMemo(
    () => (escala ? reports.find((item) => item.escala_id === escala.escala_id) : null) || null,
    [reports, escala],
  );

  useEffect(() => {
    if (!shiftEnded || !escala || !myReport) return;
    if (myReport.status !== "AGUARDANDO_MEMBRO") return;
    if (autoSentRef.current === myReport.id) return;
    autoSentRef.current = myReport.id;
    void reportAction({
      id: myReport.id,
      acao: "ENVIAR",
      resumo: `Relatório enviado automaticamente ao final da escala “${escala.titulo}”.`,
      entradas: shiftStats.entradas,
      saidas: shiftStats.saidas,
      ocorrencias: shiftStats.ocorrencias,
    });
  }, [shiftEnded, escala, myReport, reportAction, shiftStats]);

  if (!escala) {
    return (
      <section className="gestao-operator gestao-operator-closed">
        <span aria-hidden="true">◷</span>
        <h1>Fora do horário de operação</h1>
        <p>A Gestão do estacionamento só abre aqui durante o seu plantão confirmado em Escalas.</p>
      </section>
    );
  }

  async function handleDetected(code: string): Promise<ParkingQrValidationResult | boolean> {
    const result = await reservationAction({ codigo: code, acao: "CHECKIN" });
    if (result && typeof result === "object") return result as ParkingQrValidationResult;
    return Boolean(result);
  }

  return (
    <section className={`gestao-operator urgency-${urgency}`} style={{ "--gestao-accent": data?.config.cor_destaque || "#d99a32" } as React.CSSProperties}>
      <header className="gestao-operator-header">
        <div>
          <p className="gestao-kicker">PLANTÃO · {communityName}</p>
          <h1>{escala.titulo}</h1>
          <p>{escala.funcao} · {formatClock(escala.inicia_em)} às {formatClock(escala.termina_em)}</p>
        </div>
        <div className="gestao-countdown" role="timer" aria-live="polite">
          <small>{shiftEnded ? "ENCERRADA" : phase === "pre" ? "COMEÇA EM BREVE" : "ENCERRA EM"}</small>
          <strong>{shiftEnded ? "00:00" : formatCountdown(remaining)}</strong>
        </div>
      </header>

      {(feedback || error) && <p className={`gestao-feedback${error ? " is-error" : ""}`} role="status">{error || feedback}</p>}

      {shiftEnded ? (
        <section className="gestao-shift-summary">
          <span aria-hidden="true">✓</span>
          <h2>Escala encerrada</h2>
          <p>O relatório foi enviado automaticamente para a liderança do estacionamento.</p>
          <div className="gestao-shift-summary-grid">
            <div><strong>{shiftStats.entradas}</strong><small>Entradas</small></div>
            <div><strong>{shiftStats.saidas}</strong><small>Saídas</small></div>
            <div><strong>{shiftStats.ocorrencias}</strong><small>Ocorrências</small></div>
          </div>
        </section>
      ) : (
        <>
          <section className="gestao-scan-hub">
            <div>
              <p className="gestao-kicker">PORTARIA DIGITAL</p>
              <h2>Ler QR Code da reserva</h2>
              <p>Aponte a câmera para o código do visitante para liberar a entrada.</p>
            </div>
            <ParkingQrCheckin promptOnMount disabled={working} onDetected={handleDetected} />
          </section>

          <section className="gestao-card">
            <header><p className="gestao-kicker">RESERVAS</p><h2>Quem reservou</h2></header>
            <div className="gestao-simple-list">
              {pendingReservations.length ? pendingReservations.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.nome_completo}</strong>
                    <small>{item.vaga_codigo} · {item.setor_nome} · {formatTime(item.inicio_em)}</small>
                  </div>
                  <span className={`gestao-badge status-${item.status.toLowerCase()}`}>{item.status === "PENDENTE" ? "Pendente" : "Confirmada"}</span>
                </article>
              )) : <p className="gestao-empty">Ninguém reservou para este horário.</p>}
            </div>
          </section>

          <section className="gestao-card">
            <header><p className="gestao-kicker">NO LOCAL</p><h2>Veículos estacionados</h2></header>
            <div className="gestao-simple-list">
              {onSite.length ? onSite.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.placa}</strong>
                    <small>{item.vaga_codigo || "Sem vaga"} · {item.responsavel}</small>
                  </div>
                  <button type="button" disabled={working} onClick={() => void registerExit(item.id)}>Check-out</button>
                </article>
              )) : <p className="gestao-empty">Nenhum veículo no local.</p>}
            </div>
          </section>

          <section className="gestao-card">
            <header><p className="gestao-kicker">SAÍRAM</p><h2>Check-outs feitos</h2></header>
            <div className="gestao-simple-list">
              {recentCheckouts.length ? recentCheckouts.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.placa}</strong>
                    <small>{item.responsavel} · saiu {formatTime(item.saida_em as string)}</small>
                  </div>
                </article>
              )) : <p className="gestao-empty">Ainda não houve check-out nesta escala.</p>}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
