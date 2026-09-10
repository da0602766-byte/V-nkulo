"use client";

import { useEffect, useState } from "react";
import ParkingManagementConsole from "./parking/ParkingManagementConsole";
import ParkingMemberPortal from "./parking/ParkingMemberPortal";
import ParkingOperatorMobile from "./parking/ParkingOperatorMobile";
import { useParkingData } from "./parking/useParkingData";

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
}: {
  communityName: string;
  memberMode?: boolean;
}) {
  const parking = useParkingData(memberMode);
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
