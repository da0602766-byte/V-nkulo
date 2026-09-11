# Secretaria Ministerial — V4.7.2

## Estrutura de navegação

A entrada da Secretaria exibe somente os ministérios que o usuário pode
consultar. Escalas, eventos, checklists e relatórios não aparecem diretamente
nessa tela.

Ao abrir um ministério, o fluxo completo continua organizado em seis etapas:

1. informações do ministério;
2. integrantes, funções e disponibilidade;
3. criação e publicação da escala;
4. repertório e links de apoio;
5. checklist com responsabilidades;
6. exportação e compartilhamento.

Um painel lateral apresenta somente as próximas escalas em que o usuário
autenticado está designado. No celular, o painel é reposicionado abaixo dos
cards de ministérios.

O módulo existente de Ministérios não foi removido. Recursos avançados anteriores — funções personalizadas, modelos, campos configuráveis e histórico — permanecem em **Secretaria → Configurações → Configurações avançadas**.

## Permissões e isolamento

- `ministries.view` continua sendo a permissão de entrada.
- Pastores e SuperAdmin da comunidade própria possuem visão global da
  Secretaria.
- O líder responsável é obrigatório na criação e recebe automaticamente a
  designação `LIDER` no ministério criado.
- Líder administra somente o ministério pelo qual é responsável ou no qual
  possui designação ativa de liderança.
- Usuário sem participação, liderança ou escala publicada não recebe o
  ministério na consulta.
- Integrantes comuns não recebem a lista da equipe, funções, modelos ou
  recursos administrativos.
- Integrante consulta somente escala publicada em que foi designado.
- Toda consulta e mutação usa a comunidade ativa resolvida no servidor.
- IDs enviados pelo frontend nunca substituem o tenant da sessão.
- Links públicos exibem apenas nome, função, repertório, checklist e dados operacionais da escala; contatos e credenciais não são consultados.

## Fluxos operacionais

### Ministério

A gestão pastoral cria o ministério com nome, categoria, descrição e líder
responsável pertencente à comunidade ativa. A criação sem líder é recusada.

### Integrantes

O gestor inclui uma conta ativa da comunidade, define função e papel. Cada integrante pode registrar dias e período de disponibilidade.

### Escala

O formulário exige título, início, término e responsável do próprio ministério. Permite local, integrantes, repertório, links, checklist e observações.

- `RASCUNHO`: salva sem notificar.
- `PUBLICADA`: libera resposta dos integrantes e cria notificações internas.
- conflitos de horário são recusados antes da gravação;
- alterações publicadas notificam novamente a equipe.

### Repertório e links

- até 80 itens de repertório;
- até 20 links;
- tipos: YouTube, Spotify, Cifra Club, Google Drive e personalizado;
- endereços somente HTTPS.

### Checklist

Cada tarefa pode ficar com a equipe ou ser atribuída a um integrante selecionado. O item é persistido em `ministerio_checklist_itens` e continua integrado à Diaconia.

### Exportação e compartilhamento

- PDF autenticado;
- arquivo de calendário ICS autenticado;
- imagem PNG gerada localmente;
- link público somente leitura com token único;
- compartilhamento manual por WhatsApp, Telegram ou e-mail;
- nenhum envio automático externo.

## Banco de dados

A migração `0031_wooden_sage.sql` acrescenta:

- `ministerios_comunidade.responsavel_usuario_id`;
- `escalas_ministerio.repertorio`;
- `escalas_ministerio.links_recursos`;
- `escalas_ministerio.responsavel_usuario_id`;
- `escalas_ministerio.share_token`;
- `escalas_ministerio.compartilhado_em`;
- índice único do token compartilhável.

As tabelas existentes e seus dados não são removidos.

## Interface

- catálogo inicial composto somente por ministérios autorizados;
- resumo lateral com próximas escalas do próprio usuário;
- botão de retorno para o catálogo dentro de cada ministério;
- visão interna com métricas e fluxo operacional do ministério selecionado;
- abas Integrantes, Escalas, Checklists, Relatórios e Configurações somente
  para Pastor, SuperAdmin ou líder autorizado;
- integrante comum recebe apenas a aba `Minhas escalas`;
- temas claro, escuro e automático herdados do sistema;
- grades adaptativas para desktop e tablet;
- controles empilhados e navegação horizontal segura no celular;
- estados de carregamento, vazio, erro e sucesso.

## Dependências externas

Não há dependência externa obrigatória para persistência, PDF, calendário, imagem ou link público. Envio automático por e-mail, WhatsApp, Telegram ou push depende de provedores externos e não foi simulado.

## Validação

- build de produção aprovado;
- lint sem erros;
- 42 testes automatizados aprovados;
- migrações verificadas em SQLite temporário;
- isolamento entre ministérios testado com Pastor, líder responsável, membro
  participante e líder sem atribuição;
- resposta de integrante limitada às próprias designações;
- token único e ausência de contatos na página pública testados.
