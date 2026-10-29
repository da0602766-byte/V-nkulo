import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { DEFAULT_COMMUNITY_HIGHLIGHT, parseCommunityHighlight } from "../../../lib/community-highlight";
const key=(id:number)=>`community_highlight:${id}`;
export async function GET() {
 const access=await requireTenantPermission("dashboard.view"); if("error" in access) return access.error;
 const row=await getD1().prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1").bind(key(access.context.comunidadeId)).first<{valor:string}>();
 let highlight=DEFAULT_COMMUNITY_HIGHLIGHT;
 if(row?.valor) { try { highlight=parseCommunityHighlight(JSON.parse(row.valor)); } catch { return Response.json({error:"Não foi possível ler o destaque salvo."},{status:500}); } }
 return Response.json({communityId:access.context.comunidadeId,highlight,canEdit:access.context.permissions.includes("community.theme.manage"),canUpload:access.user.system_owner===true || access.context.communityAccess==="OWNER" || access.context.papel==="ADMIN_COMUNIDADE"},{headers:{"Cache-Control":"no-store"}});
}
export async function PATCH(request:Request) {
 const access=await requireTenantPermission("community.theme.manage"); if("error" in access) return access.error;
 let payload; try { payload=await request.json(); } catch { return Response.json({error:"Conteúdo inválido."},{status:400}); }
 if(payload?.communityId!==access.context.comunidadeId) return Response.json({error:"A comunidade ativa mudou. Reabra a edição antes de salvar."},{status:409});
 if(!payload.highlight || typeof payload.highlight!=="object" || Array.isArray(payload.highlight)) return Response.json({error:"Conteúdo inválido."},{status:400});
 const db=getD1();
 const saved=await db.prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1").bind(key(access.context.comunidadeId)).first<{valor:string}>();
 let highlight; try { const previous=saved?.valor ? JSON.parse(saved.valor) : DEFAULT_COMMUNITY_HIGHLIGHT; highlight=parseCommunityHighlight({...previous,...payload.highlight}); } catch(error) { return Response.json({error:(error as Error).message},{status:400}); }
 await db.prepare(`INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
 ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_por=excluded.atualizado_por, atualizado_em=CURRENT_TIMESTAMP`).bind(key(access.context.comunidadeId),JSON.stringify(highlight),String(access.user.id)).run();
 await recordTenantAudit(db,access.context,access.user.id,"DESTAQUE_LATERAL_ATUALIZADO","SUCESSO",{comunidadeId:access.context.comunidadeId,ativo:highlight.enabled});
 return Response.json({communityId:access.context.comunidadeId,highlight});
}
