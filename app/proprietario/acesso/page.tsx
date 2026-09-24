import { redirect } from 'next/navigation';
import AccessPortal from '../../components/AccessPortal';
import { getSessionUser } from '../../lib/local-auth';
export const dynamic='force-dynamic';
export const metadata={title:'Acesso do Proprietário | VÍNKULO',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{erro?:string}>}) {
  if((await getSessionUser())?.system_owner) redirect('/proprietario');
  return <AccessPortal owner initialMessage={(await searchParams).erro||''}/>;
}
