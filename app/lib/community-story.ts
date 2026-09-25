import { getD1 } from '../../db';
import { getSubscription } from './commerce';
import { canPublishCommunityStory, normalizeCommunityStory } from './community-story-policy.mjs';

export type CommunityStory = { title: string; body: string; mission: string; foundedYear: string; published: boolean };
export async function getCommunityStory(communityId: number) {
  const [subscription, row] = await Promise.all([
    getSubscription(communityId),
    getD1().prepare('SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1').bind(`community_story:${communityId}`).first<{valor: string}>(),
  ]);
  let stored: unknown = {};
  try { stored = JSON.parse(row?.valor || '{}'); } catch { stored = {}; }
  return { eligible: canPublishCommunityStory(subscription), story: normalizeCommunityStory(stored) as CommunityStory };
}
export async function getPublishedCommunityStory(communityId: number): Promise<CommunityStory | null> {
  const result = await getCommunityStory(communityId);
  return result.eligible && result.story.published && result.story.body ? result.story : null;
}
