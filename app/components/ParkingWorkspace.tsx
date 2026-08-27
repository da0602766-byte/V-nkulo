"use client";

import {
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ParkingQrCheckin,
  ParkingReservationQr,
} from "./ParkingReservationQr";

type Space = {
  id: number;
  codigo: string;
  tipo: string;
  status: string;
  setor_id: number;
  setor_nome: string;
  setor_cor: string;
  ordem: number;
  posicao_x: number;
  posicao_y: number;
  reservada?: boolean | number;
};
type Reservation = { id:number; vaga_id:number; evento_id:number|null; evento_titulo:string; nome_completo:string; email:string; telefone:string; placa_veiculo:string; tipo_veiculo:string; modelo_veiculo:string; cor_veiculo:string; documento_mascarado:string; inicio_em:string; fim_em:string; codigo?:string; status:string; checkin_em:string|null; vaga_codigo:string; setor_nome:string };
type ParkingEventOption = { id:number; titulo:string; inicia_em:string; termina_em:string|null; local:string; status:string };
type ParkingReport = { id:number; escala_id:number; usuario_id:number; membro_nome:string; titulo:string; inicia_em:string; termina_em:string; resumo:string; entradas:number; saidas:number; ocorrencias:number; status:string };
type Movement = {
  id: number;
  placa: string;
  tipo_veiculo: string;
  responsavel: string;
  vinculo: string;
  entrada_em: string;
  saida_em: string | null;
  status: string;
  vaga_codigo: string | null;
  setor_nome: string | null;
  operador_nome: string | null;
};
type Occurrence = {
  id: number;
  tipo: string;
  descricao: string;
  gravidade: string;
  status: string;
  criado_em: string;
  criado_por_nome: string | null;
};
type AvailableUser = { id: number; nome: string; papel: string };
type ParkingData = {
  reservationGate?: {
    unlocked: boolean;
    eventAvailable: boolean;
    reason: "NO_EVENT" | "WAIT_OPENING";
    eventId: number | null;
    eventTitle: string;
    eventStartsAt: string | null;
    eventEndsAt: string | null;
    schedulesOpenAt: string | null;
    reservationsOpenAt: string | null;
  };
  config: {
    nome_modulo: string;
    cor_destaque: string;
    responsavelUsuarioId: number | null;
    instrucoes: string;
    responsavel: { id: number; nome: string; email: string } | null;
    atualizado_por_nome: string | null;
    atualizado_em: string;
  };
  stats: { total: number; ocupadas: number; livres: number; especiais: number };
  vagas: Space[];
  movimentacoes: Movement[];
  ocorrencias: Occurrence[];
  availableUsers: AvailableUser[];
  operator: {
    id: number;
    nome: string;
    email: string;
    papel: string;
    origemAcesso: "ESCALA_ATIVA" | "PERFIL_GESTOR";
    escala: {
      escala_id: number;
      titulo: string;
      inicia_em: string;
      termina_em: string;
      funcao: string;
    } | null;
  };
  permissions: string[];
};
type ParkingSector = { id:string; name:string; color:string; order:number; spaces:Space[] };

