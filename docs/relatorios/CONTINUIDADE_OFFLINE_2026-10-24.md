# Continuidade offline — 24/10/2026

Base web: Sites 432. Fonte Android conferida: 6a1efe33de3caf80c15e3f8119314c95b4ccedbf, APK 1.23.0/código 26, conforme manifesto publicado. Atualização web autorizada; validação física adiada.

## Entrega web

- A entrada manual também está em Perfil e conta. A inspeção com membro comum mostrou que o único acesso anterior estava em Configurações, área restrita a perfis administrativos. Mantidas as restrições administrativas e as verificações de capacidade/versão e de política global; a entrada não concede nenhuma permissão offline.
- Consulta compartilhada da política global entre os componentes, sem requisições duplicadas. Respostas antigas são descartadas; timeout de 12 segundos encerra a espera. Ocultar a aba ou desmontar os consumidores cancela a consulta; voltar à aba, restaurar página ou reconectar revalida a decisão.
- Falha HTTP, resposta inválida e perda de conexão não são interpretadas como autorização. A última decisão válida é preservada como referência; sem decisão inicial, nenhuma ação de abrir/instalar é oferecida. A interface distingue indisponibilidade da consulta de bloqueio confirmado e oferece nova tentativa.
- Orientação sobre validade, mesma conta/comunidade, confirmação de cada envio, preservação de rascunhos e relatórios de células exclusivamente locais. Nenhuma contagem zero ou prazo foi presumido. Cartão responsivo e alvo de toque ajustado à escala efetiva do painel.

## Limite confirmado na fonte Android

VinkuloPending e as pontes de consulta só respondem ao documento local /mobile-app, no frame principal e origem oficial, com a política habilitada. A ponte VinkuloAndroid do painel não possui método de resumo de validade/fila. A navegação local restaura a tela inicial; acrescentar uma âncora ao link não abre diretamente a Central de pendências.

Por isso o painel explica onde consultar os dados reais, mas **não exibe contagem ou prazo nativos**. Essa melhoria continua pendente de uma nova versão Android com ponte mínima de resumo, isolamento por sessão/comunidade e testes de contrato. Não foi contornada a proteção de origem; nenhuma chamada de envio/sincronização foi acrescentada à web. Não foi gerado nem promovido um APK nesta entrega.

## Validação

- **866/866 testes web**, incluindo sete regressões novas de política e interface. TypeScript e build aprovados; lint zero erros e 38 avisos preexistentes. Último ajuste exclusivamente visual recompilado e conferido no navegador. Diff sem problemas de espaços.
- **52/52 testes JavaScript da interface local do APK**, extraídos do commit exato do manifesto e executados sem modificar o código: expiração, resposta atrasada, ocultação, timeout, preservação de rascunhos, ausência de envio automático, filas e bloqueio de resumos. A suíte visual externa não foi executada; os testes nativos Java/instrumentados e o aparelho físico não foram repetidos.
- Suíte web inclui Workers/D1 com recibos idempotentes, resposta perdida, rollback, autorizações e limites de validade. Nenhuma operação em dados reais ou comunicação externa.
- Navegador: membro comum em Perfil e conta, ponte 1.23 simulada apenas no servidor temporário de QA, desativação global em banco fictício, 390/768/1864 px sem overflow horizontal. Botão com 44,18 px efetivos no celular após a compensação da escala do painel. Não equivale a validar WebView/Room/Keystore ou a reconexão em aparelho físico.

Evidências locais: .task-tools/offline-release-tests.log, offline-release-build.log, offline-final-types.log, offline-final-lint.json e offline-native-js-tests.log. Prévia e cópia da fonte Android ficam fora do pacote publicado.

## Publicação

Validação concluída; publicação em preparação. Preservar audiência e configurações atuais.
