"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readJson } from "./format";
import type {
  ParkingData,
  ParkingEventOption,
  ParkingReport,
  ParkingSector,
  Reservation,
} from "./types";

export function useParkingData(memberMode: boolean) {
  const [data, setData] = useState<ParkingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [eventOptions, setEventOptions] = useState<ParkingEventOption[]>([]);
  const [reports, setReports] = useState<ParkingReport[]>([]);
  const [canManageReservations, setCanManageReservations] = useState(false);
  const [canReviewReports, setCanReviewReports] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await fetch(
        memberMode ? "/api/pilot/estacionamento/disponibilidade" : "/api/pilot/estacionamento",
        { cache: "no-store" },
      );
      const result = await readJson<ParkingData & { error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar o estacionamento.");
      }
      setData(result);
      const [reservationResponse, reportResponse, eventResponse] = await Promise.all([
        fetch(memberMode ? "/api/pilot/estacionamento/reservas?scope=mine" : "/api/pilot/estacionamento/reservas", { cache: "no-store" }),
        memberMode ? Promise.resolve(null) : fetch("/api/pilot/estacionamento/relatorios", { cache: "no-store" }),
        fetch("/api/pilot/eventos", { cache: "no-store" }),
      ]);
      if (reservationResponse.ok) {
        const extras = await readJson<{ reservas: Reservation[]; canManage: boolean }>(reservationResponse);
        setReservations(extras.reservas || []);
        setCanManageReservations(Boolean(extras.canManage));
      }
      if (reportResponse?.ok) {
        const extras = await readJson<{ relatorios: ParkingReport[]; canReview: boolean }>(reportResponse);
        setReports(extras.relatorios || []);
        setCanReviewReports(Boolean(extras.canReview));
      }
      if (eventResponse.ok) {
        const extras = await readJson<{ eventos?: ParkingEventOption[] }>(eventResponse);
        const minimumDate = Date.now() - 12 * 60 * 60 * 1000;
        setEventOptions(
          (extras.eventos || []).filter(
            (item) => item.status === "PUBLICADO" && new Date(item.inicia_em).getTime() >= minimumDate,
          ),
        );
      } else {
        setEventOptions([]);
      }
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [memberMode]);

  const refreshReservations = useCallback(async () => {
    try {
      const [response, availabilityResponse, reportResponse] = await Promise.all([
        fetch(memberMode ? "/api/pilot/estacionamento/reservas?scope=mine" : "/api/pilot/estacionamento/reservas", { cache: "no-store" }),
        memberMode ? fetch("/api/pilot/estacionamento/disponibilidade", { cache: "no-store" }) : Promise.resolve(null),
        memberMode ? Promise.resolve(null) : fetch("/api/pilot/estacionamento/relatorios", { cache: "no-store" }),
      ]);
      if (response.ok) {
        const extras = await readJson<{ reservas: Reservation[]; canManage: boolean }>(response);
        setReservations(extras.reservas || []);
        setCanManageReservations(Boolean(extras.canManage));
      }
      if (availabilityResponse?.ok) {
        const availability = await readJson<ParkingData>(availabilityResponse);
        setData(availability);
      }
      if (reportResponse?.ok) {
        const extras = await readJson<{ relatorios: ParkingReport[]; canReview: boolean }>(reportResponse);
        setReports(extras.relatorios || []);
        setCanReviewReports(Boolean(extras.canReview));
      }
    } catch {
      // A atualização silenciosa não interrompe o fluxo da operação.
    }
  }, [memberMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshReservations();
    }, 12_000);
    const onVisible = () => document.visibilityState === "visible" && void refreshReservations();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshReservations]);

  const sectors: ParkingSector[] = useMemo(() => {
    const grouped = new Map<string, ParkingSector["spaces"]>();
    for (const space of data?.vagas || []) {
      const key = `${space.setor_id}:${space.setor_nome}`;
      grouped.set(key, [...(grouped.get(key) || []), space]);
    }
    return [...grouped.entries()]
      .map(([key, spaces]) => ({
        id: key,
        name: spaces[0]?.setor_nome || "Setor",
        color: spaces[0]?.setor_cor || "#3b82f6",
        order: Number(spaces[0]?.ordem || 0),
        spaces,
      }))
      .sort((a, b) => a.order - b.order);
  }, [data]);

  async function registerEntry(values: Record<string, unknown>) {
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/pilot/estacionamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Entrada não registrada.");
      setFeedback("Entrada registrada e vaga ocupada.");
      await load(true);
      return true;
    } catch (saveError) {
      setError((saveError as Error).message);
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function registerExit(id: number) {
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(`/api/pilot/estacionamento/${id}`, { method: "PATCH" });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Saída não registrada.");
      setFeedback("Saída registrada e vaga liberada.");
      await load(true);
      return true;
    } catch (saveError) {
      setError((saveError as Error).message);
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function registerOccurrence(values: Record<string, unknown>) {
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/pilot/estacionamento/ocorrencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Ocorrência não registrada.");
      setFeedback("Ocorrência registrada com auditoria.");
      await load(true);
      return true;
    } catch (saveError) {
      setError((saveError as Error).message);
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function submitJson(
    url: string,
    body: Record<string, unknown>,
    success: string,
    method?: "POST" | "PATCH",
  ) {
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(url, {
        method: method || (url.endsWith("configuracao") ? "PATCH" : "POST"),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Alteração não concluída.");
      setFeedback(success);
      await load(true);
      return true;
    } catch (saveError) {
      setError((saveError as Error).message);
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function createReservation(values: Record<string, FormDataEntryValue>) {
    setWorking(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/pilot/estacionamento/reservas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await readJson<{ error?: string; message?: string; codigo?: string; id?: number; status?: string }>(response);
      if (!response.ok) {
        const fallback = response.status === 403
          ? "Sua conta não tem permissão para reservar uma vaga."
          : response.status === 409
            ? "A vaga ou o horário escolhido não está mais disponível. Escolha outra opção."
            : response.status === 400
              ? "Confira nome, contato, placa, modelo, cor, período e vaga antes de continuar."
              : `Não foi possível criar a reserva (erro ${response.status}). Tente novamente.`;
        throw new Error(result.error || result.message || fallback);
      }
      setFeedback(`Reserva solicitada. Seu código é ${result.codigo}.`);
      await refreshReservations();
      return result;
    } catch (cause) {
      setError((cause as Error).message);
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function reservationAction(body: Record<string, unknown>) {
    const isCheckin = String(body.acao || "").toUpperCase() === "CHECKIN";
    setWorking(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/pilot/estacionamento/reservas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await readJson<{
        error?: string;
        reserva?: {
          nomeCompleto: string;
          documento: string;
          inicioEm: string;
          fimEm: string;
          vaga: string;
          placaVeiculo: string;
          tipoVeiculo: string;
          modeloVeiculo: string;
          corVeiculo: string;
        };
      }>(response);
      if (!response.ok) throw new Error(result.error || "Reserva não atualizada.");
      setFeedback(
        result.reserva
          ? `Check-in confirmado: ${result.reserva.nomeCompleto} · vaga ${result.reserva.vaga}.`
          : "Reserva atualizada.",
      );
      if (isCheckin) await load(true);
      else await refreshReservations();
      if (isCheckin && result.reserva) {
        return {
          ok: true,
          title: "QR Code verificado",
          message: `Entrada de ${result.reserva.nomeCompleto} liberada com sucesso.`,
          details: [
            `Vaga ${result.reserva.vaga}`,
            `${result.reserva.tipoVeiculo} · ${result.reserva.modeloVeiculo} · ${result.reserva.corVeiculo}`,
            `Reserva até ${result.reserva.fimEm}`,
          ],
        };
      }
      return true;
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      return isCheckin
        ? { ok: false, title: "Acesso não liberado", message }
        : message;
    } finally {
      setWorking(false);
    }
  }

  async function deleteReservationHistory(id: number) {
    if (working) return;
    setWorking(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/pilot/estacionamento/reservas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir esta reserva.");
      setFeedback("Reserva encerrada removida do histórico.");
      await refreshReservations();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function clearReservationHistory() {
    if (working) return;
    setWorking(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/pilot/estacionamento/reservas", { method: "DELETE" });
      const result = await readJson<{ error?: string; removidos?: number }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível limpar o histórico.");
      setFeedback(`${result.removidos || 0} registro(s) encerrado(s) removido(s).`);
      await refreshReservations();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function clearMovementHistory() {
    if (working) return;
    setWorking(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/pilot/estacionamento", { method: "DELETE" });
      const result = await readJson<{ error?: string; removidos?: number }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível limpar as movimentações.");
      setFeedback(`${result.removidos || 0} movimentação(ões) encerrada(s) removida(s).`);
      setData((current) => current ? {
        ...current,
        movimentacoes: current.movimentacoes.filter((item) => item.status === "NO_LOCAL"),
      } : current);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function reportAction(body: Record<string, unknown>) {
    return submitJson("/api/pilot/estacionamento/relatorios", body, "Relatório atualizado.", "PATCH");
  }

  async function moveSpace(sourceId: number, posicaoX: number, posicaoY: number) {
    setData((current) => current ? {
      ...current,
      vagas: current.vagas.map((space) => space.id === sourceId
        ? { ...space, posicao_x: posicaoX, posicao_y: posicaoY }
        : space),
    } : current);
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/pilot/estacionamento/mapa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ATUALIZAR_POSICAO", vagaId: sourceId, posicaoX, posicaoY }),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a posição da vaga.");
      setFeedback("Posição da vaga salva.");
    } catch (cause) {
      setError((cause as Error).message);
      await load(true);
    } finally {
      setWorking(false);
    }
  }

  return {
    data,
    setData,
    loading,
    working,
    feedback,
    error,
    reservations,
    eventOptions,
    reports,
    canManageReservations,
    canReviewReports,
    sectors,
    load,
    refreshReservations,
    registerEntry,
    registerExit,
    registerOccurrence,
    submitJson,
    createReservation,
    reservationAction,
    deleteReservationHistory,
    clearReservationHistory,
    clearMovementHistory,
    reportAction,
    moveSpace,
  };
}

export type ParkingController = ReturnType<typeof useParkingData>;

export function canDeleteReservationHistory(reservation: Reservation) {
  return ["RECUSADA", "CANCELADA", "CHECKIN"].includes(reservation.status);
}
