# Correção da alternância de temas no Calendário — 08/11/2026

Correção do contraste dos títulos indicado no comentário do proprietário sobre os eventos no mês.

## Causa e ajuste

O fundo normal dos itens referenciava --pilot-soft, token ausente, e caía sempre no fallback claro. O texto já seguia a paleta escura. A superfície agora referencia --pilot-surface-2, que acompanha a comunidade nos dois temas.

A verificação da troca de volta para claro encontrou um segundo problema: light-dark() era convertido pelo build em fallbacks ligados a prefers-color-scheme, e algumas cores continuavam seguindo o sistema operacional. As cores semânticas de prioridade, alertas e texto dos botões passaram a usar o data-theme resolvido pelo aplicativo, com compatibilidade para o atributo legado data-pilot-theme quando não há data-theme. As declarações da paleta foram reunidas em um único bloco, com sua variante escura, removendo a duplicação anterior.

## Verificação

Build de produção e validação do artefato Sites passaram. CSS compilado sem o fallback --lightningcss dependente do tema do sistema neste componente.

Navegador com build real e conta fictícia local: 24 combinações, alternando pelo controle real de aparência do Vínkulo. Mês, Semana, Dia e Agenda; 390, 768 e 1864 px; temas claro e escuro. Incluídos itens P1/P2/P3, concluídos e botão principal. Contraste calculado das cores computadas, considerando composição com o fundo e opacidade: mínimo observado 4,83:1. Sem overflow horizontal da página. A alternância preservou os registros exibidos.

Escopo: somente estilos do Calendário. Nenhuma alteração em autenticação, permissões, banco ou dados reais. A evidência visual usa dados fictícios locais; a confirmação da publicação é registrada separadamente no workspace.