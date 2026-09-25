// Only an active subscription with a positive contracted price unlocks storytelling.
export function canPublishCommunityStory(subscription) {
  return Boolean(subscription?.active && Number(subscription.plan?.valor_centavos) > 0);
}

export function normalizeCommunityStory(value) {
  return {
    title: String(value?.title ?? '').trim().slice(0, 120),
    body: String(value?.body ?? '').trim().slice(0, 8000),
    mission: String(value?.mission ?? '').trim().slice(0, 600),
    foundedYear: /^\d{4}$/.test(String(value?.foundedYear ?? '')) ? String(value.foundedYear) : '',
    published: value?.published === true,
  };
}
