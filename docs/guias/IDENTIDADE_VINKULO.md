# Identidade do Vínkulo

O V enviado pelo proprietário é a assinatura principal da plataforma. A identidade visual e os movimentos devem partir dessa arte, preservando suas cores, sua dobra central e a silhueta sem fundo.

## Aplicação

- **Marca oficial:** `VinkuloMark`, com a arte de `app/lib/brand-identity.ts`. Usar o V transparente, sem recortar as pontas ou acrescentar quadrado atrás da imagem.
- **Entrada e carregamento de página:** `AnimatedVinkuloMark`, coordenado por `PlatformLoadingTransition`. O braço esquerdo desce até a dobra, o direito sobe e o brilho acompanha a superfície do V.
- **Ações locais:** `VinkuloActionMark`, com estados `idle`, `pending`, `success` e `error`. Tamanho de referência de 28–38 px, dentro de controles com alvo de toque de pelo menos 44 px.
- **Mensagens com texto:** `VinkuloActionStatus`. O símbolo é decorativo; a mensagem e seu papel de status ou alerta comunicam o resultado de forma acessível.
- **Confirmações:** `ActionDialog`, `AgendaDialog` e `visitors/Dialog` mantêm o V no cabeçalho e o animam enquanto `busy` estiver ativo. `ActionDialog` e `visitors/Dialog` aceitam `failed` para mostrar uma falha sem sinalizar sucesso. `visitors/Views.Confirm` acompanha a promessa da ação e impede confirmações duplicadas.
- **Avisos do sistema:** `TransientFeedback` compartilha o mesmo V, com a indicação de sucesso, informação ou erro. O histórico permanece estático.

## Características visuais

Os tokens de `app/brand-feedback.css` derivam o violeta, o índigo e o ciano da logo. Esse gradiente assina as bordas dos controles de comunicação e a linha dos avisos. O V permanece colorido sobre superfícies legíveis nos temas claro e escuro.

As superfícies e os textos continuam usando os tokens da comunidade. O gradiente funciona como assinatura transversal da plataforma, sem eliminar as paletas escolhidas pelas comunidades nem as cores de erro e de ações destrutivas.

A dobra e o aspecto de fita inspiram movimentos curtos, curvas suaves e brilho restrito à silhueta. A marca não precisa ficar em movimento constante: em repouso ela está completa; durante o processamento se desenha; ao concluir faz um movimento curto de assentamento.

## Comportamento

- Iniciar o movimento junto da requisição real e encerrá-lo conforme a resposta.
- Mostrar sucesso somente depois da confirmação do servidor. Diferenciar envio, entrega e leitura no chat.
- Manter textos, acessibilidade, recuperação de falha e a possibilidade de tentar novamente.
- Ações locais não iniciam o carregamento de página e não ganham atraso artificial.
- Respeitar movimento reduzido. Manter o V e a mensagem visíveis, com animações desativadas.
- Evitar repetição de animações no histórico ou em todas as mensagens já enviadas.

## Implementação e revisão

O padrão está aplicado ao chat privado, aos comentários, à criação e edição de publicações, aos pedidos de oração, à confirmação de presença, aos diálogos compartilhados e aos avisos transitórios.

As confirmações de ocultar e excluir publicações usam `ActionDialog`, com cancelamento antes da requisição, progresso real e erro dentro do próprio diálogo.

O QA reproduzível está em `scripts/qa/brand-actions-qa.mjs`. Ele usa exclusivamente um banco em memória e usuários sintéticos. Capturas e resultados ficam em `outputs/brand-actions/`. A publicação do site continua dependendo da autorização do proprietário.
