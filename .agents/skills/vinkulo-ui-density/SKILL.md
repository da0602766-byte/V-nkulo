---
name: vinkulo-ui-density
description: Criar, alterar ou revisar interfaces do projeto Vínkulo mantendo cartões proporcionais ao conteúdo, layouts responsivos e controles legíveis. Aplicar em telas e componentes do Vínkulo, sem alterar a identidade de outros projetos.
---

# Proporções da interface do Vínkulo

A área de trabalho pode ser ampla; cada objeto deve ter apenas o espaço necessário à sua função. Não crie cartões ou objetos enormes sem justificativa funcional. Preserve as cores da comunidade e a hierarquia de ações existente.

## Decisões de layout

- Para coleções, use colunas com largura limitada e alinhamento ao início. Um único item não deve crescer para preencher toda a tela. Evite `auto-fit` com `1fr` quando isso esticar um cartão curto.
- Referências iniciais: post-it 240–280 px; veículo 280–360 px; ministério 260–360 px; evento 340–520 px. São larguras máximas de referência, nunca larguras mínimas que causem overflow. Use `min(100%, ...)` e ajuste ao conteúdo real.
- Altura pelo conteúdo, com itens da grade alinhados ao topo. Não use altura de viewport, `height:100%` ou grande `min-height` em cartões comuns. Notas longas podem ter rolagem interna com conteúdo e controles acessíveis.
- Quadros de notas, calendários, tabelas e mapas podem ocupar a área ampla necessária. Não os confunda com um cartão individual. Não reduza a área de trabalho ao compactar seus objetos.
- Agrupamentos estruturais não precisam de um segundo cartão ao fundo: prefira espaço, título ou divisor. Evite bordas, sombras e superfícies empilhadas sem uma função clara.
- Mantenha células de tabela como `table-cell`; coloque flex/grid dentro de um elemento filho. Nomes longos, ausência de foto e observações extensas não podem desalinhá-las.
- Em monitores, reúna controles relacionados em uma barra quando couberem; em celular, permita quebra natural. Nunca force uma linha única produzindo corte ou rolagem da página.
- Compactar não é diminuir indiscriminadamente a fonte. Campos de celular usam texto de 16 px e ações principais têm alvo de toque de pelo menos 44 px. Não oculte funções essenciais para caber.
- Formulários curtos têm largura limitada. Mostre opções secundárias progressivamente e rótulos separados dos campos; preserve foco visível, teclado e estados de erro.

## Verificação antes de publicar

Inspecione os componentes alterados com um item, vários itens, texto longo e estado vazio quando relevante. Confira desktop amplo (por exemplo 1864 px), tablet e celular (390 px): sem sobreposição, corte, esticamento indevido ou rolagem horizontal da página. Tabelas e mapas podem rolar dentro de seu contêiner.

Reutilize estilos locais e revise a cascata existente antes de acrescentar overrides. Não crie regras globais para todos os `article`, `button` ou `section`. Teste comportamento e permissões quando a mudança incluir funções, notificações ou dados. Registre limites de verificação, sem prometer ausência absoluta de bugs.
