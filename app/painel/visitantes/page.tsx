import { redirect } from "next/navigation";
import { getSessionState } from "../../lib/local-auth";
import { getActiveTenantContext } from "../../lib/tenant";
import VisitorApp from "../../components/visitors/VisitorApp";

export const dynamic = "force-dynamic";
export const metadata = { title:"Visitantes | Vínkulo" };

export default async function VisitorsPage() {
  const session = await getSessionState();
  if (!session.user) redirect(`/login?motivo=${session.reason}&returnTo=${encodeURIComponent('/painel/visitantes')}`);
  if (!session.user.ativo) redirect("/acesso-negado");
  const tenant = await getActiveTenantContext(session.user);
  if (!tenant.context) redirect("/sem-comunidade");
  if (!tenant.context.permissions.includes("visitors.view")) redirect("/acesso-negado");
  return <VisitorApp key={tenant.context.comunidadeId} communityName={tenant.context.comunidadeNome}
    userName={session.user.nome} permissions={tenant.context.permissions} isOwner={tenant.context.isOwner} />;
}
