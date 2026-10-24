import {getRuntimeEnv} from '../../../../../../db/runtime-env';
import {getSessionUser} from '../../../../../lib/local-auth';
import {getActiveTenantContext} from '../../../../../lib/tenant';
import {readLabModule} from '../../../../../lib/lab-module-storage';
import {canUseModule} from '../../../../../lib/lab-modules';
import {assetIdValid,layoutHasAsset} from '../../../../../lib/lab-layout';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;assetId:string}>}){
 const {id,assetId}=await params,user=await getSessionUser();
 if(!user?.ativo)return new Response('Faça login.',{status:401});
 if(!assetIdValid(assetId))return new Response('Imagem inválida.',{status:404});
 const labModule=await readLabModule(id);if(!labModule)return new Response('Aba não encontrada.',{status:404});
 if(!user.system_owner){const {context}=await getActiveTenantContext(user);if(!context||labModule.archived||!labModule.published||!canUseModule(labModule.published.definition,context)||!layoutHasAsset(labModule.published.definition,assetId))return new Response('Imagem indisponível.',{status:403});}
 const object=await getRuntimeEnv().BUCKET?.get(`lab-images/${assetId}`);
 if(!object)return new Response('Imagem não encontrada.',{status:404});
 return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
