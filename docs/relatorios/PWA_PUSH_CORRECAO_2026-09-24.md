# Correção de notificações PWA — 24/09/2026

## Relato e causa reproduzida

O proprietário confirmou: Android com PWA instalado, mensagem enviada pelo chat aparece dentro do sistema, mas não no topo do celular. Foram identificadas duas causas no código: o chat não criava trabalho na fila push e o transporte Web Push ainda utilizava `redirect: "error"`. No runtime Workers utilizado pelo projeto, a construção da Request rejeita esse valor antes de enviar a requisição. A fila registra status 0 e, ao esgotar as tentativas, encerra com falha. O transporte Firebase nativo já havia recebido a correção equivalente, mas o caminho Web Push permanecia separado.

O novo teste `web-push-runtime.test.mjs` reproduziu a falha antes da alteração: `Invalid redirect value, must be one of "follow" or "manual"`. Depois da correção, passou usando criptografia ECDH/AES-GCM, assinatura VAPID e Request nativa do Workerd, com provedor simulado. Não usa credenciais reais nem envia mensagens para aparelhos.

## Mudanças

- Transporte PWA usa `manual`, sem seguir redirecionamentos. A fila considera 3xx uma recusa, sem marcar aceite nem encaminhar autorização VAPID a outro destino.
- Permissão solicitada diretamente na ação do usuário, antes da consulta de configuração, preservando a ativação exigida pelos navegadores. Referência: [WebKit — User Activation API](https://webkit.org/blog/13862/the-user-activation-api/).
- Em aparelhos novos, a inscrição espera o service worker ativar. Instalação interrompida ou sem resposta encerra com erro acionável após no máximo 15 segundos, sem anunciar sucesso.
- Preservadas a vinculação ao usuário/sessão, a revalidação antes de exibir e a ausência de conteúdo privado no push. Não reabre entregas antigas encerradas e não modifica credenciais, APK ou permissões do aparelho.
- O POST autenticado do chat grava mensagem, metadados genéricos e fila dos aparelhos do destinatário em uma transação D1. O gatilho geral continua ignorando inserções avulsas de CHAT; a fila é criada explicitamente apenas pelo envio autenticado. Não há migração nem envio retroativo. O processamento é despertado depois da gravação.
- Antes de enviar e de exibir, a autorização revalida destinatário, sessão, vínculo do aparelho, mensagem não lida, semana atual, comunidade ativa, ambos os usuários/vínculos ativos, classe de comunicação e preferência de mensagens. O aviso não revela remetente, comunidade nem conteúdo; abre a aba Mensagens. A comunidade ativa continua sendo escolhida pelo usuário no seletor existente.
- A central do sino permanece separada das conversas. A limpeza semanal passa a remover também os metadados genéricos do chat e sua fila por cascata, junto do conteúdo original. O mesmo fluxo atende PWA e APK já instalado.

## Verificação e limites

Testes cobrem envio no runtime Workers, criptografia real, redirecionamentos, ordem permissão/configuração, instalação nova, falha/timeout, negação de permissão e erro ao salvar a assinatura. Testes do chat com SQLite real cobrem destinatário, ambos os transportes, metadados mínimos, cancelamento por leitura/permissão, sessão, preferências e limpeza semanal. Um teste adicional usa o D1 do Miniflare para validar RETURNING, isolamento entre envios concorrentes e rollback integral se a fila falhar. A suíte de privacidade e da fila continua obrigatória.

A confirmação física da faixa de notificação depende de novo teste no celular do proprietário. Os testes automatizados não provam exibição no sistema operacional. A orientação é atualizar/reabrir o PWA, verificar a ativação em “Avisos neste celular” e enviar uma mensagem nova mantendo o destinatário conectado e fora da conversa. Conversas abertas podem ser marcadas como lidas antes do envio, cancelando corretamente o aviso.

Publicação e validação completa serão registradas após o deploy.
