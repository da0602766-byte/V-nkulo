import { AccessShell } from '../../components/AccessPortal';
import ContractingForm from '../../components/ContractingForm';
import { readContractLink,requestPlans } from '../../lib/contracting';
export const dynamic='force-dynamic';
export const metadata={title:'Contratação | VÍNKULO',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){
 const {token}=await params;const row=await readContractLink(token);
 if(!row)return <AccessShell><header className="access-heading"><span className="access-eyebrow">CONTRATAÇÃO</span><h1>Este link não está disponível.</h1><p>O link pode ter expirado, sido revogado ou já utilizado. Solicite um novo link à equipe que entrou em contato.</p></header></AccessShell>;
 return <ContractingForm token={token} plans={await requestPlans(row)} expiresAt={row.expira_em}/>;
}
