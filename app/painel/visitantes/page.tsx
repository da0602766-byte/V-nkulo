import { redirect } from "next/navigation";
import { getSessionState } from "../../lib/local-auth";
import { getActiveTenantContext } from "../../lib/tenant";
import VisitorApp from "../../components/visitors/VisitorApp";
import VisitorCommunityEntry from "../../components/visitors/VisitorCommunityEntry";
import {getRuntimeEnv} from '../../../db/runtime-env';

export const dynamic = "force-dynamic";
export const metadata = { title:"Visitantes | Vínkulo" };

export default async function VisitorsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams;
  // The initial unauthenticated render may receive empty searchParams in vinext.
  // Preserve the notification destination from the request-scoped URL as well.
  const requestUrl=getRuntimeEnv().requestUrl;
  const requested=Number((requestUrl?new URL(requestUrl).searchParams.get('comunidade'):null)||query.comunidade||0);
  const returnTo='/painel/visitantes'+(requested>0?`?section=compartilhar&comunidade=${requested}`:'');
  const session = await getSessionState();
  if (!session.user) redirect(`/login?motivo=${session.reason}&returnTo=${encodeURIComponent(returnTo)}`);
  if (!session.user.ativo) redirect("/acesso-negado");
  const tenant = await getActiveTenantContext(session.user);
  if(requested&&requested!==tenant.context?.comunidadeId){
    const selected=tenant.memberships.find(m=>m.comunidadeId===requested&&m.status==='ATIVO');
    if(!selected)return <main className="pilot-state-page"><h1>Este compartilhamento não está disponível</h1><p>Confira com o administrador se seu vínculo com a comunidade continua ativo.</p><a href="/painel">Voltar ao painel</a></main>;
    return <VisitorCommunityEntry communityId={selected.comunidadeId} communityName={selected.comunidadeNome}/>;
  }
  if (!tenant.context) redirect("/sem-comunidade");
  if (!tenant.context.permissions.includes("visitors.view")) return <main className="pilot-state-page"><h1>Acesso a Visitantes indisponível</h1><p>O compartilhamento pode ter sido removido. Peça ao administrador para conferir seu acesso e a disponibilidade de Visitantes nesta comunidade.</p><a href="/painel">Voltar ao painel</a></main>;
  return <VisitorApp key={tenant.context.comunidadeId} communityName={tenant.context.comunidadeNome}
    userName={session.user.nome} permissions={tenant.context.permissions} isOwner={tenant.context.isOwner} />;
}
