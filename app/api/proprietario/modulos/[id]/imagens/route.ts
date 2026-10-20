import {getRuntimeEnv} from '../../../../../../db/runtime-env';
import {getSessionUser} from '../../../../../lib/local-auth';
import {readLabModule} from '../../../../../lib/lab-module-storage';

const MAX=8*1024*1024;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await getSessionUser();
 if(!user?.ativo||!user.system_owner)return Response.json({error:'Acesso exclusivo do proprietário.'},{status:403});
 const {id}=await params;if(!await readLabModule(id))return Response.json({error:'Aba não encontrada.'},{status:404});
 const bucket=getRuntimeEnv().BUCKET;if(!bucket)return Response.json({error:'Armazenamento de imagens indisponível. Tente novamente mais tarde.'},{status:503});
 if(Number(request.headers.get('content-length'))>MAX+65536)return Response.json({error:'Envie uma foto de até 8 MB.'},{status:413});
 try{
  const type=request.headers.get('content-type')||'';
  if(!['image/jpeg','image/png','image/webp'].includes(type))return Response.json({error:'Use JPG, PNG ou WebP.'},{status:415});
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(!bytes.length||bytes.length>MAX)return Response.json({error:'Selecione uma foto de até 8 MB.'},{status:413});
  const valid=type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/png'?[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n):String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!valid)return Response.json({error:'O conteúdo do arquivo não é uma imagem válida.'},{status:415});
  const assetId=crypto.randomUUID();
  await bucket.put(`lab-images/${assetId}`,bytes.buffer,{httpMetadata:{contentType:type,cacheControl:'private, no-store'},customMetadata:{moduleId:id,uploadedBy:String(user.id)}});
  return Response.json({assetId},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Não foi possível enviar a foto. Tente novamente.'},{status:400});}
}
