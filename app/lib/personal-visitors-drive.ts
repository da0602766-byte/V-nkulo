import {createDriveFolder,getDriveAccessToken,uploadDriveFile} from './google-integration';
import {assertPrivateDrive,platformDB,VisitorDriveError} from './visitor-drive-store';
import {archiveHash} from './visitor-drive-format';
import {PERSONAL_MAX_BYTES,validatePersonalVisitors,type PersonalVisitors} from './personal-visitors';
export type PersonalStorage={usuario_id:number;comunidade_id:number;provider:'LOCAL'|'GOOGLE_DRIVE';revisao:number;pasta_id:string|null;arquivo_id:string|null;hash:string|null};
export function personalStorage(userId:number,communityId:number){return platformDB().prepare('SELECT * FROM visitante_pessoal_storage WHERE usuario_id=? AND comunidade_id=?').bind(userId,communityId).first<PersonalStorage>();}
async function privateFile(token:string,id:string){
  try{await assertPrivateDrive(token,id);}catch(e){if(e instanceof VisitorDriveError&&e.status===403)throw new VisitorDriveError('Mantenha a pasta e os arquivos da sua lista pessoal privados no Google Drive.',403);throw e;}
}
export async function personalToken(userId:number) {
  try{return await getDriveAccessToken(userId);}catch{throw new VisitorDriveError('Reconecte seu Google Drive para continuar. Sua lista anterior foi preservada.',503);}
}
export async function boundedText(body:ReadableStream<Uint8Array>|null){
  if(!body)throw new VisitorDriveError('Arquivo vazio.',400);
  const reader=body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>PERSONAL_MAX_BYTES+1024){await reader.cancel();throw new VisitorDriveError('O arquivo excede 4 MB.',413);}chunks.push(next.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);
}
export async function readPersonalDrive(c:PersonalStorage,token:string){
  if(!c.pasta_id||!c.arquivo_id||!c.hash)throw new VisitorDriveError('Não foi possível localizar sua lista no Drive.',503);
  await Promise.all([privateFile(token,c.pasta_id),privateFile(token,c.arquivo_id)]);
  const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(c.arquivo_id)}?alt=media`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new VisitorDriveError('Sua lista não está acessível no Drive. Confira a conexão e a lixeira do Drive.',503);
  const text=await boundedText(r.body);if(await archiveHash(text)!==c.hash)throw new VisitorDriveError('O arquivo foi alterado fora do Vínkulo. A versão atual não foi substituída.');
  const doc:unknown=JSON.parse(text);validatePersonalVisitors(doc,c.usuario_id,c.comunidade_id);
  if(doc.revision!==c.revisao)throw new VisitorDriveError('A versão do arquivo não corresponde à sua lista.');return doc;
}
export async function writePersonalDrive(c:PersonalStorage,doc:PersonalVisitors,token:string){
  validatePersonalVisitors(doc,c.usuario_id,c.comunidade_id);
  const folder=c.pasta_id||await createDriveFolder(token,'Vínkulo — Meus visitantes');
  await privateFile(token,folder);
  const text=JSON.stringify(doc),file=await uploadDriveFile(token,{name:`Meus visitantes — versão ${doc.revision}.json`,type:'application/json',bytes:new TextEncoder().encode(text),parentId:folder,properties:{personalVisitorOwner:String(c.usuario_id),personalVisitorCommunity:String(c.comunidade_id)}});
  const candidate={...c,pasta_id:folder,arquivo_id:file.id,hash:await archiveHash(text),revisao:doc.revision};
  await readPersonalDrive(candidate,token);
  return candidate;
}
