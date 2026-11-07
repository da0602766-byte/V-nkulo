# Feed: aviso privado de armazenamento cheio

Proposta aprovada pelo proprietário em 07/11/2026 após revisão com captura de tela e animação. Cartão translúcido, nuvem com expressão preocupada e arquivos saindo dela, mantendo os controles e a identidade do Vínkulo. Fonte de partida: Sites 467, commit 4ada1bd848bc35ee3c73d044e7217fa67d899851.

## Comportamento

O aviso aparece no topo do Feed, acima da apresentação recolhível da comunidade. O dono de uma conexão Google Drive ativa recebe o aviso sobre a própria conta. Usuários com compartilhamento ativo READ ou EDIT da lista de Visitantes da comunidade atual recebem a versão para Drive compartilhado. Um cargo administrativo sozinho não permite consultar o armazenamento de outra conta.

O endpoint autenticado /api/storage/drive-status verifica a cota total pela API Google Drive about.get, com os escopos já autorizados. Não abre pastas, arquivos ou contatos, e não altera a conta Google. Somente identificação da sessão/comunidade e estados FULL, AVAILABLE ou UNKNOWN chegam ao cliente; não são enviados e-mail Google, identidade do proprietário, tokens ou valores de uso/capacidade. Vínculo, compartilhamento e conexão são revalidados após a chamada remota, protegendo a revogação durante uma consulta.

Fechar os detalhes mantém um lembrete compacto, com opção Ver aviso. Essa preferência é isolada por usuário e comunidade. O aviso é atualizado ao entrar, ao retomar a aba e periodicamente enquanto visível; a atualização automática tem intervalo mínimo entre consultas. Verificar novamente consulta o Google. Espaço disponível confirmado remove o aviso, e a revogação do compartilhamento remove a fonte autorizada. Falha temporária não inventa armazenamento cheio e não apaga um aviso já confirmado: mantém o lembrete e informa a impossibilidade de verificar.

O dono dispõe de link para gerenciar o armazenamento Google. Quem usa uma lista compartilhada recebe orientação para falar com o responsável. Nenhuma mensagem é enviada automaticamente a outra pessoa.

## Interface e acessibilidade

Cartão com fundo translúcido, borda discreta e cores da comunidade. A nuvem flutua, pisca e move os documentos por dois ciclos curtos; não há animação contínua indefinida. Respeita prefers-reduced-motion. Controles têm alvos de 44 px, foco visível, nomes acessíveis e retorno de foco ao recolher/reabrir. O lembrete permanece legível e os estados são anunciados sem anunciar cada quadro da animação.

## Verificação

- 985/985 testes aprovados na fonte isolada, incluindo regressões novas da cota, preferências, autorização e API no Worker compilado.
- TypeScript com noUnusedLocals/noUnusedParameters aprovado, build Sites e validação do artefato aprovados, diff sem erros de espaços.
- ESLint nos arquivos novos e no sistema de ícones alterado: sem erros ou avisos. Revisão de React: efeitos com limpeza, cancelamento de consultas, identidade conferida antes de aceitar respostas, preferências com esquema e isolamento por conta/comunidade.
- Componente real renderizado em navegador isolado em 320, 390, 768 e 1864 px, nos temas claro e escuro: sem overflow horizontal e com alvos de toque conferidos.
- Fechamento, reabertura, foco, preferência após recarregar, compartilhamento, ausência de botão de gerenciamento da conta alheia, falha temporária, recuperação confirmada e resposta atrasada de outra conta aprovados no navegador.
- Animações e redução de movimento verificadas no componente real, sem erros de JavaScript.

Sem mudança de dependências, migrações, credenciais, audiência do site ou permissões de compartilhamento de produção. As chamadas Google e as contas da validação automatizada foram simuladas; não houve gravação real em Drive nem ensaio físico do APK. O app recebe o componente pela interface web do Feed.

Referências técnicas: https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get e https://developers.google.com/workspace/drive/api/reference/rest/v3/about .
