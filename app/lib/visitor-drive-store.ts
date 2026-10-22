import { getRuntimeEnv } from '../../db/runtime-env';
import { getDriveAccessToken, createDriveFolder, uploadDriveFile, encryptDrivePayload, decryptDrivePayload } from './google-integration';
import { archiveHash, validateVisitorArchive, MAX_VISITOR_ARCHIVE_BYTES, type VisitorArchive } from './visitor-drive-format';

export type VisitorDriveConfig = { comunidade_id: number; usuario_id: number; estado: 'LOCKED'|'REVIEW'|'ACTIVE'|'PURGING'; pasta_id: string|null; arquivo_id: string|null; hash: string|null; revisao: number; verificado_em: string|null };
export class VisitorDriveError extends Error { constructor(message: string, public status = 409) { super(message); } }
export function platformDB() { const db = getRuntimeEnv().DB; if (!db) throw new Error('Banco indisponível.'); return db; }
export async function visitorDriveConfig(communityId: number) {
  try{return await platformDB().prepare('SELECT * FROM visitante_drive WHERE comunidade_id=?').bind(communityId).first<VisitorDriveConfig>();}
  catch(e){if(/no such table:\s*(?:main\.)?visitante_drive\b/i.test(String(e)))return null;throw e;}
}
export async function driveAccess(config: VisitorDriveConfig, userId: number) {
  if (config.usuario_id === userId) return 'EDIT';
  const grant = await platformDB().prepare('SELECT papel FROM visitante_drive_acessos WHERE comunidade_id=? AND usuario_id=?').bind(config.comunidade_id, userId).first<{papel:'READ'|'EDIT'}>();
  return grant?.papel || null;
}
export async function ownerToken(config: VisitorDriveConfig) {
  const owner = await platformDB().prepare(`SELECT u.id FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id=u.id
    JOIN comunidades c ON c.id=uc.comunidade_id WHERE u.id=? AND u.ativo=1 AND uc.comunidade_id=? AND uc.status='ATIVO' AND c.status='ATIVA'
    AND (c.proprietario_usuario_id=u.id OR uc.papel IN ('PASTOR','ADMIN_COMUNIDADE','SUPERADMIN'))`).bind(config.usuario_id, config.comunidade_id).first();
  if (!owner) throw new VisitorDriveError('A conta responsável pelo Drive perdeu o vínculo de gestão. Reative o vínculo antes de continuar.',403);
  try{return await getDriveAccessToken(config.usuario_id);}catch{throw new VisitorDriveError('Reconecte a conta Google responsável pelo arquivo em Armazenamento e acessos.',503);}
}
async function google(token: string, path: string) {
  const r = await fetch('https://www.googleapis.com/drive/v3/'+path, {headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
  if (!r.ok) throw new VisitorDriveError(r.status === 404 ? 'O arquivo no Drive não foi encontrado. Restaure-o da lixeira ou use um backup.' : 'Não foi possível acessar o Drive. Confira a conexão e a autorização da conta responsável.',503);
  return r;
}
export async function assertPrivateDrive(token: string, id: string) {
  const r = await google(token,`files/${encodeURIComponent(id)}?fields=id,trashed,permissions(type,role),capabilities(canEdit)`);
  const f = await r.json() as {trashed?:boolean;permissions?:{type:string;role:string}[];capabilities?:{canEdit?:boolean}};
  if (f.trashed || !f.capabilities?.canEdit || !f.permissions?.length || f.permissions.some(p=>p.type!=='user'||p.role!=='owner')) throw new VisitorDriveError('Mantenha a pasta e o arquivo técnico privados no Drive. Compartilhe os cadastros em “Acessos” no Vínkulo.',403);
}
export async function readArchive(config: VisitorDriveConfig, token: string) {
  if (!config.arquivo_id || !config.hash || !config.pasta_id) throw new VisitorDriveError('Conclua a preparação do Drive.');
  await Promise.all([assertPrivateDrive(token,config.arquivo_id), assertPrivateDrive(token,config.pasta_id)]);
  const r = await google(token,`files/${encodeURIComponent(config.arquivo_id)}?alt=media`);
  const reader=r.body?.getReader(); if(!reader)throw new VisitorDriveError('Arquivo vazio no Drive.');
  const chunks:Uint8Array[]=[];let size=0;
  try { while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>MAX_VISITOR_ARCHIVE_BYTES){await reader.cancel();throw new VisitorDriveError('O arquivo excede o limite de 4 MB.');}chunks.push(next.value);} } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const text=new TextDecoder().decode(bytes);
  if(await archiveHash(text)!==config.hash)throw new VisitorDriveError('O arquivo foi alterado fora do Vínkulo ou está incompleto. Restaure um backup verificado.');
  const archive:unknown=JSON.parse(text);validateVisitorArchive(archive,config.comunidade_id);return archive;
}
export async function writeArchive(config: VisitorDriveConfig, token: string, archive: VisitorArchive) {
  validateVisitorArchive(archive,config.comunidade_id);
  const text=JSON.stringify(archive),bytes=new TextEncoder().encode(text);
  if(bytes.length>MAX_VISITOR_ARCHIVE_BYTES)throw new VisitorDriveError('O arquivo excede 4 MB. Nenhuma alteração foi gravada.');
  if(!config.pasta_id)throw new VisitorDriveError('Pasta do Drive não configurada.');
  await assertPrivateDrive(token,config.pasta_id);
  let file:{id:string};
  try{file=await uploadDriveFile(token,{name:`Visitantes — versão ${config.revisao+1}.json`,type:'application/json',bytes,parentId:config.pasta_id,properties:{visitorCommunity:String(config.comunidade_id)}});}catch{throw new VisitorDriveError('O Drive não confirmou o envio. A versão anterior foi preservada; confira a conexão e tente novamente.',503);}
  const candidate={...config,arquivo_id:file.id,hash:await archiveHash(text)};
  await readArchive(candidate,token); // Re-read remote bytes, not merely the upload response.
  return candidate;
}
export async function newVisitorFolder(token: string) {return createDriveFolder(token,'Vínkulo — Visitantes (acesso pelo aplicativo)');}
export async function sealNotes(notes: unknown) {return Buffer.from(await encryptDrivePayload(notes)).toString('base64');}
export async function openNotes(value: string) {return value ? decryptDrivePayload<Record<string,unknown>[]>(new Uint8Array(Buffer.from(value,'base64'))) : [];}
