# Visitantes — teste real do Google Drive, 26/10/2026

Base publicada: Sites 444, commit 270af5c3c07eaef87c4c842ea94365430a2135d7. Publicação de correções autorizada pelo usuário. Fonte isolada da árvore principal com alterações preexistentes.

## Validação real realizada

Usada a conexão Google já autorizada da sessão existente do proprietário. A tela informou armazenamento ACTIVE e carregou 91 fichas ativas. Nenhum token, senha ou arquivo de contatos foi exportado ou armazenado como credencial de teste. Não houve reconexão OAuth, migração, restauração nem concessão de acesso a outro usuário.

1. **Ler e verificar:** executado “Verificar arquivo atual”; o arquivo foi relido e validado pelo serviço real do Google Drive.
2. **Gravar:** criada exclusivamente a ficha `QA Drive 2026-10-26 — teste fictício`, sem telefone, e-mail ou dados pessoais. A lista passou de 91 para 92 ativos.
3. **Reler:** aberta uma nova aba, com novo carregamento pelo servidor; a busca encontrou a ficha gravada no Drive. É outra aba da mesma sessão, não outro aparelho ou usuário.
4. **Editar e proteger concorrência:** mantido um editor antigo na segunda aba; a primeira salvou observação nova. Ao salvar o editor antigo, o servidor recusou com “Os cadastros mudaram desde que você abriu a edição...”. A versão mais recente foi preservada, confirmada ao reabrir a ficha.
5. **Arquivar:** a ficha fictícia foi arquivada e localizada no filtro Arquivados. A lista ativa voltou a 91. Nenhum cadastro real foi editado ou excluído. A ficha QA permanece recuperável e identificada; versões técnicas anteriores permanecem no Drive segundo o funcionamento normal da integração.
6. **Atualização entre abas:** a segunda aba aberta passou a mostrar 91 ativos e nenhum resultado para a busca da ficha QA após a atualização periódica, sem novo comando de atualização nessa etapa.

Evidência local: `.task-tools/qa-drive-real-arquivado.png`. O arquivo mostra apenas a ficha fictícia e não integra a publicação.

## Problemas corrigidos

### Lista pessoal não incorporava a versão remota automaticamente

A checagem de acesso em foco/intervalo ignorava respostas bem-sucedidas; uma edição feita em outra sessão só aparecia após atualização manual. Agora compara o armazenamento e a revisão remota, baixa a versão somente quando muda e atualiza a lista aberta. Mantém o formulário em edição e orienta a atualizar, evita checagens simultâneas, invalida respostas após troca de conta/desmontagem ou início de gravação, conserva a lista carregada em falha temporária e limpa dados privados em revogação.

Cinco regressões reproduziram e verificaram: versão nova versus inalterada; preservação de rascunho; falha atrasada de outra conta e chamadas simultâneas; falha temporária e recuperação; revogação. A cobertura do fluxo pessoal é automatizada, com respostas controladas. O teste real acima usou a lista compartilhável do gestor já conectada ao Drive.

### Aviso de verificação indicava uma confirmação inexistente

No estado ACTIVE, a confirmação agora informa “Arquivo atual relido e validado no Google Drive.” A orientação de conferir quantidades antes de confirmar permanece somente para a preparação da migração.

## Verificações e limites

- 914/914 testes aprovados, nenhum ignorado, incluindo as integrações anteriores de Drive, compartilhamento, conflito, privacidade e revogação.
- TypeScript com noUnusedLocals/noUnusedParameters aprovado.
- Lint completo: zero erros e zero avisos.
- Build Sites e git diff --check aprovados.
- Nenhuma alteração de dependências, banco, migrações, configurações Google ou permissões reais.

**Pendente:** acesso real à lista compartilhada em outro aparelho e por outro usuário. O usuário respondeu que não possui uma segunda sessão disponível agora. Duas abas da mesma sessão não comprovam esse cenário. Não foi criado um usuário artificial em produção nem reutilizada a sessão do proprietário como se fosse outra conta. O fluxo de nova autorização OAuth também não foi repetido, pois a conexão existente funcionou.

Para concluir a pendência, entrar no segundo aparelho com um usuário autorizado, abrir Visitantes → Pessoas → Listas disponíveis, abrir a lista recebida e comparar uma ficha fictícia e suas alterações. Conferir READ/EDIT e revogação com esse usuário, sem compartilhar diretamente a pasta técnica do Google Drive.

Publicação das correções autorizadas em preparação; resultado será registrado após confirmação do Sites.
