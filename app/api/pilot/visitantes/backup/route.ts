import { requireTenantPermission } from '../../../../lib/tenant';
import { ownerToken, readArchive, visitorDriveConfig } from '../../../../lib/visitor-drive-store';
export async function GET() {
  const a=await requireTenantPermission('dashboard.view');if('error' in a)return a.error;
  const c=await visitorDriveConfig(a.context.comunidadeId);
  if(!c||a.context.temporaryAccess||c.usuario_id!==a.user.id)return Response.json({error:'O backup completo exige a conta responsável pelo Drive.'},{status:403});
  try {
    const archive=await readArchive(c,await ownerToken(c));
    return new Response(JSON.stringify(archive),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="vinkulo-visitantes-${c.comunidade_id}-v${c.revisao}.json"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return Response.json({error:'Não foi possível ler e verificar o backup no Drive. Tente novamente.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
