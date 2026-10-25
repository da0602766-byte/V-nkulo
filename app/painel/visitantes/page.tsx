import { redirect } from "next/navigation";
import { getSessionState } from "../../lib/local-auth";
import { getActiveTenantContext } from "../../lib/tenant";
import VisitorApp from "../../components/visitors/VisitorApp";
import VisitorCommunityEntry from "../../components/visitors/VisitorCommunityEntry";
import PersonalVisitorApp from '../../components/visitors/PersonalVisitorApp';
import {getRuntimeEnv} from '../../../db/runtime-env';

export const dynamic = "force-dynamic";
export const metadata = { title:"Visitantes | Vínkulo" };

export default async function VisitorsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams;
  // The initial unauthenticated render may receive empty searchParams in vinext.
  // Preserve the notification destination from the request-scoped URL as well.
  const requestUrl=getRuntimeEnv().requestUrl;
  const requested=Number((requestUrl?new URL(requestUrl).searchParams.get('comunidade'):null)||query.comunidade||0);
  const list=(requestUrl?new URL(requestUrl).searchParams.get('lista'):null)||query.lista;
  const section=(requestUrl?new URL(requestUrl).searchParams.get('section'):null)||query.section;
  const returnTo='/painel/visitantes'+(requested>0?`?section=compartilhar&comunidade=${requested}`:list==='pessoal'?'?lista=pessoal':list==='compartilhada'?'?lista=compartilhada':'');
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
  const manager=tenant.context.isOwner||tenant.context.isCommunityOwner||['PASTOR','ADMIN_COMUNIDADE'].includes(tenant.context.papel);
  const wantsShared=requested>0||list==='compartilhada'||section==='compartilhar';
  if(tenant.context.visitorPersonalAccess&&(list==='pessoal'||(!manager&&!wantsShared)))return <PersonalVisitorApp
    key={`${session.user.id}:${tenant.context.comunidadeId}`} userId={session.user.id} communityId={tenant.context.comunidadeId}
    userName={session.user.nome} communityName={tenant.context.comunidadeNome} canOpenShared={tenant.context.permissions.includes('visitors.view')}/>;
  if(tenant.context.visitorPersonalAccess&&!tenant.context.permissions.includes('visitors.view'))return <main className="pilot-state-page"><h1>Lista compartilhada indisponível</h1><p>A permissão da página dá acesso aos seus próprios cadastros. Para abrir esta lista, peça ao responsável para compartilhá-la com você.</p><a href="/painel/visitantes?lista=pessoal">Abrir minha lista pessoal</a></main>;
  if (!tenant.context.permissions.includes("visitors.view")) return <main className="pilot-state-page"><h1>Acesso a Visitantes indisponível</h1><p>O compartilhamento pode ter sido removido. Peça ao administrador para conferir seu acesso e a disponibilidade de Visitantes nesta comunidade.</p><a href="/painel">Voltar ao painel</a></main>;
  return <VisitorApp key={tenant.context.comunidadeId} communityName={tenant.context.comunidadeNome}
    userName={session.user.nome} permissions={tenant.context.permissions} isOwner={tenant.context.isOwner} personalListLink={tenant.context.visitorPersonalAccess} />;
}
