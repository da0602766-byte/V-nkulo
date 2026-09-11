import { redirect } from "next/navigation";
import OwnerWorkspace from "../components/OwnerWorkspace";
import { getPilotFeatureState } from "../lib/pilot-data";
import { getSessionState } from "../lib/local-auth";
import { getPlatformBranding } from "../lib/platform-branding";
import { getActiveTenantContext } from "../lib/tenant";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const session = await getSessionState();
  if (!session.user) redirect(`/login?motivo=${session.reason}`);
  if (!session.user.ativo || !session.user.system_owner) redirect("/acesso-negado");

  const tenant = await getActiveTenantContext(session.user);
  const currentCommunityId = tenant.context?.comunidadeId || 0;
  const [features, branding] = await Promise.all([
    getPilotFeatureState(currentCommunityId),
    getPlatformBranding(),
  ]);

  return (
    <OwnerWorkspace
      ownerName={session.user.nome}
      ownerPhoto={session.user.foto_perfil || ""}
      brandName={branding.siteName}
      brandLogo={branding.logoUrl}
      features={features}
      currentCommunityId={currentCommunityId}
    />
  );
}
