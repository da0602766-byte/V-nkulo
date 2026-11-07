# Visitantes: armazenamento do Google Drive cheio

Solicitação: corrigir a falha da imagem ao criar categoria, revisar falhas relacionadas e publicar. Durante a investigação, o proprietário confirmou o aviso de armazenamento cheio na conta Google e pediu a mensagem no site e no app.

## Diagnóstico e alteração

Os registros de produção mostraram respostas 503 em POST /api/pilot/visitante-categorias. A gravação substituía qualquer erro de envio por uma mensagem de conexão. O formulário não era a origem do bloqueio: faltava espaço na conta Google.

O erro storageQuotaExceeded do Google agora retorna 507, com a mensagem: “O armazenamento da conta Google responsável pelo Drive está cheio. Libere espaço no Google Drive, Gmail ou Google Fotos e tente salvar novamente. Os dados anteriores foram preservados.” A interface de Visitantes, inclusive quando carregada pelo app, apresenta a resposta no alerta existente e conserva o formulário na falha.

O mesmo tratamento foi aplicado à lista pessoal e à criação de pastas durante a preparação do armazenamento. Autorização expirada, limite temporário de solicitações, permissão de gravação insuficiente e pasta ausente recebem orientações próprias. Respostas externas em HTML ou com detalhes privados não são apresentadas ao usuário. Uma recusa de permissão do Google não é tratada como revogação do acesso do usuário ao Vínkulo.

Nenhum arquivo real foi excluído, nenhuma conta Google foi reconectada e não houve migração nem mudança de permissões. A alteração informa a causa e orienta a recuperação; não aumenta a capacidade da conta Google. É necessário liberar espaço para voltar a gravar.

## Validação

- 982/982 testes aprovados na cópia isolada da fonte publicada.
- TypeScript com noUnusedLocals/noUnusedParameters, build Sites, validação do artefato e git diff --check aprovados.
- ESLint dos arquivos de implementação e testes do Drive alterados: zero erros e avisos.
- Regressões com respostas controladas do Google: categoria com nome, descrição e responsável; criação, edição e exclusão com cota cheia; ponteiro, hash e revisão preservados; nenhuma categoria parcial; nova tentativa bem-sucedida após liberar a cota; lista pessoal e preparação da migração preservadas.
- A suíte completa encontrou uma expectativa antiga de texto no teste de login. Ela foi atualizada para conferir a orientação atual de CPF e a presença dos campos de CPF e senha, preservando as verificações de comunidade e convite. Nenhuma tela de login foi modificada.

Limites: a automação do navegador Windows foi interrompida por não conseguir confirmar a URL. Não houve ensaio visual ou gravação real no Drive nesta entrega; os testes de gravação e recuperação usaram bancos descartáveis e respostas simuladas. A conta Google continua dependendo de liberação de espaço pelo proprietário.

Publicação preparada a partir do commit publicado 0c7a794700a784b35d97bf915aee843a77d4e882, em checkout isolado, sem incorporar as alterações preexistentes da árvore principal.
