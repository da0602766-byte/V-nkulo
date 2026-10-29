---
name: vinkulo-compact-lists
description: Criar ou revisar listagens repetidas do Vínkulo, como integrantes de ministérios, pessoas e equipes. Aplicar quando cada registro tiver botões ou formulários que ampliam a altura sem necessidade; usar a listagem de Visitantes como referência de densidade.
---

# Listagens compactas do Vínkulo

Use junto com `../vinkulo-ui-density/SKILL.md`. Preserve permissões, confirmações e identidade visual.

- Apresente registros em linhas separadas por divisores, sem um cartão grande para cada pessoa. Nome é a informação principal; função, papel e resumo vêm abaixo ou ao lado.
- Mantenha dados essenciais visíveis. Reúna ações secundárias em um botão “Opções” por registro, com nome acessível que identifique a pessoa, `aria-expanded` e `aria-controls`.
- Mostre campos de edição e ações destrutivas somente ao expandir o registro. Abra apenas um editor por vez. Não deixe um formulário aberto para cada integrante.
- A edição expandida fica no fluxo da lista; não use um menu flutuante que cubra outros dados. Agrupe campo e ação de salvar quando houver espaço; permita quebra no celular.
- Use botões proporcionais ao texto e alvos reais de toque de pelo menos 44 px, considerando qualquer zoom global. Compacte estrutura e espaçamento, não a legibilidade.
- Exiba remover somente para perfis autorizados e mantenha a autorização no servidor. A confirmação deve explicar o que será removido.
- Valide nomes longos, função ausente, um item, vários e estado vazio em 390, 768 e 1864 px. Confira teclado, abertura/fechamento, edição, remoção e ausência de rolagem horizontal.

Evite converter quadros, calendários ou cartões informativos em listas sem uma necessidade funcional. Esta preferência pertence ao Vínkulo.
