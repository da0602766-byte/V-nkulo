import {getSessionUser} from "../../lib/local-auth";
import {getActiveTenantContext} from "../../lib/tenant";
import {listLabModules} from "../../lib/lab-module-storage";
import {canUseModule} from "../../lib/lab-modules";
export async function GET(){
  const user=await getSessionUser();if(!user?.ativo)return Response.json({error:"Faça login."},{status:401});
  const {context}=await getActiveTenantContext(user);if(!context)return Response.json({modules:[]});
  const modules=(await listLabModules()).filter(m=>!m.archived&&m.published&&canUseModule(m.published.definition,context)).map(m=>({id:m.id,name:m.published!.definition.name}));
  return Response.json({modules},{headers:{"Cache-Control":"no-store"}});
}
