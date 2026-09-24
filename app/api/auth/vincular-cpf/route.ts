import { getD1 } from '../../../../db';
import { normalizeCpf } from '../../../lib/cpf';
import { auditAccess, privateHash, rateLimit } from '../../../lib/access-security';
import { normalizeEmail, verifyPassword } from '../../../lib/local-auth';

// Migration only: cannot create users, replace a bound CPF or issue privileged sessions.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const cpf = normalizeCpf(body?.cpf);
  if (!await rateLimit(request,'bind-cpf',email,5)) return Response.json({error:'Aguarde 15 minutos antes de tentar novamente.'},{status:429});
  if (!cpf) return Response.json({error:'Informe um CPF válido.'},{status:400});
  const db = getD1();
  const user = await db.prepare(`SELECT u.id,u.senha_hash,u.senha_salt FROM usuarios u
    WHERE lower(u.email)=? AND u.ativo=1 AND NOT EXISTS(SELECT 1 FROM identidades_cpf i WHERE i.usuario_id=u.id)
    AND NOT EXISTS(SELECT 1 FROM redefinicoes_senha r WHERE r.usuario_id=u.id AND r.usado=0 AND r.token_hash LIKE 'first:%') LIMIT 1`)
    .bind(email).first<{id:number;senha_hash:string;senha_salt:string}>();
  const senha=String(body?.senha||'');
  const valid = senha.length <= 256 && await verifyPassword(senha,user?.senha_salt||'0'.repeat(32),user?.senha_hash||'0'.repeat(64));
  if (!user || !valid) return Response.json({error:'Não foi possível vincular. Confira seus dados ou solicite ajuda à liderança.'},{status:401});
  try {
    await db.batch([
      db.prepare('INSERT INTO identidades_cpf(usuario_id,cpf_hash,finais) VALUES (?,?,?)').bind(user.id,await privateHash('cpf',cpf),cpf.slice(-2)),
      db.prepare('DELETE FROM sessoes WHERE usuario_id=?').bind(user.id),
      db.prepare(`INSERT INTO auditoria_piloto(usuario_id,evento,resultado) VALUES (?,'CPF_VINCULADO','SUCESSO')`).bind(user.id),
    ]);
    return Response.json({ok:true,message:'CPF vinculado. Entre com CPF e senha.'});
  } catch {
    await auditAccess('CPF_VINCULADO',null,{},null,'NEGADO');
    return Response.json({error:'Não foi possível vincular. Confira seus dados ou solicite ajuda à liderança.'},{status:409});
  }
}
