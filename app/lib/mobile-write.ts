import { getD1 } from '../../db';
import { visitorDriveConfig } from './visitor-drive-store';
import { getCurrentSessionTokenHash } from './local-auth';
import { requireTenantPermission } from './tenant';
import { privateHash, secureToken, rateLimit } from './access-security';

export const WRITE_TABLES = [
  `CREATE TABLE IF NOT EXISTS mobile_write_grants (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    comunidade_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL, session_hash TEXT NOT NULL,
    token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
    PRIMARY KEY(usuario_id,comunidade_id,device_id))`,
  `CREATE TABLE IF NOT EXISTS mobile_visitor_receipts (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    comunidade_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
    operation_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
    result TEXT NOT NULL CHECK(result IN ('PENDING','CONFIRMED','CONFLICT')),
    visitor_id INTEGER, audited INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(usuario_id,comunidade_id,operation_id))`,
];
// Additive bootstrap for already-hosted databases, same DDL as migration 0081.
// Called only after authentication. Never mutates existing visitor records.
export async function ensureMobileWriteTables() {
  const db = getD1();
  await db.batch(WRITE_TABLES.map(sql => db.prepare(sql)));
}
export const mobileReply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private', Vary: 'Cookie, Origin' },
});
export const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

export async function mobileWriteAccess(request: Request) {
  // Offline receipts cannot atomically commit together with an external file.
  if (request.headers.get('origin') !== new URL(request.url).origin
      || request.headers.get('sec-fetch-site') === 'cross-site'
      || request.headers.get('x-vinkulo-client') !== 'android-write-1') {
    return { error: mobileReply({error:'Origem ou versão incompatível.'},403) } as const;
  }
  const access = await requireTenantPermission('visitors.create');
  if(!('error' in access)&&await visitorDriveConfig(access.context.comunidadeId))return {error:mobileReply({error:'Esta comunidade usa o Google Drive. Abra Visitantes online para concluir o cadastro; a fila local não foi confirmada.',code:'DRIVE_ONLINE_REQUIRED'},409)} as const;
  if ('error' in access) return {error:mobileReply({error:'Entre novamente e confira seu acesso.'},access.error.status)} as const;
  if (!access.user.ativo || access.context.temporaryAccess || access.context.communityAccess === 'FEED_ONLY') {
    return {error:mobileReply({error:'Este acesso exige o sistema online.'},403)} as const;
  }
  const sessionHash = await getCurrentSessionTokenHash();
  const session = sessionHash ? await getD1().prepare(
    `SELECT expira_em FROM sessoes WHERE usuario_id=? AND token_hash=? AND datetime(expira_em)>CURRENT_TIMESTAMP`,
  ).bind(access.user.id,sessionHash).first<{expira_em:string}>() : null;
  if (!session) return {error:mobileReply({error:'Sessão expirada.'},401)} as const;
  const raw = session.expira_em;
  const sessionExpires = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : raw.replace(' ','T')+'Z');
  if (!Number.isFinite(sessionExpires) || sessionExpires <= Date.now()) return {error:mobileReply({error:'Sessão expirada.'},401)} as const;
  return {...access,sessionHash:sessionHash!,sessionExpires};
}
export async function mobileBody(request: Request): Promise<Record<string,unknown>|null> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  // Bound streamed bytes, not only a client-supplied Content-Length.
  const reader=request.body?.getReader(); if (!reader) return null;
  const chunks:Uint8Array[]=[]; let size=0;
  try {
    while(true) { const next=await reader.read(); if(next.done) break;
      size+=next.value.length; if(size>4096) {await reader.cancel();return null;} chunks.push(next.value); }
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const body=JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body==='object' && !Array.isArray(body) ? body : null;
  } catch {return null;} finally {reader.releaseLock();}
}

export async function prepareMobileWrite(request: Request) {
  const access=await mobileWriteAccess(request); if('error' in access)return access.error;
  const body=await mobileBody(request);
  const challenge=request.headers.get('x-vinkulo-challenge')||'';
  if(!body || !uuid(body.deviceId) || Object.keys(body).some(k=>k!=='deviceId') || !/^[a-f0-9]{64}$/.test(challenge)) {
    return mobileReply({error:'Preparação inválida.'},400);
  }
  if(!await rateLimit(request,'mobile-write-grant',String(access.user.id),30))return mobileReply({error:'Aguarde antes de preparar novamente.'},429);
  await ensureMobileWriteTables();
  const db=getD1(), token=secureToken(), issuedAt=Date.now(), expiresAt=Math.min(access.sessionExpires,issuedAt+8*3600000);
  await db.batch([
    db.prepare('DELETE FROM mobile_write_grants WHERE expires_at<=?').bind(issuedAt),
    db.prepare(`INSERT INTO mobile_write_grants(usuario_id,comunidade_id,device_id,session_hash,token_hash,expires_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(usuario_id,comunidade_id,device_id) DO UPDATE SET
      session_hash=excluded.session_hash,token_hash=excluded.token_hash,expires_at=excluded.expires_at`)
      .bind(access.user.id,access.context.comunidadeId,body.deviceId,access.sessionHash,await privateHash('mobile-write-token',token),expiresAt),
  ]);
  return mobileReply({protocol:1,challenge,deviceId:body.deviceId,accountId:access.user.id,communityId:access.context.comunidadeId,
    communityName:access.context.comunidadeNome.slice(0,160),issuedAt,expiresAt,capability:'visitor.create',token});
}

