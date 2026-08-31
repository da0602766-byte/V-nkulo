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
| Codex | Revisão visual de 31/08: Início e Fio do Dia, cabeçalho, Agenda, estacionamento, Células e Central da comunidade | `app/components/AgendaCalendar.tsx`, `CommunityHome.tsx`, `EventsWorkspace.tsx`, `ParkingWorkspace.tsx`, `PilotDashboard.tsx`, `app/globals.css`, testes relacionados, `COORDENACAO_IA.md` | 2026-08-31 | concluído e validado | Os 11 apontamentos visuais foram aplicados sem remover funções. TypeScript e artefato aprovados; lint com 0 erros e 46 avisos preexistentes; suíte completa 265/265. A revisão local do painel ficou limitada pela ausência de sessão/banco no ambiente de desenvolvimento; a conferência visual responsiva será repetida na versão publicada. |
| Codex | Barra móvel animada com ação central, perfil no Menu, indicadores reais e correção do cabeçalho público | `app/components/PilotDashboard.tsx`, `app/components/PilotNotificationCenter.tsx`, `app/components/PublicHeader.tsx`, `app/globals.css`, `tests/v187-mobile-navigation-motion.test.mjs`, `COORDENACAO_IA.md` | 2026-08-30 | concluído e validado | Referência visual: vídeo e marcações do proprietário de 30/08. TypeScript e artefato aprovados; lint com 0 erros e 47 avisos preexistentes; suíte completa 214/214. |
| Codex | Redesenho da gestão comunitária, publicação moderada, hierarquias, denúncias, eventos, visitantes, notificações e mensagens conforme revisão de 30/08 | `app/components/PilotDashboard.tsx`, `CommunityAdminWorkspace.tsx`, `EditorialSidebarSchedule.tsx`, `TenantOperations.tsx`, `PeopleWorkspace.tsx`, `PilotNotificationCenter.tsx`, `CommunityHome.tsx`, `CommunityPostInteractions.tsx`, `EventsWorkspace.tsx`, `AgendaCalendar.tsx`, `PrivateChatDialog.tsx`, `PrivateChatWorkspace.tsx`, `OwnerWorkspace.tsx`, APIs relacionadas em `app/api`, `db/schema.ts`, `drizzle/0059_*`, `app/globals.css`, testes relacionados, `COORDENACAO_IA.md` | 2026-08-30 | concluído e validado | Funções existentes preservadas; migração 0059 adiciona audiência, canais e aprovação. TypeScript, lint, build e artefato aprovados; suíte completa 210/210. |
| Codex | Correções visuais da navegação e do botão Ajuda com base nas imagens e vídeos de 28/08 | `app/components/PilotDashboard.tsx`, `app/globals.css`, testes relacionados, `COORDENACAO_IA.md` | 2026-08-28 | concluído e validado | Ícones móveis restaurados, Mural e Escalas diferenciados, atalho visual ⌘K ocultado e Ajuda removido durante diálogos. Integrado sobre o redesign `1281e08`: build e artefato aprovados; lint com 0 erros e 47 avisos; candidato 203/203 e base 199/199 testes aprovados. |
| Codex | Carregamento na navegação pública, Ajuda oculta durante carregamentos e saneamento do lint para publicação | `app/components/StableLink.tsx`, `PublicHeader.tsx`, `PublicMobileNav.tsx`, `MemberRegistrationForm.tsx`, `MemberRegistrationLinkManager.tsx`, `MobileAppInstall.tsx`, `ParkingReservationQr.tsx`, `ParkingWorkspace.tsx`, `PilotDashboard.tsx`, `PilotNotificationCenter.tsx`, `SecretaryMinisterialWorkspace.tsx`, `TenantOperations.tsx`, `app/globals.css`, testes relacionados, `COORDENACAO_IA.md` | 2026-08-28 | concluído e pronto para publicação | Implementação em `53d1f2e`, além do redesenho de comentários em `7f970b4` e `b3786b4`, integrados sobre `9e4be77`. Validação: build e artefato aprovados; lint com 0 erros e 49 avisos; suíte no candidato e no commit anterior com as mesmas 11 falhas históricas, sem regressão nova. |
| Codex | Correção do popover da conta: escala de fonte e controles de tema | `app/globals.css` | 2026-08-27 | concluído e sincronizado | Commit `15e22c2`; sincronizado com o repositório do Sites em 2026-08-27. |
| Claude | Reforma Visual V5 — blocos 1 a 6 concluídos (acento único, navegação, Fio do dia, Células, Visitantes, Notificações, escopo do proprietário, Configurações e superfície pública) | `REFORMA_VISUAL_V5.md`, `COORDENACAO_IA.md`, `app/globals.css`, `app/lib/platform-branding.ts`, `app/lib/pilot-login-config.ts`, `app/components/PlatformBrandingWorkspace.tsx`, `app/components/PilotDashboard.tsx`, `app/components/MinistriesWorkspace.tsx`, `app/components/DayThreadWorkspace.tsx`, `app/components/TenantOperations.tsx`, `app/components/PilotNotificationCenter.tsx`, `app/components/OwnerWorkspace.tsx`, `app/components/CommunityAdminWorkspace.tsx`, `app/components/CommunityHome.tsx`, `app/components/LoginPortal.tsx`, `app/login/page.tsx`, `app/painel/page.tsx`, `app/comunidades/page.tsx`, `app/comunidades/[slug]/page.tsx`, `app/api/pilot/fio/route.ts`, `drizzle/0060_fio_registros.sql`, `tests/v190-reforma-visual-v5.test.mjs` | 2026-08-30 | concluído, validado e publicado no Sites (versão 194) | Commits `b1f001d`, `095fbdf`, `79c8fbc`, `f0eda8d`, o bloco 4 e o bloco 6. Validação final sobre a versão 193: build e artefato aprovados; 261 de 261 testes, 38 no arquivo da reforma; lint com 0 erros e 46 avisos. A migração `0060` foi incluída na publicação (era `0059`, renumerada porque o Codex publicou `0059_publication_governance.sql` primeiro). O bloco 6 achou a causa de o acento do bloco 1 não chegar às telas: a camada v2 mantinha uma segunda marca (azul `#2554b8` e verde `#168778`) imposta com `!important` sobre `--pilot-primary`, `--pilot-accent` e `--pilot-gradient`; está na seção 7.2 do documento. Integrado sobre `8d9aca2` do Codex e, na publicação final, sobre a versão 193 do Sites: a barra móvel, os nomes das visões de Visitantes, o popover de mensagens, a folha móvel e as melhorias posteriores de login Google foram preservados; os ícones em SVG, o Fio do dia, o funil, a saúde das células e a correção de fuso são da reforma. O Codex restringiu o registro manual do Fio à liderança, validou o escopo pastoral no servidor, corrigiu a janela diária para `America/Sao_Paulo` e tornou o teste compatível com Windows e Linux. Detalhe na seção 7.3 do documento. Para acompanhamento: o aviso de hidratação em `CommunityHome` (`renderedAt` com `Date.now()` num `useState`) existe nos dois lados desde antes e continua aberto. |

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
