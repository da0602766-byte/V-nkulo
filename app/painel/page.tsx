import { redirect } from "next/navigation";
import PilotDashboard from "../components/PilotDashboard";
import RecepcaoAvisos from "../components/RecepcaoAvisos";
import { getD1 } from "../../db";
import {
  getIntroductionState,
  getPendingPromotionNotice,
} from "../lib/recepcao";
import {
  getParkingModuleState,
  getPilotFeatureState,
  getPilotFeed,
} from "../lib/pilot-data";
import { getSessionState } from "../lib/local-auth";
import { getActiveTenantContext } from "../lib/tenant";
import { getCommunityTheme } from "../lib/community-theme-storage";

export const dynamic = "force-dynamic";

// Esta lista precisa acompanhar o tipo View de PilotDashboard. Uma view que
// existe no menu mas falta aqui é aceita no clique e perdida no recarregamento,
// porque openView grava ?view= na URL e esta validação a devolve para "inicio".
const VALID_VIEWS = new Set([
  "inicio",
  "fio",
  "eventos",
  "ministerios",
  "visitantes",
  "celulas",
  "estacionamento",
  "redes",
  "membro",
  "lider",
  "comunidade",
  "relatorios",
  "avisos",
  "configuracoes",
  "continuidade",
  "pessoas",
  "solicitacoes",
  "conta",
  "mensagens",
]);

export default async function PilotPanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionState();
  if (!session.user) redirect(`/login?motivo=${session.reason}`);
  if (!session.user.ativo) redirect("/acesso-negado");
  const tenant = await getActiveTenantContext(session.user);
  if (!tenant.context) redirect("/sem-comunidade");
  const query = await searchParams;
  const requestedView = String(query.view || "inicio");
  if (requestedView === "visitantes") {
    const next = new URLSearchParams();
    for (const [key,value] of Object.entries(query)) if (key !== "view" && typeof value === "string") next.set(key,value);
    redirect('/painel/visitantes' + (next.size ? '?' + next.toString() : ''));
  }
  const initialView = VALID_VIEWS.has(requestedView) ? requestedView : "inicio";
  const db = getD1();
  const [feed, features, parkingEnabled, communityTheme, promocao, introducao] =
    await Promise.all([
      // Other workspaces do not render the feed. CommunityHome fetches it on
      // mount when the user later navigates back to the overview.
      initialView === "inicio"
        ? getPilotFeed(tenant.context.comunidadeId, session.user.id, tenant.context.permissions.includes("feed.moderate"), session.user.system_owner === true)
        : Promise.resolve([]),
      getPilotFeatureState(tenant.context.comunidadeId),
      getParkingModuleState(tenant.context.comunidadeId),
      getCommunityTheme(tenant.context.comunidadeId),
      getPendingPromotionNotice(
        db,
        tenant.context.comunidadeId,
        session.user.id,
      ),
      getIntroductionState(db, session.user.id, tenant.context.comunidadeId),
    ]);
  return (
    <>
      <PilotDashboard
        active={tenant.context}
        memberships={tenant.memberships}
        feed={feed}
        features={features}
        parkingEnabled={parkingEnabled}
        userName={session.user.nome}
        userEmail={session.user.email}
        userPhotoUrl={session.user.foto_perfil || ""}
        systemOwner={Boolean(session.user.system_owner)}
        initialView={initialView}
        communityTheme={communityTheme}
      />
      <RecepcaoAvisos
        promocao={promocao}
        introducao={introducao}
        communityName={tenant.context.comunidadeNome}
        userName={session.user.nome}
      />
    </>
  );
}
