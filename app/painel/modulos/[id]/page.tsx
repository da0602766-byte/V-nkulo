import {redirect} from "next/navigation";
import {getSessionUser} from "../../../lib/local-auth";
import {getActiveTenantContext} from "../../../lib/tenant";
import {readLabModule} from "../../../lib/lab-module-storage";
import {canUseModule} from "../../../lib/lab-modules";
import LabModuleRuntime from "../../../components/LabModuleRuntime";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params,user=await getSessionUser();if(!user?.ativo)redirect('/login');
 const {context}=await getActiveTenantContext(user),module=await readLabModule(id);
 if(!context||!module?.published||module.archived||!canUseModule(module.published.definition,context))redirect('/acesso-negado');
 return <LabModuleRuntime key={`${id}-${context.comunidadeId}`} id={id}/>;
}
