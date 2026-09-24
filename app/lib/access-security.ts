import { getD1 } from '../../db';
import { getRuntimeEnv } from '../../db/runtime-env';
import { getSessionUser } from './local-auth';

// Keyed lookup: the 11-digit CPF space must not be searchable with an unkeyed hash.
export async function privateHash(purpose: string, value: string) {
  const secret = getRuntimeEnv().AUTH_SECRET;
  if (!secret) throw new Error('Chave de autenticação indisponível.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${purpose}:v1:${value}`));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}

export function secureToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
}

export async function rateLimit(request: Request, purpose: string, identifier: string, max = 10) {
  const db = getD1();
  const now = Math.floor(Date.now() / 1000);
  // Only Cloudflare's trusted client address; never accept a client-controlled X-Forwarded-For.
  const network = request.headers.get('cf-connecting-ip') || 'local';
  const keys = await Promise.all([privateHash('rate', `${purpose}:ip:${network}`), privateHash('rate', `${purpose}:id:${identifier}`)]);
  const results = await db.batch(keys.map(chave => db.prepare(
    `INSERT INTO controlled_auth_rate_limits(chave,tentativas,expira_em) VALUES (?,1,?)
     ON CONFLICT(chave) DO UPDATE SET tentativas = CASE WHEN expira_em <= ? THEN 1 ELSE tentativas + 1 END,
     expira_em = CASE WHEN expira_em <= ? THEN excluded.expira_em ELSE expira_em END RETURNING tentativas`,
  ).bind(chave, now + 900, now, now)));
  await db.prepare('DELETE FROM controlled_auth_rate_limits WHERE expira_em < ?').bind(now - 86400).run();
  return Number((results[0].results?.[0] as {tentativas:number}|undefined)?.tentativas ?? Infinity) <= max * 10
    && Number((results[1].results?.[0] as {tentativas:number}|undefined)?.tentativas ?? Infinity) <= max;
}

export async function requireGlobalOwner() {
  const user = await getSessionUser();
  if (!user?.ativo || !user.system_owner) return { error: Response.json({error:'Acesso administrativo não autorizado.'},{status:user ? 403 : 401}) } as const;
  return { user } as const;
}

export async function auditAccess(event: string, userId: number | null, metadata: Record<string, unknown> = {}, communityId: number | null = null, result = 'SUCESSO') {
  await getD1().prepare(`INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado,metadados) VALUES (?,?,?,?,?)`)
    .bind(communityId,userId,event,result,JSON.stringify(metadata)).run();
}
