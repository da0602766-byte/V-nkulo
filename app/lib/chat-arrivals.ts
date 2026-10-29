export type ChatArrivalConversation = {
  id?: number;
  participante_id?: number;
  participante_nome?: string;
  participante_foto?: string | null;
  ultima_recebida_id?: number | null;
  ultima_recebida?: string | null;
  nao_lidas?: number;
};

export function incomingChatArrivals(conversations: ChatArrivalConversation[], previous: Map<number, number> | null, readingUserId: number | null, enabled: boolean) {
  if (!previous || !enabled) return [];
  return conversations.filter(conversation => {
    const messageId = Number(conversation.ultima_recebida_id || 0);
    return messageId > (previous.get(Number(conversation.id)) || 0)
      && Number(conversation.nao_lidas) > 0
      && Number(conversation.participante_id) !== readingUserId;
  }).sort((a, b) => Number(b.ultima_recebida_id) - Number(a.ultima_recebida_id));
}
