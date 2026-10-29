import { getD1 } from '../../db';
import { visitorDriveConfig } from './visitor-drive-store';
import { getCurrentSessionTokenHash } from './local-auth';
import { requireTenantPermission } from './tenant';
import { privateHash, secureToken, rateLimit } from './access-security';
import { mobileBody, mobileReply, uuid } from './mobile-write';
import { isMobileModule, MobileModule, modulePayload } from './mobile-module-contract';
import { ensureModuleTables } from './mobile-module-storage';
import { moduleSnapshot } from './mobile-module-snapshot';
import { commitModuleOperation } from './mobile-module-operations';

const READ = {requests:'dashboard.view',notes:'dashboard.view',followups:'followups.view',checklists:'ministries.view',cells:'cells.view',parking:'parking.reserve'};
const WRITE = {...READ,followups:'followups.manage',checklists:'schedules.view',parking:'parking.edit'};
export async function moduleAccess(request: Request, module: MobileModule, write = false) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('x-vinkulo-client') !== 'android-modules-1') return {error:mobileReply({error:'Origem incompatível.'},403)} as const;
  const access = await requireTenantPermission((write ? WRITE : READ)[module], module === 'requests' ? 'requests' : undefined);
  if ('error' in access) return {error:mobileReply({error:'Entre novamente e confira sua permissão.'},access.error.status)} as const;
  if(['notes','followups'].includes(module)&&await visitorDriveConfig(access.context.comunidadeId))return {error:mobileReply({error:'Abra Visitantes online para usar os dados no Drive. Os rascunhos locais ainda não foram enviados.',code:'DRIVE_ONLINE_REQUIRED'},409)} as const;
  if (!access.user.ativo || access.context.temporaryAccess || access.context.communityAccess === 'FEED_ONLY') return {error:mobileReply({error:'Este acesso exige o sistema online.'},403)} as const;
  const sessionHash = await getCurrentSessionTokenHash();
  const session = sessionHash ? await getD1().prepare('SELECT expira_em FROM sessoes WHERE usuario_id=? AND token_hash=? AND datetime(expira_em)>CURRENT_TIMESTAMP').bind(access.user.id,sessionHash).first<{expira_em:string}>() : null;
  const raw = session?.expira_em || '', sessionExpires = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : raw.replace(' ','T')+'Z');
  if (!session || !Number.isFinite(sessionExpires) || sessionExpires <= Date.now()) return {error:mobileReply({error:'Sessão expirada.'},401)} as const;
  return {...access,sessionHash:sessionHash!,sessionExpires};
}
export type ModuleAccess = Exclude<Awaited<ReturnType<typeof moduleAccess>>, {error:Response}>;

export async function prepareModule(request: Request) {
  const body = await mobileBody(request);
  if (!body || !isMobileModule(body.module) || !uuid(body.deviceId) || Object.keys(body).some(k=>!['module','deviceId'].includes(k))) return mobileReply({error:'Preparação inválida.'},400);
  const kind = body.module, access = await moduleAccess(request,kind); if ('error' in access) return access.error;
  const challenge = request.headers.get('x-vinkulo-challenge') || '';
  if (!/^[a-f0-9]{64}$/.test(challenge)) return mobileReply({error:'Preparação inválida.'},400);
  if (!await rateLimit(request,'mobile-module-prepare',String(access.user.id),60)) return mobileReply({error:'Aguarde antes de tentar novamente.'},429);
  await ensureModuleTables();
  const snapshot = await moduleSnapshot(kind,access);
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > 110000) return mobileReply({error:'Seleção excede o limite local. Use o sistema online.'},422);
  const issuedAt = Date.now(), expiresAt = Math.min(access.sessionExpires,issuedAt+8*3600000), token = secureToken();
  await getD1().batch([
    getD1().prepare('DELETE FROM mobile_module_grants WHERE expires_at<=?').bind(issuedAt),
    getD1().prepare(`INSERT INTO mobile_module_grants(usuario_id,comunidade_id,device_id,module,session_hash,token_hash,expires_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(usuario_id,comunidade_id,device_id,module) DO UPDATE SET
      session_hash=excluded.session_hash,token_hash=excluded.token_hash,expires_at=excluded.expires_at`)
      .bind(access.user.id,access.context.comunidadeId,body.deviceId,kind,access.sessionHash,await privateHash('mobile-module-token',token),expiresAt),
  ]);
  return mobileReply({protocol:1,module:kind,challenge,deviceId:body.deviceId,accountId:access.user.id,communityId:access.context.comunidadeId,communityName:access.context.comunidadeNome.slice(0,160),
    issuedAt,expiresAt,token,canWrite:kind!=='cells' && access.context.permissions.includes(WRITE[kind]),snapshot});
}
export async function writeModule(request: Request) {
  const body = await mobileBody(request);
  if (!body || !isMobileModule(body.module) || !uuid(body.deviceId) || !uuid(body.operationId) || Object.keys(body).some(k=>!['module','deviceId','operationId','payload'].includes(k))) return mobileReply({error:'Operação inválida.'},400);
  const kind = body.module, access = await moduleAccess(request,kind,true); if ('error' in access) return access.error;
  if (kind === 'cells') return mobileReply({error:'Rascunhos de células são locais. Publicação e gestão exigem conexão.'},422);
  const payload = modulePayload(kind,body.payload); if (!payload) return mobileReply({error:'Revise os campos do registro.'},422);
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return mobileReply({error:'Prepare novamente este módulo.'},401);
  await ensureModuleTables();
  const grant = await getD1().prepare(`SELECT 1 FROM mobile_module_grants WHERE usuario_id=? AND comunidade_id=? AND device_id=? AND module=? AND session_hash=? AND token_hash=? AND expires_at>?`)
    .bind(access.user.id,access.context.comunidadeId,body.deviceId,kind,access.sessionHash,await privateHash('mobile-module-token',token),Date.now()).first();
  if (!grant) return mobileReply({error:'Autorização expirada.'},401);
  if (!await rateLimit(request,'mobile-module-write',String(access.user.id),200)) return mobileReply({error:'Limite temporário.'},429);
  return commitModuleOperation(kind,access,body.operationId,payload);
}
