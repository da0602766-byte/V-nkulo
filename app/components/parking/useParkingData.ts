"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const [context, setContext] = useState({ eventId: "", start: "", end: "" });
  const [reservationFilters, setReservationFilters] = useState({ q: "", setorId: "", tipo: "", status: "", page: 1 });
  const [reservationTotal, setReservationTotal] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [stale, setStale] = useState(true);
  const [online, setOnline] = useState(true);
  const requestRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const retryRef = useRef(0);
  const mutationRef = useRef(false);
  const reservationRequestRef = useRef({ payload: "", key: "" });

  const load = useCallback(async (quiet = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const sequence = ++sequenceRef.current;
    if (!quiet) { setLoading(true); setStale(true); }
    try {
      if (!navigator.onLine) throw new Error("Você está sem conexão. As vagas podem estar desatualizadas.");
      const params = new URLSearchParams();
      if (context.eventId) params.set("eventoId",context.eventId);
      if (context.start && context.end) { params.set("inicioEm",context.start); params.set("fimEm",context.end); }
      const filters = new URLSearchParams({ ...reservationFilters, page: String(reservationFilters.page), pageSize: "40" });
      // Choosing an activity affects availability, while the personal list keeps every activity visible.
      if (context.eventId && !memberMode) filters.set("eventoId",context.eventId);
      if (memberMode) filters.set("scope","mine");
      const options = { cache: "no-store" as const, signal: controller.signal };
      const [response,reservationResponse,reportResponse] = await Promise.all([
        fetch((memberMode ? "/api/pilot/estacionamento/disponibilidade" : "/api/pilot/estacionamento") + "?" + params,options),
        fetch("/api/pilot/estacionamento/reservas?"+filters,options),
        memberMode ? Promise.resolve(null) : fetch("/api/pilot/estacionamento/relatorios",options),
      ]);
      if ([response,reservationResponse,reportResponse].some(item=>item && [401,403,423].includes(item.status)) && sequence===sequenceRef.current) {
        setData(null);setReservations([]);setReports([]);setEventOptions([]);setCanManageReservations(false);setCanReviewReports(false);
      }
      const result = await readJson<ParkingData & {error?:string}>(response);
      if (!response.ok) {
        if ([401,403,423].includes(response.status) && sequence === sequenceRef.current) {
          setData(null); setReservations([]); setReports([]); setEventOptions([]); setCanManageReservations(false); setCanReviewReports(false);
        }
        throw new Error(result.error || "Não foi possível atualizar as vagas.");
      }
      if (!reservationResponse.ok) throw new Error("Não foi possível atualizar as reservas. Tente novamente.");
      const extras = await readJson<{reservas:Reservation[];canManage:boolean;total:number}>(reservationResponse);
      const reportData = reportResponse?.ok ? await readJson<{relatorios:ParkingReport[];canReview:boolean}>(reportResponse) : null;
      if (reportResponse && !reportResponse.ok) throw new Error("Não foi possível atualizar os relatórios.");
      if (!result.config || !result.operator || !Array.isArray(result.vagas) || !Array.isArray(result.permissions) || !result.stats || !Array.isArray(extras.reservas) || (reportResponse && !Array.isArray(reportData?.relatorios))) throw new Error("O servidor retornou dados incompletos. Tente atualizar novamente.");
      if (sequence !== sequenceRef.current || controller.signal.aborted) return;
      setData(result); setEventOptions(result.eventos || []);
      setReservations(extras.reservas || []); setReservationTotal(extras.total || 0);
      setCanManageReservations(Boolean(extras.canManage));
      setReports(reportData?.relatorios || []); setCanReviewReports(Boolean(reportData?.canReview));
      setLastSync(result.serverTime || new Date().toISOString()); setStale(false); setError(""); retryRef.current=0;
    } catch (cause) {
      if (controller.signal.aborted || sequence !== sequenceRef.current) return;
      setError((cause as Error).message); setStale(true); retryRef.current = Math.min(4,retryRef.current+1);
    } finally {
      if (sequence === sequenceRef.current) { setLoading(false); requestRef.current=null; }
    }
  }, [memberMode,context,reservationFilters]);

  const refreshReservations = useCallback(() => load(true),[load]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(),0);
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const poll = async () => {
      if (document.visibilityState === "visible" && navigator.onLine && !requestRef.current && !mutationRef.current) await load(true);
      if (!disposed) timer = setTimeout(poll,12_000 * 2 ** retryRef.current);
    };
    timer=setTimeout(poll,12_000);
    const resume = () => { setOnline(navigator.onLine); if (navigator.onLine && document.visibilityState === "visible") void load(true); };
    const offline = () => { setOnline(false); setStale(true); setError("Você está sem conexão. As vagas podem estar desatualizadas."); };
    document.addEventListener("visibilitychange",resume);
    window.addEventListener("focus",resume); window.addEventListener("online",resume); window.addEventListener("offline",offline);
    return () => { disposed=true; clearTimeout(initial); clearTimeout(timer); requestRef.current?.abort();
      document.removeEventListener("visibilitychange",resume); window.removeEventListener("focus",resume); window.removeEventListener("online",resume); window.removeEventListener("offline",offline); };
  },[load]);

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
    if (mutationRef.current || stale || !navigator.onLine) return null;
    mutationRef.current = true;
    const serialized = JSON.stringify(values);
    if (reservationRequestRef.current.payload !== serialized) reservationRequestRef.current = { payload: serialized, key: crypto.randomUUID() };
    setWorking(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/pilot/estacionamento/reservas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, requestId: reservationRequestRef.current.key }),
      });
      const result = await readJson<{ error?: string; message?: string; codigo?: string; id?: number; status?: string; notificationWarning?: boolean }>(response);
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
      if (!result.id || !result.codigo) throw new Error("Não foi possível confirmar a resposta. Atualize Minhas reservas antes de tentar novamente.");
      // An acknowledged request has finished. A later explicit reservation is a new intent,
      // even if its fields match a reservation the member has since cancelled.
      reservationRequestRef.current = {payload:"",key:""};
      setFeedback(`Reserva solicitada. Seu código é ${result.codigo}.${result.notificationWarning ? " A reserva foi salva, mas houve falha no envio da notificação." : ""}`);
      await refreshReservations();
      return result;
    } catch (cause) {
      await refreshReservations();
      setError((cause as Error).message);
      return null;
    } finally {
      mutationRef.current = false;
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
        body: JSON.stringify({ ...body, ...(isCheckin && context.eventId ? {eventoId:context.eventId} : {}) }),
      });
      const result = await readJson<{
        error?: string;
        notificationWarning?: boolean;
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
        (isCheckin && result.reserva
          ? `Check-in confirmado: ${result.reserva.nomeCompleto} · vaga ${result.reserva.vaga}.`
          : "Reserva atualizada.") + (result.notificationWarning ? " Alteração salva; falha no envio da notificação." : ""),
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
    const previous = data?.vagas.find(space => space.id === sourceId);
    if (!previous || working) return;
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/pilot/estacionamento/mapa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ATUALIZAR_POSICAO", vagaId: sourceId, posicaoX, posicaoY, previousX: previous.posicao_x, previousY: previous.posicao_y }),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a posição da vaga.");
      setFeedback("Posição da vaga salva.");
      await load(true);
    } catch (cause) {
      await load(true);
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return {
    data,
    setData,
    loading,
    working: working || stale || !online,
    stale, online, lastSync, context, setContext, reservationFilters, setReservationFilters, reservationTotal,
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
