import { redirect } from "next/navigation";
import PilotDashboard from "../components/PilotDashboard";
import {
  getParkingModuleState,
  getPilotFeatureState,
  getPilotFeed,
} from "../lib/pilot-data";
import { getSessionState } from "../lib/local-auth";
import { getActiveTenantContext } from "../lib/tenant";
import { getCommunityTheme } from "../lib/community-theme";

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
  "diaconia",
  "estacionamento",
  "redes",
  "membro",
  "lider",
  "pastoral",
  "comunidade",
  "continuidade",
  "pessoas",
  "solicitacoes",
  "conta",
  "mensagens",
]);

export default async function PilotPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await getSessionState();
  if (!session.user) redirect(`/login?motivo=${session.reason}`);
  if (!session.user.ativo) redirect("/acesso-negado");
  const tenant = await getActiveTenantContext(session.user);
  if (!tenant.context) redirect("/sem-comunidade");
  const requestedView = (await searchParams).view || "inicio";
  const initialView = VALID_VIEWS.has(requestedView) ? requestedView : "inicio";
  const [feed, features, parkingEnabled, communityTheme] = await Promise.all([
    getPilotFeed(tenant.context.comunidadeId),
    getPilotFeatureState(tenant.context.comunidadeId),
    getParkingModuleState(tenant.context.comunidadeId),
    getCommunityTheme(tenant.context.comunidadeId),
  ]);
  return (
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
  );
}
