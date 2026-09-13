# Script de funcionalidades — Aba "Visitantes"

> Levantamento funcional da aba **Visitantes** (dentro do painel de uma
> comunidade, visível a quem tem a permissão `visitors.view`). Só
> funcionalidades — nenhuma indicação de cor, espaçamento ou componente
> visual — para servir de base a um novo layout no Figma.

---

## 1. Cabeçalho da aba

- Identificação do nome da comunidade ativa.
- Botão **"Novo visitante"** (visível para quem tem permissão de cadastrar)
  que abre o formulário de cadastro.
- Botão de **Configurações** (visível só para quem pode gerenciar
  categorias) que abre um painel com:
  - Criação de nova categoria de acompanhamento.
  - Busca de categorias por nome, ministério ou responsável.
  - Lista de categorias existentes, cada uma editável e reordenável
    (arrastar, ou mover com as setas do teclado).
  - Exclusão de categoria (com confirmação e validação de vínculos —
    não deixa excluir categoria em uso sem avisar).

## 2. Funil de acolhimento

- Quatro etapas fixas, com contagem de pessoas em cada uma: **Recebidos**,
  **Contatados**, **Em acompanhamento**, **Integrados**.
- Cada etapa mostra o total de pessoas e o percentual sobre o total geral.

## 3. Painel de crescimento

- Número total de visitantes ativos em destaque.
- Gráfico de cadastros acumulados nos últimos 6 meses.
- Lista de categorias em formato de cartão, cada uma exibindo: ícone, nome,
  ministério vinculado e quantidade de pessoas na categoria.
- Clicar num cartão de categoria filtra a lista principal por aquela
  categoria (inclusive um cartão "Todas").
- Estado vazio quando não há categoria criada, com atalho para criar a
  primeira.

## 4. Aniversariantes do mês

- Lista de até 5 aniversariantes do mês corrente.
- Cada item mostra: dia do aniversário, nome, data por extenso.
- Atalho para enviar mensagem de parabéns pelo WhatsApp (quando a pessoa
  tem telefone cadastrado).
- Estado vazio quando não há aniversariante no mês.

## 5. Cadastro de novo visitante (formulário em 4 blocos)

1. **Informações pessoais**: nome completo (obrigatório), data de
   nascimento, telefone/WhatsApp, e-mail, parente ou responsável, endereço.
2. **Conexão espiritual**: se é batizado (sim/não/não informado), se já
   participou do "Encontro com Deus", se já concluiu o curso de membros.
3. **Vínculo com a igreja**: célula, categoria de acompanhamento (com aviso
   de que uma categoria com regra de idade automática tem prioridade sobre
   a escolha manual), quem recebeu a pessoa, ministério de interesse.
4. **Finalização**: data de entrada, status inicial, observações livres.

Durante o preenchimento, o sistema verifica em tempo real se já existe
alguém parecido cadastrado (por nome, e-mail, telefone ou parente) e mostra
os possíveis cadastros duplicados, permitindo abrir a ficha existente em vez
de duplicar.

## 6. Visões da lista (abas de filtro rápido)

Todos · Novos · Em acompanhamento · Pendências · Sem contato há 15 dias ·
(mais) Arquivados — cada visão muda o conjunto de pessoas listado e mostra
a contagem correspondente.

## 7. Barra de comando da lista

- Busca por nome, telefone ou e-mail.
- Botão de filtros (abre painel com filtro por categoria, atalho para
  limpar filtros e atalho para ver arquivados).
- Botão de colunas (mostra quais colunas a tabela exibe).
- Alternância de ordenação por nome (A–Z / Z–A).
- Botão de atualizar a lista.
- Indicação visual dos filtros ativos no momento, cada um removível
  individualmente com um clique.

## 8. Importação de planilha

- Botão para importar Excel/CSV.
- Depois de escolher o arquivo, mostra uma prévia com as primeiras linhas
  reconhecidas (nome, contato, categoria, ministério, status) antes de
  confirmar.
- Confirmação executa a importação em lote.

## 9. Exportação

- Botão "Revisar e exportar" abre uma tela de conferência antes de gerar o
  arquivo, mostrando quantos cadastros estão incompletos (sem categoria,
  sem telefone, sem responsável) para incentivar a correção antes de
  exportar.
- Sugestão de categorias padrão para quem ainda não organizou os dados.
- Exportação gera uma planilha com: nome, telefone, e-mail, parente,
  categoria, ministério, status, data de entrada, próximo contato.

## 10. Seleção em massa

- Checkbox por linha e checkbox "selecionar página inteira".
- Barra de ações em massa aparece quando há seleção: limpar seleção,
  arquivar selecionados, excluir definitivamente os selecionados (ambas com
  confirmação).

## 11. Tabela principal de visitantes

