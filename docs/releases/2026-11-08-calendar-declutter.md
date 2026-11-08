# Calendário compacto — 8 de novembro de 2026

A tela abria com títulos repetidos, filtros, métricas zeradas e apoio ao planejamento antes do calendário. Agora a consulta começa pelo período e pelos itens, com apenas seleção de visualização, Filtros, Mais opções e Novo na barra principal.

- Filtros abrem sob demanda, preservam a seleção ao fechar e indicam filtros ativos. Escape fecha o painel e devolve o foco.
- Pendências, resumo e ajuda ficam em Mais opções. A programação completa de eventos mantém seus recursos em uma seção recolhida.
- No celular, detalhes e cadastro substituem a grade durante o uso; a lista Agenda é a visualização inicial. O mês usa marcadores discretos e somente as semanas necessárias.
- O cadastro prioriza título, responsável e agendamento. Campos opcionais ficam em Mais detalhes; erros de validação reabrem a seção. Seções de formulário permanecem abertas ao clicar em Salvar, evitando deslocamento do botão.
- Os temas preservam os tokens e o contraste corrigidos na versão 470. Nenhuma migração, alteração de permissões ou mudança de integração foi incluída.

## Verificação

- TypeScript, ESLint dos componentes alterados e build Sites aprovados.
- Suite completa: 993 testes aprovados, zero falhas.
- Revisão visual local com dados fictícios: 320, 390, 768 e 1864 px; Mês, Semana, Dia e Agenda; claro e escuro (32 combinações), sem transbordamento horizontal da página.
- Menu verificado em 320 px; calendário começa a 185 px no celular. Contraste medido dos títulos dos eventos: 13,2:1 no claro e 13,92:1 no escuro; botão principal: 6,36:1 e 5,49:1.
- Fluxos locais verificados: filtrar/reabrir/limpar, consultar evento, criar e editar tarefa, validar término, mover para pendências, Agendar e Desfazer, criação de evento pelo formulário existente.
- Arrastar nativo não foi confirmado pela automação nesta revisão; os manipuladores existentes foram preservados. Instalação PWA em aparelho físico não foi exercitada.
- Evidências de interface usam somente a prévia local e dados fictícios.
