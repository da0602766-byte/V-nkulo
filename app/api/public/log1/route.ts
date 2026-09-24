import { getD1 } from '../../../../db';
import { normalizeCpf, validBirthDate } from '../../../lib/cpf';
import { normalizeBrazilianPhone } from '../../../lib/brazilian-validation';
import { privateHash, rateLimit, secureToken } from '../../../lib/access-security';
import { purgeAccessRequests } from '../../../lib/access-retention';

export async function POST(request:Request) {
  const body=await request.json().catch(()=>null);
  const cpf=normalizeCpf(body?.cpf);
  if(!await rateLimit(request,'log1',cpf||'invalid',4)) return Response.json({error:'Aguarde 15 minutos para enviar uma nova solicitação.'},{status:429});
  const nome=String(body?.nome||'').trim(); const telefone=normalizeBrazilianPhone(body?.telefone); const nascimento=String(body?.nascimento||'');
  if(nome.length<5||nome.length>120||!telefone||!validBirthDate(nascimento)||!cpf||body?.aceite!==true) return Response.json({error:'Revise nome completo, telefone, nascimento, CPF e o aceite de privacidade.'},{status:400});
  const db=getD1();
  // Retain only the period necessary for review; no user or community is created here.
  await purgeAccessRequests(db);
  const protocolo=secureToken().slice(0,16).toUpperCase();
  await db.prepare(`INSERT INTO solicitacoes_log1(protocolo,nome,telefone,nascimento,cpf_hash,cpf_finais) VALUES (?,?,?,?,?,?)
    ON CONFLICT DO NOTHING`).bind(protocolo,nome,telefone,nascimento,await privateHash('cpf',cpf),cpf.slice(-2)).run();
  // The same response for duplicate identities avoids account/request enumeration.
  return Response.json({ok:true,message:'Solicitação recebida. Se já existe uma solicitação em andamento, ela será mantida. Entraremos em contato pelo telefone informado.'},{status:202});
}