Colunas: seleção, nome (com inicial/avatar e data de entrada), contato
(telefone/e-mail), categoria (com cor e ícone), ministério, responsável,
status (editável diretamente na linha, quando permitido), data do último
contato, próximo passo (com destaque quando está atrasado), abrir ficha.

- Duplo clique na linha abre a ficha da pessoa.
- Botão "Carregar mais" quando há mais resultados do que a página atual.
- Estado vazio orientando a ajustar filtros ou cadastrar alguém.

## 12. Ficha central da pessoa (painel lateral)

- Cabeçalho com avatar, nome, categoria e status atual.
- Ações rápidas: abrir WhatsApp, marcar como integrado, arquivar, excluir
  definitivamente (as três últimas dependem de permissão).
- Resumo: telefone, e-mail, célula, ministério, responsável, data da
  próxima ação.
- Edição completa dos dados cadastrais (mesmos campos do cadastro inicial),
  dentro de uma seção que pode ser expandida/recolhida.
- Registro rápido de um novo acompanhamento: canal de contato (WhatsApp,
  telefone, presencial, e-mail, outro), resultado do contato, data do
  próximo contato, observações.
- Linha do tempo com todo o histórico de acompanhamentos já registrados
  (canal, data/hora, resultado, observações, próximo contato agendado).

## 13. Central de Relacionamento (bloco de apoio à decisão, dentro da mesma aba)

- Indicadores no topo: quantas pessoas são urgentes, quantas ainda não
  tiveram nenhum contato, engajamento médio geral.
- Busca por pessoa, prioridade ou trecho do histórico.
- Navegação por três áreas (a mesma central se reorganiza em abas no
  celular): Prioridades, Pessoas, Histórico.
- **Ordem de cuidado**: lista das pessoas que mais precisam de atenção
  agora, cada uma com o tempo desde o último contato, o responsável e uma
  sugestão de próxima ação; clicar abre a ficha da pessoa.
- **Sugestões de organização**: até 3 recomendações automáticas (ex.:
  "acolha X pessoas urgentes hoje", "X pessoas sem primeiro contato",
  lembrete de sempre registrar o próximo cuidado).
- **Visão por pessoa**: lista de pessoas com uma régua visual da etapa de
  acompanhamento e uma nota de engajamento (pontuação), mais a data do
  último contato; clicar abre a ficha.
- **Linha do tempo por pessoa**: ao escolher alguém num seletor, mostra
  duas colunas — histórico de contatos e histórico de visitas presenciais
  dessa pessoa.
- Estados de carregamento e vazio próprios em cada bloco.

## 14. Painel de notas de cuidado (bloco lateral de apoio)

- Espaço para anotações rápidas ligadas ao acompanhamento das pessoas,
  exibido ao lado da Central de Relacionamento.

## 15. Gestão de categorias de acompanhamento (dentro das Configurações)

Cada categoria tem:
- Nome e descrição.
- Opção de exibir (ou não) um cartão de resumo dessa categoria no painel
  de crescimento.
- Regra de classificação automática por idade: liga/desliga, com idade
  mínima e máxima; quando ligada, a pessoa é reclassificada
  automaticamente ao entrar em outra faixa etária (com aviso de que faixas
  automáticas não podem se sobrepor).
- Escolha de ícone (lista fixa de opções).
- Escolha de cor (lista fixa de opções + seletor de cor livre).
- Responsável pela categoria (selecionado entre pessoas da comunidade).
- Ministério vinculado.
- Posição/ordem de exibição entre as demais categorias.

---

## Regras de permissão que aparecem na interface

- **Ver visitantes**: acesso de leitura à aba inteira.
- **Cadastrar visitantes**: habilita o botão de novo cadastro, o botão de
  importar e o atalho de cadastro secundário.
- **Editar visitantes**: habilita edição de status na tabela, edição
  completa na ficha e atualização de campos.
- **Desativar/gerenciar acesso**: habilita arquivar e excluir
  definitivamente (individual e em massa).
- **Gerenciar acompanhamentos**: habilita registrar novo acompanhamento e
  o atalho "Registrar contato" na tabela (sem essa permissão, o mesmo botão
  vira "Abrir ficha").
- **Gerenciar categorias**: habilita o botão de Configurações e tudo o que
  está dentro dele.

## Estados que a tela sempre trata

- Carregando (lista, categorias, histórico de relacionamento).
- Vazio (sem visitantes na visão atual, sem categoria criada, sem cartão de
  categoria ativo, sem aniversariante no mês, sem prioridade encontrada,
  sem pessoa encontrada na busca).
- Erro de operação (mensagem de erro genérica reaproveitada em todas as
  ações).
- Confirmação obrigatória antes de: excluir categoria, arquivar em massa,
  excluir definitivamente (individual ou em massa).
