"use client";

import { useEffect, useState } from "react";
import PublicIcon from "./PublicIcon";
import "./parking/parking.css";
import ParkingManagementConsole from "./parking/ParkingManagementConsole";
import ParkingMemberPortal from "./parking/ParkingMemberPortal";
import ParkingOperatorMobile from "./parking/ParkingOperatorMobile";
import ParkingReportDetail from "./parking/ParkingReportDetail";
import { useParkingData } from "./parking/useParkingData";
import { useBrowserSearch } from "./useBrowserSearch";

const MOBILE_QUERY = "(max-width: 900px)";

/**
 * Gestão do estacionamento. Três experiências completamente distintas
 * compartilham os mesmos dados (useParkingData):
 *  - Membro sem acesso à Gestão: reserva de vaga, histórico e garagem própria.
 *  - Auxiliar em plantão (acesso vem de uma escala confirmada), no celular:
 *    tela focada em check-in por QR Code, check-outs e cronômetro da escala.
 *  - Líder do ministério ou administração, ou operação pelo computador:
 *    console completo de gestão (entradas, saídas, reservas, ocorrências,
 *    relatórios e mapa de vagas).
 */
export default function ParkingWorkspace({
  communityName,
  memberMode = false,
  reportsEnabled = true,
}: {
  communityName: string;
  memberMode?: boolean;
  reportsEnabled?: boolean;
}) {
  const [viewAsMember, setViewAsMember] = useState(false);
  const search = useBrowserSearch();
  const reportId = Number(new URLSearchParams(search).get("relatorio"));
  if (reportsEnabled && Number.isSafeInteger(reportId) && reportId > 0) return <ParkingReportDetail key={reportId} id={reportId} />;
  const effectiveMemberMode = memberMode || viewAsMember;
  return <div className="parking-experience">
    {!memberMode && <nav className="parking-experience-switch" aria-label="Visão do estacionamento">
      <button type="button" aria-pressed={!viewAsMember} onClick={() => setViewAsMember(false)}><PublicIcon name="layers" size={18}/>Gestão</button>
      <button type="button" aria-pressed={viewAsMember} onClick={() => setViewAsMember(true)}><PublicIcon name="user" size={18}/>Visão do membro · Reservar vaga</button>
    </nav>}
    <ParkingExperience key={effectiveMemberMode ? "member" : "management"} communityName={communityName} memberMode={effectiveMemberMode} reportsEnabled={reportsEnabled} />
  </div>;
}

function ParkingExperience({ communityName, memberMode, reportsEnabled }: { communityName: string; memberMode: boolean; reportsEnabled: boolean }) {
  const parking = useParkingData(memberMode, reportsEnabled);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  if (memberMode) {
    return <ParkingMemberPortal communityName={communityName} parking={parking} />;
  }

  const isPermanentLeader = Boolean(parking.data?.permissions.includes("parking.configure"));
  const isOnDutyShift = Boolean(parking.data?.operator.escala);
  const showOperatorMobile = isMobile && isOnDutyShift && !isPermanentLeader;

  if (showOperatorMobile) {
    return <ParkingOperatorMobile communityName={communityName} parking={parking} />;
  }
  return <ParkingManagementConsole communityName={communityName} parking={parking} />;
}
