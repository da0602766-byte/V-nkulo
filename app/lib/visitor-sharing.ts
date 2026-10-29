import { getRuntimeEnv } from '../../db/runtime-env';
import type { TenantContext } from './tenant';

export type VisitorShareRole = 'READ' | 'EDIT';
export function canManageVisitorSharing(context: TenantContext) {
  return !context.temporaryAccess && context.permissions.includes('visitors.view') &&
    (context.isOwner || context.isCommunityOwner || ['PASTOR', 'ADMIN_COMUNIDADE'].includes(context.papel));
}

export async function visitorShareRole(communityId: number, userId: number): Promise<VisitorShareRole | null> {
  try {
    const grant = await getRuntimeEnv().DB!.prepare(`SELECT a.papel FROM visitante_acessos a
      JOIN usuario_comunidades uc ON uc.comunidade_id=a.comunidade_id AND uc.usuario_id=a.usuario_id
      WHERE a.comunidade_id=? AND a.usuario_id=? AND uc.status='ATIVO'`)
      .bind(communityId, userId).first<{papel: VisitorShareRole}>();
    if(grant?.papel)return grant.papel;
    // Preserve explicit shares created before the unified sharing screen.
    const legacy=await getRuntimeEnv().DB!.prepare(`SELECT a.papel FROM visitante_drive_acessos a
      JOIN visitante_drive d ON d.comunidade_id=a.comunidade_id AND d.estado='ACTIVE'
      JOIN usuario_comunidades uc ON uc.comunidade_id=a.comunidade_id AND uc.usuario_id=a.usuario_id
      WHERE a.comunidade_id=? AND a.usuario_id=? AND uc.status='ATIVO'`)
      .bind(communityId,userId).first<{papel:VisitorShareRole}>();
    return legacy?.papel || null;
  } catch (error) {
    // Older deployments remain usable until migration 0089 is installed.
    if (/no such table:\s*(?:main\.)?visitante_acessos\b/i.test(String(error))) return null;
    throw error;
  }
}

export function visitorSharePermissions(role: VisitorShareRole | null) {
  if (!role) return [];
  return role === 'EDIT'
    ? ['visitors.view', 'followups.view', 'visitors.create', 'visitors.edit', 'followups.manage']
    : ['visitors.view', 'followups.view'];
}