export default function ParkingWorkspace({
  communityName,
  memberMode = false,
}: {
  communityName: string;
  memberMode?: boolean;
}) {
  const [data, setData] = useState<ParkingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [mobileActions, setMobileActions] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [eventOptions, setEventOptions] = useState<ParkingEventOption[]>([]);
  const [reports, setReports] = useState<ParkingReport[]>([]);
  const [canManageReservations, setCanManageReservations] = useState(false);
  const [canReviewReports, setCanReviewReports] = useState(false);
  const [mapEditing, setMapEditing] = useState(false);
  const [draggedSpace, setDraggedSpace] = useState<number | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const [mobileManagerView, setMobileManagerView] = useState(false);
  const entryRef = useRef<HTMLDetailsElement>(null);
  const exitRef = useRef<HTMLDetailsElement>(null);
  const occurrenceRef = useRef<HTMLDetailsElement>(null);
  const operatorRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(memberMode ? "/api/pilot/estacionamento/disponibilidade" : "/api/pilot/estacionamento", {
        cache: "no-store",
      });
      const result = await readJson<ParkingData & { error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar o estacionamento.");
      }
      setData(result);
      const [reservationResponse, reportResponse, eventResponse] = await Promise.all([
        fetch("/api/pilot/estacionamento/reservas", { cache: "no-store" }),
        memberMode ? Promise.resolve(null) : fetch("/api/pilot/estacionamento/relatorios", { cache: "no-store" }),
        fetch("/api/pilot/eventos", { cache: "no-store" }),
      ]);
      if (reservationResponse.ok) { const extras=await readJson<{reservas:Reservation[];canManage:boolean}>(reservationResponse); setReservations(extras.reservas||[]); setCanManageReservations(Boolean(extras.canManage)); }
      if (reportResponse?.ok) { const extras=await readJson<{relatorios:ParkingReport[];canReview:boolean}>(reportResponse); setReports(extras.relatorios||[]); setCanReviewReports(Boolean(extras.canReview)); }
      if (eventResponse.ok) {
        const extras = await readJson<{ eventos?: ParkingEventOption[] }>(eventResponse);
        const minimumDate = Date.now() - 12 * 60 * 60 * 1000;
        setEventOptions((extras.eventos || []).filter((item) => item.status === "PUBLICADO" && new Date(item.inicia_em).getTime() >= minimumDate));
      } else {
        setEventOptions([]);
      }
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [memberMode]);

  const refreshReservations = useCallback(async () => {
    try {
      const [response, availabilityResponse] = await Promise.all([
        fetch("/api/pilot/estacionamento/reservas", { cache: "no-store" }),
        memberMode ? fetch("/api/pilot/estacionamento/disponibilidade", { cache: "no-store" }) : Promise.resolve(null),
      ]);
      if (!response.ok) return;
      const extras = await readJson<{ reservas: Reservation[]; canManage: boolean }>(response);
      setReservations(extras.reservas || []);
      setCanManageReservations(Boolean(extras.canManage));
      if (availabilityResponse?.ok) {
        const availability = await readJson<ParkingData>(availabilityResponse);
        setData(availability);
      }
    } catch {
      // A atualização silenciosa não interrompe o fluxo de reserva.
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

  useEffect(() => {
    const open = () => setMobileActions(true);
    window.addEventListener("vinkulo:parking-action", open);
    return () => window.removeEventListener("vinkulo:parking-action", open);
  }, []);

  const sectors = useMemo(() => {
    const grouped = new Map<string, Space[]>();
    for (const space of data?.vagas || []) {
      const key = `${space.setor_id}:${space.setor_nome}`;
      grouped.set(key, [...(grouped.get(key) || []), space]);
    }
    return [...grouped.entries()].map(([key, spaces]) => ({
      id: key,
      name: spaces[0]?.setor_nome || "Setor",
      color: spaces[0]?.setor_cor || "#3b82f6",
      order: Number(spaces[0]?.ordem || 0),
      spaces,
    }));
  }, [data]);
  const visibleMovements = useMemo(() => {
    const term = query.trim().toLowerCase();
    const source = term ? (data?.movimentacoes || []).filter((item) =>
      [item.placa, item.responsavel, item.vaga_codigo, item.setor_nome]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    ) : (data?.movimentacoes || []);
    return source.slice(0, 10);
  }, [data, query]);
  const activeMovements = (data?.movimentacoes || []).filter(
    (item) => item.status === "NO_LOCAL",
  );
  const canEntry = data?.permissions.includes("parking.entry");
  const canExit = data?.permissions.includes("parking.exit");
  const canEdit = data?.permissions.includes("parking.edit");
  const canConfigure = data?.permissions.includes("parking.configure");
  const canManageHelpers =
    data?.permissions.includes("parking.helpers.manage") &&
    Boolean(data?.operator.escala);

  function openAction(ref: React.RefObject<HTMLDetailsElement | null>) {
    setMobileActions(false);
    if (!ref.current) return;
    ref.current.open = true;
    ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function registerEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setWorking(true);
    setFeedback("");
    setError("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/pilot/estacionamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Entrada não registrada.");
      setFeedback("Entrada registrada e vaga ocupada.");
      formElement.reset();
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function registerExit(id: number) {
    setWorking(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(`/api/pilot/estacionamento/${id}`, {
        method: "PATCH",
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Saída não registrada.");
      setFeedback("Saída registrada e vaga liberada.");
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function registerOccurrence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setWorking(true);
    setFeedback("");
    setError("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/pilot/estacionamento/ocorrencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error || "Ocorrência não registrada.");
      }
      setFeedback("Ocorrência registrada com auditoria.");
      formElement.reset();
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
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
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function createReservation(values: Record<string, FormDataEntryValue>) {
    setWorking(true); setError(""); setFeedback("");
    try {
      const response=await fetch("/api/pilot/estacionamento/reservas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)});
      const result=await readJson<{error?:string;message?:string;codigo?:string;id?:number;status?:string}>(response);
      if(!response.ok) {
        const fallback = response.status === 403
          ? "Sua conta não tem permissão para reservar uma vaga."
          : response.status === 409
            ? "A vaga ou o horário escolhido não está mais disponível. Escolha outra opção."
            : response.status === 400
              ? "Confira nome, contato, placa, modelo, cor, período e vaga antes de continuar."
              : `Não foi possível criar a reserva (erro ${response.status}). Tente novamente.`;
        throw new Error(result.error || result.message || fallback);
      }
      setFeedback(`Reserva solicitada. Seu código é ${result.codigo}.`); setSelectedSpaceId(null); await load(); return result;
    }
    catch(cause){setError((cause as Error).message); return null;} finally{setWorking(false);}
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget; const values=Object.fromEntries(new FormData(form).entries());
    const result = await createReservation(values);
    if (result) form.reset();
  }

  async function reservationAction(body: Record<string,unknown>) {
    setWorking(true); setError(""); setFeedback("");
    try {
      const response=await fetch("/api/pilot/estacionamento/reservas",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result=await readJson<{error?:string;reserva?:{nomeCompleto:string;documento:string;inicioEm:string;vaga:string;codigo:string}}>(response);
      if(!response.ok) throw new Error(result.error||"Reserva não atualizada.");
      setFeedback(result.reserva ? `Check-in confirmado: ${result.reserva.nomeCompleto} · vaga ${result.reserva.vaga} · ${result.reserva.documento} · ${formatTime(result.reserva.inicioEm)}.` : "Reserva atualizada.");
      await load();
      return true;
    } catch(cause){ const message=(cause as Error).message; setError(message); return message; } finally { setWorking(false); }
  }
  async function clearReservationHistory() {
    if (working || !window.confirm("Limpar reservas recusadas, canceladas e confirmações já vencidas?")) return;
    setWorking(true); setError(""); setFeedback("");
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
    if (working || !window.confirm("Excluir as movimentações encerradas do histórico? Veículos ainda no local serão preservados.")) return;
    setWorking(true); setError(""); setFeedback("");
    try {
      const response = await fetch("/api/pilot/estacionamento", { method: "DELETE" });
      const result = await readJson<{ error?: string; removidos?: number }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível limpar as movimentações.");
      setFeedback(`${result.removidos || 0} movimentação(ões) encerrada(s) removida(s).`);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function reportAction(body: Record<string,unknown>) { await submitJson("/api/pilot/estacionamento/relatorios",body,"Relatório atualizado.","PATCH"); }

  async function moveSpace(sourceId:number,posicaoX:number,posicaoY:number) {
    if(!mapEditing) return;
    setDraggedSpace(null);
    await submitJson("/api/pilot/estacionamento/mapa",{action:"ATUALIZAR_POSICAO",vagaId:sourceId,posicaoX,posicaoY},"Posição da vaga salva.","PATCH");
  }

  function dropSpace(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!mapEditing || !draggedSpace) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.round(event.clientX - rect.left - 26));
    const y = Math.max(0, Math.round(event.clientY - rect.top - 18));
    void moveSpace(draggedSpace, x, y);
  }

  async function applyLayoutSuggestion(preset: "GRADE" | "CORREDOR" | "FILEIRAS") {
    if (!mapEditing || !data) return;
    const positions = sectors.flatMap((sector) => sector.spaces.map((space, index) => {
      const row = Math.floor(index / 8);
      const column = index % 8;
      if (preset === "CORREDOR") {
        return { vagaId: space.id, posicaoX: column * 82 + (column >= 4 ? 88 : 0), posicaoY: row * 58 + 10 };
      }
      if (preset === "FILEIRAS") {
        return { vagaId: space.id, posicaoX: column * 78 + (row % 2 ? 32 : 0), posicaoY: row * 62 + 12 };
      }
      return { vagaId: space.id, posicaoX: column * 78 + 10, posicaoY: row * 58 + 10 };
    }));
    await submitJson(
      "/api/pilot/estacionamento/mapa",
      { action: "ATUALIZAR_POSICOES", positions },
      "Sugestão aplicada. Você ainda pode ajustar cada vaga livremente.",
      "PATCH",
    );
  }

  if (memberMode) {
    if (data?.reservationGate && !data.reservationGate.unlocked) {
      return <ParkingReservationGate communityName={communityName} gate={data.reservationGate} />;
    }
    const selectedSpace = data?.vagas.find((space) => space.id === selectedSpaceId) || null;
    const reservationStartsAt = data?.reservationGate?.eventStartsAt ? new Date(data.reservationGate.eventStartsAt) : null;
    const reservationEndsAt = data?.reservationGate?.eventEndsAt ? new Date(data.reservationGate.eventEndsAt) : null;
    const suggestedStart = reservationStartsAt && !Number.isNaN(reservationStartsAt.getTime()) ? toLocalDateTimeInput(new Date(reservationStartsAt.getTime() - 90 * 60 * 1000)) : "";
    const suggestedEnd = reservationEndsAt && !Number.isNaN(reservationEndsAt.getTime()) ? toLocalDateTimeInput(new Date(reservationEndsAt.getTime() + 2 * 60 * 60 * 1000)) : "";
    return (<>
      <ParkingMobileExperience communityName={communityName} data={data} sectors={sectors} reservations={reservations} eventOptions={eventOptions} loading={loading} working={working} feedback={feedback} error={error} onReserve={createReservation} />
      <section className="parking-workspace parking-member-workspace parking-desktop-shell" style={{ "--parking-accent": data?.config.cor_destaque || "#d99a32" } as React.CSSProperties}>
        <header className="parking-member-heading">
          <div><p className="pilot-kicker">ESTACIONAMENTO · {communityName}</p><h1>Escolha sua vaga</h1><p>Toque em uma vaga livre para iniciar a reserva.</p></div>
          {data && <span><strong>{data.stats.livres}</strong> disponíveis</span>}
        </header>
        {loading && !data && <div className="parking-loading"><span className="pilot-loader" /><p>Carregando vagas…</p></div>}
        {(feedback || error) && <p className={`operations-feedback ${error ? "error" : ""}`} role="status">{error || feedback}</p>}
        {data && <>
          <section className="parking-cinema" aria-label="Vagas disponíveis para reserva">
            <div className="parking-cinema-screen"><span>ENTRADA</span></div>
            {sectors.map((sector) => <section key={sector.id} style={{ "--sector-color": sector.color } as React.CSSProperties}>
              <header><strong>{sector.name}</strong><small>{sector.spaces.filter(isSpaceAvailable).length} livres</small></header>
              <div>{sector.spaces.map((space) => {
                const free = isSpaceAvailable(space);
                const reserved = Boolean(space.reservada);
                return <button
                  type="button"
                  key={space.id}
                  disabled={!free}
                  className={`${free ? "free" : reserved ? "reserved" : "busy"}${selectedSpaceId === space.id ? " selected" : ""}`}
                  aria-pressed={selectedSpaceId === space.id}
                  onClick={() => setSelectedSpaceId(space.id)}
                  title={`${space.codigo} · ${space.tipo} · ${free ? "Livre" : reserved ? "Reservada" : "Ocupada"}`}
                ><span>{space.codigo}</span><small>{space.tipo === "COMUM" ? "" : space.tipo}</small></button>;
              })}</div>
            </section>)}
            <footer><span><i className="free" />Livre</span><span><i className="selected" />Selecionada</span><span><i className="busy" />Indisponível</span></footer>
          </section>

          {selectedSpace && <section className="parking-member-reservation">
            <header><div><p className="pilot-kicker">VAGA SELECIONADA</p><h2>{selectedSpace.codigo} · {selectedSpace.setor_nome}</h2></div><button type="button" onClick={() => setSelectedSpaceId(null)} aria-label="Cancelar seleção">×</button></header>
            <form onSubmit={submitReservation}>
              <input type="hidden" name="vagaId" value={selectedSpace.id} />
              <label>Nome completo<input name="nomeCompleto" required minLength={5} defaultValue={data.operator.nome} /></label>
              <label>E-mail<input name="email" type="email" defaultValue={data.operator.email} /></label>
              <label>CPF ou CNPJ <small>use se não informar e-mail</small><input name="documento" inputMode="numeric" /></label>
              <label>Celular<input name="telefone" inputMode="tel" placeholder="(47) 99999-9999" required /></label>
              <p className="parking-reservation-window"><strong>Horário sugerido do culto</strong><span>{reservationStartsAt ? formatTime(reservationStartsAt.toISOString()) : "A definir"}{reservationEndsAt ? ` até ${formatTime(reservationEndsAt.toISOString())}` : ""}. Entrada sugerida 1h30 antes e saída até 2h depois.</span></p>
              <label>Entrada<input name="inicioEm" type="datetime-local" defaultValue={suggestedStart} required /></label>
              <label>Saída<input name="fimEm" type="datetime-local" defaultValue={suggestedEnd} required /></label>
              <button disabled={working}>Reservar {selectedSpace.codigo}</button>
            </form>
          </section>}

          <section className="parking-member-tickets">
            <header><p className="pilot-kicker">MINHAS RESERVAS</p><h2>Códigos de acesso</h2></header>
            <div>{reservations.length ? reservations.slice(0, 5).map((reservation) => <article key={reservation.id} className={`status-${reservation.status.toLowerCase()}`}>
              <div className="parking-member-ticket-summary"><span>{reservation.vaga_codigo}</span><div><strong>{reservation.setor_nome}</strong><small>{formatTime(reservation.inicio_em)} · {reservation.status}</small></div></div>
              {reservation.status === "CONFIRMADA" && reservation.codigo ? <details className="parking-member-qr-ticket"><summary>▦ Mostrar QR Code de acesso</summary><ParkingReservationQr code={reservation.codigo} label={`${reservation.vaga_codigo} · ${reservation.setor_nome}`} expiresAt={reservation.fim_em} /></details> : <p>{reservation.status === "PENDENTE" ? "Aguardando confirmação do responsável." : reservation.status === "CHECKIN" ? "Entrada já liberada." : "Esta reserva não possui acesso ativo."}</p>}
            </article>) : <p>Nenhuma reserva neste período.</p>}</div>
          </section>
        </>}
      </section>
    </>);
  }

  return (<>
    {!mobileManagerView && <ParkingMobileExperience communityName={communityName} data={data} sectors={sectors} reservations={reservations} eventOptions={eventOptions} loading={loading} working={working} feedback={feedback} error={error} canManage={Boolean(canManageReservations && (canEntry || canExit || canEdit || canConfigure))} onManage={() => setMobileManagerView(true)} onReserve={createReservation} />}
    <section
      className={`parking-workspace parking-desktop-shell${mobileManagerView ? " mobile-manager-active" : ""}`}
      style={
        {
          "--parking-accent": data?.config.cor_destaque || "#d99a32",
        } as React.CSSProperties
      }
    >
      {mobileManagerView && <button type="button" className="parking-mobile-return" onClick={() => setMobileManagerView(false)}>← Voltar à reserva</button>}
      <header className="parking-heading">
        <div>
          <p className="pilot-kicker">GESTÃO DE ESTACIONAMENTO</p>
          <h1>{data?.config.nome_modulo || "Estacionamento"}</h1>
          <p>
            Operação isolada de {communityName}. Placas e responsáveis deste
            tenant não aparecem em outra comunidade.
          </p>
        </div>
        <span className="parking-live"><i />Atualização sob demanda</span>
      </header>

      {loading && !data && (
        <div className="parking-loading">
          <span className="pilot-loader" />
          <p>Carregando vagas e movimentações…</p>
        </div>
      )}
      {(feedback || error) && (
        <p className={`operations-feedback ${error ? "error" : ""}`} role="status">
          {error || feedback}
        </p>
      )}
      {data && (
        <>
          {!memberMode && <section className="parking-operator" ref={operatorRef}>
            <span aria-hidden="true">◎</span>
            <div>
              <small>OPERADOR AUTENTICADO</small>
              <strong>{data.operator.nome}</strong>
              <p>
                {data.operator.origemAcesso === "ESCALA_ATIVA"
                  ? `${data.operator.escala?.funcao} · ${data.operator.escala?.titulo}`
                  : `${data.operator.papel} · acesso permanente de gestão`}
              </p>
            </div>
            <em>
              {data.config.responsavel
                ? `Responsável: ${data.config.responsavel.nome}`
                : "Responsável ainda não definido"}
            </em>
          </section>}
          {canEntry&&<section className="parking-checkin-hub parking-checkin-primary-v4"><div><p className="pilot-kicker">PORTARIA DIGITAL</p><h3>Ler acesso da reserva</h3><p>Aponte a câmera para o QR Code do usuário. O leitor permanece aberto para conferir várias reservas em sequência.</p></div><ParkingQrCheckin promptOnMount disabled={working} onDetected={(codigo)=>reservationAction({codigo,acao:"CHECKIN"})} /></section>}
          <div className="parking-metrics">
            <Metric icon="●" label="Vagas ocupadas" value={data.stats.ocupadas} tone="green" />
            <Metric icon="○" label="Vagas disponíveis" value={data.stats.livres} tone="cyan" />
            <Metric icon="▣" label="Reservas ativas" value={reservations.filter((item)=>["PENDENTE","CONFIRMADA","CHECKIN"].includes(item.status)).length} tone="purple" />
          </div>

          <section className="parking-reservations-card">
            <header><div><p className="pilot-kicker">RESERVAS</p><h2>Minha vaga e código de acesso</h2></div><div className="parking-reservation-header-actions"><span>{data.stats.livres} disponíveis agora</span>{canManageReservations && <button type="button" onClick={() => void clearReservationHistory()} disabled={working}>Limpar histórico</button>}</div></header>
            <div className="parking-reservation-layout">
              {!canEntry && !canEdit && <form className="parking-reservation-form-v3" onSubmit={submitReservation}>
                <fieldset>
                  <legend><span>1</span><strong>Dados do usuário</strong><small>Contato e identificação da reserva</small></legend>
                  <div>
                    <label>Nome completo<input name="nomeCompleto" required minLength={5} autoComplete="name" defaultValue={data.operator.nome} /></label>
                    <label>E-mail <small>ou informe CPF/CNPJ</small><input name="email" type="email" autoComplete="email" defaultValue={data.operator.email} /></label>
                    <label>CPF ou CNPJ <small>ou informe e-mail</small><input name="documento" inputMode="numeric" autoComplete="off" placeholder="Somente números" /></label>
                    <label>Celular<input name="telefone" inputMode="tel" autoComplete="tel" placeholder="(47) 99999-9999" required /></label>
                  </div>
                </fieldset>
                <fieldset>
                  <legend><span>2</span><strong>Dados do veículo</strong><small>Informações conferidas na entrada</small></legend>
                  <div>
                    <label>Placa<input name="placaVeiculo" required minLength={6} maxLength={10} autoCapitalize="characters" placeholder="ABC1D23" /></label>
                    <label>Tipo<select name="tipoVeiculo" defaultValue="CARRO"><option value="CARRO">Carro</option><option value="MOTO">Moto</option><option value="VAN">Van</option><option value="OUTRO">Outro</option></select></label>
                    <label>Marca e modelo<input name="modeloVeiculo" required minLength={2} maxLength={80} placeholder="Ex.: Honda Civic" /></label>
                    <label>Cor<input name="corVeiculo" required maxLength={40} placeholder="Ex.: Prata" /></label>
                  </div>
                </fieldset>
                <fieldset className="parking-reservation-period-v3">
                  <legend><span>3</span><strong>Período e vaga</strong><small>Escolha quando e onde deseja estacionar</small></legend>
                  <div>
                    <label className="wide parking-event-choice-v4">Evento ou culto
                      <select
                        name="eventoId"
                        defaultValue=""
                        onChange={(event) => applyEventRecommendationToForm(event.currentTarget, eventOptions)}
                      >
                        <option value="">Reserva sem evento vinculado</option>
                        {eventOptions.map((item) => <option key={item.id} value={item.id}>{item.titulo} · {formatTime(item.inicia_em)}</option>)}
                      </select>
                      <small>Ao escolher, sugerimos chegada 45 min antes e saída 30 min depois.</small>
                    </label>
                    <label>Início<input name="inicioEm" type="datetime-local" required /></label>
                    <label>Fim<input name="fimEm" type="datetime-local" required /></label>
                    <label className="wide">Vaga<select name="vagaId" required defaultValue=""><option value="" disabled>Escolha uma vaga livre</option>{data.vagas.filter((space)=>space.status==="LIVRE").map((space)=><option key={space.id} value={space.id}>{space.codigo} · {space.setor_nome}</option>)}</select></label>
                  </div>
                </fieldset>
                <button className="parking-reservation-submit-v3" disabled={working}>{working ? "Enviando…" : "Solicitar reserva"}<span aria-hidden="true">→</span></button>
              </form>}
              <div className="parking-reservation-list">
                {reservations.map((reservation)=><article key={reservation.id}>
                  <div><small>{reservation.status}</small><strong>{reservation.vaga_codigo} · {reservation.setor_nome}</strong><span>{reservation.nome_completo} · {formatTime(reservation.inicio_em)}</span>{reservation.evento_titulo&&<em className="parking-reservation-event-v4">▣ {reservation.evento_titulo}</em>}</div>
                  {canManageReservations&&<details className="parking-reservation-person"><summary>Exibir informações</summary><dl><div><dt>Nome</dt><dd>{reservation.nome_completo}</dd></div><div><dt>Documento</dt><dd>{reservation.documento_mascarado}</dd></div><div><dt>E-mail</dt><dd>{reservation.email || "Não informado"}</dd></div><div><dt>Celular</dt><dd>{reservation.telefone}</dd></div><div><dt>Veículo</dt><dd>{reservation.placa_veiculo} · {reservation.tipo_veiculo}</dd></div><div><dt>Modelo e cor</dt><dd>{reservation.modelo_veiculo} · {reservation.cor_veiculo}</dd></div>{reservation.evento_titulo&&<div><dt>Evento ou culto</dt><dd>{reservation.evento_titulo}</dd></div>}<div><dt>Período</dt><dd>{formatTime(reservation.inicio_em)} até {formatTime(reservation.fim_em)}</dd></div></dl></details>}
                  {canManageReservations&&reservation.status==="PENDENTE"&&<footer><button onClick={()=>void reservationAction({id:reservation.id,acao:"CONFIRMAR"})}>Confirmar</button><button className="danger-link" onClick={()=>void reservationAction({id:reservation.id,acao:"RECUSAR"})}>Recusar</button></footer>}
                </article>)}
                {!reservations.length&&<p>Nenhuma reserva neste período.</p>}
              </div>
            </div>
          </section>

          <div className="parking-actions">
            {canEntry && (
              <details ref={entryRef}>
                <summary><span>↳</span><strong>Registrar entrada</strong><small>Ocupar uma vaga livre</small></summary>
                <form onSubmit={registerEntry} className="parking-action-form">
                  <label>Placa<input name="placa" required maxLength={10} placeholder="DEMO01" /></label>
                  <label>Responsável<input name="responsavel" required maxLength={120} placeholder="Pessoa demonstrativa" /></label>
                  <label>Tipo<select name="tipoVeiculo"><option value="CARRO">Carro</option><option value="MOTO">Moto</option><option value="VAN">Van</option><option value="ONIBUS">Ônibus</option><option value="OUTRO">Outro</option></select></label>
                  <label>Vínculo<select name="vinculo"><option value="VISITANTE">Visitante</option><option value="MEMBRO">Membro</option><option value="VOLUNTARIO">Voluntário</option><option value="EQUIPE">Equipe</option></select></label>
                  <label>Vaga<select name="vagaId" required defaultValue=""><option value="" disabled>Selecione</option>{data.vagas.filter((item) => item.status === "LIVRE").map((space) => <option key={space.id} value={space.id}>{space.codigo} · {space.setor_nome} · {space.tipo}</option>)}</select></label>
                  <button disabled={working}>Confirmar entrada</button>
                </form>
              </details>
            )}
            <details ref={exitRef}>
              <summary><span>↗</span><strong>Registrar saída</strong><small>Liberar vaga ocupada</small></summary>
              <div className="parking-quick-list">
                {activeMovements.length ? activeMovements.map((item) => (
                  <button key={item.id} disabled={!canExit || working} onClick={() => registerExit(item.id)}>
                    <strong>{item.placa}</strong><span>{item.vaga_codigo} · {item.responsavel}</span>
                  </button>
                )) : <p>Nenhum veículo no local.</p>}
              </div>
            </details>
            {canEdit && (
              <details ref={occurrenceRef}>
                <summary><span>!</span><strong>Relatar ocorrência</strong><small>Registrar sem apagar histórico</small></summary>
                <form onSubmit={registerOccurrence} className="parking-action-form occurrence">
                  <label>Tipo<select name="tipo"><option value="SEGURANCA">Segurança</option><option value="DANO">Dano</option><option value="BLOQUEIO">Bloqueio</option><option value="ORIENTACAO">Orientação</option><option value="OUTRO">Outro</option></select></label>
                  <label>Gravidade<select name="gravidade"><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option></select></label>
                  <label className="wide">Descrição<textarea name="descricao" required minLength={8} rows={3} /></label>
                  <button disabled={working}>Registrar ocorrência</button>
                </form>
              </details>
            )}
          </div>

          {canManageHelpers && (
            <section className="parking-management-card">
              <div>
                <p className="pilot-kicker">EQUIPE DO PLANTÃO</p>
                <h2>Convidar auxiliar</h2>
                <p>
                  Somente pessoas ativas em {communityName} podem ser chamadas.
                  O acesso só começa após a confirmação da escala e termina
                  automaticamente com o plantão.
                </p>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const values = Object.fromEntries(
                    new FormData(event.currentTarget).entries(),
                  );
                  void submitJson(
                    "/api/pilot/estacionamento/auxiliares",
                    {
                      ...values,
                      escalaId: data.operator.escala?.escala_id,
                    },
                    "Convite enviado ao auxiliar. Ele deverá confirmar a escala.",
                  );
                }}
              >
                <select name="usuarioId" required defaultValue="">
                  <option value="" disabled>Selecione uma pessoa da comunidade</option>
                  {data.availableUsers
                    .filter((item) => item.id !== data.operator.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} · {item.papel}
                      </option>
                    ))}
                </select>
                <button disabled={working}>Enviar convite</button>
              </form>
            </section>
          )}

          <div className="parking-grid">
            {(canEntry||canExit||canEdit) && <section className="parking-history">
              <header>
                <div><p className="pilot-kicker">MOVIMENTAÇÕES</p><h2>Histórico recente</h2></div>
                <div className="parking-history-tools-v4"><label>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar placa, pessoa ou vaga" /></label>{canEdit&&<button type="button" onClick={() => void clearMovementHistory()} disabled={working}>Limpar encerrados</button>}</div>
              </header>
              <div className="parking-table-wrap">
                <table>
                  <thead><tr><th>Placa</th><th>Responsável</th><th>Tipo</th><th>Entrada</th><th>Setor</th><th>Status</th><th>Ação</th></tr></thead>
                  <tbody>
                    {visibleMovements.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.placa}</strong></td>
                        <td>{item.responsavel}<small>{item.vinculo}</small></td>
                        <td>{item.tipo_veiculo}</td>
                        <td>{formatTime(item.entrada_em)}</td>
                        <td>{item.setor_nome || "—"}<small>{item.vaga_codigo || "Sem vaga"} · por {item.operador_nome || "sistema"}</small></td>
                        <td><span className={`parking-status status-${item.status.toLowerCase()}`}>{item.status === "NO_LOCAL" ? "No local" : "Encerrada"}</span></td>
                        <td>{item.status === "NO_LOCAL" && canExit ? <button disabled={working} onClick={() => registerExit(item.id)}>Saída</button> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleMovements.length && <p className="parking-empty">Nenhuma movimentação encontrada.</p>}
              </div>
            </section>}

            <aside className="parking-map-panel">
              <header><div><p className="pilot-kicker">MAPA DO ESTACIONAMENTO</p><h2>Ocupação por setor</h2></div><div className="parking-map-head-actions"><span>{data.stats.livres} livres</span>{canConfigure&&<button type="button" className={mapEditing?"active":""} onClick={()=>setMapEditing((value)=>!value)}>{mapEditing?"Concluir posições":"Editar posições"}</button>}</div></header>
              {mapEditing&&<>
                <p className="parking-map-edit-hint">Clique, segure e arraste cada vaga para reorganizar sua posição.</p>
                <div className="parking-layout-suggestions" aria-label="Sugestões de posicionamento">
                  <span>Sugestões</span>
                  <button type="button" disabled={working} onClick={() => void applyLayoutSuggestion("GRADE")}>Grade compacta</button>
                  <button type="button" disabled={working} onClick={() => void applyLayoutSuggestion("CORREDOR")}>Corredor central</button>
                  <button type="button" disabled={working} onClick={() => void applyLayoutSuggestion("FILEIRAS")}>Fileiras alternadas</button>
                </div>
              </>}
              <div className="parking-map">
                {sectors.map((sector) => (
                  <section key={sector.id} style={{ "--sector-color": sector.color } as React.CSSProperties}>
                    <header>
                      <strong>{sector.name}</strong>
                      {canConfigure && (
                        <details className="parking-sector-editor">
                          <summary>Editar</summary>
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              const values = Object.fromEntries(
                                new FormData(event.currentTarget).entries(),
                              );
                              void submitJson(
                                "/api/pilot/estacionamento/mapa",
                                {
                                  action: "ATUALIZAR_SETOR",
                                  setorId: Number(sector.id.split(":")[0]),
                                  ...values,
                                },
                                `Setor “${sector.name}” atualizado no mapa.`,
                                "PATCH",
                              );
                            }}
                          >
                            <label>
                              Nome
                              <input name="nome" defaultValue={sector.name} required maxLength={80} />
                            </label>
                            <label>
                              Cor
                              <input name="cor" type="color" defaultValue={sector.color} />
                            </label>
                            <label>
                              Posição
                              <input name="ordem" type="number" min="0" max="99" defaultValue={sector.order} />
                            </label>
                            <button disabled={working}>Salvar setor</button>
                          </form>
                        </details>
                      )}
                    </header>
                    <div
                      className={mapEditing ? "parking-free-position-canvas" : ""}
                      onDragOver={(event) => { if (mapEditing) event.preventDefault(); }}
                      onDrop={dropSpace}
                    >{sector.spaces.map((space) => <button
                      type="button"
                      key={space.id}
                      draggable={mapEditing}
                      data-space-id={space.id}
                      onDragStart={() => setDraggedSpace(space.id)}
                      onDragEnd={() => setDraggedSpace(null)}
                      style={mapEditing ? { left: `${space.posicao_x}px`, top: `${space.posicao_y}px` } : undefined}
                      className={`parking-space space-${space.status.toLowerCase()} type-${space.tipo.toLowerCase()}${mapEditing ? " editing" : ""}`}
                      title={`${space.codigo} · ${space.tipo} · ${space.status}`}
                    >{space.codigo}</button>)}</div>
                  </section>
                ))}
                <p>ENTRADA / SAÍDA</p>
              </div>
              <div className="parking-legend"><span><i className="free" />Livre</span><span><i className="busy" />Ocupada</span><span><i className="special" />Especial</span></div>
              {canConfigure&&<details className="parking-map-settings">
                <summary>
                  <span className="parking-settings-summary-mark" aria-hidden="true">⌘</span>
                  <span>
                    <strong>Configuração do estacionamento</strong>
                    <small>Liderança, setores e vagas</small>
                  </span>
                  <span className="parking-settings-summary-action">Abrir editor</span>
                  <i aria-hidden="true">⌄</i>
                </summary>
                <div className="parking-settings-grid">
                  <form
                    className="parking-settings-card parking-settings-card-lead"
                    onSubmit={(event)=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());void submitJson("/api/pilot/estacionamento/configuracao",{ativo:true,nomeModulo:data.config.nome_modulo,corDestaque:data.config.cor_destaque,...values},"Responsável atualizado.");}}
                  >
                    <header><span>1</span><div><h3>Liderança e orientações</h3><p>Defina quem coordena a operação e as instruções da equipe.</p></div></header>
                    <div className="parking-settings-fields parking-settings-lead-fields">
                      <label>Responsável<select name="responsavelUsuarioId" defaultValue={data.config.responsavelUsuarioId||""}><option value="">Automático pelo ministério</option>{data.availableUsers.map((item)=><option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
                      <label>Instruções<textarea name="instrucoes" rows={2} defaultValue={data.config.instrucoes} placeholder="Orientações para entrada, saída e atendimento"/></label>
                      <button disabled={working}>Salvar liderança</button>
                    </div>
                  </form>
                  <form
                    className="parking-settings-card"
                    onSubmit={(event)=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());void submitJson("/api/pilot/estacionamento/mapa",{action:"CRIAR_SETOR",...values},"Setor criado.");}}
                  >
                    <header><span>2</span><div><h3>Criar novo setor</h3><p>Agrupe as vagas por área ou finalidade.</p></div></header>
                    <div className="parking-settings-fields parking-settings-sector-fields">
                      <label>Nome do setor<input name="nome" required placeholder="Ex.: Visitantes"/></label>
                      <label className="parking-color-field">Cor de identificação<input name="cor" type="color" defaultValue="#3b82f6"/></label>
                      <input type="hidden" name="ordem" value={sectors.length+1}/>
                      <button disabled={working}>Adicionar setor</button>
                    </div>
                  </form>
                  <form
                    className="parking-settings-card"
                    onSubmit={(event)=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());void submitJson("/api/pilot/estacionamento/mapa",{action:"CRIAR_VAGAS",...values},"Vagas adicionadas.");}}
                  >
                    <header><span>3</span><div><h3>Adicionar vagas</h3><p>Escolha o setor, o prefixo e a quantidade.</p></div></header>
                    <div className="parking-settings-fields parking-settings-space-fields">
                      <label>Setor<select name="setorId" required defaultValue=""><option value="" disabled>Selecione um setor</option>{sectors.map((sector)=><option key={sector.id} value={sector.id.split(":")[0]}>{sector.name}</option>)}</select></label>
                      <label>Prefixo<input name="prefixo" required maxLength={5} placeholder="Ex.: A"/></label>
                      <label>Quantidade<input name="quantidade" type="number" min="1" max="40" defaultValue="4"/></label>
                      <input type="hidden" name="tipo" value="COMUM"/>
                      <button disabled={working}>Criar vagas</button>
                    </div>
                  </form>
                </div>
              </details>}
            </aside>
          </div>

          {(reports.length>0) && <section className="parking-shift-reports">
            <header><div><p className="pilot-kicker">FECHAMENTO DA ESCALA</p><h2>Relatórios para revisão</h2></div><small>Membro → líder do ministério → pastor</small></header>
            <div>{reports.map((report)=><article key={report.id}>
              <div><small>{report.status.replaceAll("_"," ")}</small><strong>{report.titulo}</strong><span>{report.membro_nome} · {formatTime(report.termina_em)}</span></div>
              {report.status==="AGUARDANDO_MEMBRO"?<form onSubmit={(event)=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());void reportAction({id:report.id,acao:"ENVIAR",...values});}}><label>Resumo<textarea name="resumo" required rows={2}/></label><label>Entradas<input name="entradas" type="number" min="0" defaultValue="0"/></label><label>Saídas<input name="saidas" type="number" min="0" defaultValue="0"/></label><label>Ocorrências<input name="ocorrencias" type="number" min="0" defaultValue="0"/></label><button disabled={working}>Enviar ao líder</button></form>:<p>{report.resumo||"Relatório enviado para revisão."}</p>}
              {canReviewReports&&report.status==="AGUARDANDO_LIDER"&&<footer><button onClick={()=>void reportAction({id:report.id,acao:"CONFIRMAR"})}>Confirmar e enviar ao pastor</button><button onClick={()=>void reportAction({id:report.id,acao:"CORRIGIR",resumo:report.resumo})}>Solicitar correção</button></footer>}
            </article>)}</div>
          </section>}

          {canEdit && <section className="parking-occurrences">
            <header>
              <div>
                <p className="pilot-kicker">RELATÓRIOS OPERACIONAIS</p>
                <h2>Ocorrências recentes</h2>
              </div>
              <small>
                {data.config.responsavel
                  ? `Notificações enviadas para ${data.config.responsavel.nome}`
                  : "Defina um responsável para receber notificações"}
              </small>
            </header>
            <div>
              {data.ocorrencias.length ? data.ocorrencias.map((item) => (
                <article key={item.id}>
                  <span>{item.gravidade}</span>
                  <strong>{item.tipo}</strong>
                  <p>{item.descricao}</p>
                  <small>
                    {item.criado_por_nome || "Operador"} · {formatTime(item.criado_em)}
                  </small>
                </article>
              )) : <p className="parking-empty">Nenhuma ocorrência registrada.</p>}
            </div>
          </section>}

          {false && canConfigure && (
            <section className="parking-configurator">
              <header>
                <div>
                  <p className="pilot-kicker">CONFIGURAÇÃO DA COMUNIDADE</p>
                  <h2>Operação e mapa</h2>
                </div>
                <small>Alterações persistentes, isoladas e auditadas</small>
              </header>
              <div className="parking-config-grid">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = Object.fromEntries(
                      new FormData(event.currentTarget).entries(),
                    );
                    void submitJson(
                      "/api/pilot/estacionamento/configuracao",
                      {
                        ativo: true,
                        nomeModulo: data.config.nome_modulo,
                        corDestaque: data.config.cor_destaque,
                        ...values,
                      },
                      "Responsável e instruções atualizados.",
                    );
                  }}
                >
                  <h3>Responsabilidade</h3>
                  <label>Responsável da diaconia
                    <select
                      name="responsavelUsuarioId"
                      defaultValue={data.config.responsavelUsuarioId || ""}
                    >
                      <option value="">Não definido</option>
                      {data.availableUsers.map((item) => (
                        <option key={item.id} value={item.id}>{item.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label>Instruções do plantão
                    <textarea
                      name="instrucoes"
                      rows={3}
                      defaultValue={data.config.instrucoes}
                      placeholder="Ex.: registrar ocorrências graves imediatamente."
                    />
                  </label>
                  <button disabled={working}>Salvar operação</button>
                </form>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = Object.fromEntries(
                      new FormData(event.currentTarget).entries(),
                    );
                    void submitJson(
                      "/api/pilot/estacionamento/mapa",
                      { action: "CRIAR_SETOR", ...values },
                      "Setor criado no mapa.",
                    );
                  }}
                >
                  <h3>Novo setor</h3>
                  <label>Nome<input name="nome" required placeholder="Setor C" /></label>
                  <label>Cor<input name="cor" type="color" defaultValue="#3b82f6" /></label>
                  <label>Posição<input name="ordem" type="number" min="0" max="99" defaultValue="3" /></label>
                  <button disabled={working}>Adicionar setor</button>
                </form>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = Object.fromEntries(
                      new FormData(event.currentTarget).entries(),
                    );
                    void submitJson(
                      "/api/pilot/estacionamento/mapa",
                      { action: "CRIAR_VAGAS", ...values },
                      "Vagas adicionadas ao mapa.",
                    );
                  }}
                >
                  <h3>Adicionar vagas</h3>
                  <label>Setor<select name="setorId" required defaultValue="">
                    <option value="" disabled>Selecione</option>
                    {sectors.map((sector) => (
                      <option key={sector.id} value={sector.id.split(":")[0]}>
                        {sector.name}
                      </option>
                    ))}
                  </select></label>
                  <label>Prefixo<input name="prefixo" required maxLength={5} placeholder="C" /></label>
                  <label>Quantidade<input name="quantidade" type="number" min="1" max="40" defaultValue="4" /></label>
                  <label>Tipo<select name="tipo"><option value="COMUM">Comum</option><option value="PCD">PCD</option><option value="IDOSO">Idoso</option><option value="RESERVADA">Reservada</option></select></label>
                  <button disabled={working}>Criar vagas</button>
                </form>
              </div>
              <p className="parking-future-note">
                Reserva com pagamento, cobrança adicional e punições permanecem
                desativadas. Essa etapa exigirá backend financeiro homologado.
              </p>
            </section>
          )}

          {mobileActions && (
            <div className="parking-mobile-overlay" role="presentation" onClick={() => setMobileActions(false)}>
              <section
                className="parking-mobile-actions"
                role="dialog"
                aria-modal="true"
                aria-label="Ações do estacionamento"
                onClick={(event) => event.stopPropagation()}
              >
                <header>
                  <div><small>ESTACIONAMENTO</small><h2>Ação rápida</h2></div>
                  <button onClick={() => setMobileActions(false)} aria-label="Fechar">×</button>
                </header>
                {canEntry && <button onClick={() => openAction(entryRef)}><span>↳</span><strong>Registrar entrada</strong></button>}
                {canExit && <button onClick={() => openAction(exitRef)}><span>↗</span><strong>Registrar saída</strong></button>}
                {canEdit && <button onClick={() => openAction(occurrenceRef)}><span>!</span><strong>Relatar problema</strong></button>}
                <button onClick={() => {
                  setMobileActions(false);
                  operatorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}><span>◎</span><strong>Ver meu acesso</strong></button>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  </>);
}

function ParkingMobileExperience({
  communityName,
  data,
  sectors,
  reservations,
  eventOptions,
  loading,
  working,
  feedback,
  error,
  canManage = false,
  onManage,
  onReserve,
}: {
  communityName: string;
  data: ParkingData | null;
  sectors: ParkingSector[];
  reservations: Reservation[];
  eventOptions: ParkingEventOption[];
  loading: boolean;
  working: boolean;
  feedback: string;
  error: string;
  canManage?: boolean;
  onManage?: () => void;
  onReserve: (values: Record<string, FormDataEntryValue>) => Promise<{ codigo?:string; id?:number; status?:string } | null>;
}) {
  const [step, setStep] = useState<"local"|"space"|"details"|"success">("local");
  const [sectorId, setSectorId] = useState("");
  const [spaceId, setSpaceId] = useState<number | null>(null);
  const [createdCode, setCreatedCode] = useState("");
  const [dismissedCode, setDismissedCode] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [saveProfile, setSaveProfile] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [recommendedStart, setRecommendedStart] = useState(() => toLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [recommendedEnd, setRecommendedEnd] = useState(() => toLocalDateTimeInput(new Date(Date.now() + 3 * 60 * 60 * 1000)));
  const [profile, setProfile] = useState({ nomeCompleto:"", email:"", telefone:"", placaVeiculo:"", tipoVeiculo:"CARRO", modeloVeiculo:"", corVeiculo:"" });
  const profileLoaded = useRef(false);
  const selectedSector = sectors.find((sector) => sector.id === sectorId) || sectors[0] || null;
  const selectedSpace = selectedSector?.spaces.find((space) => space.id === spaceId) || null;
  const activeReservation = useMemo(() => reservations.find((reservation) => ["PENDENTE","CONFIRMADA","CHECKIN"].includes(reservation.status) && reservation.codigo !== dismissedCode) || null, [reservations, dismissedCode]);
  const ticketReservation = activeReservation || reservations.find((reservation) => reservation.codigo === createdCode) || null;
  const ticketCode = ticketReservation?.codigo || createdCode;
  const ticketSpace = ticketReservation?.vaga_codigo || selectedSpace?.codigo || "";
  const ticketSector = ticketReservation?.setor_nome || selectedSector?.name || "";
  const ticketStatus = ticketReservation?.status || "PENDENTE";
  const selectedEvent = eventOptions.find((item) => String(item.id) === selectedEventId) || null;

  useEffect(() => {
    if (!data || profileLoaded.current) return;
    profileLoaded.current = true;
    let saved: Partial<typeof profile> = {};
    try { saved = JSON.parse(window.localStorage.getItem("vinkulo-parking-profile-v1") || "{}"); } catch { saved = {}; }
    setSaveProfile(Boolean(Object.keys(saved).length));
    setProfile({ nomeCompleto:data.operator.nome, email:data.operator.email, telefone:"", placaVeiculo:"", tipoVeiculo:"CARRO", modeloVeiculo:"", corVeiculo:"", ...saved });
  }, [data]);

  useEffect(() => {
    if (!activeReservation || step !== "local") return;
    const sector = sectors.find((item) => item.spaces.some((space) => space.id === activeReservation.vaga_id));
    if (sector) setSectorId(sector.id);
    setSpaceId(activeReservation.vaga_id);
    setCreatedCode(activeReservation.codigo || "");
    setStep("success");
  }, [activeReservation, sectors, step]);

  useEffect(() => {
    if (step !== "success" || ticketStatus !== "CHECKIN" || !ticketCode) return;
    const timer = window.setTimeout(() => {
      setDismissedCode(ticketCode);
      setCreatedCode("");
      setSpaceId(null);
      setStep("local");
    }, 4_500);
    return () => window.clearTimeout(timer);
  }, [step, ticketCode, ticketStatus]);

  function goBack() {
    if (step === "success") setStep("details");
    else if (step === "details") setStep("space");
    else if (step === "space") setStep("local");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSpace) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const result = await onReserve(values);
    if (!result?.codigo) return;
    const nextProfile = { nomeCompleto:String(values.nomeCompleto||""), email:String(values.email||""), telefone:String(values.telefone||""), placaVeiculo:String(values.placaVeiculo||""), tipoVeiculo:String(values.tipoVeiculo||"CARRO"), modeloVeiculo:String(values.modeloVeiculo||""), corVeiculo:String(values.corVeiculo||"") };
    if (saveProfile) window.localStorage.setItem("vinkulo-parking-profile-v1", JSON.stringify(nextProfile));
    else window.localStorage.removeItem("vinkulo-parking-profile-v1");
    setCreatedCode(result.codigo);
    setStep("success");
  }

  async function copyCode() {
    if (!ticketCode) return;
    try {
      await navigator.clipboard.writeText(ticketCode);
    } catch {
      const field = document.createElement("textarea");
      field.value = ticketCode;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopyMessage("Código copiado");
    window.setTimeout(() => setCopyMessage(""), 2_000);
  }

  if (loading && !data) return <section className="parking-mobile-app"><div className="parking-mobile-loading"><span className="pilot-loader"/><p>Preparando as vagas…</p></div></section>;
  if (!data) return <section className="parking-mobile-app"><p className="operations-feedback error">{error || "Não foi possível carregar o estacionamento."}</p></section>;

  return <section className={`parking-mobile-app parking-mobile-step-${step}`} style={{"--parking-mobile-accent":"#d5f247"} as React.CSSProperties}>
    <header className="parking-mobile-header">
      {step === "local" ? <span className="parking-mobile-logo">V</span> : <button type="button" onClick={goBack} aria-label="Voltar">←</button>}
      <strong>{step === "local" ? "Reserva de vaga" : step === "space" ? "Escolha sua vaga" : step === "details" ? "Dados da reserva" : "Sua reserva"}</strong>
      <span className="parking-mobile-help" aria-hidden="true">?</span>
    </header>

    <main className="parking-mobile-main">
      {canManage && <div className="parking-mobile-role"><span>ÁREA INTERNA</span><button type="button" onClick={onManage}>Abrir gestão</button></div>}
      {(feedback || error) && step !== "success" && <p className={`parking-mobile-feedback${error ? " error" : ""}`} role="status">{error || feedback}</p>}

      {step === "local" && <>
        <p className="parking-mobile-step-label">01 / LOCAL</p>
        <h1>Onde você<br/><em>quer parar?</em></h1>
        <p className="parking-mobile-intro">Escolha o setor mais conveniente em {communityName}.</p>
        <div className="parking-mobile-sector-list">
          {sectors.map((sector,index) => {
            const free = sector.spaces.filter(isSpaceAvailable).length;
            const chosen = (sectorId || sectors[0]?.id) === sector.id;
            return <button key={sector.id} type="button" className={chosen ? "chosen" : ""} onClick={() => setSectorId(sector.id)}>
              <span className={`parking-mobile-sector-symbol tone-${index%3}`} aria-hidden="true">P</span>
              <span><strong>{sector.name}</strong><small>{communityName}</small><em>{free} vagas disponíveis</em></span>
              <i aria-hidden="true"><b/></i>
            </button>;
          })}
        </div>
      </>}

      {step === "space" && selectedSector && <>
        <p className="parking-mobile-step-label">02 / VAGA</p>
        <h1>Escolha o seu<br/><em>lugar.</em></h1>
        <p className="parking-mobile-location">⌖ {selectedSector.name} · {communityName}</p>
        <div className="parking-mobile-legend"><span><i className="free"/>Livre</span><span><i className="reserved"/>Reservada</span><span><i className="busy"/>Ocupada</span><span><i className="selected"/>Sua escolha</span></div>
        <section className="parking-mobile-map" aria-label={`Vagas do ${selectedSector.name}`}>
          <div className="parking-mobile-entrance">ENTRADA <span>↓</span></div>
          <div className="parking-mobile-lane">ACESSO</div>
          <div className="parking-mobile-spots">{selectedSector.spaces.map((space) => {
            const free = isSpaceAvailable(space);
            const reserved = Boolean(space.reservada);
            return <button key={space.id} type="button" disabled={!free} className={`${free ? "free" : reserved ? "reserved" : "busy"}${spaceId === space.id ? " selected" : ""}`} title={`${space.codigo} · ${free ? "Livre" : reserved ? "Reservada" : "Ocupada"}`} onClick={() => setSpaceId(space.id)} aria-pressed={spaceId === space.id}><span aria-hidden="true">▰</span><small>{space.codigo}</small>{reserved && <b>R</b>}</button>;
          })}</div>
          <div className="parking-mobile-exit">SAÍDA <span>↑</span></div>
        </section>
        {selectedSpace && <div className="parking-mobile-selection"><span>▦</span><div><small>VAGA SELECIONADA</small><strong>{selectedSpace.codigo}</strong></div><b>{selectedSector.name}</b></div>}
      </>}

      {step === "details" && selectedSpace && <>
        <p className="parking-mobile-step-label">03 / CONFIRMAÇÃO</p>
        <h1>Quase <em>lá.</em></h1>
        <div className="parking-mobile-summary"><span>▦</span><div><small>VOCÊ ESTÁ RESERVANDO</small><strong>{selectedSector?.name} · Vaga {selectedSpace.codigo}</strong><p>Preencha os dados do usuário e do veículo.</p></div></div>
        <form className="parking-mobile-form" onSubmit={submit}>
          <input type="hidden" name="vagaId" value={selectedSpace.id}/>
          <fieldset><legend>DADOS DO USUÁRIO</legend>
            <label>NOME COMPLETO<input name="nomeCompleto" required minLength={5} autoComplete="name" value={profile.nomeCompleto} onChange={(event)=>setProfile((current)=>({...current,nomeCompleto:event.target.value}))}/></label>
            <label>E-MAIL PARA CONFIRMAÇÃO<input name="email" type="email" autoComplete="email" value={profile.email} onChange={(event)=>setProfile((current)=>({...current,email:event.target.value}))}/></label>
            <label>CPF OU CNPJ <small>necessário se não informar e-mail</small><input name="documento" inputMode="numeric" autoComplete="off"/></label>
            <label>CELULAR<input name="telefone" inputMode="tel" autoComplete="tel" placeholder="(47) 99999-9999" required value={profile.telefone} onChange={(event)=>setProfile((current)=>({...current,telefone:event.target.value}))}/></label>
          </fieldset>
          <fieldset><legend>DADOS DO VEÍCULO</legend>
            <label>PLACA<input name="placaVeiculo" required minLength={6} maxLength={10} placeholder="ABC1D23" autoCapitalize="characters" value={profile.placaVeiculo} onChange={(event)=>setProfile((current)=>({...current,placaVeiculo:event.target.value.toUpperCase()}))}/></label>
            <label>TIPO<select name="tipoVeiculo" value={profile.tipoVeiculo} onChange={(event)=>setProfile((current)=>({...current,tipoVeiculo:event.target.value}))}><option value="CARRO">Carro</option><option value="MOTO">Moto</option><option value="VAN">Van</option><option value="OUTRO">Outro</option></select></label>
            <label>MARCA E MODELO<input name="modeloVeiculo" required minLength={2} placeholder="Ex.: Honda Civic" value={profile.modeloVeiculo} onChange={(event)=>setProfile((current)=>({...current,modeloVeiculo:event.target.value}))}/></label>
            <label>COR<input name="corVeiculo" required placeholder="Ex.: Prata" value={profile.corVeiculo} onChange={(event)=>setProfile((current)=>({...current,corVeiculo:event.target.value}))}/></label>
          </fieldset>
          <label className="parking-mobile-save-profile"><input type="checkbox" checked={saveProfile} onChange={(event)=>setSaveProfile(event.target.checked)}/><span><strong>Salvar meus dados neste aparelho</strong><small>Nome, contato e veículo serão preenchidos na próxima reserva. CPF/CNPJ não será salvo.</small></span></label>
          <section className="parking-mobile-event-v4">
            <label>EVENTO OU CULTO
              <select name="eventoId" value={selectedEventId} onChange={(event) => {
                const nextId = event.target.value;
                setSelectedEventId(nextId);
                const nextEvent = eventOptions.find((item) => String(item.id) === nextId);
                if (!nextEvent) return;
                const recommendation = getEventParkingWindow(nextEvent);
                setRecommendedStart(recommendation.start);
                setRecommendedEnd(recommendation.end);
              }}>
                <option value="">Reserva sem evento vinculado</option>
                {eventOptions.map((item) => <option key={item.id} value={item.id}>{item.titulo} · {formatTime(item.inicia_em)}</option>)}
              </select>
            </label>
            {selectedEvent && <p><strong>Horário recomendado</strong><span>Chegue 45 minutos antes de {selectedEvent.titulo}. Você pode ajustar abaixo.</span></p>}
          </section>
          <div className="parking-mobile-time-grid"><label>CHEGADA<input name="inicioEm" type="datetime-local" value={recommendedStart} onChange={(event) => setRecommendedStart(event.target.value)} required/></label><label>SAÍDA<input name="fimEm" type="datetime-local" value={recommendedEnd} onChange={(event) => setRecommendedEnd(event.target.value)} required/></label></div>
          <button className="parking-mobile-primary parking-mobile-submit" disabled={working}>{working ? "Enviando…" : "Solicitar reserva"} <span>✓</span></button>
        </form>
      </>}

      {step === "success" && ticketCode && <>
        <section className={`parking-mobile-success status-${ticketStatus.toLowerCase()}`}><span>{ticketStatus === "CHECKIN" ? "✓" : ticketStatus === "CONFIRMADA" ? "▦" : "✓"}</span><p className="parking-mobile-step-label">{ticketStatus === "CHECKIN" ? "ACESSO AUTENTICADO" : ticketStatus === "CONFIRMADA" ? "RESERVA CONFIRMADA" : "SOLICITAÇÃO ENVIADA"}</p><h1>Vaga <em>{ticketSpace}</em><br/>{ticketStatus === "CHECKIN" ? "liberada." : "reservada."}</h1><p>{ticketStatus === "CHECKIN" ? "QR Code validado pelo responsável. Esta confirmação será fechada automaticamente." : ticketStatus === "CONFIRMADA" ? "Apresente o QR Code abaixo ao responsável na entrada." : "Aguardando a confirmação do responsável. O QR Code já está pronto e será validado após a aprovação."}</p></section>
        <section className="parking-mobile-ticket"><div><span>▦</span><p><small>CÓDIGO DA RESERVA</small><strong>{ticketCode}</strong></p><button type="button" className="parking-mobile-copy" onClick={()=>void copyCode()}>{copyMessage || "Copiar"}</button></div>{ticketReservation?.evento_titulo&&<div><span>◷</span><p><small>EVENTO OU CULTO</small><strong>{ticketReservation.evento_titulo}</strong></p></div>}<div><span>⌖</span><p><small>LOCAL</small><strong>{ticketSector}<br/>{communityName}</strong></p></div><footer><span><small>STATUS</small><strong>{ticketStatus === "CHECKIN" ? "Autenticado" : ticketStatus === "CONFIRMADA" ? "Pronto para entrada" : "Aguardando confirmação"}</strong></span><span><small>VAGA</small><strong>{ticketSpace}</strong></span></footer></section>
        {ticketStatus !== "CHECKIN" && <ParkingReservationQr code={ticketCode} label={`${ticketSpace} · ${ticketSector}`}/>}
        <button type="button" className="parking-mobile-secondary" onClick={() => {setDismissedCode(ticketCode);setStep("local");setSpaceId(null);setCreatedCode("");}}>Fazer outra reserva</button>
      </>}
    </main>

    {step === "local" && <footer className="parking-mobile-action"><button type="button" className="parking-mobile-primary" disabled={!selectedSector} onClick={() => setStep("space")}>Escolher vaga <span>›</span></button></footer>}
    {step === "space" && <footer className="parking-mobile-action"><button type="button" className="parking-mobile-primary" disabled={!selectedSpace} onClick={() => setStep("details")}>Continuar <span>›</span></button></footer>}
  </section>;
}

function ParkingReservationGate({
  communityName,
  gate,
}: {
  communityName: string;
  gate: NonNullable<ParkingData["reservationGate"]>;
}) {
  const waiting = gate.reason === "WAIT_OPENING";
  return (
    <section className="parking-reservation-gate">
      <span className="parking-mobile-logo" aria-hidden="true">V</span>
      <p className="pilot-kicker">ESTACIONAMENTO · {communityName}</p>
      <h1>{waiting ? "Reserva programada" : "Aguardando próximo evento"}</h1>
      <p>
        {waiting
          ? `As reservas para “${gate.eventTitle}” serão liberadas automaticamente no horário informado.`
          : "A reserva será liberada quando houver um evento publicado."}
      </p>
      <dl>
        <div><dt>Evento</dt><dd>{gate.eventStartsAt ? formatTime(gate.eventStartsAt) : "A definir"}</dd></div>
        <div><dt>Escalas abrem</dt><dd>{gate.schedulesOpenAt ? formatTime(gate.schedulesOpenAt) : "Ao publicar"}</dd></div>
        <div><dt>Reservas abrem</dt><dd>{gate.reservationsOpenAt ? formatTime(gate.reservationsOpenAt) : "Ao publicar"}</dd></div>
      </dl>
      {!gate.eventAvailable && <a href="/painel?view=eventos">Ver Eventos</a>}
      {waiting && gate.reservationsOpenAt && <ParkingOpeningCountdown opensAt={gate.reservationsOpenAt} />}
    </section>
  );
}

function ParkingOpeningCountdown({ opensAt }: { opensAt: string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(opensAt) - Date.now()));
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Math.max(0, Date.parse(opensAt) - Date.now());
      setRemaining(next);
      if (!next) window.location.reload();
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [opensAt]);
  const total = Math.ceil(remaining / 1_000);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return <strong className="parking-opening-countdown" aria-live="polite">{hours}h {minutes}min {seconds}s</strong>;
}

