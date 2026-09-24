import { getD1 } from '../../../../../db';
import { hashPassword,normalizeEmail,sha256,validatePassword,verifyPassword } from '../../../../lib/local-auth';
import { normalizeCpf } from '../../../../lib/cpf';
import { privateHash,rateLimit,secureToken } from '../../../../lib/access-security';

export async function POST(request:Request){
 const p=await request.json().catch(()=>null);const token=String(p?.token||'');const email=normalizeEmail(p?.email);const nome=String(p?.nome||'').trim();const senha=String(p?.senha||'');const cpf=normalizeCpf(p?.cpf);
 if(!await rateLimit(request,'invite',email,6))return Response.json({error:'Muitas tentativas. Aguarde 15 minutos.'},{status:429});
 if(!/^[a-f0-9]{64}$/.test(token)||!cpf||nome.length<3||nome.length>120||validatePassword(senha)||senha.length>256||p?.aceite!==true)return Response.json({error:'Informe nome, CPF válido, e-mail, senha com letras e números e aceite os termos.'},{status:400});
 const db=getD1();const invite=await db.prepare(`SELECT i.id,i.comunidade_id,i.papel,i.email FROM convites_comunidade i JOIN comunidades c ON c.id=i.comunidade_id AND c.status='ATIVA'
 WHERE i.token_hash=? AND i.status='PENDENTE' AND datetime(i.expira_em)>CURRENT_TIMESTAMP`).bind(await sha256(token)).first<{id:number;comunidade_id:number;papel:string;email:string}>();
 if(!invite||invite.email.toLowerCase()!==email||!['MEMBRO','LIDER','ADMIN_COMUNIDADE'].includes(invite.papel))return Response.json({error:'Convite inválido, expirado, revogado ou incompatível com os dados.'},{status:404});
 const cpfHash=await privateHash('cpf',cpf);
 const user=await db.prepare(`SELECT u.id,u.ativo,u.senha_hash,u.senha_salt,i.cpf_hash FROM usuarios u LEFT JOIN identidades_cpf i ON i.usuario_id=u.id WHERE lower(u.email)=?`).bind(email).first<{id:number;ativo:number;senha_hash:string;senha_salt:string;cpf_hash:string|null}>();
 if(user&&(!user.ativo||!user.senha_salt||(user.cpf_hash&&user.cpf_hash!==cpfHash)||!await verifyPassword(senha,user.senha_salt,user.senha_hash)))return Response.json({error:'Não foi possível validar as credenciais. Use a senha da conta existente.'},{status:401});
 const identity=await db.prepare('SELECT usuario_id FROM identidades_cpf WHERE cpf_hash=?').bind(cpfHash).first<{usuario_id:number}>();
 if(identity&&identity.usuario_id!==user?.id)return Response.json({error:'Não foi possível concluir o vínculo com estes dados.'},{status:409});
 const password=user?null:await hashPassword(senha);const claim=secureToken();
 try{const results=await db.batch([
  db.prepare(`UPDATE convites_comunidade SET status='ACEITO',uso_chave=?,usado_em=CURRENT_TIMESTAMP WHERE id=? AND status='PENDENTE' AND datetime(expira_em)>CURRENT_TIMESTAMP
    AND EXISTS(SELECT 1 FROM comunidades WHERE id=comunidade_id AND status='ATIVA')`).bind(claim,invite.id),
  db.prepare(`INSERT INTO usuarios(nome,email,perfil,permissoes,senha_hash,senha_salt,ativo) SELECT ?,?,'ACOMPANHANTE','',?,?,1 FROM convites_comunidade WHERE id=? AND uso_chave=? AND ? IS NULL`)
   .bind(nome,email,password?.hash||null,password?.salt||null,invite.id,claim,user?.id||null),
  db.prepare(`UPDATE convites_comunidade SET usado_por=(SELECT id FROM usuarios WHERE lower(email)=?) WHERE id=? AND uso_chave=?`).bind(email,invite.id,claim),
  db.prepare(`INSERT INTO identidades_cpf(usuario_id,cpf_hash,finais) SELECT usado_por,?,? FROM convites_comunidade WHERE id=? AND uso_chave=?
    AND NOT EXISTS(SELECT 1 FROM identidades_cpf WHERE usuario_id=usado_por)`).bind(cpfHash,cpf.slice(-2),invite.id,claim),
  db.prepare(`INSERT INTO usuario_comunidades(usuario_id,comunidade_id,papel,status) SELECT usado_por,comunidade_id,papel,'ATIVO' FROM convites_comunidade i WHERE id=? AND uso_chave=?
    AND NOT EXISTS(SELECT 1 FROM usuario_comunidades uc WHERE uc.usuario_id=i.usado_por AND uc.comunidade_id=i.comunidade_id)`).bind(invite.id,claim),
  db.prepare(`INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado,metadados) SELECT comunidade_id,usado_por,'CONVITE_MEMBRO_ACEITO','SUCESSO',? FROM convites_comunidade WHERE id=? AND uso_chave=?`).bind(JSON.stringify({conviteId:invite.id,papel:invite.papel}),invite.id,claim),
 ]);if(!results[0].meta.changes)return Response.json({error:'Este convite não está mais disponível.'},{status:409});
 return Response.json({ok:true,redirect:'/login',message:'Cadastro concluído. Entre com CPF e senha.'},{status:201});
 }catch{return Response.json({error:'Não foi possível concluir. Confira os dados ou solicite à comunidade a revisão do limite do plano.'},{status:409});}
}
