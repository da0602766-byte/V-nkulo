"use client";

import { useState } from "react";
import "./cells/cells.css";
import "./directory-controls.css";
import CellManagementConsole from "./cells/CellManagementConsole";
import CellMemberPortal from "./cells/CellMemberPortal";
import { useCellsData } from "./cells/useCellsData";

/**
 * Células. Duas experiências completamente distintas compartilham os mesmos
 * dados (useCellsData), como no redesenho da Gestão do estacionamento:
 *  - Gestão: quem tem `cells.manage` (pastoral/administração) ou lidera/
 *    vice-lidera ao menos uma célula. Grade de células, célula em página
 *    cheia com abas (Visão geral, Integrantes, Agenda, Relatório semanal,
 *    Solicitações, Configurações).
 *  - Participação: todo mundo mais. Lista de células, painel de perfil,
 *    caixinha de destaque editável pela liderança, e uma prévia de celular
 *    visível mesmo pelo computador.
 * Quem tem acesso à Gestão pode alternar para "Ver como participante" e
 * voltar — o resto só vê Participação.
 */
export default function CellsWorkspace({
  permissions,
  communityName,
  memberMode = false,
}: {
  permissions: string[];
  communityName: string;
  memberMode?: boolean;
}) {
  const cells = useCellsData();
  const [view, setView] = useState<"gestao" | "participacao">("gestao");

  const hasGestaoAccess =
    permissions.includes("cells.manage") || cells.cells.some((cell) => cell.can_operate);

  if (!cells.hasLoaded) {
    return <section className="cells-load-state" aria-busy={cells.loading}><h1>Células</h1>{cells.loading ? <p role="status">Carregando células…</p> : <><p role="alert">Não foi possível carregar as células. {cells.loadError}</p><button type="button" onClick={() => void cells.retryLoad()}>Tentar novamente</button></>}</section>;
  }

  const content = memberMode || !hasGestaoAccess ? <CellMemberPortal communityName={communityName} cells={cells} /> : view === "participacao" ? (
    <CellMemberPortal communityName={communityName} cells={cells} onBackToGestao={() => setView("gestao")} />
  ) : (
    <CellManagementConsole
      communityName={communityName}
      cells={cells}
      onPreviewParticipacao={() => setView("participacao")}
    />
  );
  return <>{cells.loadError && <div className="cells-load-state" role="alert"><p>Não foi possível atualizar as células. Os dados abaixo são da última atualização.</p><button type="button" disabled={cells.loading} onClick={() => void cells.retryLoad()}>Tentar novamente</button></div>}{content}</>;
}
