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
| Codex | Carregamento na navegação pública, Ajuda oculta durante carregamentos e saneamento do lint para publicação | `app/components/StableLink.tsx`, `PublicHeader.tsx`, `PublicMobileNav.tsx`, `MemberRegistrationForm.tsx`, `MemberRegistrationLinkManager.tsx`, `MobileAppInstall.tsx`, `ParkingReservationQr.tsx`, `ParkingWorkspace.tsx`, `PilotDashboard.tsx`, `PilotNotificationCenter.tsx`, `SecretaryMinisterialWorkspace.tsx`, `TenantOperations.tsx`, `app/globals.css`, testes relacionados, `COORDENACAO_IA.md` | 2026-08-28 | concluído e pronto para publicação | Implementação em `53d1f2e`, além do redesenho de comentários em `7f970b4` e `b3786b4`, integrados sobre `9e4be77`. Validação: build e artefato aprovados; lint com 0 erros e 49 avisos; suíte no candidato e no commit anterior com as mesmas 11 falhas históricas, sem regressão nova. |
| Codex | Correção do popover da conta: escala de fonte e controles de tema | `app/globals.css` | 2026-08-27 | concluído e sincronizado | Commit `15e22c2`; sincronizado com o repositório do Sites em 2026-08-27. |
| Claude | Reforma Visual V5 — blocos 1 a 3 (acento único, navegação e Fio do dia) | `REFORMA_VISUAL_V5.md`, `COORDENACAO_IA.md`, `app/globals.css`, `app/lib/platform-branding.ts`, `app/components/PlatformBrandingWorkspace.tsx`, `app/components/PilotDashboard.tsx`, `app/components/MinistriesWorkspace.tsx`, `app/components/DayThreadWorkspace.tsx`, `app/api/pilot/fio/route.ts`, `drizzle/0059_fio_registros.sql`, `tests/v190-reforma-visual-v5.test.mjs` | 2026-08-30 | concluído e aguardando publicação | Commits `b1f001d` (especificação), `095fbdf` (bloco 1), `79c8fbc` (bloco 2) e o bloco 3. Validação: build e artefato aprovados; 219 de 219 testes, 13 novos; lint com 0 erros e 47 avisos. Blocos 4 a 6 pendentes. A migração `0059` precisa ser aplicada no banco antes da publicação. |

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
