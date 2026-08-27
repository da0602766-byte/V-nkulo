# Coordenação entre IAs — Vínkulo

Este arquivo é o ponto único de coordenação para quem trabalha neste projeto.
Antes de alterar o código, leia este documento e atualize a seção **Trabalho em andamento**.

## Regras obrigatórias

1. Não sobrescreva alterações não relacionadas feitas por outra pessoa ou IA.
2. Antes de editar, verifique `git status` e `git diff` para identificar trabalho em curso.
3. Declare abaixo os arquivos que pretende modificar **antes** de iniciar a alteração.
4. Uma tarefa não pode ser assumida por duas pessoas ao mesmo tempo sem combinar a divisão por arquivos.
5. Prefira arquivos e componentes já existentes; não crie uma segunda versão de uma tela ou componente sem necessidade.
6. Não altere `.dev.vars`, artefatos `site-v*.tgz`, `dist/`, `.next/` ou `node_modules/` como parte de uma funcionalidade.
7. Rode uma validação proporcional à mudança e registre o resultado antes de concluir.
8. Faça commits pequenos, com uma finalidade clara. Não inclua mudanças de outra pessoa no mesmo commit.
9. Antes de publicar, confirme que o commit contém somente a tarefa declarada e registre a versão/URL no histórico.

## Trabalho em andamento

> Preencha uma linha ao começar, atualize ao concluir e remova apenas tarefas canceladas.

| Responsável | Tarefa | Arquivos reservados | Início | Estado | Observações |
| --- | --- | --- | --- | --- | --- |
| Codex | Correção do popover da conta: escala de fonte e controles de tema | `app/globals.css` | 2026-08-27 | concluído e sincronizado | Commit `15e22c2`; sincronizado com o repositório do Sites em 2026-08-27. |
| Claude | _A preencher antes de editar_ | _A preencher_ |  | pendente |  |

## Antes de começar uma nova tarefa

1. Atualize ou adicione uma linha em **Trabalho em andamento**.
2. Liste os arquivos que serão modificados.
3. Se um arquivo já estiver reservado, escolha outro recorte ou peça alinhamento ao responsável.
4. Consulte `ESTADO_DO_PROJETO.md` e os componentes existentes antes de criar arquivos novos.

## Ao concluir

Registre na linha da tarefa:

- estado: `concluído`, `bloqueado` ou `aguardando revisão`;
- validação executada e resultado;
- hash do commit, quando houver;
- publicação realizada, se aplicável.

## Sincronização com o Sites

1. Não dependa do Git Credential Manager nem grave credenciais no remote ou na configuração do Git.
2. Leia o `project_id` de `.openai/hosting.json` e solicite ao conector do Sites uma credencial temporária de escrita para esse projeto.
3. Use a credencial somente no comando de `push`, por meio de um cabeçalho HTTP de autorização por comando.
4. Nunca mostre, registre, salve ou inclua o token em arquivos, logs, commits ou URLs.
5. Depois do `push`, faça `fetch` e confirme que `HEAD` e `origin/main` apontam para o mesmo commit antes de declarar a tarefa concluída.
6. Se a credencial expirar, solicite outra pelo Sites; não reutilize credenciais antigas e não tente contornar o fluxo pelo gerenciador do Windows.

## Convenções de comunicação

- Use português nas mensagens visíveis ao usuário.
- Nomeie componentes pela função, evitando sufixos genéricos como `Novo`, `Final` ou `V2` quando substituírem um componente existente.
- Para mudanças estruturais, descreva a decisão no commit ou em `ESTADO_DO_PROJETO.md`.
- Em caso de dúvida sobre autoria ou escopo, pare antes de editar o mesmo arquivo.
