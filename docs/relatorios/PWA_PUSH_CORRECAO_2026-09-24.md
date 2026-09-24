# Correção de notificações PWA — 24/09/2026

## Relato e causa reproduzida

O proprietário relatou ausência de notificações no topo de outro celular com o PWA. O transporte Web Push ainda utilizava `redirect: "error"`. No runtime Workers utilizado pelo projeto, a construção da Request rejeita esse valor antes de enviar a requisição. A fila registra status 0 e, ao esgotar as tentativas, encerra com falha. O transporte Firebase nativo já havia recebido a correção equivalente, mas o caminho Web Push permanecia separado.

O novo teste `web-push-runtime.test.mjs` reproduziu a falha antes da alteração: `Invalid redirect value, must be one of "follow" or "manual"`. Depois da correção, passou usando criptografia ECDH/AES-GCM, assinatura VAPID e Request nativa do Workerd, com provedor simulado. Não usa credenciais reais nem envia mensagens para aparelhos.

## Mudanças

- Transporte PWA usa `manual`, sem seguir redirecionamentos. A fila considera 3xx uma recusa, sem marcar aceite nem encaminhar autorização VAPID a outro destino.
- Permissão solicitada diretamente na ação do usuário, antes da consulta de configuração, preservando a ativação exigida pelos navegadores. Referência: [WebKit — User Activation API](https://webkit.org/blog/13862/the-user-activation-api/).
- Em aparelhos novos, a inscrição espera o service worker ativar. Instalação interrompida ou sem resposta encerra com erro acionável após no máximo 15 segundos, sem anunciar sucesso.
- Preservadas a vinculação ao usuário/sessão, a revalidação antes de exibir e a ausência de conteúdo privado no push. Não reabre entregas antigas encerradas e não modifica credenciais, APK ou permissões do aparelho.

## Verificação e limites

Testes cobrem envio no runtime Workers, criptografia real, redirecionamentos, ordem permissão/configuração, instalação nova, falha/timeout, negação de permissão e erro ao salvar a assinatura. A suíte de privacidade e da fila continua obrigatória.

A confirmação física da faixa de notificação depende de novo teste no celular do proprietário. Esta correção não prova exibição no sistema operacional. O tipo de teste (chat, evento/escala/aviso ou botão Firebase) e o sistema do outro celular foram perguntados para orientar essa confirmação; até a resposta, o diagnóstico comprovado se refere ao transporte PWA. Mensagens de chat continuam fora da central e da fila push pela regra atual; não foram habilitadas sem revisar seu fluxo e autorização.

Publicação e validação completa serão registradas após o deploy.
