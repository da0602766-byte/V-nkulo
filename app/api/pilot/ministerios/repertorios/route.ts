import { getD1 } from '../../../../../db';
import { requireTenantPermission } from '../../../../lib/tenant';
import { canViewMinistry } from '../../../../lib/ministry-access';
import { parseSecretaryLinks } from '../../../../lib/ministry-validation';

// Directory membership is checked again on every read/share; a grant cannot bypass
// leaving a community or its worship ministries. Song contents stay owner-private.
const eligible=`SELECT DISTINCT u.id,u.nome FROM usuarios u
 JOIN usuario_comunidades uc ON uc.usuario_id=u.id AND uc.comunidade_id=? AND uc.status='ATIVO'
 JOIN ministerios_comunidade m ON m.comunidade_id=uc.comunidade_id AND m.categoria='LOUVOR' AND m.status='ATIVO'
 WHERE u.ativo=1 AND (m.responsavel_usuario_id=u.id OR EXISTS(SELECT 1 FROM ministerio_voluntarios v WHERE v.usuario_id=u.id AND v.ministerio_id=m.id AND v.comunidade_id=m.comunidade_id AND v.ativo=1))`;
type Song={id:number;titulo:string;links:string;versao:number;chave:string};
async function authorize(ministryId:number){
  const access=await requireTenantPermission('ministries.view'); if('error' in access)return access.error;
  const db=getD1();
  const ministry=await db.prepare("SELECT id FROM ministerios_comunidade WHERE id=? AND comunidade_id=? AND categoria='LOUVOR' AND status='ATIVO'").bind(ministryId,access.context.comunidadeId).first();
  if(!ministry||access.context.communityAccess==='FEED_ONLY'||!await canViewMinistry(db,access.context,access.user.id,ministryId))return Response.json({error:'Repertórios disponíveis apenas nos ministérios de Louvor aos quais você tem acesso.'},{status:403});
  const members=(await db.prepare(eligible).bind(access.context.comunidadeId).all<{id:number;nome:string}>()).results;
  // An administrator may manage the library without being an active musician,
  // but personal sharing requires membership in Louvor for both participants.
  return {access,db,members};
}
export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  const auth=await authorize(Number(params.get('ministerioId')));if(auth instanceof Response)return auth;
  const {access,db,members}=auth,me=access.user.id,community=access.context.comunidadeId;
  const owner=Number(params.get('donoId'))||me;
  const grants=(await db.prepare('SELECT dono_id,destinatario_id,status FROM louvor_compartilhamentos WHERE comunidade_id=? AND (dono_id=? OR destinatario_id=?)').bind(community,me,me).all<{dono_id:number;destinatario_id:number;status:string}>()).results;
  const isMember=(id:number)=>members.some(row=>row.id===id);
  if(owner!==me&&(!isMember(me)||!isMember(owner)||!grants.some(row=>row.dono_id===owner&&row.destinatario_id===me&&row.status==='APROVADO')))return Response.json({error:'Solicite acesso ao dono desta lista.'},{status:403});
  const songs=(await db.prepare('SELECT id,titulo,links,versao,chave FROM louvor_musicas_pessoais WHERE usuario_id=? ORDER BY titulo,id').bind(owner).all<Song>()).results;
  const counts=(await db.prepare(`SELECT usuario_id,COUNT(*) total FROM louvor_musicas_pessoais WHERE usuario_id IN (SELECT id FROM (${eligible})) GROUP BY usuario_id`).bind(community).all<{usuario_id:number;total:number}>()).results;
  return Response.json({me,owner,songs:songs.map(row=>({...row,links:JSON.parse(row.links)})),members:members.map(row=>({...row,total:counts.find(c=>c.usuario_id===row.id)?.total||0})),grants:grants.filter(row=>isMember(row.dono_id)&&isMember(row.destinatario_id))},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
  const body=await request.json().catch(()=>null);if(!body)return Response.json({error:'Dados inválidos.'},{status:400});
  const auth=await authorize(Number(body.ministerioId));if(auth instanceof Response)return auth;
  const {access,db,members}=auth,me=access.user.id,community=access.context.comunidadeId;
  const fail=(error:string,status=400)=>Response.json({error},{status});
  if(['REQUEST','SHARE','APPROVE','DECLINE','REVOKE'].includes(body.action)){
    const other=Number(body.userId);
    if(other===me||!members.some(row=>row.id===other)||!members.some(row=>row.id===me))return fail('Escolha outro integrante ativo de Louvor nesta comunidade.',403);
    const requesting=body.action==='REQUEST',owner=requesting?other:me,reader=requesting?me:other;
    if(requesting){
      await db.prepare("INSERT INTO louvor_compartilhamentos(comunidade_id,dono_id,destinatario_id,status) VALUES(?,?,?,'PENDENTE') ON CONFLICT(comunidade_id,dono_id,destinatario_id) DO UPDATE SET status=CASE WHEN status='APROVADO' THEN status ELSE 'PENDENTE' END").bind(community,owner,reader).run();
    }else if(body.action==='SHARE'){
      await db.prepare("INSERT INTO louvor_compartilhamentos(comunidade_id,dono_id,destinatario_id,status) VALUES(?,?,?,'APROVADO') ON CONFLICT(comunidade_id,dono_id,destinatario_id) DO UPDATE SET status='APROVADO'").bind(community,owner,reader).run();
    }else{
      const status=body.action==='APPROVE'?'APROVADO':body.action==='DECLINE'?'RECUSADO':'REVOGADO';
      const result=await db.prepare('UPDATE louvor_compartilhamentos SET status=? WHERE comunidade_id=? AND dono_id=? AND destinatario_id=?').bind(status,community,me,other).run();
      if(!result.meta.changes)return fail('Solicitação não encontrada.',404);
    }
    return Response.json({ok:true});
  }
  if(body.action==='SAVE'){
    const title=String(body.titulo||'').trim(),key=title.normalize('NFKC').toLocaleLowerCase('pt-BR');
    if(!title||title.length>140)return fail('Informe um título de até 140 caracteres.');
    const links=parseSecretaryLinks(body.links);if('error' in links)return fail(links.error);
    const count=await db.prepare('SELECT COUNT(*) total FROM louvor_musicas_pessoais WHERE usuario_id=?').bind(me).first<{total:number}>();
    if(!body.id&&Number(count?.total)>=500)return fail('Sua lista pode ter até 500 músicas.');
    try{
      if(body.id){const result=await db.prepare('UPDATE louvor_musicas_pessoais SET titulo=?,chave=?,links=?,versao=versao+1 WHERE id=? AND usuario_id=? AND versao=?').bind(title,key,JSON.stringify(links.value),Number(body.id),me,Number(body.versao)).run();if(!result.meta.changes)return fail('A música mudou ou foi excluída. Recarregue a lista.',409);}
      else await db.prepare('INSERT INTO louvor_musicas_pessoais(usuario_id,titulo,chave,links) VALUES(?,?,?,?)').bind(me,title,key,JSON.stringify(links.value)).run();
    }catch(cause){if(String(cause).includes('UNIQUE'))return fail('Você já tem uma música com este título. Edite o item existente.',409);throw cause;}
    return Response.json({ok:true});
  }
  if(body.action==='DELETE'){
    const result=await db.prepare('DELETE FROM louvor_musicas_pessoais WHERE id=? AND usuario_id=? AND versao=?').bind(Number(body.id),me,Number(body.versao)).run();
    return result.meta.changes?Response.json({ok:true}):fail('A música mudou ou já foi excluída. Recarregue a lista.',409);
  }
  if(body.action==='COPY'){
    const owner=Number(body.userId);
    if(owner===me||!members.some(row=>row.id===owner)||!members.some(row=>row.id===me))return fail('Lista indisponível.',403);
    const grant=await db.prepare("SELECT 1 FROM louvor_compartilhamentos WHERE comunidade_id=? AND dono_id=? AND destinatario_id=? AND status='APROVADO'").bind(community,owner,me).first();
    if(!grant)return fail('O dono precisa compartilhar a lista antes de copiá-la.',403);
    const result=await db.prepare(`INSERT INTO louvor_musicas_pessoais(usuario_id,titulo,chave,links)
      SELECT ?,s.titulo,s.chave,s.links FROM louvor_musicas_pessoais s WHERE s.usuario_id=?
      AND EXISTS(SELECT 1 FROM louvor_compartilhamentos WHERE comunidade_id=? AND dono_id=? AND destinatario_id=? AND status='APROVADO')
      AND NOT EXISTS(SELECT 1 FROM louvor_musicas_pessoais own WHERE own.usuario_id=? AND own.chave=s.chave)
      ORDER BY s.id LIMIT MAX(0,500-(SELECT COUNT(*) FROM louvor_musicas_pessoais WHERE usuario_id=?))
      ON CONFLICT(usuario_id,chave) DO NOTHING`).bind(me,owner,community,owner,me,me,me).run();
    return Response.json({ok:true,copied:result.meta.changes});
  }
  return fail('Ação inválida.');
}
