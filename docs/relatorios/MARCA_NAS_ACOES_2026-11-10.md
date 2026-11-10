# A marca V nas ações da plataforma

Implementação local, sem publicação. O padrão visual está descrito em `docs/guias/IDENTIDADE_VINKULO.md`.

## Resultado

- O mesmo V transparente identifica o envio de mensagens privadas, comentários e publicações, a edição de publicações, pedidos de oração e confirmações de presença.
- Durante a ação, o V se desenha e recebe brilho. A confirmação usa um movimento curto com indicação de sucesso; falhas conservam o aviso de erro e a recuperação.
- O chat continua distinguindo mensagem enviada, entregue e visualizada. A confirmação visual depende da resposta do servidor.
- Avisos transitórios e diálogos compartilhados adotam a mesma marca. O histórico de avisos não repete animações.
- Confirmações de ocultar e excluir publicações usam um diálogo da plataforma com o V, cancelamento e erro dentro do próprio diálogo.
- Diálogos de Visitantes também receberam a assinatura. Seu componente de confirmação acompanha a promessa da ação, bloqueia cliques duplicados e mantém a falha visível quando a operação rejeita.
- A identidade usa as cores violeta, índigo e ciano da logo nos detalhes de comunicação e feedback. As paletas das comunidades e a identificação de ações destrutivas são preservadas.

As ações são locais: não iniciam o carregamento de página nem esperam uma duração artificial. A preferência por movimento reduzido mantém o símbolo completo e o texto visível, com os movimentos desativados.

## Correções feitas durante a revisão

- Bloqueado envio duplicado antes da próxima renderização no chat, nos comentários, nas operações do feed e nas confirmações de Visitantes.
- Um envio concluído após trocar de conversa continua limitado ao destinatário original; não confirma a conversa recém-aberta.
- Um comentário já aceito pelo servidor deixa de aparecer como pendente mesmo se a leitura seguinte falhar.
- Ajustada a cascata de estilos para manter o V legível nos controles de envio, inclusive quando o botão fica desabilitado durante o processamento.
- Os alvos de ação consideram o inverso da escala global para manter pelo menos 44 px reais. As marcas e os avisos também compensam essa escala.

## Verificação

- Build de produção e validação do artefato ESM com `default.fetch` e manifesto JSON.
- TypeScript e lint dos arquivos alterados sem ocorrências.
- Testes de ciclo do chat incluem envio duplicado, sucesso após resposta real, falha sem confirmação positiva, troca de destinatário e reenvio.
- Testes de confirmação de Visitantes incluem promessa pendente, cancelamento bloqueado durante a operação, falha e nova tentativa.
- QA no Edge com banco exclusivamente em memória e usuários sintéticos: 10 cenários aprovados, sem erros de JavaScript.
- Verificados envio e sucesso no chat, falha e reenvio, publicação, comentários, falha na leitura após comentário aceito, cancelamento de confirmação, falha dentro da confirmação, arquivamento, pedido de oração, tema escuro e movimento reduzido.
- Conferidos 390, 768 e 1864 px, sem rolagem horizontal nos estados capturados. Medidos controles de ação com pelo menos 44 px reais, incluindo a escala global.

As capturas e resultados estão em `outputs/brand-actions/`. O teste reproduzível está em `scripts/qa/brand-actions-qa.mjs`, com Playwright configurável por `VINKULO_PLAYWRIGHT_MODULE`.

A suíte completa terminou com 965 testes aprovados em 968. Conserva três falhas preexistentes em `tests/visitor-sheets-ui.test.mjs`, cujos mocks não reconhecem `../lib/google-authorization-client`. O componente de Planilhas e esses testes não foram alterados nesta tarefa. Os logs estão em `outputs/brand-actions-all-tests.log`.

Não houve publicação, alteração de dados reais, envio de mensagens a pessoas reais ou recompilação de APK. A revisão visual usa navegador e tamanhos emulados; não representa validação em todos os aparelhos físicos.
