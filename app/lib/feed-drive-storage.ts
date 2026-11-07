import {getRuntimeEnv} from '../../db/runtime-env';
import {getDriveAccessToken,getGoogleConnection} from './google-integration';
import {driveAccess,ownerToken,visitorDriveConfig,type VisitorDriveConfig} from './visitor-drive-store';
import type {TenantContext} from './tenant';

export type FeedDriveCheck={id:'own'|'shared-visitors';own:boolean;status:'FULL'|'AVAILABLE'|'UNKNOWN'};
type Source={id:FeedDriveCheck['id'];own:boolean;ownerId:number;config?:VisitorDriveConfig};
const connected=(c:Awaited<ReturnType<typeof getGoogleConnection>>)=>Boolean(c?.drive_enabled&&!c.revoked_at&&c.refresh_token_ciphertext&&c.refresh_token_iv);

async function sources(context:TenantContext):Promise<Source[]> {
  if(context.temporaryAccess)return [];
  const db=getRuntimeEnv().DB;
  if(!db)return [];
  const member=await db.prepare(`SELECT u.id FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id=u.id
    JOIN comunidades c ON c.id=uc.comunidade_id WHERE u.id=? AND u.ativo=1 AND uc.id=? AND uc.comunidade_id=?
    AND uc.status='ATIVO' AND c.status='ATIVA'`).bind(context.userId,context.membershipId,context.comunidadeId).first();
  if(!member)return [];
  const result:Source[]=[];
  if(connected(await getGoogleConnection(context.userId)))result.push({id:'own',own:true,ownerId:context.userId});
  // A management role alone never grants visibility into somebody else's quota.
  if(context.communityAccess==='FEED_ONLY'||!context.permissions.includes('visitors.view'))return result;
  const config=await visitorDriveConfig(context.comunidadeId);
  if(config?.estado==='ACTIVE'&&config.usuario_id!==context.userId&&await driveAccess(config,context.userId)
    &&connected(await getGoogleConnection(config.usuario_id))) {
    result.push({id:'shared-visitors',own:false,ownerId:config.usuario_id,config});
  }
  return result;
}

export function quotaStatus(value:unknown):FeedDriveCheck['status'] {
  if(!value||typeof value!=='object')return 'UNKNOWN';
  const quota=value as {usage?:unknown;limit?:unknown};
  const bytes=(v:unknown)=>typeof v==='string'&&/^\d{1,24}$/.test(v)?BigInt(v):null;
  const used=bytes(quota.usage);
  if(used===null)return 'UNKNOWN';
  // Google omits limit for accounts with unlimited storage.
  if(quota.limit===undefined)return 'AVAILABLE';
  const limit=bytes(quota.limit);
  return limit===null?'UNKNOWN':used>=limit?'FULL':'AVAILABLE';
}

export async function feedDriveChecks(context:TenantContext):Promise<FeedDriveCheck[]> {
  const allowed=await sources(context);
  const checks=await Promise.all(allowed.map(async source=>{
    let status:FeedDriveCheck['status']='UNKNOWN';
    try {
      const token=source.config?await ownerToken(source.config):await getDriveAccessToken(source.ownerId);
      const response=await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota(limit,usage)',{
        headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(8000),
      });
      if(response.ok){const body=await response.json() as {storageQuota?:unknown};status=quotaStatus(body.storageQuota);}
    } catch {/* Unavailability is not proof of a full or recovered account. */}
    return {source,status};
  }));
  // Recheck grants, active membership, ownership and connection after remote I/O.
  // A share revoked during the Google request must not return a private alert.
  const current=await sources(context);
  return checks.filter(({source})=>current.some(s=>s.id===source.id&&s.ownerId===source.ownerId))
    .map(({source,status})=>({id:source.id,own:source.own,status}));
}
