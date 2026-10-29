import {requireTenantPermission} from '../../../../lib/tenant';
import {createGoogleAuthorization,getGoogleConnection,googleIntegrationAvailable} from '../../../../lib/google-integration';
import {platformDB,VisitorDriveError} from '../../../../lib/visitor-drive-store';
import {boundedText,personalStorage,personalToken,readPersonalDrive,writePersonalDrive,type PersonalStorage} from '../../../../lib/personal-visitors-drive';
import {emptyPersonalVisitors,validatePersonalVisitors} from '../../../../lib/personal-visitors';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function access(request:Request){
  const a=await requireTenantPermission('dashboard.view');if('error' in a)return a;
  const url=new URL(request.url);
  if(!a.context.visitorPersonalAccess)return {error:reply({error:'Seu acesso à lista pessoal de Visitantes não está disponível. Peça ao administrador para conferir a permissão da página.'},403)};
  if(Number(url.searchParams.get('usuario'))!==a.user.id||Number(url.searchParams.get('comunidade'))!==a.context.comunidadeId)return {error:reply({error:'A conta ou comunidade mudou. Volte ao painel e abra Visitantes novamente.'},409)};
  return a;
}
function failure(error:unknown){return reply({error:error instanceof VisitorDriveError?error.message:'Não foi possível concluir. Sua lista anterior foi preservada. Confira sua conexão e tente novamente.'},error instanceof VisitorDriveError?error.status:503);}
export async function GET(request:Request){
  const a=await access(request);if('error' in a)return a.error;
  try{
    const c=await personalStorage(a.user.id,a.context.comunidadeId),connection=await getGoogleConnection(a.user.id);
    const document=c?.provider==='GOOGLE_DRIVE'&&new URL(request.url).searchParams.get('dados')==='1'?await readPersonalDrive(c,await personalToken(a.user.id)):undefined;
    return reply({userId:a.user.id,communityId:a.context.comunidadeId,provider:c?.provider||null,revision:c?.revisao||0,document,
      googleAvailable:googleIntegrationAvailable(),googleConnected:!!(connection?.drive_enabled&&!connection.revoked_at&&connection.refresh_token_ciphertext),googleEmail:connection?.google_email||null,
      folderUrl:c?.pasta_id?`https://drive.google.com/drive/folders/${encodeURIComponent(c.pasta_id)}`:null});
  }catch(error){return failure(error);}
}
export async function POST(request:Request){return mutate(request,false);}
export async function PATCH(request:Request){return mutate(request,true);}
async function mutate(request:Request,update:boolean){
  const a=await access(request);if('error' in a)return a.error;
  try{
    let body;try{body=JSON.parse(await boundedText(request.body));}catch(e){if(e instanceof VisitorDriveError)throw e;throw new VisitorDriveError('Solicitação inválida.',400);}
    if(!body||typeof body!=='object')throw new VisitorDriveError('Solicitação inválida.',400);
    const userId=a.user.id,communityId=a.context.comunidadeId,db=platformDB();
    if(!update&&body.action==='authorize'){
      const auth=await createGoogleAuthorization(new URL(request.url).origin,{purpose:'drive',personalVisitors:true,userId,returnTo:'/painel/visitantes?lista=pessoal'});
      return Response.json({url:auth.url},{headers:{'Cache-Control':'no-store','Set-Cookie':`__Host-vinkulo_google_state=${auth.nonce}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`}});
    }
    const c=await personalStorage(userId,communityId);
    if(!update&&body.action==='local'){
      if(c&&c.provider!=='LOCAL')throw new VisitorDriveError('Você já usa o Drive. Atualize a página para abrir sua lista.');
      await db.prepare("INSERT INTO visitante_pessoal_storage(usuario_id,comunidade_id,provider) VALUES(?,?,'LOCAL') ON CONFLICT DO NOTHING").bind(userId,communityId).run();
      if((await personalStorage(userId,communityId))?.provider!=='LOCAL')throw new VisitorDriveError('O armazenamento mudou em outra aba. Atualize a página.');
      return reply({ok:true,provider:'LOCAL'});
    }
    if(update?c?.provider!=='GOOGLE_DRIVE':body.action!=='drive')throw new VisitorDriveError('Escolha o armazenamento da sua lista primeiro.',400);
    if(!update&&c?.provider==='GOOGLE_DRIVE')throw new VisitorDriveError('Sua lista já está no Drive. Atualize a página.');
    if(update&&body.revision!==c!.revisao)throw new VisitorDriveError('Sua lista mudou em outra aba ou dispositivo. Atualize antes de tentar novamente.');
    const doc=body.document??(!c&&!update?emptyPersonalVisitors(userId,communityId):null);
    try{validatePersonalVisitors(doc,userId,communityId);}catch(e){throw new VisitorDriveError((e as Error).message,400);}
    if(update&&doc.revision!==c!.revisao)throw new VisitorDriveError('A versão da lista está desatualizada. Atualize antes de salvar.');
    const token=await personalToken(userId);
    // Verify the current source before writing. Never replace a missing/corrupt
    // Drive file with an empty list after a failed read.
    if(update)await readPersonalDrive(c!,token);
    doc.events=doc.events.filter(e=>Date.parse(e.at)>Date.now()-30*86400000);
    doc.revision=(c?.revisao||0)+1;
    const base:PersonalStorage=c||{usuario_id:userId,comunidade_id:communityId,provider:'GOOGLE_DRIVE',revisao:0,pasta_id:null,arquivo_id:null,hash:null};
    const saved=await writePersonalDrive(base,doc,token);
    // Authorization can be revoked during a slow Google upload.
    const fresh=await access(request);if('error' in fresh)return fresh.error;
    const result=c?await db.prepare('UPDATE visitante_pessoal_storage SET provider=\'GOOGLE_DRIVE\',pasta_id=?,arquivo_id=?,hash=?,revisao=? WHERE usuario_id=? AND comunidade_id=? AND revisao=? AND provider=?').bind(saved.pasta_id,saved.arquivo_id,saved.hash,saved.revisao,userId,communityId,c.revisao,c.provider).run():await db.prepare('INSERT INTO visitante_pessoal_storage(usuario_id,comunidade_id,provider,pasta_id,arquivo_id,hash,revisao) VALUES(?,?,\'GOOGLE_DRIVE\',?,?,?,?) ON CONFLICT DO NOTHING').bind(userId,communityId,saved.pasta_id,saved.arquivo_id,saved.hash,saved.revisao).run();
    if(!result.meta.changes)throw new VisitorDriveError('Outra aba alterou o armazenamento. Atualize para conferir a versão salva.');
    return reply({ok:true,provider:'GOOGLE_DRIVE',document:doc,revision:doc.revision});
  }catch(error){return failure(error);}
}
