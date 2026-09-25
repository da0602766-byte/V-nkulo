import { getD1 } from '../../../../db';
import { requireTenantPermission } from '../../../lib/tenant';
import { recordTenantAudit } from '../../../lib/tenant-audit';
import { getCommunityStory } from '../../../lib/community-story';
import { normalizeCommunityStory } from '../../../lib/community-story-policy.mjs';

export async function GET() {
  const access = await requireTenantPermission('community.theme.manage');
  if ('error' in access) return access.error;
  const result = await getCommunityStory(access.context.comunidadeId);
  return Response.json(result, {headers: {'Cache-Control': 'no-store'}});
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission('community.theme.manage');
  if ('error' in access) return access.error;
  const {eligible} = await getCommunityStory(access.context.comunidadeId);
  if (!eligible) return Response.json({error: 'A história pública está disponível para comunidades com plano pago ativo.'}, {status: 403});
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({error: 'Conteúdo inválido.'}, {status: 400}); }
  const story = normalizeCommunityStory(payload);
  if (story.published && (!story.title || story.body.length < 20)) return Response.json({error: 'Informe um título e uma história com pelo menos 20 caracteres antes de publicar.'}, {status: 400});
  const db = getD1();
  await db.prepare(`INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(chave) DO UPDATE SET
    valor = excluded.valor, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`)
    .bind(`community_story:${access.context.comunidadeId}`, JSON.stringify(story), String(access.user.id)).run();
  await recordTenantAudit(db, access.context, access.user.id, 'HISTORIA_PUBLICA_ATUALIZADA', 'SUCESSO', {published: story.published});
  return Response.json({story, eligible: true});
}
