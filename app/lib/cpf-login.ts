import { getD1 } from '../../db';
import { attachSessionCookie, createFirstAccessToken, createSession, isSystemOwnerAccount, verifyPassword } from './local-auth';
import { normalizeCpf } from './cpf';
import { privateHash, rateLimit, auditAccess } from './access-security';
import { safeRelativeReturnPath } from './safe-return-path';

export async function loginWithCpf(request: Request, owner: boolean) {
  const form = /application\/x-www-form-urlencoded|multipart\/form-data/.test(request.headers.get('content-type') || '');
  const payload = await (form ? request.formData().then(x => Object.fromEntries(x.entries())) : request.json()).catch(() => null);
  const fail = (status = 401, message = 'CPF ou senha inválidos. Tente novamente ou recupere seu acesso.') => form
    ? new Response(null, {status:303, headers:{Location: new URL(`${owner ? '/proprietario/acesso' : '/login'}?erro=${encodeURIComponent(message)}`,request.url).toString()}})
    : Response.json({error:message},{status});
  const cpf = normalizeCpf(payload?.cpf);
  const senha = String(payload?.senha || '');
  if (!await rateLimit(request, 'login', cpf || 'invalid', 8)) return fail(429,'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
  if (!cpf || !senha || senha.length > 256) return fail();
  const db = getD1();
  const user = await db.prepare(`SELECT u.id,u.email,u.criado_em,u.ativo,u.senha_hash,u.senha_salt,u.bloqueado_ate,
    EXISTS(SELECT 1 FROM redefinicoes_senha r WHERE r.usuario_id=u.id AND r.usado=0 AND r.token_hash LIKE 'first:%') AS primeiro
    FROM identidades_cpf i JOIN usuarios u ON u.id=i.usuario_id WHERE i.cpf_hash=? LIMIT 1`)
    .bind(await privateHash('cpf',cpf)).first<{id:number;email:string;criado_em:string;ativo:number;senha_hash:string|null;senha_salt:string|null;bloqueado_ate:string|null;primeiro:number}>();
  const valid = await verifyPassword(senha, user?.senha_salt || '0'.repeat(32), user?.senha_hash || '0'.repeat(64));
  if (!user?.ativo || !valid || (user.bloqueado_ate && Date.parse(user.bloqueado_ate)>Date.now()) || (owner && !isSystemOwnerAccount(user))) {
    await auditAccess(owner ? 'LOGIN_PROPRIETARIO' : 'LOGIN_CPF', null, {}, null, 'NEGADO');
    return fail();
  }
  await db.prepare('UPDATE usuarios SET tentativas_login=0,bloqueado_ate=NULL WHERE id=?').bind(user.id).run();
  let redirect = owner ? '/proprietario' : safeRelativeReturnPath(payload.returnTo, '/painel');
  if (user.primeiro) {
    const first = await createFirstAccessToken(user.id);
    redirect = `/primeiro-acesso?token=${encodeURIComponent(first.token)}&login=${encodeURIComponent(user.email)}`;
    return form ? new Response(null,{status:303,headers:{Location:new URL(redirect,request.url).toString()}}) : Response.json({ok:true,redirect});
  }
  const session = await createSession(user.id, owner ? 'owner' : 'member');
  await auditAccess(owner ? 'LOGIN_PROPRIETARIO' : 'LOGIN_CPF', user.id);
  return attachSessionCookie(form ? new Response(null,{status:303,headers:{Location:new URL(redirect,request.url).toString(),'Cache-Control':'no-store'}}) : Response.json({ok:true,redirect}),session);
}