async function readJson<T>(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

function toLocalDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getEventParkingWindow(event: ParkingEventOption) {
  const eventStart = new Date(event.inicia_em);
  const rawEnd = event.termina_em ? new Date(event.termina_em) : null;
  const eventEnd = rawEnd && Number.isFinite(rawEnd.getTime())
    ? rawEnd
    : new Date(eventStart.getTime() + 2 * 60 * 60 * 1000);
  return {
    start: toLocalDateTimeInput(new Date(eventStart.getTime() - 45 * 60 * 1000)),
    end: toLocalDateTimeInput(new Date(eventEnd.getTime() + 30 * 60 * 1000)),
  };
}

function applyEventRecommendationToForm(select: HTMLSelectElement, events: ParkingEventOption[]) {
  const event = events.find((item) => String(item.id) === select.value);
  if (!event || !select.form) return;
  const recommendation = getEventParkingWindow(event);
  const start = select.form.elements.namedItem("inicioEm");
  const end = select.form.elements.namedItem("fimEm");
  if (start instanceof HTMLInputElement) start.value = recommendation.start;
  if (end instanceof HTMLInputElement) end.value = recommendation.end;
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
  tone: string;
}) {
  return <article className={`parking-metric tone-${tone}`}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></article>;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function isSpaceAvailable(space: Space) {
  return space.status === "LIVRE" && !Boolean(space.reservada);
}