export type MobileVisitor = {nomeCompleto:string;telefone:string;email:string;dataEntrada:string};
export function validateMobileVisitor(value: unknown): MobileVisitor|null {
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  const raw=value as Record<string,unknown>,limits={nomeCompleto:120,telefone:30,email:180,dataEntrada:10};
  if(Object.keys(raw).some(k=>!Object.hasOwn(limits,k)))return null;
  for(const [k,max] of Object.entries(limits))if(typeof raw[k]!=='string' || (raw[k] as string).length>max || /[\u0000-\u001f]/.test(raw[k] as string))return null;
  const p={nomeCompleto:(raw.nomeCompleto as string).trim(),telefone:(raw.telefone as string).trim(),email:(raw.email as string).trim().toLowerCase(),dataEntrada:(raw.dataEntrada as string).trim()};
  if(!p.nomeCompleto || (p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) || !/^\d{4}-\d{2}-\d{2}$/.test(p.dataEntrada))return null;
  const date=new Date(p.dataEntrada+'T00:00:00Z');
  if(Number.isNaN(date.getTime()) || date.toISOString().slice(0,10)!==p.dataEntrada)return null;
  return p;
}

export async function createMobileVisitor(request: Request) {
  const access=await mobileWriteAccess(request);if('error' in access)return access.error;
  const body=await mobileBody(request);
  if(!body || !uuid(body.operationId) || !uuid(body.deviceId) || Object.keys(body).some(k=>!['operationId','deviceId','visitor'].includes(k)))return mobileReply({error:'Operação inválida.'},400);
  const payload=validateMobileVisitor(body.visitor);if(!payload)return mobileReply({error:'Revise nome, contato e data de entrada.'},422);
  const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)return mobileReply({error:'Prepare novamente os cadastros offline.'},401);
  await ensureMobileWriteTables();
  const db=getD1(), user=access.user.id, community=access.context.comunidadeId;
  const grant=await db.prepare(`SELECT 1 AS ok FROM mobile_write_grants WHERE usuario_id=? AND comunidade_id=? AND device_id=?
    AND session_hash=? AND token_hash=? AND expires_at>?`).bind(user,community,body.deviceId,access.sessionHash,
      await privateHash('mobile-write-token',token),Date.now()).first();
  if(!grant)return mobileReply({error:'Autorização de envio expirada.'},401);
  if(!await rateLimit(request,'mobile-visitor-write',String(user),200))return mobileReply({error:'Limite temporário. Tente mais tarde.'},429);
  const hash=await privateHash('mobile-visitor-payload',JSON.stringify(payload));
  const key=[user,community,body.operationId];
  const phone=payload.telefone.replace(/\D/g,'');
  // The receipt, visitor and audit share one D1 transaction. A lost response can
  // be replayed with the same UUID; no post-insert network call can lose its ID.
  const result=await db.batch([
    db.prepare(`INSERT OR IGNORE INTO mobile_visitor_receipts(usuario_id,comunidade_id,operation_id,payload_hash,result)
      VALUES(?,?,?,?,'PENDING')`).bind(...key,hash),
    db.prepare(`INSERT INTO visitantes(comunidade_id,nome_completo,telefone,email,data_entrada,batizado,status,criado_por,ativo,escopo_confirmado)
      SELECT ?,?,?,?,?,'NAO_INFORMADO','NOVO',?,1,1
      WHERE EXISTS(SELECT 1 FROM mobile_visitor_receipts WHERE usuario_id=? AND comunidade_id=? AND operation_id=? AND payload_hash=? AND result='PENDING')
      AND NOT EXISTS(SELECT 1 FROM visitantes WHERE comunidade_id=? AND escopo_confirmado=1 AND (
        lower(trim(nome_completo))=lower(?) OR (?<>'' AND lower(trim(COALESCE(email,'')))=?) OR
        (?<>'' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telefone,''),'(',''),')',''),'-',''),' ',''),'+',''),'.','')=?)))`)
      .bind(community,payload.nomeCompleto,payload.telefone||null,payload.email||null,payload.dataEntrada,access.user.email,...key,hash,
        community,payload.nomeCompleto,payload.email,payload.email,phone,phone),
    db.prepare(`UPDATE mobile_visitor_receipts SET visitor_id=CASE WHEN changes()=1 THEN last_insert_rowid() ELSE NULL END,
      result=CASE WHEN changes()=1 THEN 'CONFIRMED' ELSE 'CONFLICT' END
      WHERE usuario_id=? AND comunidade_id=? AND operation_id=? AND payload_hash=? AND result='PENDING'`).bind(...key,hash),
    db.prepare(`INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado,metadados)
      SELECT comunidade_id,usuario_id,'VISITANTE_MOBILE_CRIADO','SUCESSO',json_object('visitanteId',visitor_id,'operationId',operation_id)
      FROM mobile_visitor_receipts WHERE usuario_id=? AND comunidade_id=? AND operation_id=? AND payload_hash=? AND result='CONFIRMED' AND audited=0`).bind(...key,hash),
    db.prepare(`UPDATE mobile_visitor_receipts SET audited=1 WHERE usuario_id=? AND comunidade_id=? AND operation_id=? AND payload_hash=?`).bind(...key,hash),
    db.prepare(`SELECT payload_hash,result,visitor_id FROM mobile_visitor_receipts WHERE usuario_id=? AND comunidade_id=? AND operation_id=?`).bind(...key),
  ]);
  const receipt=result[5].results?.[0] as {payload_hash:string;result:string;visitor_id:number|null}|undefined;
  if(!receipt)throw new Error('Missing mobile receipt');
  if(receipt.payload_hash!==hash)return mobileReply({error:'Este identificador já foi usado com outros dados.',code:'OPERATION_MISMATCH'},409);
  if(receipt.result==='CONFLICT')return mobileReply({operationId:body.operationId,result:'CONFLICT',error:'Há uma ficha semelhante. Confira os visitantes no sistema online.'},409);
  return mobileReply({operationId:body.operationId,result:'CONFIRMED',visitorId:receipt.visitor_id});
}
